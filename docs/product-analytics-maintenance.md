# Product analytics (`product_events`) — storage & maintenance

## Expected volume (Phase 1)

Rough order-of-magnitude for this deployment (~118 members, 3 societies):

| Event | Estimate (active month) |
|-------|-------------------------|
| `screen_view` | 500–3,000 / month |
| Action events (RSVP, payment, tee sheet, export) | 200–800 / month |
| **Total rows** | **~1,000–4,000 / month** |

Append-only; no automatic deletion in Phase 1.

## Indexes used by admin report (7 / 30 / 90 days)

All report queries filter `WHERE created_at >= v_since`. Primary supporting indexes:

- `idx_product_events_created_at` — `(created_at DESC)` — window scans
- `idx_product_events_event_name_created` — `(event_name, created_at DESC)` — aggregates by event name
- Partial indexes on `society_id`, `user_id`, `related_event_id` — not required for platform-wide admin RPC but useful for future society-scoped reports

**Metadata is not indexed** (by design — JSONB payload only, no GIN index in Phase 1).

## Retention recommendation (Phase 2+)

| Tier | Retention | Action |
|------|-----------|--------|
| Hot | 90 days | Full rows in `product_events` |
| Warm | 1 year | Monthly aggregates in `product_events_monthly` (new table) |
| Cold | > 1 year | Archive to object storage or drop raw rows after aggregate export |

## Safeguards against operational DB impact

1. **Append-only** — no UPDATE/DELETE policies for clients; inserts are fire-and-forget from the app.
2. **No FK cascades on bulk deletes** — `user_id` / `society_id` use `ON DELETE SET NULL`.
3. **Bounded RPC** — `p_days` clamped to `[1, 365]`; returns aggregates only, not raw rows.
4. **Monitor** — alert if `product_events` exceeds ~500k rows or 500 MB (Supabase dashboard).
5. **Future** — scheduled `pg_cron` job to archive rows older than 90 days (requires explicit approval).

## Enabling live gross scoring (pre–Phase 2 UI)

Until the manage-screen toggle ships, platform admins can enable per event:

```sql
-- Platform admin session required (or service role in Supabase SQL editor)
UPDATE public.events
SET live_gross_scoring_enabled = true
WHERE id = '<event-uuid>';
```

To disable:

```sql
UPDATE public.events
SET live_gross_scoring_enabled = false
WHERE id = '<event-uuid>';
```

Historical gross-scoring rows in `event_player_rounds` / `event_player_hole_scores` remain in the database; the UI gate only hides entry actions when the flag is false.
