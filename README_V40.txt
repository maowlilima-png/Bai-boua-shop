BAI BOUA ADMIN V40 — SQL ORDERS

1) Supabase > SQL Editor > New Query
2) Run database/BaiBoua_supabase_v40_orders.sql once. It should end with V40 READY.
3) Upload all V40 files to the GitHub Pages repository, replacing the previous version.
4) Hard refresh once (Cmd+Shift+R).
5) Create one Pre-order. You should see a toast saying it was saved to SQL.
6) V40 syncs SQL orders every 3 seconds without reloading the page.
7) Completed SQL orders are archived after 30 days while Admin is open; their Storage images are removed and the compact order row remains archived in SQL.

Important: V40 uses separate admin_orders_v40/admin_order_items_v40 tables to avoid conflicting with older tables in this Supabase project.
