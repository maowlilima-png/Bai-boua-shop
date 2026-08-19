Bai Boua Admin V41 — direct SQL save fix

1) Run database/BaiBoua_supabase_v40_orders.sql once if V40 SQL has not already been run.
2) Upload ALL V41 files to GitHub Pages and replace the old files.
3) Hard refresh once (Cmd+Shift+R).
4) Add one Pre-order.

Expected messages:
- saved locally / sending SQL
- saved Pre-order · SQL ✓

If SQL fails, V41 shows the actual SQL error in the red toast and keeps the local order visible.
3-second live sync remains enabled.
