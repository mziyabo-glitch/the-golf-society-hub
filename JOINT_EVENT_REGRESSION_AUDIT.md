# Joint-Event Regression Audit for React #310

## 1. Baseline

**Last known good (before joint-event):** `7661a3f5` (fix: cron schedule for Vercel Hobby plan)

**Joint-event commits:** 31516664, 4b11f638, c48a194a, 8d65801f, c30a7b91, 76d61b45, 05d39f59, 6fa68d0c, 7e8aa452, bf1406de

## 2. Files Changed for Joint-Event

| File | Joint-Event Changes |
|------|---------------------|
| `app/(app)/event/[id]/players.tsx` | societyFilter, societyNames, guestSocietyId, alternateMembers, participatingSocietyIds, filteredMembers, membersWithAlternates, society filter UI, change-society modal |
| `app/(app)/event/[id]/index.tsx` | participatingSocietyNames, hostSocietyName, formIsJointEvent, formParticipatingSocietyIds, isJointEvent, getHostSocietyId, Joint Event toggle |
| `app/(app)/event/[id]/points.tsx` | Minor (usePaidAccess) |
| `app/(app)/(tabs)/events.tsx` | Event list display |
| `app/(app)/tee-sheet.tsx` | Tee sheet for multi-society |
| `lib/db_supabase/eventRepo.ts` | participatingSocietyIds, is_joint_event, event_societies |
| `lib/db_supabase/eventSocietiesRepo.ts` | New repo |
| `lib/db_supabase/memberRepo.ts` | getMembersBySocietyIds, getMemberRowsByUserIdForSocieties |
| `components/ui/Toggle.tsx` | No hooks |

## 3. Hook-Order Audit

### players.tsx
- **Hooks:** useRouter, useLocalSearchParams, useBootstrap, useState×22, useCallback, useEffect — all unconditional, all before early returns
- **Derived (before returns):** isJointEvent, participatingSocietyIds, filteredMembers, membersWithAlternates — plain const/IIFE, no hooks
- **Early returns:** After all hooks (lines 362–380)
- **Risk:** LOW

### event index.tsx
- **Hooks:** useRouter, useLocalSearchParams, useBootstrap, usePaidAccess, useState×many, useEffect, useCallback×3, useFocusEffect, useMemo — all unconditional
- **Risk:** LOW

### event points.tsx
- No joint-event-specific hook changes
- **Risk:** LOW

### Custom hooks (usePaidAccess, useBootstrap)
- No hooks inside conditionals
- **Risk:** LOW

## 4. Derived State (Joint-Event)

| Name | Location | Can Affect Hook Order? |
|------|----------|------------------------|
| participatingSocietyIds | players.tsx | No — IIFE, not a hook |
| hostSocietyId | index.tsx | No — from getHostSocietyId |
| guestSocietyId | players.tsx | No — useState |
| isJointEvent | players, index | No — derived from event |
| membersWithAlternates | players.tsx | No — IIFE |
| filteredMembers | players.tsx | No — ternary |

## 5. File-by-File Report

| File | What Changed | Hook Order? | Risk |
|------|--------------|-------------|------|
| `app/(app)/event/[id]/players.tsx` | 6 new useState, society filter UI, change-society modal, derived state | No | LOW |
| `app/(app)/event/[id]/index.tsx` | 6 new useState, isJointEvent, getHostSocietyId, Joint Event form | No | LOW |
| `app/(app)/event/[id]/points.tsx` | usePaidAccess (existing) | No | LOW |
| `lib/db_supabase/eventRepo.ts` | Data mapping only | N/A | LOW |
| `lib/db_supabase/memberRepo.ts` | New functions, no hooks | N/A | LOW |
| `components/ui/Toggle.tsx` | No hooks | N/A | LOW |

## 6. Shared Layout/Guard Logic

- **app/(app)/_layout.tsx** — Not changed for joint-event
- **app/(app)/event/_layout.tsx** — Not changed for joint-event
- **useSocietyMembershipGuard** — Not changed for joint-event
- **Screen** — Uses useContext(BottomTabBarHeightContext). When on event/players (outside tabs), context is undefined → ?? 0. Same hook count every render.

## 7. Most Likely Offending File (If Joint-Event Related)

**players.tsx** — Highest concentration of joint-event changes:

- Society filter UI: `{participatingSocietyIds.length > 1 && (...)}` — conditional render of a new section
- Change-society modal: `{showChangeSociety && (...)}` — conditional modal
- MemberRow: `hasAlternates={membersWithAlternates.has(m.id)}`, `isJointEvent={isJointEvent}` — props passed to children

**Suspicious:** Conditional rendering of `{participatingSocietyIds.length > 1 && (...)}` — when this flips from false to true (e.g. after event loads), the DOM tree changes. On React DOM (web), this can stress reconciliation. The **SectionErrorBoundary** wraps each section; each section has different content for joint vs non-joint.

## 8. Smallest Suspicious Diff Block

```tsx
// players.tsx — society filter (conditional)
{participatingSocietyIds.length > 1 && (
  <View style={{ flexDirection: "row", ... }}>
    {participatingSocietyIds.map((sid) => (
      <Pressable key={sid} ...>
        <AppText>{societyNames[sid] ?? "Society"}</AppText>
      </Pressable>
    ))}
  </View>
)}
```

When `participatingSocietyIds` goes from `[]` to `["id1","id2"]`, this block appears. The parent tree (SectionErrorBoundary) now has an extra child. The **SectionErrorBoundary** is a class component; its children are different. If React reconciles this poorly with the rest of the tree, it could contribute to #310.

## 9. Minimal Fix

**Option A — Rollback joint-event UI on players (diagnostic):**

```tsx
// In players.tsx, wrap the society filter and change-society UI:
const JOINT_EVENT_UI_ENABLED = false; // Toggle for diagnostic

// Then:
{JOINT_EVENT_UI_ENABLED && participatingSocietyIds.length > 1 && (
  <View style={{ ... }}>...</View>
)}
```

And for MemberRow: `hasAlternates={JOINT_EVENT_UI_ENABLED ? membersWithAlternates.has(m.id) : false}`, `isJointEvent={JOINT_EVENT_UI_ENABLED && isJointEvent}`.

**Option B — Always render society filter container:**

```tsx
// Render the container always; hide content when not joint
<View style={participatingSocietyIds.length > 1 ? { flexDirection: "row", ... } : { display: "none" }}>
  {participatingSocietyIds.length > 1 && participatingSocietyIds.map(...)}
</View>
```

Keeps layout structure stable; reduces conditional mount/unmount.

## 10. Minimal Fix Applied

**File:** `app/(app)/event/[id]/players.tsx`  
**Line:** ~10 (new constant), ~500, ~545, ~578, ~597

```ts
const DEBUG_310_JOINT_UI = true;  // Set to false to disable joint-event UI
```

When `DEBUG_310_JOINT_UI = false`:
- Society filter hidden
- MemberRow receives `hasAlternates={false}`, `isJointEvent={false}`
- GuestRow receives `isJointEvent={false}`
- Add-guest "Representing society" hidden

**Test:** Set `DEBUG_310_JOINT_UI = false` and deploy. If #310 disappears, the conditional joint-event UI is the culprit.

## 11. Rollback Option (Joint-Event Only)

To roll back only the joint-event players UI:

1. Remove society filter UI.
2. Remove change-society modal.
3. Pass `hasAlternates={false}` and `isJointEvent={false}` to MemberRow/GuestRow.
4. Keep `getMembersBySocietyIds` for loading (needed for multi-society events).
5. Keep `participatingSocietyIds` for add-guest society selection (or simplify to single society).

This preserves the core flow while removing the conditional UI that may trigger #310.
