create or replace function private.pdv_process_return(
  p_device_id uuid,
  p_tenant_id uuid,
  p_company_id uuid,
  p_branch_id uuid,
  p_pos_register_id uuid,
  p_event_id uuid,
  p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path to 'public','private','extensions'
as $$
declare
  v_return uuid;
  v_sale public.sales%rowtype;
  v_item jsonb;
  v_sale_item public.sale_items%rowtype;
  v_qty numeric;
  v_returned numeric;
  v_remaining numeric;
  v_unit_net numeric;
  v_line numeric;
  v_total numeric := 0;
  v_method text := coalesce(nullif(p_payload->>'refund_method',''),'cash');
  v_cash uuid;
  v_fin_status text;
  v_has_authorized_fiscal boolean := false;
begin
  select id into v_return from public.sale_returns where pdv_device_id=p_device_id and client_event_id=p_event_id limit 1;
  if v_return is not null then
    return (select jsonb_build_object('ok',true,'return_id',sr.id,'sale_id',sr.sale_id,'total',sr.total,'status',sr.status,'idempotent',true) from public.sale_returns sr where sr.id=v_return);
  end if;

  if v_method <> all(array['cash','pix','credit_card','debit_card','voucher','store_credit','other']) then
    return jsonb_build_object('ok',false,'error','invalid_refund_method');
  end if;

  if nullif(p_payload->>'sale_id','') is not null then
    select * into v_sale from public.sales where id=(p_payload->>'sale_id')::uuid and tenant_id=p_tenant_id and branch_id=p_branch_id;
  elsif nullif(p_payload->>'sale_client_event_id','') is not null then
    select * into v_sale from public.sales where pdv_device_id=p_device_id and client_event_id=(p_payload->>'sale_client_event_id')::uuid and tenant_id=p_tenant_id;
  end if;
  if v_sale.id is null then return jsonb_build_object('ok',false,'error','sale_not_found'); end if;
  if v_sale.status <> 'completed' then return jsonb_build_object('ok',false,'error','sale_not_completed'); end if;
  if jsonb_array_length(coalesce(p_payload->'items','[]'::jsonb))=0 then return jsonb_build_object('ok',false,'error','return_without_items'); end if;

  if v_method='cash' then
    select id into v_cash from public.cash_sessions where tenant_id=p_tenant_id and pos_register_id=p_pos_register_id and status='open' order by opened_at desc limit 1;
    if v_cash is null then return jsonb_build_object('ok',false,'error','cash_required_for_cash_refund'); end if;
  end if;

  insert into public.sale_returns(tenant_id,sale_id,pdv_device_id,client_event_id,status,reason,refund_method,total)
  values(p_tenant_id,v_sale.id,p_device_id,p_event_id,'completed',nullif(trim(p_payload->>'reason'),''),v_method,0)
  returning id into v_return;

  for v_item in select * from jsonb_array_elements(p_payload->'items') loop
    if nullif(v_item->>'sale_item_id','') is not null then
      select * into v_sale_item from public.sale_items where id=(v_item->>'sale_item_id')::uuid and sale_id=v_sale.id and tenant_id=p_tenant_id;
    else
      select * into v_sale_item from public.sale_items where sale_id=v_sale.id and product_id=(v_item->>'product_id')::uuid and tenant_id=p_tenant_id order by created_at limit 1;
    end if;
    if v_sale_item.id is null then raise exception 'sale_item_not_found'; end if;

    v_qty:=coalesce(nullif(v_item->>'quantity','')::numeric,0);
    if v_qty<=0 then raise exception 'invalid_return_quantity'; end if;

    select coalesce(sum(sri.quantity),0) into v_returned
    from public.sale_return_items sri join public.sale_returns sr on sr.id=sri.return_id
    where sri.sale_item_id=v_sale_item.id and sr.status='completed';
    v_remaining:=v_sale_item.quantity-v_returned;
    if v_qty>v_remaining+0.0001 then raise exception 'return_quantity_exceeds_remaining'; end if;

    v_unit_net:=case when v_sale_item.quantity=0 then 0 else v_sale_item.total/v_sale_item.quantity end;
    v_line:=round(v_qty*v_unit_net,2);
    v_total:=v_total+v_line;

    insert into public.sale_return_items(tenant_id,return_id,sale_item_id,product_id,quantity,unit_price,total)
    values(p_tenant_id,v_return,v_sale_item.id,v_sale_item.product_id,v_qty,v_unit_net,v_line);

    if v_sale_item.product_id is not null then
      insert into public.stock_movements(tenant_id,branch_id,product_id,movement_type,quantity,reference_type,reference_id,notes)
      values(p_tenant_id,p_branch_id,v_sale_item.product_id,'sale_return',abs(v_qty),'sale_return',v_return,'Devolução da venda '||v_sale.number);
      insert into public.inventory_balances(tenant_id,branch_id,product_id,quantity,reserved_quantity,updated_at)
      values(p_tenant_id,p_branch_id,v_sale_item.product_id,abs(v_qty),0,now())
      on conflict(tenant_id,branch_id,product_id) do update set quantity=public.inventory_balances.quantity+excluded.quantity,updated_at=now();
    end if;
  end loop;

  update public.sale_returns set total=v_total where id=v_return;

  v_fin_status:=case when v_method in ('cash','store_credit') then 'paid' else 'open' end;
  insert into public.financial_entries(tenant_id,company_id,branch_id,entry_type,status,description,amount,paid_amount,due_date,paid_at,customer_id,sale_id,metadata)
  values(p_tenant_id,p_company_id,p_branch_id,'payable',v_fin_status,'Devolução venda '||v_sale.number,v_total,case when v_fin_status='paid' then v_total else 0 end,current_date,case when v_fin_status='paid' then now() else null end,v_sale.customer_id,v_sale.id,
    jsonb_build_object('origin','pdv_desktop_return','return_id',v_return,'refund_method',v_method,'provider_refund_pending',v_method not in ('cash','store_credit')));

  if v_method='cash' and v_total>0 then
    insert into public.cash_movements(tenant_id,cash_session_id,movement_type,amount,notes,device_id,client_event_id)
    values(p_tenant_id,v_cash,'refund',v_total,'Devolução venda '||v_sale.number,p_device_id,p_event_id)
    on conflict(device_id,client_event_id) do nothing;
  end if;

  select exists(select 1 from public.fiscal_documents where sale_id=v_sale.id and status='authorized') into v_has_authorized_fiscal;
  if v_has_authorized_fiscal then
    insert into public.fiscal_documents(tenant_id,company_id,branch_id,sale_id,document_type,environment,status,series,provider,request_payload)
    select p_tenant_id,p_company_id,p_branch_id,v_sale.id,'nfe',coalesce(fs.environment,'homologation'),'draft',coalesce(fs.nfe_series,'1'),fs.provider,
      jsonb_build_object('operation','sale_return','return_id',v_return,'source','pdv_desktop','requires_fiscal_review',true)
    from (select 1) x left join public.fiscal_settings fs on fs.tenant_id=p_tenant_id;
  end if;

  return jsonb_build_object('ok',true,'return_id',v_return,'sale_id',v_sale.id,'sale_number',v_sale.number,'total',v_total,'refund_method',v_method,'financial_status',v_fin_status,'fiscal_followup_required',v_has_authorized_fiscal);
exception when others then
  if v_return is not null then delete from public.sale_returns where id=v_return; end if;
  return jsonb_build_object('ok',false,'error',sqlerrm);
end $$;

create or replace function private.pdv_request_nfce(
  p_device_id uuid,
  p_tenant_id uuid,
  p_company_id uuid,
  p_branch_id uuid,
  p_event_id uuid,
  p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path to 'public','private','extensions'
as $$
declare
  v_sale public.sales%rowtype;
  v_doc public.fiscal_documents%rowtype;
  v_settings public.fiscal_settings%rowtype;
begin
  if nullif(p_payload->>'sale_id','') is not null then
    select * into v_sale from public.sales where id=(p_payload->>'sale_id')::uuid and tenant_id=p_tenant_id and branch_id=p_branch_id;
  elsif nullif(p_payload->>'sale_client_event_id','') is not null then
    select * into v_sale from public.sales where pdv_device_id=p_device_id and client_event_id=(p_payload->>'sale_client_event_id')::uuid and tenant_id=p_tenant_id;
  end if;
  if v_sale.id is null then return jsonb_build_object('ok',false,'error','sale_not_found'); end if;
  if v_sale.status<>'completed' then return jsonb_build_object('ok',false,'error','sale_not_completed'); end if;

  select * into v_doc from public.fiscal_documents where sale_id=v_sale.id and document_type='nfce' order by created_at desc limit 1;
  if v_doc.id is not null then
    return jsonb_build_object('ok',true,'sale_id',v_sale.id,'fiscal_document_id',v_doc.id,'status',v_doc.status,'access_key',v_doc.access_key,'protocol',v_doc.protocol,'pdf_path',v_doc.pdf_path,'idempotent',true);
  end if;

  select * into v_settings from public.fiscal_settings where tenant_id=p_tenant_id limit 1;
  insert into public.fiscal_documents(tenant_id,company_id,branch_id,sale_id,document_type,environment,status,series,provider,request_payload)
  values(p_tenant_id,p_company_id,p_branch_id,v_sale.id,'nfce',coalesce(v_settings.environment,'homologation'),'draft',coalesce(v_settings.nfce_series,'1'),v_settings.provider,
    jsonb_build_object('source','pdv_desktop','requested_by_device',p_device_id,'client_event_id',p_event_id,'requested_at',now()))
  returning * into v_doc;

  return jsonb_build_object('ok',true,'sale_id',v_sale.id,'fiscal_document_id',v_doc.id,'status',v_doc.status,'provider',v_doc.provider,'requires_provider',v_doc.provider is null or v_doc.provider='internal');
end $$;

create or replace function public.pdv_pull(p_device_token text, p_since timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public','private'
as $$
declare
  v record; v_price_table uuid; v_products jsonb; v_customers jsonb; v_stock jsonb; v_prices jsonb; v_promotions jsonb; v_context jsonb; v_cash jsonb; v_history jsonb;
begin
  select * into v from private.resolve_pdv_device(p_device_token);
  if v.device_id is null then return jsonb_build_object('ok',false,'error','invalid_device'); end if;
  update public.pdv_devices set status='online',last_seen_at=now(),updated_at=now() where id=v.device_id;
  select id into v_price_table from public.price_tables where tenant_id=v.tenant_id and company_id=v.company_id and is_default=true and active=true and (valid_from is null or valid_from<=current_date) and (valid_to is null or valid_to>=current_date) order by updated_at desc limit 1;
  select jsonb_build_object(
    'device_id',d.id,'device_name',d.name,'branch_id',b.id,'branch_name',b.name,'company_id',c.id,'company_name',coalesce(c.trade_name,c.legal_name),'pos_register_id',pr.id,'pos_name',pr.name,'pos_code',pr.code,'config',d.config,'price_table_id',v_price_table,
    'fiscal_provider',(select fs.provider from public.fiscal_settings fs where fs.tenant_id=v.tenant_id limit 1),
    'fiscal_environment',(select fs.environment from public.fiscal_settings fs where fs.tenant_id=v.tenant_id limit 1)
  ) into v_context
   from public.pdv_devices d join public.branches b on b.id=d.branch_id join public.companies c on c.id=d.company_id join public.pos_registers pr on pr.id=d.pos_register_id where d.id=v.device_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'sku',p.sku,'name',p.name,'unit',p.unit,'group_id',p.group_id,'ncm',p.ncm,'cest',p.cest,'cfop',p.cfop_default,'sale_price',p.sale_price,'minimum_stock',p.minimum_stock,'active',p.active,'updated_at',p.updated_at,'barcodes',coalesce((select jsonb_agg(pb.barcode order by pb.is_primary desc,pb.created_at) from public.product_barcodes pb where pb.tenant_id=v.tenant_id and pb.product_id=p.id),'[]'::jsonb)) order by p.name),'[]'::jsonb) into v_products from public.products p where p.tenant_id=v.tenant_id and (p_since is null or p.updated_at>p_since);
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'document',c.document,'email',c.email,'phone',c.phone,'active',c.active,'updated_at',c.updated_at) order by c.name),'[]'::jsonb) into v_customers from public.customers c where c.tenant_id=v.tenant_id and (c.company_id is null or c.company_id=v.company_id) and (p_since is null or c.updated_at>p_since);
  select coalesce(jsonb_agg(jsonb_build_object('product_id',i.product_id,'quantity',i.quantity,'reserved_quantity',i.reserved_quantity,'updated_at',i.updated_at)),'[]'::jsonb) into v_stock from public.inventory_balances i where i.tenant_id=v.tenant_id and i.branch_id=v.branch_id and (p_since is null or i.updated_at>p_since);
  select coalesce(jsonb_agg(jsonb_build_object('product_id',pti.product_id,'price',pti.price)),'[]'::jsonb) into v_prices from public.price_table_items pti where pti.price_table_id=v_price_table;
  select coalesce(jsonb_agg(jsonb_build_object('id',pr.id,'name',pr.name,'valid_from',pr.valid_from,'valid_to',pr.valid_to,'rules',pr.rules,'updated_at',pr.updated_at)),'[]'::jsonb) into v_promotions from public.promotions pr where pr.tenant_id=v.tenant_id and pr.company_id=v.company_id and pr.active=true and (pr.valid_from is null or pr.valid_from<=now()) and (pr.valid_to is null or pr.valid_to>=now());
  select coalesce(jsonb_agg(jsonb_build_object('id',cs.id,'status',cs.status,'opening_amount',cs.opening_amount,'opened_at',cs.opened_at,'pos_register_id',cs.pos_register_id) order by cs.opened_at desc),'[]'::jsonb) into v_cash from public.cash_sessions cs where cs.tenant_id=v.tenant_id and cs.pos_register_id=v.pos_register_id and cs.status='open';

  select coalesce(jsonb_agg(to_jsonb(h) order by h.created_at desc),'[]'::jsonb) into v_history
  from (
    select s.id,s.client_event_id,s.number,s.status,s.subtotal,s.discount,s.total,s.created_at,s.completed_at,s.cancelled_at,
      c.name as customer_name,
      coalesce((select jsonb_agg(jsonb_build_object(
        'sale_item_id',si.id,'product_id',si.product_id,'sku',si.sku,'name',si.description,'unit',si.unit,'quantity',si.quantity,
        'returned_quantity',coalesce((select sum(sri.quantity) from public.sale_return_items sri join public.sale_returns sr on sr.id=sri.return_id where sri.sale_item_id=si.id and sr.status='completed'),0),
        'unit_price',si.unit_price,'discount',si.discount,'total',si.total
      ) order by si.created_at) from public.sale_items si where si.sale_id=s.id),'[]'::jsonb) as items,
      coalesce((select jsonb_agg(jsonb_build_object('method',p.method,'status',p.status,'amount',p.amount,'provider',p.provider,'external_id',p.external_id,'txid',p.txid) order by p.created_at) from public.payments p where p.sale_id=s.id),'[]'::jsonb) as payments,
      (select jsonb_build_object('id',fd.id,'document_type',fd.document_type,'status',fd.status,'number',fd.number,'series',fd.series,'access_key',fd.access_key,'protocol',fd.protocol,'pdf_path',fd.pdf_path,'provider',fd.provider,'rejection_code',fd.rejection_code,'rejection_message',fd.rejection_message) from public.fiscal_documents fd where fd.sale_id=s.id and fd.document_type='nfce' order by fd.created_at desc limit 1) as fiscal,
      coalesce((select sum(sr.total) from public.sale_returns sr where sr.sale_id=s.id and sr.status='completed'),0) as returned_total
    from public.sales s
    left join public.customers c on c.id=s.customer_id
    where s.tenant_id=v.tenant_id and s.branch_id=v.branch_id and s.created_at>=now()-interval '90 days'
    order by s.created_at desc
    limit 200
  ) h;

  return jsonb_build_object('ok',true,'server_time',now(),'cursor',now(),'context',v_context,'products',v_products,'customers',v_customers,'inventory',v_stock,'price_items',v_prices,'promotions',v_promotions,'open_cash_sessions',v_cash,'sales_history',v_history);
end $$;

create or replace function public.pdv_sync_push(p_device_token text, p_events jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','extensions'
as $$
declare
  v record; e jsonb; v_event_id uuid; v_type text; v_payload jsonb; v_result jsonb; v_existing record; v_cash uuid; v_amount numeric; v_expected numeric; v_customer uuid; v_sale uuid; v_fiscal boolean; v_results jsonb:='[]'::jsonb;
begin
  select * into v from private.resolve_pdv_device(p_device_token);
  if v.device_id is null then return jsonb_build_object('ok',false,'error','invalid_device'); end if;
  if jsonb_typeof(p_events)<>'array' then return jsonb_build_object('ok',false,'error','events_must_be_array'); end if;
  if jsonb_array_length(p_events)>100 then return jsonb_build_object('ok',false,'error','too_many_events','max',100); end if;
  update public.pdv_devices set status='online',last_seen_at=now(),updated_at=now() where id=v.device_id;

  for e in select * from jsonb_array_elements(p_events) loop
    begin
      v_event_id:=(e->>'id')::uuid; v_type:=lower(trim(e->>'type')); v_payload:=coalesce(e->'payload','{}'::jsonb);
      select status,result,error into v_existing from public.pdv_sync_events where device_id=v.device_id and client_event_id=v_event_id;
      if found then
        v_results:=v_results||jsonb_build_array(jsonb_build_object('id',v_event_id,'type',v_type,'status',v_existing.status,'result',v_existing.result,'error',v_existing.error,'idempotent',true));
        continue;
      end if;
      insert into public.pdv_sync_events(tenant_id,device_id,client_event_id,event_type,payload) values(v.tenant_id,v.device_id,v_event_id,v_type,v_payload);

      if v_type='cash_open' then
        select id into v_cash from public.cash_sessions where tenant_id=v.tenant_id and pos_register_id=v.pos_register_id and status='open' order by opened_at desc limit 1;
        if v_cash is null then
          insert into public.cash_sessions(tenant_id,pos_register_id,status,opening_amount,opened_at,notes,pdv_device_id,client_event_id)
          values(v.tenant_id,v.pos_register_id,'open',greatest(coalesce(nullif(v_payload->>'opening_amount','')::numeric,0),0),coalesce(nullif(v_payload->>'occurred_at','')::timestamptz,now()),nullif(v_payload->>'notes',''),v.device_id,v_event_id) returning id into v_cash;
        end if;
        v_result:=jsonb_build_object('ok',true,'cash_session_id',v_cash);

      elsif v_type='cash_movement' then
        select id into v_cash from public.cash_sessions where tenant_id=v.tenant_id and pos_register_id=v.pos_register_id and status='open' order by opened_at desc limit 1;
        if v_cash is null then raise exception 'cash_not_open'; end if;
        v_amount:=greatest(coalesce(nullif(v_payload->>'amount','')::numeric,0),0);
        if v_amount<=0 then raise exception 'invalid_amount'; end if;
        if coalesce(v_payload->>'movement_type','') not in ('supply','withdrawal','expense','refund') then raise exception 'invalid_cash_movement'; end if;
        insert into public.cash_movements(tenant_id,cash_session_id,movement_type,amount,notes,device_id,client_event_id)
          values(v.tenant_id,v_cash,v_payload->>'movement_type',v_amount,nullif(v_payload->>'notes',''),v.device_id,v_event_id)
          on conflict(device_id,client_event_id) do nothing;
        v_result:=jsonb_build_object('ok',true,'cash_session_id',v_cash);

      elsif v_type='sale_completed' then
        v_result:=private.pdv_process_sale(v.device_id,v.tenant_id,v.company_id,v.branch_id,v.pos_register_id,v_event_id,v_payload);
        if not coalesce((v_result->>'ok')::boolean,false) then raise exception '%',coalesce(v_result->>'error','sale_failed'); end if;

      elsif v_type='sale_return' then
        v_result:=private.pdv_process_return(v.device_id,v.tenant_id,v.company_id,v.branch_id,v.pos_register_id,v_event_id,v_payload);
        if not coalesce((v_result->>'ok')::boolean,false) then raise exception '%',coalesce(v_result->>'error','return_failed'); end if;

      elsif v_type='fiscal_nfce_request' then
        v_result:=private.pdv_request_nfce(v.device_id,v.tenant_id,v.company_id,v.branch_id,v_event_id,v_payload);
        if not coalesce((v_result->>'ok')::boolean,false) then raise exception '%',coalesce(v_result->>'error','nfce_request_failed'); end if;

      elsif v_type='customer_upsert' then
        if nullif(v_payload->>'id','') is not null then v_customer:=(v_payload->>'id')::uuid; else v_customer:=gen_random_uuid(); end if;
        if nullif(trim(v_payload->>'name'),'') is null then raise exception 'customer_name_required'; end if;
        if nullif(v_payload->>'document','') is not null then
          select id into v_customer from public.customers where tenant_id=v.tenant_id and document=v_payload->>'document' limit 1;
          if v_customer is null then v_customer:=coalesce(nullif(v_payload->>'id','')::uuid,gen_random_uuid()); end if;
        end if;
        insert into public.customers(id,tenant_id,company_id,type,name,document,email,phone,active)
          values(v_customer,v.tenant_id,v.company_id,coalesce(nullif(v_payload->>'customer_type',''),'individual'),v_payload->>'name',nullif(v_payload->>'document',''),nullif(v_payload->>'email',''),nullif(v_payload->>'phone',''),true)
          on conflict(id) do update set name=excluded.name,document=excluded.document,email=excluded.email,phone=excluded.phone,active=true,updated_at=now();
        v_result:=jsonb_build_object('ok',true,'customer_id',v_customer);

      elsif v_type='sale_cancel' then
        v_sale:=null;
        if nullif(v_payload->>'sale_id','') is not null then
          select id into v_sale from public.sales where id=(v_payload->>'sale_id')::uuid and tenant_id=v.tenant_id;
        elsif nullif(v_payload->>'sale_client_event_id','') is not null then
          select id into v_sale from public.sales where pdv_device_id=v.device_id and client_event_id=(v_payload->>'sale_client_event_id')::uuid;
        end if;
        if v_sale is null then raise exception 'sale_not_found'; end if;
        if exists(select 1 from public.sales where id=v_sale and status='cancelled') then
          v_result:=jsonb_build_object('ok',true,'sale_id',v_sale,'idempotent',true);
        else
          select exists(select 1 from public.fiscal_documents fd where fd.sale_id=v_sale and fd.status='authorized') into v_fiscal;
          if v_fiscal then raise exception 'authorized_fiscal_document_requires_fiscal_cancellation'; end if;
          insert into public.stock_movements(tenant_id,branch_id,product_id,movement_type,quantity,reference_type,reference_id,notes)
            select s.tenant_id,s.branch_id,si.product_id,'sale_cancel',abs(si.quantity),'sale_cancel',s.id,'Estorno de estoque por cancelamento PDV'
            from public.sales s join public.sale_items si on si.sale_id=s.id where s.id=v_sale and si.product_id is not null;
          insert into public.inventory_balances(tenant_id,branch_id,product_id,quantity,reserved_quantity,updated_at)
            select s.tenant_id,s.branch_id,si.product_id,abs(si.quantity),0,now() from public.sales s join public.sale_items si on si.sale_id=s.id where s.id=v_sale and si.product_id is not null
            on conflict(tenant_id,branch_id,product_id) do update set quantity=public.inventory_balances.quantity+excluded.quantity,updated_at=now();
          update public.sales set status='cancelled',cancelled_at=coalesce(nullif(v_payload->>'occurred_at','')::timestamptz,now()) where id=v_sale;
          update public.financial_entries set status='cancelled',updated_at=now(),metadata=metadata||jsonb_build_object('cancelled_by','pdv_desktop','cancel_event_id',v_event_id) where sale_id=v_sale;
          update public.payments set status='cancelled',metadata=metadata||jsonb_build_object('cancellation_pending_provider_reversal',method not in ('cash','store_credit')) where sale_id=v_sale and status in ('paid','authorized');
          v_result:=jsonb_build_object('ok',true,'sale_id',v_sale,'warning','non_cash_payments_may_require_provider_reversal');
        end if;

      elsif v_type='cash_close' then
        select id into v_cash from public.cash_sessions where tenant_id=v.tenant_id and pos_register_id=v.pos_register_id and status='open' order by opened_at desc limit 1;
        if v_cash is null then raise exception 'cash_not_open'; end if;
        select cs.opening_amount
          + coalesce((select sum(p.amount) from public.payments p join public.sales s on s.id=p.sale_id where s.cash_session_id=cs.id and p.method='cash' and p.status='paid'),0)
          + coalesce((select sum(cm.amount) from public.cash_movements cm where cm.cash_session_id=cs.id and cm.movement_type='supply'),0)
          - coalesce((select sum(cm.amount) from public.cash_movements cm where cm.cash_session_id=cs.id and cm.movement_type in ('withdrawal','expense','refund')),0)
        into v_expected from public.cash_sessions cs where cs.id=v_cash;
        update public.cash_sessions set status='closed',closing_amount=greatest(coalesce(nullif(v_payload->>'closing_amount','')::numeric,0),0),closed_at=coalesce(nullif(v_payload->>'occurred_at','')::timestamptz,now()),notes=concat_ws(' | ',notes,nullif(v_payload->>'notes','')) where id=v_cash;
        v_result:=jsonb_build_object('ok',true,'cash_session_id',v_cash,'expected_cash',v_expected,'closing_amount',greatest(coalesce(nullif(v_payload->>'closing_amount','')::numeric,0),0),'difference',greatest(coalesce(nullif(v_payload->>'closing_amount','')::numeric,0),0)-v_expected);

      else
        raise exception 'unsupported_event_type';
      end if;

      update public.pdv_sync_events set status='processed',result=coalesce(v_result,'{}'::jsonb),processed_at=now() where device_id=v.device_id and client_event_id=v_event_id;
      v_results:=v_results||jsonb_build_array(jsonb_build_object('id',v_event_id,'type',v_type,'status','processed','result',v_result));
    exception when others then
      update public.pdv_sync_events set status='rejected',error=sqlerrm,processed_at=now() where device_id=v.device_id and client_event_id=v_event_id;
      v_results:=v_results||jsonb_build_array(jsonb_build_object('id',v_event_id,'type',coalesce(v_type,''),'status','rejected','error',sqlerrm));
    end;
  end loop;
  return jsonb_build_object('ok',true,'server_time',now(),'results',v_results);
end $$;

revoke all on function private.pdv_process_return(uuid,uuid,uuid,uuid,uuid,uuid,jsonb) from public, anon, authenticated;
revoke all on function private.pdv_request_nfce(uuid,uuid,uuid,uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.pdv_pull(text,timestamptz) to anon, authenticated;
grant execute on function public.pdv_sync_push(text,jsonb) to anon, authenticated;
