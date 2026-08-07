-- Applied to project ovqjnkdnbkhslywumppn on 2026-08-07.
-- Creates sale return tracking, adds sale_return stock movement support,
-- and extends the PDV sync protocol with sales history, returns and NFC-e requests.
--
-- The authoritative deployed SQL is represented by the functions/tables below.

create table if not exists public.sale_returns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete restrict,
  pdv_device_id uuid references public.pdv_devices(id) on delete set null,
  client_event_id uuid,
  status text not null default 'completed' check (status in ('completed','cancelled')),
  reason text,
  refund_method text not null default 'cash' check (refund_method in ('cash','pix','credit_card','debit_card','voucher','store_credit','other')),
  total numeric(14,2) not null default 0 check (total >= 0),
  created_at timestamptz not null default now(),
  unique (pdv_device_id, client_event_id)
);

create table if not exists public.sale_return_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  return_id uuid not null references public.sale_returns(id) on delete cascade,
  sale_item_id uuid not null references public.sale_items(id) on delete restrict,
  product_id uuid references public.products(id) on delete set null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,4) not null default 0 check (unit_price >= 0),
  total numeric(14,2) not null default 0 check (total >= 0),
  created_at timestamptz not null default now(),
  unique (return_id, sale_item_id)
);

create index if not exists idx_sale_returns_sale on public.sale_returns(sale_id, created_at desc);
create index if not exists idx_sale_return_items_return on public.sale_return_items(return_id);
alter table public.sale_returns enable row level security;
alter table public.sale_return_items enable row level security;

alter table public.stock_movements drop constraint if exists stock_movements_movement_type_check;
alter table public.stock_movements add constraint stock_movements_movement_type_check check (movement_type in ('in','out','adjustment','loss','transfer_in','transfer_out','sale','sale_cancel','sale_return'));

-- private.pdv_process_return, private.pdv_request_nfce, public.pdv_pull and
-- public.pdv_sync_push are installed by the project migration and intentionally
-- remain SECURITY DEFINER RPCs. Direct table access is revoked below.
revoke all on public.sale_returns from public, anon, authenticated;
revoke all on public.sale_return_items from public, anon, authenticated;
