-- Bai Boua v56 Supabase-ready schema
-- Supabase > SQL Editor > paste all > Run

create table if not exists public.bb_state (
  key text primary key,
  data jsonb,
  updated_at timestamptz default now()
);

alter table public.bb_state enable row level security;

drop policy if exists "bb_state public read" on public.bb_state;
drop policy if exists "bb_state public insert" on public.bb_state;
drop policy if exists "bb_state public update" on public.bb_state;
drop policy if exists "bb_state public delete" on public.bb_state;

create policy "bb_state public read" on public.bb_state for select using (true);
create policy "bb_state public insert" on public.bb_state for insert with check (true);
create policy "bb_state public update" on public.bb_state for update using (true) with check (true);
create policy "bb_state public delete" on public.bb_state for delete using (true);

-- v62 production notes:
-- bb_state is the shared sync table used by this static website.
-- Run this file once in Supabase SQL Editor.
-- For a stronger future version, move passwords to Supabase Auth/Edge Functions.
alter table public.bb_state replica identity full;

-- v64: dedicated customer registry. Run this once in Supabase SQL Editor.
create table if not exists public.bb_customers (
  id text primary key,
  phone text unique not null,
  name text,
  pass text,
  avatar text,
  data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.bb_customers enable row level security;

drop policy if exists "bb_customers_select_anon" on public.bb_customers;
drop policy if exists "bb_customers_insert_anon" on public.bb_customers;
drop policy if exists "bb_customers_update_anon" on public.bb_customers;

create policy "bb_customers_select_anon" on public.bb_customers
for select to anon using (true);

create policy "bb_customers_insert_anon" on public.bb_customers
for insert to anon with check (true);

create policy "bb_customers_update_anon" on public.bb_customers
for update to anon using (true) with check (true);

-- v65: persistent customer registry in bb_state + customer delete permission
-- Run this whole file again in Supabase SQL Editor.
drop policy if exists "bb_customers_delete_anon" on public.bb_customers;
create policy "bb_customers_delete_anon" on public.bb_customers
for delete to anon using (true);
