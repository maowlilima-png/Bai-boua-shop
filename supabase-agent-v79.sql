-- Bai Boua v79 Agent Table Final Fix
-- Run once in Supabase > SQL Editor > New Query > Run

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

create policy "allow all agents"
on public.agents
for all
using (true)
with check (true);

-- optional helper: see columns after run
-- select column_name, data_type from information_schema.columns where table_name='agents' order by ordinal_position;
