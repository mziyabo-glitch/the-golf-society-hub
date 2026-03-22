# QA regression note — stabilisation (Mar 2026)

Scope: recent fixes only — **no new features**. Use this for smoke / regression before release.

---

## 1. Summary of what changed

| Area | What changed |
|------|----------------|
| **Event / payment simplification** | Single **Payment & status** model: buckets (confirmed+paid, pending payment, playing list without fee row, not playing). Canonical helpers in `eventPlayerStatus` + `eventRegistrationRepo`. **Paid ⇒ confirmed** server-side; tee sheet eligibility = **in + paid**. Joint duplicate “Confirmed Players” card removed. See `docs/EVENT_PAYMENT_SIMPLIFICATION.md`. |
| **`mark_event_paid` society scoping (076)** | RPC takes **`p_society_id`** (active society). Caller must be **Captain/Treasurer in that society**; target **member must belong to that society**. No cross-society payment; **host does not override**. Client: `markMePaid(..., societyId)`. |
| **Dual-member badge** | Joint events only. **`DualMemberResolution`**: dual if same **`user_id`**, **normalized email** (trim + lowercase), or **`person_id`** appears in **≥2** participant societies. **Names never used** for matching. Component: `DualMemberBadge` on event detail payment rows. |
| **Tee sheet / `selectedEventId`** | After loading events for ManCo, selection is **reset only if** the previous `selectedEventId` is **no longer** in the upcoming list (e.g. **society switch**); otherwise **keeps** selection. Avoids loading wrong/stale event. Joint path can resolve meta when event not in local list. |
| **Edit event — ladies tee** | Create/edit requires **men’s + ladies’** tee (or manual ladies when no ladies rows). **Edit event** hydrates **`selectedLadiesTee`** via `matchLadiesTeeFromEvent` and saves ladies fields from picker + manual. |

---

## 2. Highest-risk regression areas

1. **Payments** — Wrong society context → RPC rejects or wrong member; **multi‑society users** must use **active society** matching **`p_society_id`**.
2. **Joint event fees** — Participant captain marking **own** society only; verify **no** accidental reliance on host-only `events.society_id` in client calls.
3. **Tee sheet** — **Society switch** with events list: selected event should clear or follow rules above; **no** blank/wrong event payload.
4. **Dual badge** — **False negative** if both rows lack linkable `user_id` / email / `person_id`; **false positive** if two different people share the same email in two societies (rare).
5. **Ladies tee on edit** — Save/load **ladies** par/CR/slope and **tee name** consistent with men’s flow; **create** vs **edit** parity.

---

## 3. Exact manual test scenarios

### A. Event detail — payment & status (standard)

1. Open **standard** event as Cap/Treas (active society = event host).
2. **Mark paid** / **Mark unpaid** on a member in **your** society → success; list refreshes.
3. Confirm **Confirmed & paid** vs **Pending payment** buckets match expectations.
4. **Playing list** member without registration row → **Mark paid** creates row → moves to confirmed+paid when paid.

### B. Event detail — joint + payment scoping

1. Switch **active society** to **participant** club → list shows **only** that society’s members.
2. Mark payment for **their** member → success.
3. Switch to **other** participant → **cannot** manage first society’s members (no UI or RPC error message appropriate to role/society).
4. **Host** view: same rule — actions only for **active** society, not “host override”.

### C. `mark_event_paid` / DB

1. After **076** applied: mark paid **no** `function mark_event_paid(...) does not exist` / wrong arity.
2. **Multi‑society user** who is **Captain in society A** only: with active **A**, mark paid works; **no** spurious “Only Captain or Treasurer…” from wrong membership row.

### D. Dual-member badge

1. **Non‑joint** event → **no** “Dual Member” on any row.
2. **Joint** event, player with **same normalized email** on both participant rosters → badge **yes** (if `MemberDoc` resolves email).
3. **Joint**, player **only** in one society → **no** badge.
4. **Joint**, player with **same `user_id`** in both societies → badge **yes**.

### E. Tee sheet (ManCo) — `selectedEventId`

1. Open **Tee sheet** tab; pick **event A** from dropdown → details/groups load for **A**.
2. Change **society** in app header → events list reloads; selection **either** stays on **A** if still in list **or** resets to first upcoming (no crash, no wrong event).
3. Pick **joint** event → joint path loads; **standard** event → standard path loads.

### F. Edit event — ladies tee

1. Open **edit** on event with **course + imported tees**; **men’s** + **ladies’** selectors populated.
2. Save; reopen edit → **ladies** tee/numbers **match** saved event (hydration + `matchLadiesTeeFromEvent`).
3. Course with **no ladies rows** → manual ladies block; save and reload.

---

## 4. Follow-up data hygiene (optional)

| Field | Recommendation |
|--------|----------------|
| **`user_id`** | Prefer **one auth user** per real person per society once they claim; reduces payment and dual-badge ambiguity. |
| **`email`** | Keep **consistent** on `members` rows across societies for the same person so **dual-member** email resolution works. |
| **`person_id`** | If your schema uses it globally, **populate** for linked identities so dual detection can use it without relying on email. |
| **Captain-added rows** | Until claimed, **`user_id` NULL** is expected; **email** is the main cross-society link for dual badge. |

---

## References

- `docs/EVENT_PAYMENT_SIMPLIFICATION.md`
- `supabase/README_MARK_EVENT_PAID.md` (073–076)
- `lib/jointEventDualMembers.ts` — identity rules  
- `lib/jointEventDualMembers.ts` — `normalizeMemberEmail`  
