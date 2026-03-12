# Tee Sheet Persistence Debug

If the tee sheet resets after saving, verify in Supabase:

## 1. Check if data actually saved

Run in Supabase SQL Editor (replace `YOUR_EVENT_ID`):

```sql
SELECT id, name, player_ids, tee_time_start, tee_time_interval, tee_time_published_at
FROM events
WHERE id = 'YOUR_EVENT_ID';
```

- If `player_ids` is empty `{}` after save → update may be failing or not persisting
- If `player_ids` has values → data is in DB; issue may be client-side load/display

## 2. Check browser/device console

After clicking "Save Tee Sheet", look for:

- `[TeeSheet] Saving playerIds: N [...]` — what we're sending
- `[eventRepo] updateEvent success, persisted player_ids: N ids` — what Supabase returned
- `[TeeSheet] After save, refreshed player_ids: N [...]` — what we got back from getEvent

## 3. Common causes

| Symptom | Possible cause |
|---------|----------------|
| "Saved" toast but `player_ids` empty in DB | RLS blocking update (0 rows) — but we throw in that case |
| `player_ids` has data in DB but UI resets | Load order or re-sort overwriting saved order |
| `player_ids` has data, refresh shows it | Caching issue; try hard refresh |
| Event Detail save clears tee sheet | Event form should NOT touch player_ids (partial update) |

## 4. RLS

Ensure migration 051 is applied: Handicapper can update events. If you're Handicapper and RLS blocked, you'd see an error.
