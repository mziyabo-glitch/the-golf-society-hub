# Top-Down Strip Test for React #310

## Providers Above (app) Route Tree

1. **BootstrapProvider** — auth, society, profile, membership (app/_layout.tsx)

No separate: auth provider, society provider, theme provider, query client. BootstrapProvider is the main provider.

## Strip Steps

### STEP 1: event/[id]/_layout.tsx
- **File:** `app/(app)/event/[id]/_layout.tsx` (created)
- **Change:** Minimal layout: `return <Slot />`, no hooks
- **Marker:** EVENT_LAYOUT_STRIPPED
- **#310:** [USER TO REPORT]

### STEP 2: app/(app)/_layout.tsx
- **File:** `app/(app)/_layout.tsx`
- **Change:** Replaced with minimal `return <Slot />`, no hooks, no guards
- **Marker:** APP_LAYOUT_STRIPPED
- **#310:** [USER TO REPORT]

### STEP 3: BootstrapProvider
- **File:** `app/_layout.tsx`
- **Change:** Replaced BootstrapProvider with BootstrapProviderStripped (pass-through)
- **Marker:** PROVIDER_BOOTSTRAP_STRIPPED
- **#310:** [USER TO REPORT]

## Interpretation

- **STEP 1 #310 disappears** → Bug in event/[id]/_layout.tsx or what it mounted (but it's minimal, so likely the event layout above it)
- **STEP 2 #310 disappears** → Bug in app/(app)/_layout.tsx or its wrappers
- **STEP 3 #310 disappears** → Bug in BootstrapProvider (useBootstrapInternal hook order)

## First Level Where #310 Disappears

[TO BE FILLED AFTER TEST]

## Exact Offending File/Component

[TO BE FILLED]

## Minimal Fix Diff

[TO BE FILLED]
