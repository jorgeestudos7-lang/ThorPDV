create or replace function public.pdv_cash_preview(p_device_token text)
returns jsonb
language plpgsql
security definer
set search_path to public, private, extensions
as $$
declare
  v record; v_cash record; v_payments jsonb; v_movements jsonb;
  v_sales_count int := 0; v_sales_total numeric := 0; v_opening numeric := 0; v_cash_payments numeric := 0;
  v_supply numeric := 0; v_withdrawal numeric := 0; v_expense numeric := 0; v_refund numeric := 0; v_expected numeric := 0;
begin
  select * into v from private.resolve_pdv_device(p_device_token);
  if v.device_id is null then return jsonb_build_object('ok',false,'error','invalid_device'); end if;
  select cs.* into v_cash from public.cash_sessions cs where cs.tenant_id=v.tenant_id and cs.pos_register_id=v.pos_register_id and cs.status='open' order by cs.opened_at desc limit 1;
  if v_cash.id is null then return jsonb_build_object('ok',false,'error','cash_not_open'); end if;
  v_opening := coalesce(v_cash.opening_amount,0);
  select coalesce(jsonb_agg(jsonb_build_object('method',x.method,'amount',x.amount,'count',x.cnt) order by x.method),'[]'::jsonb),coalesce(sum(case when x.method='cash' then x.amount else 0 end),0)
  into v_payments,v_cash_payments from (select p.method,sum(p.amount)::numeric amount,count(*)::int cnt from public.payments p join public.sales s on s.id=p.sale_id where s.cash_session_id=v_cash.id and p.status in ('paid','authorized') and s.status<>'cancelled' group by p.method) x;
  select coalesce(count(*),0)::int,coalesce(sum(s.total),0)::numeric into v_sales_count,v_sales_total from public.sales s where s.cash_session_id=v_cash.id and s.status<>'cancelled';
  select coalesce(jsonb_agg(jsonb_build_object('movement_type',x.movement_type,'amount',x.amount,'count',x.cnt) order by x.movement_type),'[]'::jsonb) into v_movements from (select cm.movement_type,sum(cm.amount)::numeric amount,count(*)::int cnt from public.cash_movements cm where cm.cash_session_id=v_cash.id group by cm.movement_type) x;
  select coalesce(sum(case when movement_type='supply' then amount else 0 end),0),coalesce(sum(case when movement_type='withdrawal' then amount else 0 end),0),coalesce(sum(case when movement_type='expense' then amount else 0 end),0),coalesce(sum(case when movement_type='refund' then amount else 0 end),0) into v_supply,v_withdrawal,v_expense,v_refund from public.cash_movements where cash_session_id=v_cash.id;
  v_expected:=v_opening+v_cash_payments+v_supply-v_withdrawal-v_expense-v_refund;
  return jsonb_build_object('ok',true,'source','server','cash_session_id',v_cash.id,'client_event_id',v_cash.client_event_id,'opened_at',v_cash.opened_at,'operator_user_id',v_cash.staff_user_id,'opening_amount',v_opening,'sales_count',v_sales_count,'sales_total',v_sales_total,'payments',coalesce(v_payments,'[]'::jsonb),'movements',coalesce(v_movements,'[]'::jsonb),'cash_payments',v_cash_payments,'supply',v_supply,'withdrawal',v_withdrawal,'expense',v_expense,'refund',v_refund,'expected_cash',v_expected,'server_time',now());
end $$;

revoke all on function public.pdv_cash_preview(text) from public;
grant execute on function public.pdv_cash_preview(text) to anon, authenticated;
