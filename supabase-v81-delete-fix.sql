-- Bai Boua v81 Delete Fix SQL
-- Run once in Supabase > SQL Editor > New Query > Run
-- This website stores most shared data as JSON in public.bb_state.

create table if not exists public.bb_state (
  key text primary key,
  data jsonb,
  updated_at timestamptz default now()
);

alter table public.bb_state enable row level security;
alter table public.bb_state replica identity full;

drop policy if exists "allow all state" on public.bb_state;
drop policy if exists "bb_state public read" on public.bb_state;
drop policy if exists "bb_state public insert" on public.bb_state;
drop policy if exists "bb_state public update" on public.bb_state;
drop policy if exists "bb_state public delete" on public.bb_state;
create policy "allow all state" on public.bb_state for all using (true) with check (true);

insert into public.bb_state(key, data, updated_at)
values
  ('BB4_users', '[]'::jsonb, now()),
  ('BB4_customerRegistry', '[]'::jsonb, now()),
  ('BB4_agents', '[]'::jsonb, now()),
  ('BB4_orders', '[]'::jsonb, now()),
  ('BB4_deletedCustomers', '{"ids":[],"phones":[],"names":[]}'::jsonb, now()),
  ('BB4_deletedAgents', '{"ids":[],"phones":[],"names":[]}'::jsonb, now()),
  ('BB4_deletedOrders', '{"ids":[],"phones":[],"names":[]}'::jsonb, now())
on conflict (key) do nothing;

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

drop policy if exists "bb_customers_allow_all" on public.bb_customers;
drop policy if exists "bb_customers_select_anon" on public.bb_customers;
drop policy if exists "bb_customers_insert_anon" on public.bb_customers;
drop policy if exists "bb_customers_update_anon" on public.bb_customers;
drop policy if exists "bb_customers_delete_anon" on public.bb_customers;
create policy "bb_customers_allow_all" on public.bb_customers for all using (true) with check (true);

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  agent_code text,
  name text,
  phone text,
  password text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.agents add column if not exists agent_code text;
alter table public.agents add column if not exists name text;
alter table public.agents add column if not exists phone text;
alter table public.agents add column if not exists password text;
alter table public.agents add column if not exists is_active boolean default true;
alter table public.agents add column if not exists created_at timestamptz default now();
alter table public.agents add column if not exists updated_at timestamptz default now();

create unique index if not exists agents_agent_code_unique on public.agents(agent_code) where agent_code is not null;
create unique index if not exists agents_phone_unique on public.agents(phone) where phone is not null;

alter table public.agents enable row level security;

drop policy if exists "allow all" on public.agents;
drop policy if exists "allow all agents" on public.agents;
drop policy if exists "agents_allow_all" on public.agents;
create policy "agents_allow_all" on public.agents for all using (true) with check (true);
