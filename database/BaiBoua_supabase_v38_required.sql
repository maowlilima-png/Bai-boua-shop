-- Bai Boua Shop V38 - REQUIRED Supabase setup
-- Run once in Supabase > SQL Editor before publishing the site.
-- This keeps the website's existing app_state JSON model and product image storage.

create extension if not exists pgcrypto;

-- 1) Main app state used by app.js
create table if not exists public.app_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- If an older experiment created a `value` column, copy it into `data` when possible.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='app_state' and column_name='value'
  ) then
    execute $q$
      update public.app_state
      set data = coalesce(data, value::jsonb, '{}'::jsonb)
      where id='main'
    $q$;
  end if;
exception when others then
  raise notice 'Skipped legacy value -> data migration: %', sqlerrm;
end $$;

create or replace function public.baiboua_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_baiboua_app_state_updated_at on public.app_state;
create trigger trg_baiboua_app_state_updated_at
before update on public.app_state
for each row execute function public.baiboua_set_updated_at();

alter table public.app_state enable row level security;

drop policy if exists "Bai Boua read app state" on public.app_state;
drop policy if exists "Bai Boua insert app state" on public.app_state;
drop policy if exists "Bai Boua update app state" on public.app_state;
drop policy if exists "Bai Boua delete app state" on public.app_state;

-- Static GitHub Pages build currently uses the anon key directly.
-- These policies make the current V38 app functional. For stronger production
-- security, migrate admin writes to Supabase Auth later.
create policy "Bai Boua read app state"
on public.app_state for select
to anon, authenticated
using (id='main');

create policy "Bai Boua insert app state"
on public.app_state for insert
to anon, authenticated
with check (id='main');

create policy "Bai Boua update app state"
on public.app_state for update
to anon, authenticated
using (id='main')
with check (id='main');

grant select, insert, update on public.app_state to anon, authenticated;

insert into public.app_state (id, data)
values ('main', '{}'::jsonb)
on conflict (id) do nothing;

-- 2) Product image bucket used by app.js
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

-- Storage RLS policies. The current static app uploads using the anon key.
drop policy if exists "Bai Boua public product image read" on storage.objects;
drop policy if exists "Bai Boua anon product image insert" on storage.objects;
drop policy if exists "Bai Boua anon product image update" on storage.objects;
drop policy if exists "Bai Boua anon product image delete" on storage.objects;

create policy "Bai Boua public product image read"
on storage.objects for select
to public
using (bucket_id='product-images');

create policy "Bai Boua anon product image insert"
on storage.objects for insert
to anon, authenticated
with check (bucket_id='product-images');

create policy "Bai Boua anon product image update"
on storage.objects for update
to anon, authenticated
using (bucket_id='product-images')
with check (bucket_id='product-images');

create policy "Bai Boua anon product image delete"
on storage.objects for delete
to anon, authenticated
using (bucket_id='product-images');

-- Verification
select id, updated_at, jsonb_typeof(data) as data_type
from public.app_state
where id='main';
