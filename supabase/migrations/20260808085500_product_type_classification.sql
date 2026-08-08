alter table public.products add column if not exists product_type text not null default 'resale';

update public.products
set product_type='resale'
where product_type is null or trim(product_type)='';

alter table public.products drop constraint if exists products_product_type_check;
alter table public.products add constraint products_product_type_check check (product_type in (
  'fixed_asset','packaging','use_consumption','raw_material','resale','other','other_inputs','finished_product','work_in_process','intermediate_product','service','byproduct'
));

create or replace function public.erp_product_save_v3(p_token text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','private'
as $function$
declare r jsonb; v record; pid uuid; mode text; supplier uuid; ptype text;
begin
  select * into v from private.resolve_temp_context(p_token);
  if v.user_id is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
  mode:=lower(coalesce(nullif(p_payload->>'production_mode',''),'stock'));
  if mode not in ('stock','on_demand','batch') then return jsonb_build_object('ok',false,'error','invalid_production_mode'); end if;
  ptype:=lower(coalesce(nullif(p_payload->>'product_type',''),'resale'));
  if ptype not in ('fixed_asset','packaging','use_consumption','raw_material','resale','other','other_inputs','finished_product','work_in_process','intermediate_product','service','byproduct') then return jsonb_build_object('ok',false,'error','invalid_product_type'); end if;
  supplier:=nullif(p_payload->>'supplier_id','')::uuid;
  if supplier is not null and not exists(select 1 from public.suppliers where id=supplier and tenant_id=v.tenant_id) then return jsonb_build_object('ok',false,'error','invalid_supplier'); end if;
  r:=public.erp_product_save_v2(p_token,p_payload);
  if not coalesce((r->>'ok')::boolean,false) then return r; end if;
  pid:=(r->>'id')::uuid;
  update public.products set
    product_type=ptype,
    production_mode=mode,
    production_sector=case when p_payload?'production_sector' then nullif(p_payload->>'production_sector','') else production_sector end,
    auto_print_production=coalesce((p_payload->>'auto_print_production')::boolean,auto_print_production),
    is_manufactured=case when mode in ('on_demand','batch') then true else is_manufactured end,
    origin=coalesce(nullif(p_payload->>'origin','')::smallint,origin),
    fiscal_profile=case when p_payload?'fiscal_profile' then coalesce(p_payload->'fiscal_profile','{}'::jsonb) else fiscal_profile end,
    updated_at=now()
  where id=pid and tenant_id=v.tenant_id;
  return r||jsonb_build_object('production_mode',mode,'product_type',ptype);
end $function$;

create or replace function public.erp_product_list(p_token text, p_search text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','private'
as $function$
declare v record; v_data jsonb; q text := '%' || coalesce(trim(p_search),'') || '%';
begin
  select * into v from private.resolve_temp_context(p_token);
  if v.user_id is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into v_data
  from (
    select p.id,p.sku,p.name,p.description,p.unit,p.product_type,p.is_weighable,p.ncm,p.cest,p.cfop_default,p.cost_price,p.sale_price,p.minimum_stock,p.active,
           p.group_id,g.name group_name,p.class_id,c.name class_name,p.production_mode,p.is_manufactured,p.production_sector,p.production_printer,p.auto_print_production,
           (select b.barcode from product_barcodes b where b.product_id=p.id order by b.is_primary desc,b.created_at limit 1) barcode,
           coalesce((select i.quantity-i.reserved_quantity from inventory_balances i where i.product_id=p.id and i.tenant_id=v.tenant_id and i.branch_id=v.branch_id),0) stock,
           p.created_at,p.updated_at
    from products p
    left join product_groups g on g.id=p.group_id
    left join product_classes c on c.id=p.class_id
    where p.tenant_id=v.tenant_id
      and (p_search is null or p.name ilike q or coalesce(p.sku,'') ilike q or exists(select 1 from product_barcodes b where b.product_id=p.id and b.barcode ilike q))
    limit 500
  ) x;
  return jsonb_build_object('ok',true,'data',v_data,'branch_id',v.branch_id);
end $function$;
