# Event / payment model simplification (Mar 2026)

## Root causes of prior complexity

1. **Overlapping concepts** — “RSVP confirmed”, “playing list”, “attending”, “tee-sheet-ready”, and “outstanding” were all surfaced at once with different derivations (`attendingRegs`, `summarizeEventRegistrations`, joint-only “Confirmed Players” card).
2. **Duplicate joint UI** — A separate “Confirmed Players” list repeated information already implied by registrations + `playerIds`.
3. **RPC mismatch (joint)** — `mark_event_paid` initially used only `events.society_id` (host); participant societies’ fee rows use each member’s `society_id` (fixed in 074).
4. **SQL typo** — `WHERE m.id = p_target_member` referenced a non-existent identifier; Postgres treated it as column `m.p_target_member` → **075** / corrected **074**.

## Canonical model

| Layer | Responsibility |
|--------|------------------|
| `lib/eventPlayerStatus.ts` | **`partitionSocietyRegistrations`**, **`bucketForRegistration`**, lineup/withdrawn helpers |
| `lib/db_supabase/eventRegistrationRepo.ts` | Data types, **`filterRegistrationsForActiveSocietyMembers`**, **`isTeeSheetEligible`** (confirmed + paid) |
| `lib/teeSheetEligibility.ts` | Tee sheet save/load filtering on top of registrations |

**Product rules encoded:** paid ⇒ confirmed (RPC); tee sheet ⇒ `status === 'in' && paid`; society page ⇒ only active society members + scoped regs.

## Files changed

| File | Change |
|------|--------|
| `lib/eventPlayerStatus.ts` | **New** — canonical buckets + helpers |
| `app/(app)/event/[id]/index.tsx` | Payment card → **Confirmed & paid** / **Pending payment** / **Not playing**; removed joint “Confirmed Players” card; Players subtitle simplified |
| `lib/db_supabase/eventRegistrationRepo.ts` | Comments; `markMePaid` hints unchanged |
| `lib/teeSheetEligibility.ts` | Doc pointer to `eventPlayerStatus` |
| `supabase/migrations/074_*.sql` | Fix `p_target_member` → `p_target_member_id` in WHERE |
| `supabase/migrations/075_*.sql` | **New** — full `mark_event_paid` with typo fix for deployed DBs |
| `supabase/README_MARK_EVENT_PAID.md` | Documents 073–075 |

## `p_target_member` error — fix

In **074**, the target lookup used `WHERE m.id = p_target_member`. The function parameter is **`p_target_member_id`**. Unquoted `p_target_member` was resolved as a **column name**, causing `column p_target_member does not exist`.

**Fix:** use `WHERE m.id = p_target_member_id`. **075** reapplies the full function for databases that already ran the broken 074.

## Removed / bypassed

- Joint-only **“Confirmed Players”** card (`societyConfirmedPlayerRows`, `buildSocietyIdToNameMap` for that card).
- **`summarizeEventRegistrations`** usage on event detail (function kept in repo for other callers).
- **`attendanceRegsByPerson`**, **`finalAttendancePaymentRows`**, **`standardAttendingTotalCountFinal`**, **`countsFinal`** / attendingCount / outstandingCount **on this screen**.
- **`JOINT_EVENT_DETAIL_ATTENDANCE_NOTE`** import (unused).

## Manual test checklist

1. **Standard event** — Mark paid / unpaid; paid row shows under **Confirmed & paid**; unpaid **in** under **Pending payment**; tee sheet still only picks paid+confirmed.
2. **Joint event (participant society)** — Payment for own member succeeds; lists never show other society’s members.
3. **Joint event (host)** — Same as 2; header society switch changes which members appear.
4. **Playing list, no fee row** — Player under **Pending payment**; Mark paid / Record unpaid creates row and moves to **Confirmed & paid** when paid.
5. **Withdrawn** — `status out` appears under **Not playing / withdrawn**.
6. **DB** — Apply **075** (or fixed **074**); `mark_event_paid` runs without `person_id` / `p_target_member` errors.
