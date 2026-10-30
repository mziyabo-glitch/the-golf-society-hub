# Free Play — database migrations and smoke testing

The app stores ad-hoc rounds in **`public.free_play_rounds`**, roster rows in **`public.free_play_round_players`**, per-player totals in **`public.free_play_round_scores`**, and hole-by-hole rows in **`public.free_play_round_hole_scores`**. There is **no** `free_play_scores` table; the aggregate table is **`free_play_round_scores`**.

## Startup / admin health check

If the app shows **Free Play migrations are missing or the PostgREST schema cache is stale**, work through this list in order:

1. **Apply migrations:** `npx supabase db push` (or your deployment pipeline equivalent) so the full Free Play chain is on the database.
2. **Reload PostgREST:** in the SQL Editor run `SELECT pg_notify('pgrst', 'reload schema');` (or use the Dashboard **API → Reload schema** control).
3. **Restart the dev server** (Expo/Metro or web dev) so clients pick up a clean bundle and reconnect.
4. **Smoke test:** create round → add players → save handicaps → start round → enter a score (see §6 below).

The in-app banner points to this file as **`supabase/README_FREE_PLAY.md`** (path relative to the repository root).

## 1. What `122_free_play_scorecards.sql` does (and does not do)

**Creates (baseline):**

- Tables: `free_play_rounds`, `free_play_round_players`, `free_play_round_scores`, `free_play_round_hole_scores`
- Indexes (including partial uniques on players), `updated_at` triggers calling `public.set_updated_at()`
- Function `public.can_access_free_play_round(uuid)` and initial RLS policies on all four tables
- `NOTIFY pgrst, 'reload schema';` at end

**Not sufficient for the current app on its own:**

- No **`scoring_format`** on rounds (`stroke_net` | `stableford`) — added in **`131_free_play_scorecard_v1.sql`**
- Hole scores require **non-null** `gross_strokes` in 122; the app records **pickups/NR** as **NULL** — relaxed in **131**
- No **`join_free_play_round_by_code(text, text)`** RPC — created in **131** (`SECURITY DEFINER`, `GRANT EXECUTE … TO authenticated`)
- Player inserts use **`course_handicap`** and **`handicap_source`** — added in **`140_free_play_player_handicap_fields.sql`**
- RLS for **creators vs joined players** and **self-scoring** evolves through **123–124**, **131–132**, and **`139_free_play_rounds_rls_created_by_user_id.sql`** (final `free_play_rounds` policies)

**Apply the full chain** (filename order under `supabase/migrations/`):

`122` → `123` → `124` → `131` → `132` → `135` → `136` → `137` → `138` → `139` → `140` → `148` → `149` → `150` → `151` → `152` → `153` → `154` → `155`

On a greenfield project, prefer:

```bash
npx supabase db push
```

(or your CI’s equivalent) so every migration runs once, in order.

## 2. App payloads vs columns (verification)

### `free_play_rounds`

| App (repo) field | DB column | Notes |
|-------------------|-----------|--------|
| `society_id` | `society_id` | optional FK |
| `created_by_user_id` | `created_by_user_id` | required; must equal `auth.uid()` on insert (139) |
| `created_by_member_id` | `created_by_member_id` | optional FK |
| `course_id` | `course_id` | optional FK |
| `course_name` | `course_name` | required text |
| `tee_id` | `tee_id` | optional FK |
| `tee_name` | `tee_name` | optional |
| `scoring_mode` | `scoring_mode` | `quick` \| `hole_by_hole` |
| `scoring_format` | `scoring_format` | **131+** — `stroke_net` \| `stableford` |
| `status` | `status` | insert uses `draft` |

Updates use the same table for `status`, `started_at`, `completed_at`, `tee_id`/`tee_name`, `course_id`/`course_name`, `scoring_mode`, `scoring_format`.

### `free_play_round_players`

| App (repo) field | DB column | Notes |
|------------------|-----------|--------|
| `round_id` | `round_id` | FK |
| `player_type` | `player_type` | `member` \| `app_user` \| `guest` |
| `member_id` | `member_id` | optional |
| `user_id` | `user_id` | optional |
| `invite_email` | `invite_email` | optional |
| `display_name` | `display_name` | required |
| `handicap_index` | `handicap_index` | numeric |
| `course_handicap` | `course_handicap` | **140+** integer (nullable) |
| `playing_handicap` | `playing_handicap` | **131+** |
| `handicap_source` | `handicap_source` | **140+** `auto` \| `manual` |
| `guest_name` | `guest_name` | **131+** |
| `tee_id` | `tee_id` | **131+** per-player tee |
| `invite_status` | `invite_status` | |
| `is_owner` | `is_owner` | |
| `sort_order` | `sort_order` | |

### `free_play_round_scores` (not `free_play_scores`)

Upsert payload: `round_id`, `round_player_id`, `quick_total`, `holes_played`. Unique constraint `(round_id, round_player_id)` matches `onConflict` in the repo.

### `free_play_round_hole_scores`

Upsert/delete uses `round_id`, `round_player_id`, `hole_number`, `gross_strokes` (nullable after **131**).

## 3. RLS — authenticated users (canonical after **154**)

- **`free_play_rounds`**: **SELECT** if you are creator or participant (`free_play_can_read_round`), with helper evaluation in `SECURITY DEFINER` context.
- **`free_play_round_players`**: **SELECT** for own row (`user_id` / linked `member_id`) plus creator/participant visibility via helper checks.
- **`free_play_round_scores`** / **`free_play_round_hole_scores`**: **SELECT** for round creator or participant via helper checks; mutate rules from **132** still allow manager or own-round-player writes.
- Helpers used by read policies run with `SET row_security = off` and must never use policy shapes that recurse through `free_play_rounds -> players -> rounds`.

So: creators own round lifecycle and roster; joined members can read the round and update **their** scoring rows where policies allow.

## 4. Schema probe in the app

`getFreePlayTablesAvailable()` runs:

`select id from free_play_rounds limit 1`

If the table exists and PostgREST exposes it, this returns **no error** (empty array is fine) → the UI treats Free Play as **ok**. If the table or schema cache is missing, PostgREST returns an error → **setup required** state.

After applying migrations, **reload the API schema** (below) so the probe and client see new tables/RPCs.

## 5. Reload PostgREST schema

After SQL changes, notify PostgREST (already appended in many migration files):

```sql
NOTIFY pgrst, 'reload schema';
```

In **Supabase Dashboard**: **Project Settings → API → Reload schema** (wording may vary by dashboard version).

## 6. Smoke test (create → players → handicaps → start → score)

1. Sign in as a test user in the app (or use Supabase JWT against REST).
2. **Free Play** → pick course/tee → **Create free-play round** (inserts round + owner player rows).
3. **Add players** (members/guests) and **Save handicaps** (updates `free_play_round_players`).
4. **Start round** (`status` → `in_progress`, `started_at` set).
5. Enter a **hole score** (hole-by-hole or quick totals); confirm `free_play_round_hole_scores` / `free_play_round_scores` update and no RLS errors in logs.
6. Optional: second user **join by code** (RPC `join_free_play_round_by_code`) and enter scores for **their** row only.

If any step fails with `42501` or missing function/table, re-check migrations **122–140** ran in order and schema was reloaded.

### 6a. Hole-by-hole scoring persistence (manual QA)

After migrations through **155** (RLS helpers for self-score writes):

1. **Start round** (round status `in_progress`).
2. Open **Simple** tab on the live hole screen; use **− / +**, number chips, or **Par** on a player card for **hole 1**.
3. Confirm UI shows **Saving hole score…** then **Saved** on that card; leaderboard preview updates when relevant.
4. **Refresh the browser** (or leave and re-open the round): hole 1 gross must still show for that player (`free_play_round_hole_scores` + aggregate `free_play_round_scores`).
5. **Next hole** → enter a value on hole 2 → **Previous hole** back to hole 1: hole 1 value must still match step 2.
6. Optional: signed-in **non-creator** roster player enters only **their** row; creator can enter for all.

If scores vanish after refresh but the SQL editor shows rows, check **PostgREST schema reload** and **SELECT** policies on `free_play_round_hole_scores`. If totals are wrong but holes exist, check **INSERT/UPDATE** on `free_play_round_scores` and `free_play_can_manage_round` / `free_play_is_own_round_player` (migration **155**).
