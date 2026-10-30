# `mark_event_paid` migrations (joint events)

## 073 — `person_id` error

Migration **072** referenced `members.person_id` (column does not exist). **073** removes that and uses `user_id` / `email` for mapping.

## 074 — "Target member not found in this society" on joint events

Migration **073** still treated **`events.society_id` (host only)** as the only society for the caller, the target member, and `event_registrations.society_id`.

For **joint events**, captains/treasurers and fee rows belong to **participating societies** (`event_societies`), and each registration row uses the **target member’s** `society_id`.

**074** (`074_mark_event_paid_joint_event_societies.sql`) updates `mark_event_paid` to:

- Allow caller **Captain/Treasurer** in the **host or any participating** society.
- Require the target **member** to belong to the **host or a participating** society.
- Set **`event_registrations.society_id`** to that member’s society (not always the host).

## 075 — `column p_target_member does not exist`

Migration **074** had a typo: `WHERE m.id = p_target_member` instead of `p_target_member_id`. **075** applies the corrected function (same as fixed **074** in repo).

## 076 — Wrong society / misleading "Only Captain or Treasurer" (multi–society users)

Migrations **074/075** resolved the caller/target `IN (host ∪ participants)` with **`LIMIT 1`**, which could pick the **wrong** `members` row when the same user belongs to **multiple** societies (e.g. Member in one club, Captain in another). The RPC then saw the wrong **role** and raised `Only Captain or Treasurer can mark payments` incorrectly.

**076** (`076_mark_event_paid_scope_society.sql`) replaces `mark_event_paid` with a **fifth argument** `p_society_id` (the **active society** from the app). The server:

- Verifies the society is part of the event (host or `event_societies`).
- Loads the caller’s role **only** for `p_society_id`.
- Requires the target member to belong to **`p_society_id`** (no cross-society payment control).

The client must pass **`societyId`** from bootstrap (same society as the fee list).

## 079 — ManCo + placeholder members on events

**079** (`079_admin_add_member_to_event_and_manco_mark_paid.sql`):

- Extends **`mark_event_paid`** caller roles to **Secretary** and **Handicapper** (same as event editing). Target members may have **`user_id` null** (placeholders).
- Adds **`admin_add_member_to_event(p_event_id, p_society_id, p_target_member_id)`** — upserts `event_registrations` with **status `in`**, **without** clearing payment on conflict (ManCo “add to event” without using the playing list).

## Apply

Run migrations in order: **073** → **074** → **075** → **076** → **079** (as needed), via SQL Editor or `supabase db push`.
