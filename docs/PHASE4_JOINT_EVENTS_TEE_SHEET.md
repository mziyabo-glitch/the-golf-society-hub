# Phase 4: Joint Events — Combined Tee Sheet

## Summary

- **One combined tee sheet** for joint events (no separate sheets per society).
- **Entries appear once only** (one row per player; dual-members shown once with badge).
- **Event-wide pairing groups**; mixed societies in one group allowed.
- **Standard event tee sheet** behavior unchanged.

---

## 1. Files changed

| Area | File |
|------|------|
| Types | `lib/db_supabase/jointEventTypes.ts` — `JointEventTeeSheet`, `JointEventTeeSheetEntry`, `JointEventTeeSheetGroup` |
| Repo | `lib/db_supabase/jointEventRepo.ts` — `getJointEventTeeSheet`, `getEventIdsWhereSocietyParticipates`, `updateEventEntriesPairings` |
| Repo | `lib/db_supabase/eventRepo.ts` — `getEventsForTeeSheet` |
| UI | `app/(app)/tee-sheet.tsx` — joint path, badges, save/publish, empty states |

---

## 2. New / updated repo and read functions

- **`getJointEventTeeSheet(eventId)`** — Returns normalized tee-sheet payload: event, participating_societies, groups, entries (one per player), is_joint_event, is_published, generated_at. No duplicate player rows; empty arrays when none.
- **`getEventIdsWhereSocietyParticipates(societyId)`** — Event IDs where society is in `event_societies` (for tee sheet event list).
- **`getEventsForTeeSheet(societyId)`** — Events for tee sheet dropdown: host events + joint events where society participates.
- **`updateEventEntriesPairings(eventId, assignments)`** — Writes `pairing_group` and `pairing_position` to `event_entries` for joint events.

---

## 3. UI changes

- Tee sheet **event list** uses `getEventsForTeeSheet` so joint events (where society participates) appear.
- **Joint path**: On event select, if `isEventJoint`, load `getJointEventTeeSheet` and show combined groups; no `tee_groups` / `tee_group_players`.
- **Joint Event** card: “Joint Event” label + participating societies (e.g. “Society A • Society B”).
- **Society badges**: In group table, each player can show a small label (society name or “Dual” for multiple societies).
- **Empty state**: “No entries yet” for joint events with no entries; no crash.
- **Save**: Joint path calls `updateEventEntriesPairings` + `updateEvent` (tee time fields only); no `upsertTeeSheet` or `playerIds`.
- **Publish**: Joint path calls `updateEventEntriesPairings`, `publishTeeTime`, then export; standard path unchanged.
- **Export**: Joint events use `societyName: "Joint: A & B"` in `TeeSheetData` so PDF/share header shows joint context.

---

## 4. Tee sheet persistence

- **Standard events**: Unchanged — `tee_groups`, `tee_group_players`, `events.player_ids`, `events.tee_time_*`, `publish_tee_times` RPC.
- **Joint events**: `event_entries.pairing_group`, `event_entries.pairing_position` updated by `updateEventEntriesPairings`; event `tee_time_start` / `tee_time_interval` / `tee_time_published_at` via `updateEvent` and `publishTeeTime`. No writes to `tee_groups` or `tee_group_players` for joint events.

---

## 5. Export / PDF compatibility

- **Joint**: One combined tee sheet; `societyName` set to `"Joint: Society A & Society B"` (or similar); same `TeeSheetData` and share flow; no duplicate players.
- **Standard**: Unchanged.
- **Follow-up**: If needed, NTP/LD holes for joint events could be added to the joint payload and passed into export; currently left as default/empty.

---

## 6. Validation and guard behavior

- **No entries**: Empty state “No entries yet” (joint) or “No players added” (standard); no blank screen.
- **No pairing_group**: Entries with null `pairing_group` are grouped into group 1 so the UI always has a valid structure.
- **Partial tee times**: Tee time derived from `event.tee_time_start` + `interval * (group_number - 1)`; missing values not required for render.
- **Empty or partial participating_societies**: `participating_societies` default to `[]`; header shows “2+ societies” if names missing.
- **No society membership on entry**: `primary_display_society` / `societyLabel` can be null; badge omitted.

---

## 7. Rollback (if needed)

1. **Tee sheet screen**: In `app/(app)/tee-sheet.tsx` replace `getEventsForTeeSheet` with `getEventsBySocietyId` and remove joint-only state and branches (`isJointEventTeeSheet`, `jointTeeSheetData`, joint branch in `loadEventDetails`, `handleSaveTeeSheet`, `handleGenerateTeeSheet`, Joint Event card, `showSocietyBadge`, Reset joint branch, empty-state message).
2. **Event list**: Revert `eventRepo.ts` to remove `getEventsForTeeSheet` (and its use of `getEventIdsWhereSocietyParticipates`).
3. **Joint repo**: Optional — leave `getJointEventTeeSheet`, `getEventIdsWhereSocietyParticipates`, `updateEventEntriesPairings` in place; they are unused if the tee sheet UI is reverted as above.

---

## 8. Test checklist

- [ ] **1. Standard event tee sheet** — Select a standard (non-joint) event; groups load from registrations or saved tee_groups; edit groups, save, publish; PDF/share works; no regression.
- [ ] **2. Joint event, one combined sheet** — Create/use a joint event (2+ societies); open tee sheet; one combined list of groups and players.
- [ ] **3. Entries once only** — Joint event with dual-member; that player appears once in the tee sheet.
- [ ] **4. Mixed-society group** — Joint event; put players from different societies in the same group; save and reload; group still mixed.
- [ ] **5. Dual-member indicator** — Joint event; player in two participating societies shows “Dual” (or both society names) as badge.
- [ ] **6. No tee times yet** — Joint event, entries but no pairing assigned; screen shows entries in default group; no crash.
- [ ] **7. Partial tee times** — Some entries with pairing_group, some without; screen renders; save updates only assigned.
- [ ] **8. Tee sheet publish (joint)** — Joint event; assign groups; “Share Tee Sheet”; publish succeeds; event shows published; export opens.
- [ ] **9. Export/PDF no duplicate players** — Export joint event tee sheet; PDF or share image has each player once.
- [ ] **10. Malformed society metadata** — Participating societies empty or missing names; header shows “2+ societies” or similar; no blank screen.

---

## 9. __DEV__ logging

- Tee sheet path: “Using joint event path” vs “Using standard tee sheet path”.
- Joint tee sheet load: groups count, entries count, duplicate player IDs if any.
- Save joint: eventId, number of assignments.
- Publish joint: eventId, number of groups.
