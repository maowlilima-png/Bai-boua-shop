-- Bai Boua Shop: Customer + Ready Stock + Admin only
-- Safe cleanup for the app_state JSON used by the website.
-- Run once in Supabase SQL Editor after making a backup.

begin;

update public.app_state
set data = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        data,
        '{agents}',
        '[]'::jsonb,
        true
      ),
      '{categories}',
      coalesce((
        select jsonb_agg(category)
        from jsonb_array_elements(coalesce(data->'categories','[]'::jsonb)) category
        where trim(both '"' from category::text) not in ('ພຣີອໍເດີ້','Pre-order','Preorder')
      ), '[]'::jsonb),
      true
    ),
    '{products}',
    coalesce((
      select jsonb_agg(
        (product - 'agentPrice') || jsonb_build_object('type','ready')
      )
      from jsonb_array_elements(coalesce(data->'products','[]'::jsonb)) product
      where coalesce(product->>'type','ready') <> 'preorder'
    ), '[]'::jsonb),
    true
  ),
  '{orders}',
  coalesce((
    select jsonb_agg(
      (ord - 'sender' - 'agentTargetCounted') || jsonb_build_object('role','customer','type','ready')
    )
    from jsonb_array_elements(coalesce(data->'orders','[]'::jsonb)) ord
    where coalesce(ord->>'role','customer') <> 'agent'
      and coalesce(ord->>'type','ready') <> 'preorder'
  ), '[]'::jsonb),
  true
),
updated_at = now()
where id = 'main';

-- Remove the old reporting view if it exists. This does not drop any physical table.
drop view if exists public.v_baiboua_agents cascade;

commit;
