# Second society join — manual QA (iPhone + cross-platform)

**Purpose:** Confirm the post-join “snap back to society A” fix before marking it done.

**Build:** dev client with `__DEV__` logs visible (Metro / Xcode console), or a staging build with logging enabled if you strip `__DEV__` in production.

---

## 1. Join B while already in A (no snapback)

**Steps**

1. Sign in; ensure you are active in society **A** (dashboard/events feel like A).
2. Join society **B** via onboarding / captain link (same flow users use on device).
3. After success, stay on the home/dashboard for **5+ seconds**.

**Expected**

- UI is for society **B** (name, events, switcher).
- **No** return to A after 1–5 seconds.

**Logs to look for**

- `[join] active_society_change` with `source: "join-flow"`, `nextSocietyId` = **B**’s id.
- If membership list was briefly stale: `[useBootstrap] active_society_change: skip self-heal — profile active society valid, membership list lag` with `source: "bootstrap-membership-list-lag"`.
- You should **not** see `source: "bootstrap-self-heal"` rewriting the pointer to A right after join.

---

## 2. Kill app and reopen (still B)

**Steps**

1. After scenario (1), force-quit the app (swipe away from app switcher).
2. Relaunch; wait for bootstrap to finish.

**Expected**

- Default context is still society **B** (same as when you quit).

**Logs**

- Normal bootstrap lines; no `bootstrap-self-heal` pointing back to A unless your profile in DB is actually A.

---

## 3. Manual switch back to A

**Steps**

1. Use **Society switcher** (or equivalent) to select society **A**.
2. Background/foreground or navigate; confirm UI stays on **A**.

**Expected**

- Switch works; **A** remains active until you change again.
- Persistence: repeat scenario (2) after switching to A — reopen should show **A**.

---

## 4. Android / Web — same ordering

**Steps**

Repeat scenarios (1)–(3) on **Android** and **web** (or at least one of them).

**Expected**

- Same behaviour: join B → land in B, no snapback; relaunch respects last active; manual switch persists.

---

## 5. Cache hydrate does not overwrite B (`__DEV__` only)

If a stale AsyncStorage snapshot still has `active_society_id: A` while in-memory profile already has **B** (same user id), hydration should **keep** in-memory profile.

**Log when that happens**

- `[useBootstrap] active_society_change: cache hydrate skipped (in-memory profile wins)` with `source: "bootstrap-cache-hydrate"`, `keptActiveSocietyId` = B, `cachedActiveSocietyId` = A.

Production builds without `__DEV__` will not print this line; rely on behaviour in (1)–(2).

---

## Sign-off

| Check | iPhone | Android | Web |
|-------|--------|---------|-----|
| (1) No snapback | ☐ | ☐ | ☐ |
| (2) Reopen in B | ☐ | — | — |
| (3) Switch A persists | ☐ | ☐ | ☐ |
| (4) Cross-platform | — | ☐ | ☐ |
| (5) Cache skip log (dev) | ☐ optional | | |

**Verifier:** _______________ **Date:** _______________

When satisfied, mark the **second society join / bootstrap heal** work item **done** in your tracker.
