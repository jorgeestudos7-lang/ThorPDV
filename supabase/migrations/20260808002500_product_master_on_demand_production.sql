-- Cadastro mestre de produtos + produção sob demanda.
-- Esta migration consolida a estrutura introduzida na rodada de 2026-08-08.

alter table public.products
  add column if not exists supplier_id uuid references public.suppliers(id) on delete set null,
  add column if not exists exclusive_supplier boolean not null default false,
  add column if not exists financial_category text,
  add column if not exists stock_location text,
  add column if not exists fractioned boolean not null default false,
  add column if not exists prompt_quantity boolean not null default false,
  add column if not exists modifiers_enabled boolean not null default false,
  add column if not exists allow_discount boolean not null default true,
  add column if not exists apply_surcharge boolean not null default true,
  add column if not exists self_service boolean not null default false,
  add column if not exists favorite boolean not null default false,
  add column if not exists age_restricted boolean not null default false,
  add column if not exists label_scale boolean not null default false,
  add column if not exists shelf_life_days integer not null default 0,
  add column if not exists production_printer text,
  add column if not exists exped_shipping_printer text,
  add column if not exists production_description text,
  add column if not exists image_url text,
  add column if not exists menu_image_url text,
  add column if not exists self_service_image_url text,
  add column if not exists menu_description text,
  add column if not exists production_yield numeric not null default 1,
  add column if not exists is_manufactured boolean not null default false,
  add column if not exists production_mode text not null default 'stock',
  add column if not exists production_sector text,
  add column if not exists auto_print_production boolean not null default true;

create table if not exists public.product_purchase_units(
  id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,unit text not null,conversion_factor numeric not null default 1 check(conversion_factor>0),
  barcode text,is_default boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(product_id,unit,barcode));
create index if not exists product_purchase_units_product_idx on public.product_purchase_units(product_id);

create table if not exists public.product_modifier_links(
  product_id uuid not null references public.products(id) on delete cascade,modifier_id uuid not null references public.product_modifiers(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,created_at timestamptz not null default now(),primary key(product_id,modifier_id));

create table if not exists public.product_composition_items(
  id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,component_product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric not null check(quantity>0),unit text not null default 'UN',waste_percent numeric not null default 0 check(waste_percent>=0 and waste_percent<100),
  deduct_stock boolean not null default true,notes text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(product_id,component_product_id),check(product_id<>component_product_id));
create index if not exists product_composition_product_idx on public.product_composition_items(product_id);

create table if not exists public.product_history(
  id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,event_type text not null,description text not null,before_data jsonb,after_data jsonb,
  created_by uuid,created_at timestamptz not null default now());
create index if not exists product_history_product_idx on public.product_history(product_id,created_at desc);

create table if not exists public.production_orders(
  id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,branch_id uuid not null references public.branches(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,number bigint not null,status text not null default 'planned',planned_quantity numeric not null check(planned_quantity>0),
  produced_quantity numeric,unit text not null default 'UN',planned_at timestamptz not null default now(),started_at timestamptz,completed_at timestamptz,canceled_at timestamptz,
  total_component_cost numeric not null default 0,unit_production_cost numeric not null default 0,notes text,created_by uuid,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  order_type text not null default 'batch',sale_id uuid references public.sales(id) on delete set null,sale_item_id uuid references public.sale_items(id) on delete set null,
  printer_name text,production_sector text,print_status text not null default 'pending',printed_at timestamptz,delivered_at timestamptz,unique(tenant_id,number));
create index if not exists production_orders_branch_idx on public.production_orders(tenant_id,branch_id,status,created_at desc);
create index if not exists production_orders_sale_idx on public.production_orders(sale_id,created_at);
create index if not exists production_orders_kitchen_idx on public.production_orders(tenant_id,branch_id,order_type,status,created_at);

create table if not exists public.production_order_items(
  id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id) on delete cascade,
  production_order_id uuid not null references public.production_orders(id) on delete cascade,component_product_id uuid not null references public.products(id) on delete restrict,
  planned_quantity numeric not null check(planned_quantity>0),consumed_quantity numeric,unit text not null default 'UN',unit_cost numeric not null default 0,total_cost numeric not null default 0,
  deduct_stock boolean not null default true,created_at timestamptz not null default now());
create index if not exists production_order_items_order_idx on public.production_order_items(production_order_id);

alter table public.product_purchase_units enable row level security;
alter table public.product_modifier_links enable row level security;
alter table public.product_composition_items enable row level security;
alter table public.product_history enable row level security;
alter table public.production_orders enable row level security;
alter table public.production_order_items enable row level security;

alter table public.stock_movements drop constraint if exists stock_movements_movement_type_check;
alter table public.stock_movements add constraint stock_movements_movement_type_check check(movement_type in ('in','out','adjustment','loss','transfer_in','transfer_out','sale','sale_cancel','sale_return','production_consumption','production_output','production_cancel_return','production_adjustment'));

-- As funções finais desta feature são mantidas no banco de produção e atualizadas pelas migrations de release.
-- Schemas relevantes: erp_product_detail, erp_product_save_v3, erp_product_composition_set,
-- erp_production_orders, erp_production_order_status, pdv_pull, private.pdv_create_on_demand_order,
-- private.pdv_process_sale, private.pdv_process_return e private.handle_on_demand_sale_cancel.
