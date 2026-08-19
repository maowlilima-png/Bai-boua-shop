-- Bai Boua Admin V40 — SQL-backed admin orders
-- Run once in Supabase SQL Editor, then upload the V40 web files to GitHub.

create table if not exists public.admin_orders_v40 (
  id text primary key,
  order_type text not null check (order_type in ('preorder','ready')),
  order_date date not null default current_date,
  customer_name text not null default '',
  customer_phone text not null default '',
  carrier text not null default '',
  branch text not null default '',
  note text not null default '',
  total numeric(14,2) not null default 0,
  paid numeric(14,2) not null default 0,
  status text not null default '',
  work_status text,
  ready_status text,
  packing_state text not null default 'new',
  created_at_ms bigint not null default ((extract(epoch from now())*1000)::bigint),
  completed_at_ms bigint,
  archived_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_order_items_v40 (
  id text primary key,
  order_id text not null references public.admin_orders_v40(id) on delete cascade,
  name text not null default '',
  code text not null default '',
  image_url text,
  qty integer not null default 1 check (qty > 0),
  price numeric(14,2) not null default 0,
  item_type text not null default 'preorder',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_orders_v40_type_idx on public.admin_orders_v40(order_type);
create index if not exists admin_orders_v40_date_idx on public.admin_orders_v40(order_date desc);
create index if not exists admin_orders_v40_archived_idx on public.admin_orders_v40(archived_at);
create index if not exists admin_orders_v40_customer_idx on public.admin_orders_v40(customer_name);
create index if not exists admin_items_v40_order_idx on public.admin_order_items_v40(order_id);

create or replace function public.touch_admin_orders_v40()
returns trigger language plpgsql as $$
begin new.updated_at=now(); return new; end $$;
drop trigger if exists trg_touch_admin_orders_v40 on public.admin_orders_v40;
create trigger trg_touch_admin_orders_v40 before update on public.admin_orders_v40
for each row execute function public.touch_admin_orders_v40();

alter table public.admin_orders_v40 enable row level security;
alter table public.admin_order_items_v40 enable row level security;

-- This static GitHub Pages admin currently uses the project's anon key.
-- These policies are required for the existing client architecture.
drop policy if exists "Bai Boua V40 anon orders select" on public.admin_orders_v40;
drop policy if exists "Bai Boua V40 anon orders insert" on public.admin_orders_v40;
drop policy if exists "Bai Boua V40 anon orders update" on public.admin_orders_v40;
drop policy if exists "Bai Boua V40 anon orders delete" on public.admin_orders_v40;
create policy "Bai Boua V40 anon orders select" on public.admin_orders_v40 for select to anon, authenticated using (true);
create policy "Bai Boua V40 anon orders insert" on public.admin_orders_v40 for insert to anon, authenticated with check (true);
create policy "Bai Boua V40 anon orders update" on public.admin_orders_v40 for update to anon, authenticated using (true) with check (true);
create policy "Bai Boua V40 anon orders delete" on public.admin_orders_v40 for delete to anon, authenticated using (true);

drop policy if exists "Bai Boua V40 anon items select" on public.admin_order_items_v40;
drop policy if exists "Bai Boua V40 anon items insert" on public.admin_order_items_v40;
drop policy if exists "Bai Boua V40 anon items update" on public.admin_order_items_v40;
drop policy if exists "Bai Boua V40 anon items delete" on public.admin_order_items_v40;
create policy "Bai Boua V40 anon items select" on public.admin_order_items_v40 for select to anon, authenticated using (true);
create policy "Bai Boua V40 anon items insert" on public.admin_order_items_v40 for insert to anon, authenticated with check (true);
create policy "Bai Boua V40 anon items update" on public.admin_order_items_v40 for update to anon, authenticated using (true) with check (true);
create policy "Bai Boua V40 anon items delete" on public.admin_order_items_v40 for delete to anon, authenticated using (true);

select 'V40 READY' as status;
