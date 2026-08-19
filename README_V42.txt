BAI BOUA ADMIN V42

Fix: SQL orders existed in Supabase but did not render on the web because the item loader used a fragile PostgREST in(...) URL filter. V42 loads order rows independently and fetches items with a simple SELECT, so an item-query problem cannot hide the whole order list.

No new SQL is required if V40 SQL was already run. Upload all files to GitHub and hard refresh once.
