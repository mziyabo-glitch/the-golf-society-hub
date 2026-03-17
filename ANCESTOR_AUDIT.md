# Ancestor-Only Isolation for /event/[id]/players

## A. Exact Render Tree Above Players Route

```
RootLayout (app/_layout.tsx)
└── BootstrapProvider
    └── RootNavigator
        └── Stack (expo-router root)
            └── AppLayout (app/(app)/_layout.tsx)     ← layout for (app) segment
                └── Stack
                    └── EventLayout (app/(app)/event/_layout.tsx)  ← layout for event segment
                        └── Stack
                            └── [id] segment (no _layout.tsx; event layout wraps it)
                                └── players.tsx (stub)
```

Note: `app/(app)/event/[id]/_layout.tsx` does NOT exist. The event layout wraps the [id] segment directly.

## B. Hooks in Execution Order

### AppLayout (app/(app)/_layout.tsx)
1. useSocietyMembershipGuard() — custom hook
2. useRef(false) — hasRenderedStack
3. getColors() — NOT a hook

### useSocietyMembershipGuard (lib/access/useSocietyMembershipGuard.ts)
1. useBootstrap() — useContext internally
2. usePathname()
3. useRef(false) — redirected
4. useRef(null) — trackedSocietyId
5. useRef(null) — missingSinceMs
6. useRef(0) — retryCount
7. useEffect(...)

### EventLayout (app/(app)/event/_layout.tsx)
- No hooks

### useBootstrap (lib/useBootstrap.tsx)
- useContext(BootstrapContext) — early return if ctx; no other hooks in useBootstrap
- useBootstrapInternal (BootstrapProvider): useState×9, useRef×3, useEffect×2, useMemo×2, useCallback×2

## C. Search Results

### Hooks after early returns
- useBootstrap: `if (ctx) return ctx` — returns AFTER useContext (only hook). ✓ Safe.
- useSocietyMembershipGuard: No early returns before hooks. ✓
- AppLayout: No early returns before hooks (fixed in prior commit). ✓

### Hooks inside conditionals
- None found in target files.

### Hooks inside route-segment conditionals
- None. Guard uses pathname for isGuardExemptRoute but all hooks run unconditionally.

### Custom hooks that branch internally
- useBootstrap: returns early if ctx; only hook is useContext. ✓ Safe.

### Helper functions with hooks
- None. isGuardExemptRoute is a plain function.

## D. Hard Markers Added

- APP_LAYOUT_TOP, APP_LAYOUT_AFTER_HOOK_1, APP_LAYOUT_AFTER_HOOK_2
- EVENT_ID_LAYOUT_TOP, EVENT_ID_LAYOUT_AFTER_HOOK_1, EVENT_ID_LAYOUT_AFTER_HOOK_2
- ROUTE_GUARD_TOP, ROUTE_GUARD_AFTER_HOOK_1, ROUTE_GUARD_AFTER_HOOK_2, ROUTE_GUARD_BEFORE_RETURN

## E. Guard Bypass (Diagnosis Only)

In useSocietyMembershipGuard, before return:
```ts
if (pathname?.includes("/event/") && pathname?.endsWith("/players")) {
  return { loading: false, isMember: true, redirecting: false };
}
```
All hooks still run; only the return value is bypassed for this route.

**Interpretation:**
- If #310 disappears when bypassed → bug is in guard/layout logic
- If #310 remains → continue upward into providers (BootstrapProvider, RootNavigator)

## F. Deliverable (Pending Test)

- **Exact offending file:** TBD after bypass test
- **Exact offending line:** TBD
- **Minimal diff:** TBD
- **Bypassing guard removed #310:** [USER TO REPORT]
