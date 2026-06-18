-- Bai Boua Shop Supabase SQL v11
-- ນຳໄປ Run ໃນ Supabase > SQL Editor
-- ໃຊ້ກັບເວັບ GitHub Pages / app.js ທີ່ save ຂໍ້ມູນໃສ່ table app_state

-- 1) Table ຫຼັກທີ່ເວັບໃຊ້ save/load ຂໍ້ມູນ
create table if not exists public.app_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 2) ອັບເດດ updated_at ອັດຕະໂນມັດ
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_app_state_updated_at on public.app_state;
create trigger trg_app_state_updated_at
before update on public.app_state
for each row
execute function public.set_updated_at();

-- 3) เปิด RLS + Policy ให้เว็บที่ใช้ anon key อ่าน/เพิ่ม/แก้ไขข้อมูล row main ได้
alter table public.app_state enable row level security;

drop policy if exists "Bai Boua read app state" on public.app_state;
drop policy if exists "Bai Boua insert app state" on public.app_state;
drop policy if exists "Bai Boua update app state" on public.app_state;
drop policy if exists "Bai Boua delete app state" on public.app_state;

create policy "Bai Boua read app state"
on public.app_state
for select
to anon, authenticated
using (id = 'main');

create policy "Bai Boua insert app state"
on public.app_state
for insert
to anon, authenticated
with check (id = 'main');

create policy "Bai Boua update app state"
on public.app_state
for update
to anon, authenticated
using (id = 'main')
with check (id = 'main');

-- ສ່ວນໃຫຍ່ app ຈະບໍ່ delete row main, ແຕ່ໃສ່ໄວ້ເພື່ອ reset ໄດ້ຖ້າຈຳເປັນ
create policy "Bai Boua delete app state"
on public.app_state
for delete
to anon, authenticated
using (id = 'main');

grant select, insert, update, delete on public.app_state to anon, authenticated;

-- 4) ສ້າງ row main ໄວ້ກ່ອນ
insert into public.app_state (id, data)
values ('main', '{}'::jsonb)
on conflict (id) do nothing;

-- 5) ลบ views เก่าก่อนสร้างใหม่
 drop view if exists public.v_baiboua_sales_summary cascade;
 drop view if exists public.v_baiboua_order_items cascade;
 drop view if exists public.v_baiboua_orders cascade;
 drop view if exists public.v_baiboua_agents cascade;
 drop view if exists public.v_baiboua_customers cascade;
 drop view if exists public.v_baiboua_products cascade;
 drop view if exists public.v_baiboua_categories cascade;
 drop view if exists public.v_baiboua_promo cascade;

-- 6) View: products ສຳລັບເບິ່ງສິນຄ້າເປັນຕາຕະລາງ
create view public.v_baiboua_products
with (security_invoker = true)
as
select
  p->>'id' as product_id,
  p->>'name' as name,
  p->>'code' as code,
  p->>'category' as category,
  p->>'type' as product_type,
  coalesce((p->>'price')::numeric, 0) as customer_price,
  coalesce((p->>'agentPrice')::numeric, 0) as agent_price,
  coalesce((p->>'cost')::numeric, 0) as cost,
  case when p ? 'stock' and p->>'stock' <> '' then (p->>'stock')::int else null end as stock,
  coalesce((select array_agg(x.value #>> '{}') from jsonb_array_elements(coalesce(p->'sizes','[]'::jsonb)) as x(value)), array[]::text[]) as sizes,
  coalesce((select array_agg(x.value #>> '{}') from jsonb_array_elements(coalesce(p->'colors','[]'::jsonb)) as x(value)), array[]::text[]) as colors,
  p->>'detail' as detail,
  case when p ? 'createdAt' and p->>'createdAt' <> '' then to_timestamp((p->>'createdAt')::numeric / 1000) else null end as created_at
from public.app_state s,
lateral jsonb_array_elements(coalesce(s.data->'products','[]'::jsonb)) as p
where s.id = 'main';

-- 7) View: customers ລູກຄ້າ
create view public.v_baiboua_customers
with (security_invoker = true)
as
select
  u->>'id' as customer_id,
  u->>'name' as name,
  u->>'phone' as phone,
  u->>'role' as role,
  case when u ? 'createdAt' and u->>'createdAt' <> '' then to_timestamp((u->>'createdAt')::numeric / 1000) else null end as created_at,
  (
    select count(*)
    from jsonb_array_elements(coalesce(s.data->'orders','[]'::jsonb)) as o
    where o->>'userId' = u->>'id' and o->>'role' = 'customer'
  ) as order_count,
  (
    select coalesce(sum((o->>'total')::numeric),0)
    from jsonb_array_elements(coalesce(s.data->'orders','[]'::jsonb)) as o
    where o->>'userId' = u->>'id' and o->>'role' = 'customer'
  ) as total_spent
from public.app_state s,
lateral jsonb_array_elements(coalesce(s.data->'users','[]'::jsonb)) as u
where s.id = 'main';

-- 8) View: agents ຕົວແທນ
create view public.v_baiboua_agents
with (security_invoker = true)
as
select
  a->>'id' as agent_id,
  a->>'name' as name,
  a->>'phone' as phone,
  coalesce((a->>'active')::boolean, true) as active,
  coalesce((a->>'weekOrders')::int, 0) as week_orders,
  coalesce((a->>'weekTarget')::int, 7) as week_target,
  case when a ? 'disabledAt' and a->>'disabledAt' <> '' and a->>'disabledAt' <> 'null' then to_timestamp((a->>'disabledAt')::numeric / 1000) else null end as disabled_at,
  case when a ? 'createdAt' and a->>'createdAt' <> '' then to_timestamp((a->>'createdAt')::numeric / 1000) else null end as created_at,
  (
    select count(*)
    from jsonb_array_elements(coalesce(s.data->'orders','[]'::jsonb)) as o
    where o->>'userId' = a->>'id' and o->>'role' = 'agent'
  ) as order_count,
  (
    select coalesce(sum((o->>'total')::numeric),0)
    from jsonb_array_elements(coalesce(s.data->'orders','[]'::jsonb)) as o
    where o->>'userId' = a->>'id' and o->>'role' = 'agent'
  ) as total_sales
from public.app_state s,
lateral jsonb_array_elements(coalesce(s.data->'agents','[]'::jsonb)) as a
where s.id = 'main';

-- 9) View: orders ອໍເດີ້
create view public.v_baiboua_orders
with (security_invoker = true)
as
select
  o->>'id' as order_id,
  o->>'role' as role,
  o->>'userId' as user_id,
  o->>'userName' as account_name,
  o->>'userPhone' as account_phone,
  o#>>'{customer,name}' as customer_name,
  o#>>'{customer,phone}' as customer_phone,
  o#>>'{sender,name}' as sender_name,
  o#>>'{sender,phone}' as sender_phone,
  o#>>'{shipping,carrier}' as carrier,
  o#>>'{shipping,branch}' as branch,
  o#>>'{shipping,city}' as city,
  o#>>'{shipping,province}' as province,
  o#>>'{shipping,note}' as note,
  o->>'type' as order_type,
  o->>'status' as status,
  coalesce((o->>'total')::numeric, 0) as total,
  coalesce((o->>'cost')::numeric, 0) as cost,
  coalesce((o->>'profit')::numeric, 0) as profit,
  coalesce((o->>'agentTargetCounted')::boolean, false) as agent_target_counted,
  coalesce(o->>'billNo','') as bill_no,
  case when coalesce(o->>'billImage','') <> '' then true else false end as has_bill_image,
  case when coalesce(o->>'slip','') <> '' then true else false end as has_slip,
  (
    select coalesce(sum((i->>'qty')::int),0)
    from jsonb_array_elements(coalesce(o->'items','[]'::jsonb)) as i
  ) as item_qty,
  case when o ? 'createdAt' and o->>'createdAt' <> '' then to_timestamp((o->>'createdAt')::numeric / 1000) else null end as created_at,
  case when o ? 'transferUploadedAt' and o->>'transferUploadedAt' <> '' then to_timestamp((o->>'transferUploadedAt')::numeric / 1000) else null end as transfer_uploaded_at,
  case when o ? 'expiresAt' and o->>'expiresAt' <> '' then to_timestamp((o->>'expiresAt')::numeric / 1000) else null end as expires_at
from public.app_state s,
lateral jsonb_array_elements(coalesce(s.data->'orders','[]'::jsonb)) as o
where s.id = 'main';

-- 10) View: order items ລາຍການສິນຄ້າໃນອໍເດີ້
create view public.v_baiboua_order_items
with (security_invoker = true)
as
select
  o->>'id' as order_id,
  o->>'role' as role,
  o->>'status' as order_status,
  case when o ? 'createdAt' and o->>'createdAt' <> '' then to_timestamp((o->>'createdAt')::numeric / 1000) else null end as order_created_at,
  i->>'productId' as product_id,
  i->>'name' as product_name,
  i->>'code' as product_code,
  i->>'type' as product_type,
  i->>'size' as size,
  i->>'color' as color,
  coalesce((i->>'qty')::int, 0) as qty,
  coalesce((i->>'price')::numeric, 0) as unit_price,
  coalesce((i->>'cost')::numeric, 0) as unit_cost,
  coalesce((i->>'qty')::int, 0) * coalesce((i->>'price')::numeric, 0) as line_total,
  coalesce((i->>'qty')::int, 0) * coalesce((i->>'cost')::numeric, 0) as line_cost,
  (coalesce((i->>'qty')::int, 0) * coalesce((i->>'price')::numeric, 0)) -
  (coalesce((i->>'qty')::int, 0) * coalesce((i->>'cost')::numeric, 0)) as line_profit
from public.app_state s,
lateral jsonb_array_elements(coalesce(s.data->'orders','[]'::jsonb)) as o,
lateral jsonb_array_elements(coalesce(o->'items','[]'::jsonb)) as i
where s.id = 'main';

-- 11) View: categories ໝວດສິນຄ້າ
create view public.v_baiboua_categories
with (security_invoker = true)
as
select c.value #>> '{}' as category_name
from public.app_state s,
lateral jsonb_array_elements(coalesce(s.data->'categories','[]'::jsonb)) as c(value)
where s.id = 'main';

-- 12) View: promo ໂປຣໂມຊັ່ນ
create view public.v_baiboua_promo
with (security_invoker = true)
as
select
  coalesce((s.data#>>'{promo,show}')::boolean, false) as show_promo,
  s.data#>>'{promo,title}' as title,
  s.data#>>'{promo,text}' as text,
  case when coalesce(s.data#>>'{promo,image}','') <> '' then true else false end as has_image
from public.app_state s
where s.id = 'main';

-- 13) View: sales summary ສະຫຼຸບຍອດຂາຍຕາມມື້/role/status
create view public.v_baiboua_sales_summary
with (security_invoker = true)
as
select
  date_trunc('day', created_at)::date as sale_date,
  role,
  status,
  count(*) as order_count,
  sum(total) as total_sales,
  sum(cost) as total_cost,
  sum(profit) as total_profit,
  sum(item_qty) as total_items
from public.v_baiboua_orders
where created_at is not null
  and coalesce(status,'') not like '%ຍົກເລີກ%'
group by 1,2,3
order by sale_date desc, role, status;

grant select on public.v_baiboua_products to anon, authenticated;
grant select on public.v_baiboua_customers to anon, authenticated;
grant select on public.v_baiboua_agents to anon, authenticated;
grant select on public.v_baiboua_orders to anon, authenticated;
grant select on public.v_baiboua_order_items to anon, authenticated;
grant select on public.v_baiboua_categories to anon, authenticated;
grant select on public.v_baiboua_promo to anon, authenticated;
grant select on public.v_baiboua_sales_summary to anon, authenticated;

-- ທົດສອບຫຼັງ Run:
-- select * from public.app_state;
-- select * from public.v_baiboua_products;
-- select * from public.v_baiboua_orders;
-- select * from public.v_baiboua_order_items;
