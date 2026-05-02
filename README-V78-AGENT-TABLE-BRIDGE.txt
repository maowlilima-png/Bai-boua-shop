Bai Boua v78 Agent Table Bridge

What changed:
- Agent add/toggle/delete/password now writes to both bb_state cache and public.agents table.
- Agent login loads from Supabase agents table before checking password.
- Uses agent_code text column as the Agent ID, because Supabase id is uuid.

Before testing:
1. Supabase > SQL Editor > New Query
2. Run supabase-agent-v78.sql once
3. Upload this zip to GitHub Pages and refresh.
