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

## Apply

Run migrations in order: **073** → **074** → **075** (as needed), via SQL Editor or `supabase db push`.
