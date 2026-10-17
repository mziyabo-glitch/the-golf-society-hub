# Joint Events Phase 3 — Test Checklist

Use this checklist to validate the joint event create/edit flow.

## Prerequisites

- Migrations 062–066 applied
- User in 2+ societies (for joint create)
- Captain/Secretary role in at least one society

## Test Cases

### 1. Standard event create still works

- [ ] Create Event → leave "Joint Event" Off
- [ ] Fill name, date, format, course
- [ ] Create Event
- [ ] Event appears in list
- [ ] No event_societies rows created

### 2. Standard event edit still works

- [ ] Open a standard event
- [ ] Edit → change name
- [ ] Save
- [ ] Changes persist
- [ ] No Participating Societies section in edit form

### 3. Joint event create with 2 societies works

- [ ] Create Event → toggle "Joint Event" On
- [ ] Current society auto-added as host
- [ ] Add second society from "Add society" list
- [ ] Fill name, date, format, course
- [ ] Create Event
- [ ] Event appears
- [ ] Open event → "Participating Societies" card visible
- [ ] Edit → Participating Societies section shows both societies

### 4. Joint event create rejects 1 society

- [ ] Create Event → Joint Event On
- [ ] Do NOT add a second society
- [ ] Fill other fields, Create
- [ ] Validation error: "Joint events require at least 2 participating societies"
- [ ] Event not created

### 5. Joint event edit loads existing participating societies

- [ ] Open a joint event (2+ societies)
- [ ] Edit
- [ ] Participating Societies section shows all societies
- [ ] Host badge on correct society
- [ ] OOM toggles reflect saved state

### 6. Host society persists correctly

- [ ] Edit joint event
- [ ] Change host via "Set as host" on another society
- [ ] Save
- [ ] Reload event
- [ ] New host is correct

### 7. Society OOM toggles persist correctly

- [ ] Edit joint event
- [ ] Toggle OOM Off for one society
- [ ] Save
- [ ] Reload, Edit
- [ ] OOM state persisted

### 8. Duplicate society selection blocked

- [ ] Create/Edit joint event
- [ ] Add society A
- [ ] Try to add society A again from list
- [ ] Society A not in "Add society" list (already added)
- [ ] Or: adding same society does nothing (no duplicate)

### 9. Failed save shows visible error

- [ ] Simulate error (e.g. network off, invalid data)
- [ ] Save
- [ ] Error banner/toast visible
- [ ] No silent failure

### 10. App does not crash if participating societies empty or malformed

- [ ] Open joint event with 0 entries
- [ ] No crash
- [ ] Edit form loads
- [ ] Empty participating_societies from API → normalized to []

## Rollback

If issues occur:

1. Revert app changes (events.tsx, event/[id]/index.tsx, jointEventRepo, ParticipatingSocietiesSection)
2. Standard event flow is unchanged; create/edit continue to work
3. event_societies rows remain; no data loss
4. get_joint_event_detail RPC remains for read-only use
