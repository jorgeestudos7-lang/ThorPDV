-- Corrige o conflito usado por estoque/vendas PDV e adiciona recuperação/reconexão do agente.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='inventory_balances_tenant_branch_product_key'
      and conrelid='public.inventory_balances'::regclass
  ) then
    alter table public.inventory_balances
      add constraint inventory_balances_tenant_branch_product_key
      unique (tenant_id, branch_id, product_id);
  end if;
end $$;

create index if not exists idx_stock_movements_tenant_branch_product_created
  on public.stock_movements(tenant_id, branch_id, product_id, created_at desc);

create index if not exists idx_sales_pdv_device_client_event
  on public.sales(pdv_device_id, client_event_id)
  where pdv_device_id is not null and client_event_id is not null;

create or replace function public.pdv_recover_sync(p_device_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','extensions'
as $$
declare
  v record;
  v_cleared integer:=0;
begin
  select * into v from private.resolve_pdv_device(p_device_token);
  if v.device_id is null then return jsonb_build_object('ok',false,'error','invalid_device'); end if;
  delete from public.pdv_sync_events where device_id=v.device_id and status='rejected';
  get diagnostics v_cleared = row_count;
  update public.pdv_devices set status='online',last_seen_at=now(),updated_at=now() where id=v.device_id;
  return jsonb_build_object('ok',true,'cleared_server_rejections',v_cleared,'device_id',v.device_id);
end $$;

revoke all on function public.pdv_recover_sync(text) from public;
grant execute on function public.pdv_recover_sync(text) to anon, authenticated;

create or replace function public.erp_pdv_device_reconnect(p_token text,p_device_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','extensions'
as $$
declare
  v record;
  d public.pdv_devices%rowtype;
  r jsonb;
begin
  select * into v from private.resolve_temp_context(p_token);
  if v.user_id is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
  select * into d from public.pdv_devices where id=p_device_id and tenant_id=v.tenant_id;
  if d.id is null then return jsonb_build_object('ok',false,'error','device_not_found'); end if;
  delete from private.pdv_device_credentials where device_id=d.id;
  delete from public.pdv_sync_events where device_id=d.id and status='rejected';
  update public.pdv_devices set status='offline',updated_at=now() where id=d.id;
  select public.erp_pdv_generate_enrollment(p_token,d.pos_register_id,'Reconexão - '||coalesce(d.name,'ThorPDV Desktop')) into r;
  return coalesce(r,'{}'::jsonb)||jsonb_build_object('reconnect',true,'device_id',d.id,'machine_id',d.machine_id);
end $$;

revoke all on function public.erp_pdv_device_reconnect(text,uuid) from public;
grant execute on function public.erp_pdv_device_reconnect(text,uuid) to anon, authenticated;

create or replace function public.erp_pdv_devices(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','private'
as $$
declare v record; v_data jsonb;
begin
  select * into v from private.resolve_temp_context(p_token);
  if v.user_id is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',d.id,'name',d.name,'machine_id',d.machine_id,'hostname',d.hostname,'app_version',d.app_version,
    'status',case when d.status='blocked' then 'blocked' when d.last_seen_at>now()-interval '2 minutes' then 'online' else 'offline' end,
    'last_seen_at',d.last_seen_at,'enrolled_at',d.enrolled_at,'capabilities',d.capabilities,'config',d.config,
    'pos_register_id',d.pos_register_id,'pos_name',pr.name,'pos_code',pr.code,'branch_id',d.branch_id,'branch_name',b.name,
    'sync_processed',coalesce((select count(*) from public.pdv_sync_events se where se.device_id=d.id and se.status='processed'),0),
    'sync_rejected',coalesce((select count(*) from public.pdv_sync_events se where se.device_id=d.id and se.status='rejected'),0),
    'last_event_at',(select max(se.received_at) from public.pdv_sync_events se where se.device_id=d.id),
    'last_sync_error',(select se.error from public.pdv_sync_events se where se.device_id=d.id and se.status='rejected' order by se.received_at desc limit 1)
  ) order by d.created_at desc),'[]'::jsonb) into v_data
  from public.pdv_devices d join public.pos_registers pr on pr.id=d.pos_register_id join public.branches b on b.id=d.branch_id
  where d.tenant_id=v.tenant_id;
  return jsonb_build_object('ok',true,'data',v_data);
end $$;
