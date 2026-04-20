# Public invite RSVP — staging sign-off (migration 121+)

**Engineering status:** implementation is code-complete. **Product/release status:** not “fully done” until every journey below is executed on **live staging** with **real data** and signed off.

**Prerequisites**

- Staging Supabase has migration **`121_event_invite_rsvp_linked_member_only.sql`** applied.
- Staging app build points at that project (`EXPO_PUBLIC_SUPABASE_*`).
- You can open the Table Editor or SQL Editor for `event_registrations` and `members`.

---

## Journey 1 — Unlinked roster member (`/invite/{eventUuid}`)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open invite URL for a real event with RSVP open. | Event loads. |
| 2 | Member path → enter email that exists on a **placeholder / unclaimed** `members` row for a **participant** society. | **Join the society in the app first** card (not “member not found”). |
| 3 | Confirm in Supabase **before/after** (same `event_id` + `member_id`). | **No new or updated** `event_registrations` row for that member. |

**SQL (adjust UUIDs):**

```sql
-- Before: note count / absence of row
SELECT id, society_id, event_id, member_id, status, updated_at
FROM public.event_registrations
WHERE event_id = '<EVENT_UUID>' AND member_id = '<UNLINKED_MEMBER_UUID>';

-- After journey 1: should be unchanged (still no row, or same row if pre-existing)
```

**Sign-off journey 1:** ☐ Pass Verifier: _______________ Date: _______________

---

## Journey 2 — Linked member, signed out → sign in → RSVP In

| Step | Action | Expected |
|------|--------|----------|
| 1 | Signed **out**, same invite, member path, email for a **linked** member (`members.user_id` set). | **Sign in to respond** gate (not unlinked card). |
| 2 | **Sign in**, complete auth (password / magic link / Google as you use in staging). | Redirect back to **same** `/invite/{eventUuid}` (pending return path). |
| 3 | Tap **In** (or complete member RSVP). | Success / “You’re set”. |
| 4 | Supabase: row for that `member_id` + `event_id`. | **Upsert**: `status = 'in'` (and correct `society_id` for that membership). |

**SQL:**

```sql
SELECT id, society_id, event_id, member_id, status, updated_at
FROM public.event_registrations
WHERE event_id = '<EVENT_UUID>' AND member_id = '<LINKED_MEMBER_UUID>';
```

**Sign-off journey 2:** ☐ Pass Verifier: _______________ Date: _______________

---

## Journey 3 — Wrong signed-in user (identity mismatch)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Sign in as **User B** (real session). | Session is B. |
| 2 | Provoke mismatch: e.g. call **`submit_public_event_rsvp_member_by_email`** from a Supabase client **as B** with email tied to **User A’s** linked member row (same event). Or any future UI that hits that RPC with wrong identity. | Error contains **`rsvp_not_allowed`** (or app copy: cannot respond as another member). |
| 3 | Supabase | **No** new/updated row for **A’s** `member_id` attributable to this attempt (or row unchanged if you’re re-testing). |

**Notes:** The public invite **UI** no longer submits member RSVP by email when signed in without matching `memberCtx`; this journey still validates the **server** contract.

**Sign-off journey 3:** ☐ Pass Verifier: _______________ Date: _______________

---

## Journey 4 — Joint event resolver (scoping + ambiguous)

Use a **real joint event** (`event_societies` has **2+** distinct `society_id` values for `event_id`).

| Case | Setup | Action | Expected resolver status |
|------|--------|--------|---------------------------|
| A | Same normalized email on **two** `members` rows in **two different participant** societies for that event. | `resolve_public_event_rsvp_member_email_status(event, email)`. | **`ambiguous`** |
| B | Email exists only on a member in a society **not** in that event’s participant set (and not host-only fallback). | Same RPC. | **`not_found`** |
| C | Single participant match, linked. | Same RPC. | **`linked`** + `user_id` set |

Confirm **no mis-scoping**: counts and picks only where `m.society_id` is in the event’s participant list (see migration `121`).

**Sign-off journey 4:** ☐ Pass Verifier: _______________ Date: _______________

---

## Feature “fully done”

When **all four** sign-off lines are checked on staging, mark this feature **done** in your tracker / release notes.

Optional automation: `npm run verify:invite-rsvp` (see `scripts/verify-public-invite-rsvp-e2e.mjs`) plus env `VERIFY_*` for resolver assertions against a fixed staging event.
