# Joint tee sheet: canonical path & society scoping (audit)

## Root cause (ZGS / guest society players missing)

**File:** `lib/teeSheetEligibility.ts`  
**Function:** `loadJointTeeSheetForManCo` (approx. lines 101–113)

**Logic:** Loads `getJointEventTeeSheet`, then applies `filterJointTeeSheetByEligible(teeSheet, eligibleIds)` where `eligibleIds` = `jointScopedRegsAndEligibleSet(regs, societies).eligibleIds` from `getEventRegistrations` + `scopeEventRegistrations(..., joint_participants)` + `isTeeSheetEligible`.

**Why ZGS rows disappeared:** Any `player_id` not present in that eligible set was **removed from groups before** `jointGroupsToCanonical` ran. Registration rows visible to the client can differ by **RLS** or **context** (e.g. host vs guest society), so guest-society members could be dropped from the in-memory tee sheet even though pairings were saved in `event_entries`.

**Fix:** `loadCanonicalTeeSheet` (joint branch) and ManCo **display** reload paths now use **`getJointEventTeeSheet` only** — no eligibility filter on read. **Save / publish** still uses `fetchEligibleMemberIdsForTeeSheetSave` + `sanitizePlayerGroupsForTeeSheetSave` (payment rules unchanged).

---

## Society-scoping filters (tee sheet–related)

| Location | Filter | Used for |
|----------|--------|----------|
| `canonicalTeeSheet.ts` joint branch | None on groups | **Display** — full `getJointEventTeeSheet` |
| `canonicalTeeSheet.ts` standard + `tee_groups` | `scopeEventRegistrations` → `eligible` → `filterTeeGroupPlayersForEligibility` | Non-joint DB snapshot rows must be eligible per product rules |
| `canonicalTeeSheet.ts` standard fallback | `scoped` + `isTeeSheetEligible` for `regIds` | Published fallback when no `tee_groups` |
| `teeSheetEligibility.loadJointTeeSheetForManCo` | `filterJointTeeSheetByEligible` | **Optional** strict preview; not used for canonical/ManCo UI after fix |
| `app/(app)/tee-sheet.tsx` save/publish | `fetchEligibleMemberIdsForTeeSheetSave`, `sanitizePlayerGroupsForTeeSheetSave` | Enforce paid+confirmed on **write** |
| `app/(app)/(tabs)/index.tsx` | `getMembersBySocietyId(societyId)` + **`getMembersByIds` augment** for joint canonical ids | Home “my tee time” needs cross-society `MemberDoc` for `representativeMemberIdForJoint` |
| Payment / event detail pages | Unchanged | Society-scoped per existing rules |

---

## DEV logs

- `[teesheet] canonical source groups` — raw ids from `getJointEventTeeSheet` groups  
- `[teesheet] canonical hydrated players` — ids after `jointGroupsToCanonical`  
- `[teesheet] canonical dropped rows` — if any id in source but not in canonical (unexpected)  
- `[teesheet] PLAYER DROPPED FROM CANONICAL` — per-id warning  
- `[teesheet] canonical render (member tee sheet)` — member screen render snapshot  
- `[teesheet][canonical] load` — existing summary log  
