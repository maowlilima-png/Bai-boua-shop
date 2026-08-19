BAI BOUA ADMIN V39 — PERFORMANCE UPDATE

What changed
1. Completed orders are kept for 30 days.
2. After 30 days they are removed from active orders automatically when the admin site is opened/running.
3. A compact text-only history is retained in db.orderArchive (max 1500 records); order photos are removed from the active JSON.
4. New manual Pre-order / Ready-stock photos upload to Supabase Storage under product-images/orders/ instead of being embedded as Base64 in app_state.
5. Those order-only Storage photos are deleted when the order is auto-archived after 30 days.
6. Pre-order and Ready-stock admin lists are paginated at 30 orders per page.
7. Images use lazy loading.
8. Uploaded manual-order images are compressed to max 1200px / JPEG ~78% before upload.

Supabase
If you already ran database/BaiBoua_supabase_v38_required.sql successfully, no additional SQL is required for V39. The existing Storage delete policy is used for automatic cleanup.

Important
The 30-day cleanup runs when the website is opened (and once per hour while it stays open). It is not a server cron job, because this version stores app data in one app_state JSON row.
