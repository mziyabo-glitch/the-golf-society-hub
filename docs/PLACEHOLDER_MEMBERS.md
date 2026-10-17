# Pre-member / placeholder members

## Model (already supported)

- `public.members.user_id` is **nullable** (migration `005_fix_members_events_complete.sql`).
- ManCo creates rows with `user_id = NULL` via `add_member_as_captain` (SECURITY DEFINER).
- Event entries, tee sheets, payments, results, and OOM data reference **`member_id`** (or `player_id` → `members.id`), not `auth.users`, so history stays on the same row when the person later links an app account.

## Schema changes (078)

Migration `078_placeholder_members_manco_and_email_claim.sql`:

1. **`add_member_as_captain`** — caller must be ManCo: `captain`, `secretary`, `handicapper`, or `treasurer` (`has_role_in_society`), not captain-only.
2. **`join_society`** — when joining with a join code, **claim order**:
   - Existing linked row for `auth.uid()` (unchanged).
   - Else **unlinked row with matching email** on the placeholder (case-insensitive), if join supplies a non-empty email and the row has an email.
   - Else **unlinked row with matching name** (historical behaviour).
   - Else **insert** a new member row.
3. **`claim_captain_added_member`** — optional `p_email`: email match first, then name match.

Deploy this migration to Supabase before relying on email-first linking in production.

## App behaviour

- **RBAC**: `canCreateMembers` is true for captain, treasurer, secretary, and handicapper (aligned with ManCo adding placeholders).
- **Members list / detail**: badge **“No app yet”** / **“App not linked”** when `user_id` is null.
- **Join**: user’s signup email is sent as `p_email` to `join_society` (from `authUser.email`), so it can match a placeholder row that ManCo saved with the same email.
- **Events (079+)**: ManCo can **`admin_add_member_to_event`** from Event detail (“Add society member to event”) and **`mark_event_paid`** for placeholders — both use **`member_id`** only; tee sheet / ManCo flows use **paid + status in** (`isTeeSheetEligible`), not `user_id`.

## Safest linking approach

1. **Preferred**: ManCo saves **email** on the placeholder; user signs up with that email → `join_society` links by email first.
2. **Fallback**: Same **display name** as ManCo entered (case-insensitive trim) → name claim.
3. **Avoid duplicates**: Do not create a second member row if a placeholder exists; join path claims the row instead of inserting.

## Captain approval (future)

For ambiguous matches (e.g. two placeholders with similar names), a follow-up could add a `member_link_requests` table and approval UI. Current implementation is intentionally conservative: email-first, then exact name match, oldest row first.
