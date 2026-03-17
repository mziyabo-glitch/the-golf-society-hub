# Provider/Root-Level Isolation Report

## 1. Providers and Top-Level Wrappers Above (app)

Root layout (`app/_layout.tsx`) structure:
- **RootLayout** (default export)
- **BootstrapProvider** (or BootstrapProviderStripped in strip test) — only provider
- **RootNavigator** — main layout component with hooks

No separate: AuthProvider, SocietyProvider, ThemeProvider, QueryClientProvider.
BootstrapProvider = auth + society + profile + membership (combined).

## 2. Exact Root Tree (Render Order)

```
RootLayout (app/_layout.tsx)
  -> BootstrapProvider
       -> RootNavigator
            -> View
                 -> Stack (expo-router)
                      -> (app) Slot
                           -> event/[id]/players (stub)
```

With stripped layouts:
```
RootLayout
  -> BootstrapProviderStripped (pass-through)
       -> RootNavigator
            -> View
                 -> Stack
                      -> (app) Slot
                           -> event Slot
                                -> players (stub)
```

## 3. Provider Audit

### BootstrapProvider (lib/useBootstrap.tsx)
- **Hooks:** useBootstrapInternal (useState×9, useRef×3, useEffect×2, useMemo×2, useCallback×2)
- **Early returns:** None before hooks
- **Conditional hooks:** None
- **Branches:** useBootstrapInternal runs unconditionally

### RootNavigator (app/_layout.tsx)
- **Hooks:** useBootstrap, useSegments, usePathname, useRouter, useRef×5, useEffect×3
- **Early returns:** None before hooks
- **Conditional hooks:** None
- **Branches:** All hooks unconditional

## 4. Strip Order

a. BootstrapProvider — already stripped (BootstrapProviderStripped), #310 remains
b. Society provider — N/A (BootstrapProvider)
c. Paid access — N/A (screen-level)
d. Theme — N/A (getColors is function, not provider)
e. Query — N/A
f. RootNavigator — NOT a provider; strip next to isolate

## 5. Strip Results

### Current config (both stripped)
- BootstrapProviderStripped (pass-through)
- RootNavigatorStripped (Stack only, no hooks)

**If #310 disappears:** Bug is in RootNavigator (hooks: useBootstrap, useSegments, usePathname, useRouter, useRef×5, useEffect×3).

### Restore order for testing
1. Restore RootNavigator → if #310 returns, RootNavigator is culprit
2. Restore BootstrapProvider → if #310 returns, BootstrapProvider is culprit

## 6. Console Markers

- ROOT_LAYOUT_TOP — RootLayout
- BOOTSTRAP_PROVIDER_TOP — BootstrapProvider (when restored)
- BOOTSTRAP_PROVIDER_STRIPPED — BootstrapProviderStripped
- ROOT_NAVIGATOR_STRIPPED — RootNavigatorStripped

## 7. Shared Hooks Audit

- **useBootstrap:** useContext only; early return after ctx ✓
- **useBootstrapInternal:** useState×9, useRef×3, useEffect×2, useMemo×2, useCallback×2 — all unconditional ✓
- **useSocietyMembershipGuard:** Not in tree (app layout stripped)
- **usePaidAccess:** Screen-level only
- **RootNavigator:** useBootstrap, useSegments, usePathname, useRouter, useRef×5, useEffect×3 — all unconditional ✓

## 8. Version Check (npm ls)

```
react@19.1.0
react-dom@19.1.0
react-native@0.81.5
react-native-web@0.21.2
expo-router@6.0.22
```

React 19 + react-native-web 0.21 — possible renderer mismatch on web.

## 9. Deliverable (Pending Test)

- **First provider/component whose removal makes #310 disappear:** [USER TO REPORT]
- **Exact offending file:** [USER TO REPORT]
- **Exact offending line:** [USER TO REPORT]
- **Minimal fix diff:** [USER TO REPORT]
