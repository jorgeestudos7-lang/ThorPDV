alter table public.stock_movements
  add column if not exists actor_type text,
  add column if not exists actor_id uuid;

alter table public.stock_movements drop constraint if exists stock_movements_actor_type_check;
alter table public.stock_movements add constraint stock_movements_actor_type_check
  check (actor_type is null or actor_type in ('auth_user','temp_user','pdv_device','system'));

create or replace function private.normalize_stock_movement_actor()
returns trigger
language plpgsql
security definer
set search_path to 'public','private','auth'
as $function$
begin
  if new.created_by is not null then
    if exists(select 1 from auth.users u where u.id=new.created_by) then
      new.actor_type:=coalesce(new.actor_type,'auth_user');
      new.actor_id:=coalesce(new.actor_id,new.created_by);
    else
      new.actor_id:=coalesce(new.actor_id,new.created_by);
      if new.actor_type is null then
        new.actor_type:=case when exists(select 1 from private.temp_users u where u.id=new.created_by) then 'temp_user' else 'system' end;
      end if;
      new.created_by:=null;
    end if;
  end if;
  return new;
end
$function$;

drop trigger if exists trg_normalize_stock_movement_actor on public.stock_movements;
create trigger trg_normalize_stock_movement_actor
before insert or update of created_by,actor_type,actor_id on public.stock_movements
for each row execute function private.normalize_stock_movement_actor();
