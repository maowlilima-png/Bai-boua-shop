Bai Boua Admin V39.1

Fixes:
- More robust Supabase app_state loading (legacy anon key + fallback request).
- Empty {} app_state no longer overwrites the browser database.
- If app_state is empty, the current local shop data is uploaded to cloud.
- app.js/style.css cache-busting for GitHub Pages.

Deployment:
1. Upload/replace all site files on GitHub Pages.
2. Hard refresh once (Cmd+Shift+R on Mac).
3. Add one test order, refresh, and confirm it remains.

The V38 SQL setup already run in Supabase is sufficient; no new SQL is required for V39.1.
