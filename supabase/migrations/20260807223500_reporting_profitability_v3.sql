alter table public.sale_items add column if not exists cost_snapshot numeric(18,6);
alter table public.sale_items add column if not exists cost_snapshot_source text;

update public.sale_items si
set cost_snapshot = coalesce(p.cost_price,0),
    cost_snapshot_source = 'estimated_current_cost'
from public.products p
where si.product_id=p.id and si.cost_snapshot is null;

update public.sale_items set cost_snapshot_source='estimated_current_cost' where cost_snapshot_source is null;
alter table public.sale_items alter column cost_snapshot_source set default 'sale_time';

create or replace function public.set_sale_item_cost_snapshot()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if new.cost_snapshot is null and new.product_id is not null then
    select coalesce(p.cost_price,0) into new.cost_snapshot from public.products p where p.id=new.product_id;
  end if;
  if new.cost_snapshot_source is null then new.cost_snapshot_source := 'sale_time'; end if;
  return new;
end;
$$;

drop trigger if exists trg_sale_item_cost_snapshot on public.sale_items;
create trigger trg_sale_item_cost_snapshot before insert on public.sale_items for each row execute function public.set_sale_item_cost_snapshot();

alter table public.staff_users add column if not exists commission_percent numeric(8,4) not null default 0;
alter table public.staff_users drop constraint if exists staff_users_commission_percent_check;
alter table public.staff_users add constraint staff_users_commission_percent_check check (commission_percent between 0 and 100);

create or replace function public.erp_staff_set_commission(p_token text,p_staff_user_id uuid,p_percent numeric)
returns jsonb language plpgsql security definer set search_path to 'public','private','extensions' as $$
declare v record;
begin
  select * into v from private.resolve_temp_context(p_token);
  if v.user_id is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
  if p_percent is null or p_percent < 0 or p_percent > 100 then return jsonb_build_object('ok',false,'error','invalid_commission_percent'); end if;
  update public.staff_users u set commission_percent=p_percent,updated_at=now()
  where u.id=p_staff_user_id and u.tenant_id=v.tenant_id
    and exists(select 1 from public.access_profiles ap where ap.id=u.profile_id and ap.scope='PDV');
  if not found then return jsonb_build_object('ok',false,'error','operator_not_found'); end if;
  return jsonb_build_object('ok',true,'staff_user_id',p_staff_user_id,'commission_percent',p_percent);
end;
$$;

create or replace function public.erp_staff_pdv_list(p_token text)
returns jsonb language plpgsql security definer set search_path to 'public','private','extensions' as $$
declare v record; v_data jsonb;
begin
  select * into v from private.resolve_temp_context(p_token);
  if v.user_id is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.name),'[]'::jsonb) into v_data
  from (
    select u.id,u.name,u.email,u.active,u.last_access,u.profile_id,p.name profile,u.branch_id,b.name branch,u.commission_percent,u.created_at
    from public.staff_users u join public.access_profiles p on p.id=u.profile_id and p.scope='PDV'
    left join public.branches b on b.id=u.branch_id where u.tenant_id=v.tenant_id
  ) x;
  return jsonb_build_object('ok',true,'data',v_data);
end;
$$;

create or replace function public.erp_report_v3(
  p_token text,p_report text,p_start date default null,p_end date default null,p_branch uuid default null,p_filters jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path to 'public','private','extensions' as $$
declare v record; v_data jsonb := '[]'::jsonb; v_start date; v_end date := coalesce(p_end,current_date);
begin
  select * into v from private.resolve_temp_context(p_token);
  if v.user_id is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
  if p_branch is not null and not exists(select 1 from public.branches where id=p_branch and tenant_id=v.tenant_id) then return jsonb_build_object('ok',false,'error','invalid_branch'); end if;
  v_start := coalesce(p_start, case when p_report in ('no_movement_products','stagnant_stock') then v_end-90 else v_end-30 end);

  case p_report
    when 'dre_managerial' then
      with sales_totals as (
        select coalesce(sum(s.subtotal),0) gross_sales,coalesce(sum(s.discount),0) discounts,coalesce(sum(s.surcharge),0) surcharges,coalesce(sum(s.total),0) net_sales
        from public.sales s where s.tenant_id=v.tenant_id and s.status in ('completed','paid','fiscalized') and s.completed_at::date between v_start and v_end and (p_branch is null or s.branch_id=p_branch)
      ), returns_totals as (
        select coalesce(sum(sr.total),0) returns_total,coalesce(sum(sri.quantity*coalesce(si.cost_snapshot,p.cost_price,0)),0) returned_cost
        from public.sale_returns sr join public.sales s on s.id=sr.sale_id join public.sale_return_items sri on sri.return_id=sr.id
        left join public.sale_items si on si.id=sri.sale_item_id left join public.products p on p.id=sri.product_id
        where sr.tenant_id=v.tenant_id and coalesce(sr.status,'completed') not in ('cancelled','rejected') and sr.created_at::date between v_start and v_end and (p_branch is null or s.branch_id=p_branch)
      ), costs as (
        select coalesce(sum(si.quantity*coalesce(si.cost_snapshot,p.cost_price,0)),0) sold_cost
        from public.sale_items si join public.sales s on s.id=si.sale_id left join public.products p on p.id=si.product_id
        where s.tenant_id=v.tenant_id and s.status in ('completed','paid','fiscalized') and s.completed_at::date between v_start and v_end and (p_branch is null or s.branch_id=p_branch)
      ), expenses as (
        select coalesce(sum(f.amount),0) operating_expenses from public.financial_entries f
        where f.tenant_id=v.tenant_id and f.entry_type='payable' and f.purchase_id is null and f.status<>'cancelled' and f.created_at::date between v_start and v_end and (p_branch is null or f.branch_id=p_branch)
      ), vals as (
        select st.gross_sales,rt.returns_total,st.discounts,st.surcharges,st.net_sales-rt.returns_total net_revenue,c.sold_cost-rt.returned_cost cmv,e.operating_expenses
        from sales_totals st cross join returns_totals rt cross join costs c cross join expenses e
      ), rows as (
        select 1 ord,'RECEITAS' section,'Receita bruta de vendas' account,gross_sales amount,case when gross_sales=0 then 0 else 100 end percent_revenue from vals union all
        select 2,'DEDUÇÕES','(-) Devoluções',-returns_total,case when gross_sales=0 then 0 else -returns_total/gross_sales*100 end from vals union all
        select 3,'DEDUÇÕES','(-) Descontos',-discounts,case when gross_sales=0 then 0 else -discounts/gross_sales*100 end from vals union all
        select 4,'RECEITAS','(+) Acréscimos',surcharges,case when gross_sales=0 then 0 else surcharges/gross_sales*100 end from vals union all
        select 5,'RESULTADO','Receita líquida',net_revenue,case when gross_sales=0 then 0 else net_revenue/gross_sales*100 end from vals union all
        select 6,'CUSTOS','(-) CMV',-cmv,case when net_revenue=0 then 0 else -cmv/net_revenue*100 end from vals union all
        select 7,'RESULTADO','Lucro bruto',net_revenue-cmv,case when net_revenue=0 then 0 else (net_revenue-cmv)/net_revenue*100 end from vals union all
        select 8,'DESPESAS','(-) Despesas operacionais',-operating_expenses,case when net_revenue=0 then 0 else -operating_expenses/net_revenue*100 end from vals union all
        select 9,'RESULTADO','Resultado operacional gerencial',net_revenue-cmv-operating_expenses,case when net_revenue=0 then 0 else (net_revenue-cmv-operating_expenses)/net_revenue*100 end from vals
      ) select coalesce(jsonb_agg(to_jsonb(x) order by x.ord),'[]'::jsonb) into v_data from rows x;

    when 'product_margin' then
      with ledger as (
        select si.product_id,si.quantity qty,si.total revenue,si.quantity*coalesce(si.cost_snapshot,p.cost_price,0) cost,coalesce(si.cost_snapshot_source,'estimated_current_cost') cost_source
        from public.sale_items si join public.sales s on s.id=si.sale_id left join public.products p on p.id=si.product_id
        where s.tenant_id=v.tenant_id and s.status in ('completed','paid','fiscalized') and s.completed_at::date between v_start and v_end and (p_branch is null or s.branch_id=p_branch)
        union all
        select sri.product_id,-sri.quantity,-sri.total,-sri.quantity*coalesce(si.cost_snapshot,p.cost_price,0),coalesce(si.cost_snapshot_source,'estimated_current_cost')
        from public.sale_returns sr join public.sales s on s.id=sr.sale_id join public.sale_return_items sri on sri.return_id=sr.id
        left join public.sale_items si on si.id=sri.sale_item_id left join public.products p on p.id=sri.product_id
        where sr.tenant_id=v.tenant_id and coalesce(sr.status,'completed') not in ('cancelled','rejected') and sr.created_at::date between v_start and v_end and (p_branch is null or s.branch_id=p_branch)
      ) select coalesce(jsonb_agg(to_jsonb(x) order by x.gross_profit desc),'[]'::jsonb) into v_data from (
        select p.sku,p.name product,p.unit,sum(l.qty) quantity,sum(l.revenue) revenue,sum(l.cost) cmv,sum(l.revenue)-sum(l.cost) gross_profit,
          case when sum(l.revenue)=0 then 0 else (sum(l.revenue)-sum(l.cost))/sum(l.revenue)*100 end margin_percent,
          case when bool_and(l.cost_source='sale_time') then 'SNAPSHOT' when bool_and(l.cost_source='estimated_current_cost') then 'ESTIMADO' else 'MISTO' end cost_accuracy
        from ledger l left join public.products p on p.id=l.product_id group by p.id,p.sku,p.name,p.unit
      ) x;

    when 'abc_curve' then
      with ledger as (
        select si.product_id,si.quantity qty,si.total revenue from public.sale_items si join public.sales s on s.id=si.sale_id
        where s.tenant_id=v.tenant_id and s.status in ('completed','paid','fiscalized') and s.completed_at::date between v_start and v_end and (p_branch is null or s.branch_id=p_branch)
        union all
        select sri.product_id,-sri.quantity,-sri.total from public.sale_returns sr join public.sales s on s.id=sr.sale_id join public.sale_return_items sri on sri.return_id=sr.id
        where sr.tenant_id=v.tenant_id and coalesce(sr.status,'completed') not in ('cancelled','rejected') and sr.created_at::date between v_start and v_end and (p_branch is null or s.branch_id=p_branch)
      ), prod as (select l.product_id,sum(l.qty) quantity,sum(l.revenue) revenue from ledger l group by l.product_id having sum(l.revenue)<>0),
      ranked as (
        select p.*,row_number() over(order by p.revenue desc)::int ranking,
          case when sum(p.revenue) over()=0 then 0 else p.revenue/sum(p.revenue) over()*100 end revenue_share,
          case when sum(p.revenue) over()=0 then 0 else sum(p.revenue) over(order by p.revenue desc rows between unbounded preceding and current row)/sum(p.revenue) over()*100 end cumulative_share
        from prod p
      ) select coalesce(jsonb_agg(to_jsonb(x) order by x.ranking),'[]'::jsonb) into v_data from (
        select r.ranking,p.sku,p.name product,p.unit,r.quantity,r.revenue,r.revenue_share,r.cumulative_share,case when r.cumulative_share<=80 then 'A' when r.cumulative_share<=95 then 'B' else 'C' end abc_class
        from ranked r left join public.products p on p.id=r.product_id
      ) x;

    when 'cmv' then
      with ledger as (
        select s.completed_at::date report_day,si.quantity qty,si.total revenue,si.quantity*coalesce(si.cost_snapshot,p.cost_price,0) cost
        from public.sale_items si join public.sales s on s.id=si.sale_id left join public.products p on p.id=si.product_id
        where s.tenant_id=v.tenant_id and s.status in ('completed','paid','fiscalized') and s.completed_at::date between v_start and v_end and (p_branch is null or s.branch_id=p_branch)
        union all
        select sr.created_at::date,-sri.quantity,-sri.total,-sri.quantity*coalesce(si.cost_snapshot,p.cost_price,0)
        from public.sale_returns sr join public.sales s on s.id=sr.sale_id join public.sale_return_items sri on sri.return_id=sr.id
        left join public.sale_items si on si.id=sri.sale_item_id left join public.products p on p.id=sri.product_id
        where sr.tenant_id=v.tenant_id and coalesce(sr.status,'completed') not in ('cancelled','rejected') and sr.created_at::date between v_start and v_end and (p_branch is null or s.branch_id=p_branch)
      ) select coalesce(jsonb_agg(to_jsonb(x) order by x.report_day),'[]'::jsonb) into v_data from (
        select report_day,sum(qty) quantity,sum(revenue) revenue,sum(cost) cmv,sum(revenue)-sum(cost) gross_profit,case when sum(revenue)=0 then 0 else sum(cost)/sum(revenue)*100 end cmv_percent from ledger group by report_day
      ) x;

    when 'gross_profit' then
      with sales_daily as (
        select s.completed_at::date report_day,sum(s.total) revenue from public.sales s
        where s.tenant_id=v.tenant_id and s.status in ('completed','paid','fiscalized') and s.completed_at::date between v_start and v_end and (p_branch is null or s.branch_id=p_branch) group by 1
      ), return_daily as (
        select sr.created_at::date report_day,sum(sr.total) returns_total from public.sale_returns sr join public.sales s on s.id=sr.sale_id
        where sr.tenant_id=v.tenant_id and coalesce(sr.status,'completed') not in ('cancelled','rejected') and sr.created_at::date between v_start and v_end and (p_branch is null or s.branch_id=p_branch) group by 1
      ), cost_ledger as (
        select s.completed_at::date report_day,sum(si.quantity*coalesce(si.cost_snapshot,p.cost_price,0)) cost
        from public.sale_items si join public.sales s on s.id=si.sale_id left join public.products p on p.id=si.product_id
        where s.tenant_id=v.tenant_id and s.status in ('completed','paid','fiscalized') and s.completed_at::date between v_start and v_end and (p_branch is null or s.branch_id=p_branch) group by 1
        union all
        select sr.created_at::date,-sum(sri.quantity*coalesce(si.cost_snapshot,p.cost_price,0))
        from public.sale_returns sr join public.sales s on s.id=sr.sale_id join public.sale_return_items sri on sri.return_id=sr.id
        left join public.sale_items si on si.id=sri.sale_item_id left join public.products p on p.id=sri.product_id
        where sr.tenant_id=v.tenant_id and coalesce(sr.status,'completed') not in ('cancelled','rejected') and sr.created_at::date between v_start and v_end and (p_branch is null or s.branch_id=p_branch) group by 1
      ), days as (select report_day from sales_daily union select report_day from return_daily union select report_day from cost_ledger)
      select coalesce(jsonb_agg(to_jsonb(x) order by x.report_day),'[]'::jsonb) into v_data from (
        select d.report_day,coalesce(sd.revenue,0)-coalesce(rd.returns_total,0) net_revenue,coalesce(c.cost,0) cmv,
          (coalesce(sd.revenue,0)-coalesce(rd.returns_total,0))-coalesce(c.cost,0) gross_profit,
          case when coalesce(sd.revenue,0)-coalesce(rd.returns_total,0)=0 then 0 else ((coalesce(sd.revenue,0)-coalesce(rd.returns_total,0))-coalesce(c.cost,0))/(coalesce(sd.revenue,0)-coalesce(rd.returns_total,0))*100 end margin_percent
        from days d left join sales_daily sd using(report_day) left join return_daily rd using(report_day) left join (select report_day,sum(cost) cost from cost_ledger group by report_day) c using(report_day)
      ) x;

    when 'sales_timing' then
      select coalesce(jsonb_agg(to_jsonb(x) order by x.day_of_week,x.hour_of_day),'[]'::jsonb) into v_data from (
        select extract(dow from timezone('America/Fortaleza',s.completed_at))::int day_of_week,
          case extract(dow from timezone('America/Fortaleza',s.completed_at))::int when 0 then 'Domingo' when 1 then 'Segunda' when 2 then 'Terça' when 3 then 'Quarta' when 4 then 'Quinta' when 5 then 'Sexta' else 'Sábado' end weekday,
          extract(hour from timezone('America/Fortaleza',s.completed_at))::int hour_of_day,count(*)::int sales_count,sum(s.total) revenue,case when count(*)=0 then 0 else sum(s.total)/count(*) end avg_ticket
        from public.sales s where s.tenant_id=v.tenant_id and s.status in ('completed','paid','fiscalized') and s.completed_at::date between v_start and v_end and (p_branch is null or s.branch_id=p_branch)
        group by 1,2,3
      ) x;

    when 'average_ticket' then
      select coalesce(jsonb_agg(to_jsonb(x) order by x.report_day,x.branch),'[]'::jsonb) into v_data from (
        select s.completed_at::date report_day,b.name branch,count(*)::int sales_count,sum(s.total) revenue,case when count(*)=0 then 0 else sum(s.total)/count(*) end avg_ticket,coalesce(sum(items.qty),0) item_quantity
        from public.sales s left join public.branches b on b.id=s.branch_id left join lateral(select sum(si.quantity) qty from public.sale_items si where si.sale_id=s.id) items on true
        where s.tenant_id=v.tenant_id and s.status in ('completed','paid','fiscalized') and s.completed_at::date between v_start and v_end and (p_branch is null or s.branch_id=p_branch) group by 1,b.name
      ) x;

    when 'no_movement_products' then
      select coalesce(jsonb_agg(to_jsonb(x) order by x.stock_value desc,x.product),'[]'::jsonb) into v_data from (
        select p.sku,p.name product,p.unit,p.sale_price,p.cost_price,coalesce(st.current_stock,0) current_stock,coalesce(st.current_stock,0)*p.cost_price stock_value,ls.last_sale_at,v_end-coalesce(ls.last_sale_at::date,p.created_at::date) days_without_sale
        from public.products p
        left join lateral(select sum(i.quantity-i.reserved_quantity) current_stock from public.inventory_balances i where i.tenant_id=v.tenant_id and i.product_id=p.id and (p_branch is null or i.branch_id=p_branch)) st on true
        left join lateral(select max(s.completed_at) last_sale_at from public.sale_items si join public.sales s on s.id=si.sale_id where si.product_id=p.id and s.tenant_id=v.tenant_id and s.status in ('completed','paid','fiscalized') and (p_branch is null or s.branch_id=p_branch)) ls on true
        where p.tenant_id=v.tenant_id and p.active=true and not exists(select 1 from public.sale_items si join public.sales s on s.id=si.sale_id where si.product_id=p.id and s.tenant_id=v.tenant_id and s.status in ('completed','paid','fiscalized') and s.completed_at::date between v_start and v_end and (p_branch is null or s.branch_id=p_branch))
      ) x;

    when 'stagnant_stock' then
      select coalesce(jsonb_agg(to_jsonb(x) order by x.stock_value desc,x.days_stagnant desc),'[]'::jsonb) into v_data from (
        select p.sku,p.name product,p.unit,st.current_stock,p.cost_price,st.current_stock*p.cost_price stock_value,ls.last_sale_at,lm.last_outbound_at,
          v_end-greatest(p.created_at::date,coalesce(ls.last_sale_at::date,p.created_at::date),coalesce(lm.last_outbound_at::date,p.created_at::date)) days_stagnant
        from public.products p
        join lateral(select coalesce(sum(i.quantity-i.reserved_quantity),0) current_stock from public.inventory_balances i where i.tenant_id=v.tenant_id and i.product_id=p.id and (p_branch is null or i.branch_id=p_branch)) st on st.current_stock>0
        left join lateral(select max(s.completed_at) last_sale_at from public.sale_items si join public.sales s on s.id=si.sale_id where si.product_id=p.id and s.tenant_id=v.tenant_id and s.status in ('completed','paid','fiscalized') and (p_branch is null or s.branch_id=p_branch)) ls on true
        left join lateral(select max(sm.created_at) last_outbound_at from public.stock_movements sm where sm.tenant_id=v.tenant_id and sm.product_id=p.id and sm.movement_type in ('sale','out','loss','transfer_out') and (p_branch is null or sm.branch_id=p_branch)) lm on true
        where p.tenant_id=v.tenant_id and p.active=true and not exists(select 1 from public.sale_items si join public.sales s on s.id=si.sale_id where si.product_id=p.id and s.tenant_id=v.tenant_id and s.status in ('completed','paid','fiscalized') and s.completed_at::date between v_start and v_end and (p_branch is null or s.branch_id=p_branch))
      ) x;

    when 'seller_commission' then
      with returns_by_sale as (select sr.sale_id,sum(sr.total) return_total from public.sale_returns sr where sr.tenant_id=v.tenant_id and coalesce(sr.status,'completed') not in ('cancelled','rejected') group by sr.sale_id)
      select coalesce(jsonb_agg(to_jsonb(x) order by x.commission_amount desc,x.revenue desc),'[]'::jsonb) into v_data from (
        select coalesce(u.name,'Sem operador') seller,b.name branch,coalesce(u.commission_percent,0) commission_percent,count(*)::int sales_count,sum(s.total) gross_revenue,
          sum(coalesce(r.return_total,0)) returns_total,sum(s.total-coalesce(r.return_total,0)) revenue,sum(s.discount) discounts,
          sum(s.total-coalesce(r.return_total,0))*coalesce(u.commission_percent,0)/100 commission_amount
        from public.sales s left join public.staff_users u on u.id=s.staff_user_id left join public.branches b on b.id=s.branch_id left join returns_by_sale r on r.sale_id=s.id
        where s.tenant_id=v.tenant_id and s.status in ('completed','paid','fiscalized') and s.completed_at::date between v_start and v_end and (p_branch is null or s.branch_id=p_branch)
        group by u.id,u.name,u.commission_percent,b.name
      ) x;

    else return public.erp_report_v2(p_token,p_report,p_start,p_end,p_branch,p_filters);
  end case;

  return jsonb_build_object('ok',true,'report',p_report,'data',v_data,'start',v_start,'end',v_end,'branch',p_branch);
end;
$$;

revoke all on function public.erp_staff_set_commission(text,uuid,numeric) from public;
revoke all on function public.erp_staff_pdv_list(text) from public;
revoke all on function public.erp_report_v3(text,text,date,date,uuid,jsonb) from public;
grant execute on function public.erp_staff_set_commission(text,uuid,numeric) to anon,authenticated;
grant execute on function public.erp_staff_pdv_list(text) to anon,authenticated;
grant execute on function public.erp_report_v3(text,text,date,date,uuid,jsonb) to anon,authenticated;
