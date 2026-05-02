-- Bai Boua v77 Agent Fix SQL
-- Run in Supabase > SQL Editor if agent delete/toggle does not sync.
-- This website stores shared data in public.bb_state as JSON.

create table if not exists public.bb_state (
  key text primary key,
  data jsonb,
  updated_at timestamptz default now()
);

alter table public.bb_state enable row level security;
alter table public.bb_state replica identity full;

drop policy if exists "bb_state public read" on public.bb_state;
drop policy if exists "bb_state public insert" on public.bb_state;
drop policy if exists "bb_state public update" on public.bb_state;
drop policy if exists "bb_state public delete" on public.bb_state;

create policy "bb_state public read" on public.bb_state for select using (true);
create policy "bb_state public insert" on public.bb_state for insert with check (true);
create policy "bb_state public update" on public.bb_state for update using (true) with check (true);
create policy "bb_state public delete" on public.bb_state for delete using (true);

-- Optional cleanup: ensure keys can exist. Safe to run many times.
insert into public.bb_state(key, data, updated_at)
values
  ('BB4_agents', '[]'::jsonb, now()),
  ('BB4_deletedAgents', '{"ids":[],"phones":[],"names":[]}'::jsonb, now())
on conflict (key) do nothing;
