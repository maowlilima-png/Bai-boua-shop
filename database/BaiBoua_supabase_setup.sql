-- Bai Boua Shop Supabase setup for HTML v8
-- Run this once in Supabase Dashboard > SQL Editor.

create table if not exists public.app_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

drop policy if exists "Bai Boua read app state" on public.app_state;
drop policy if exists "Bai Boua insert app state" on public.app_state;
drop policy if exists "Bai Boua update app state" on public.app_state;

-- Prototype policy: allows the website using the anon key to read/write the single app state row.
-- For production, replace this with Supabase Auth + stricter RLS policies.
create policy "Bai Boua read app state"
on public.app_state
for select
to anon
using (id = 'main');

create policy "Bai Boua insert app state"
on public.app_state
for insert
to anon
with check (id = 'main');

create policy "Bai Boua update app state"
on public.app_state
for update
to anon
using (id = 'main')
with check (id = 'main');

insert into public.app_state (id, data)
values ('main', '{}'::jsonb)
on conflict (id) do nothing;
