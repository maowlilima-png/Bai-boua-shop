Bai Boua v77 - Final Agent System Fix

What changed:
- Agent active/disabled state uses one boolean only.
- Disabled agent cards become grayscale.
- Disabled agents cannot login.
- Toggle button changes correctly: active shows "ປິດ ID", disabled shows "ເປີດ ID".
- Delete agent writes tombstone + cleaned list to Supabase immediately.
- Agent password changes persist immediately.

Supabase:
- If you already ran supabase-schema.sql before, this version should work.
- If agent delete/toggle still does not save, run supabase-agent-fix.sql in Supabase SQL Editor once.
