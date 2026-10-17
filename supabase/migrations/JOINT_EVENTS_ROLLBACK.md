# Joint Events Phase 1 — Rollback Plan

If joint events migrations need to be reverted, run in **reverse order**:

```sql
-- 4. oom_awards (065)
DROP TABLE IF EXISTS public.oom_awards CASCADE;

-- 3. event_entry_society_eligibility (064) — depends on event_entries
DROP TABLE IF EXISTS public.event_entry_society_eligibility CASCADE;

-- 2. event_entries (063)
DROP TABLE IF EXISTS public.event_entries CASCADE;

-- 1. event_societies (062)
DROP TABLE IF EXISTS public.event_societies CASCADE;
```

**Note:** These tables are additive. Dropping them does not affect:
- `events`
- `event_registrations`
- `event_results`
- `tee_groups` / `tee_group_players`

The single-society event flow remains unchanged.
