alter function public.set_updated_at() set search_path = public;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.is_tenant_member(uuid) from public, anon;
grant execute on function public.is_tenant_member(uuid) to authenticated;

revoke execute on function public.create_tenant_with_owner(text, text) from public, anon;
grant execute on function public.create_tenant_with_owner(text, text) to authenticated;
