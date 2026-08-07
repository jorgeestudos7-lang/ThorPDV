create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  document text,
  status text not null default 'active' check (status in ('active','suspended','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenant_members (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'operator' check (role in ('owner','admin','manager','cashier','operator','accountant')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  legal_name text not null,
  trade_name text,
  cnpj text,
  state_registration text,
  municipal_registration text,
  tax_regime text,
  email text,
  phone text,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, cnpj)
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  cnpj text,
  is_headquarters boolean not null default false,
  street text,
  number text,
  complement text,
  district text,
  city text,
  state char(2),
  postal_code text,
  ibge_city_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  type text not null default 'individual' check (type in ('individual','company')),
  name text not null,
  document text,
  email text,
  phone text,
  state_registration text,
  street text,
  number text,
  complement text,
  district text,
  city text,
  state char(2),
  postal_code text,
  ibge_city_code text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  name text not null,
  document text,
  email text,
  phone text,
  state_registration text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  sku text,
  name text not null,
  description text,
  unit text not null default 'UN',
  ncm text,
  cest text,
  origin smallint,
  cfop_default text,
  fiscal_profile jsonb not null default '{}'::jsonb,
  cost_price numeric(15,4) not null default 0,
  sale_price numeric(15,4) not null default 0,
  minimum_stock numeric(15,4) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, sku)
);

create table public.product_barcodes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  barcode text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tenant_id, barcode)
);

create table public.inventory_balances (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity numeric(15,4) not null default 0,
  reserved_quantity numeric(15,4) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (branch_id, product_id)
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  movement_type text not null check (movement_type in ('in','out','adjustment','transfer_in','transfer_out','sale','sale_cancel')),
  quantity numeric(15,4) not null,
  unit_cost numeric(15,4),
  reference_type text,
  reference_id uuid,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  number bigint generated by default as identity,
  channel text not null default 'pdv' check (channel in ('pdv','backoffice','ecommerce','marketplace','api')),
  status text not null default 'open' check (status in ('open','completed','cancelled')),
  subtotal numeric(15,2) not null default 0,
  discount numeric(15,2) not null default 0,
  freight numeric(15,2) not null default 0,
  total numeric(15,2) not null default 0,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  cancelled_at timestamptz
);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid references public.products(id) on delete restrict,
  sku text,
  description text not null,
  unit text not null default 'UN',
  quantity numeric(15,4) not null check (quantity > 0),
  unit_price numeric(15,4) not null default 0,
  discount numeric(15,2) not null default 0,
  total numeric(15,2) not null default 0,
  fiscal_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sale_id uuid references public.sales(id) on delete cascade,
  method text not null check (method in ('cash','pix','credit_card','debit_card','voucher','store_credit','other')),
  status text not null default 'pending' check (status in ('pending','authorized','paid','failed','cancelled','refunded')),
  amount numeric(15,2) not null check (amount >= 0),
  provider text,
  external_id text,
  txid text,
  paid_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.financial_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  entry_type text not null check (entry_type in ('receivable','payable')),
  status text not null default 'open' check (status in ('open','partial','paid','overdue','cancelled')),
  description text not null,
  amount numeric(15,2) not null,
  paid_amount numeric(15,2) not null default 0,
  due_date date,
  paid_at timestamptz,
  customer_id uuid references public.customers(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  sale_id uuid references public.sales(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.fiscal_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  sale_id uuid references public.sales(id) on delete set null,
  document_type text not null check (document_type in ('nfe','nfce','nfse')),
  environment text not null default 'homologation' check (environment in ('homologation','production')),
  status text not null default 'draft' check (status in ('draft','processing','authorized','rejected','cancelled','contingency')),
  series text,
  number text,
  access_key text,
  protocol text,
  authorization_at timestamptz,
  cancellation_protocol text,
  cancellation_at timestamptz,
  rejection_code text,
  rejection_message text,
  xml_path text,
  pdf_path text,
  provider text,
  provider_reference text,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_tenant_members_user on public.tenant_members(user_id);
create index idx_companies_tenant on public.companies(tenant_id);
create index idx_branches_tenant on public.branches(tenant_id);
create index idx_products_tenant_name on public.products(tenant_id, name);
create index idx_customers_tenant_name on public.customers(tenant_id, name);
create index idx_sales_tenant_created on public.sales(tenant_id, created_at desc);
create index idx_stock_movements_product_created on public.stock_movements(product_id, created_at desc);
create index idx_financial_entries_tenant_due on public.financial_entries(tenant_id, due_date);
create index idx_fiscal_documents_sale on public.fiscal_documents(sale_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger tenants_updated_at before update on public.tenants for each row execute function public.set_updated_at();
create trigger companies_updated_at before update on public.companies for each row execute function public.set_updated_at();
create trigger branches_updated_at before update on public.branches for each row execute function public.set_updated_at();
create trigger customers_updated_at before update on public.customers for each row execute function public.set_updated_at();
create trigger suppliers_updated_at before update on public.suppliers for each row execute function public.set_updated_at();
create trigger products_updated_at before update on public.products for each row execute function public.set_updated_at();
create trigger financial_entries_updated_at before update on public.financial_entries for each row execute function public.set_updated_at();
create trigger fiscal_documents_updated_at before update on public.fiscal_documents for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_tenant_member(target_tenant uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.tenant_members tm
    where tm.tenant_id = target_tenant and tm.user_id = auth.uid()
  );
$$;

create or replace function public.create_tenant_with_owner(p_name text, p_document text default null)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  new_tenant_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  insert into public.tenants (name, document)
  values (p_name, p_document)
  returning id into new_tenant_id;

  insert into public.tenant_members (tenant_id, user_id, role)
  values (new_tenant_id, auth.uid(), 'owner');

  return new_tenant_id;
end;
$$;

grant execute on function public.create_tenant_with_owner(text, text) to authenticated;

alter table public.profiles enable row level security;
alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;
alter table public.companies enable row level security;
alter table public.branches enable row level security;
alter table public.customers enable row level security;
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.product_barcodes enable row level security;
alter table public.inventory_balances enable row level security;
alter table public.stock_movements enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.payments enable row level security;
alter table public.financial_entries enable row level security;
alter table public.fiscal_documents enable row level security;

create policy profiles_select_own on public.profiles for select using (id = auth.uid());
create policy profiles_update_own on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy tenants_member_select on public.tenants for select using (public.is_tenant_member(id));
create policy tenants_member_update on public.tenants for update using (public.is_tenant_member(id)) with check (public.is_tenant_member(id));

create policy tenant_members_select on public.tenant_members for select using (public.is_tenant_member(tenant_id));

create policy companies_member_all on public.companies for all using (public.is_tenant_member(tenant_id)) with check (public.is_tenant_member(tenant_id));
create policy branches_member_all on public.branches for all using (public.is_tenant_member(tenant_id)) with check (public.is_tenant_member(tenant_id));
create policy customers_member_all on public.customers for all using (public.is_tenant_member(tenant_id)) with check (public.is_tenant_member(tenant_id));
create policy suppliers_member_all on public.suppliers for all using (public.is_tenant_member(tenant_id)) with check (public.is_tenant_member(tenant_id));
create policy products_member_all on public.products for all using (public.is_tenant_member(tenant_id)) with check (public.is_tenant_member(tenant_id));
create policy product_barcodes_member_all on public.product_barcodes for all using (public.is_tenant_member(tenant_id)) with check (public.is_tenant_member(tenant_id));
create policy inventory_balances_member_all on public.inventory_balances for all using (public.is_tenant_member(tenant_id)) with check (public.is_tenant_member(tenant_id));
create policy stock_movements_member_all on public.stock_movements for all using (public.is_tenant_member(tenant_id)) with check (public.is_tenant_member(tenant_id));
create policy sales_member_all on public.sales for all using (public.is_tenant_member(tenant_id)) with check (public.is_tenant_member(tenant_id));
create policy sale_items_member_all on public.sale_items for all using (public.is_tenant_member(tenant_id)) with check (public.is_tenant_member(tenant_id));
create policy payments_member_all on public.payments for all using (public.is_tenant_member(tenant_id)) with check (public.is_tenant_member(tenant_id));
create policy financial_entries_member_all on public.financial_entries for all using (public.is_tenant_member(tenant_id)) with check (public.is_tenant_member(tenant_id));
create policy fiscal_documents_member_all on public.fiscal_documents for all using (public.is_tenant_member(tenant_id)) with check (public.is_tenant_member(tenant_id));
