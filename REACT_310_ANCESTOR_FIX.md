# React #310 Ancestor Fix — Deliverable

## Exact Offending File
`app/(app)/_layout.tsx`

## Exact Offending Pattern
**Early returns that unmounted the Stack** — When `loading && !hasRenderedStack.current` or `redirecting` was true, the component returned a loading spinner instead of the Stack. The Stack (and its children: EventLayout, players screen) was **not in the tree**. When loading became false, the component returned the Stack instead — the Stack and everything below it **mounted for the first time**. This swap caused expo-router's reconciliation to get confused, triggering "Rendered more hooks than during the previous render" (React #310).

## Hook-Order Mismatch
- **Root cause**: Not a hook-order mismatch *within* AppLayout — all hooks ran before any return.
- **Root cause**: The Stack was conditionally absent/present. When the Stack was absent, expo-router's internal layout/slot tree had no child. When the Stack appeared, the router mounted a new subtree. The transition from "no Stack" to "Stack" caused React's reconciler to invalidate fiber identity and re-enter mount logic mid-reconcile.

## Minimal Fix Diff
```diff
--- a/app/(app)/_layout.tsx
+++ b/app/(app)/_layout.tsx
@@ -16,26 +16,22 @@ export default function AppLayout() {
   if (isMember || !loading) hasRenderedStack.current = true;
-  // First-time bootstrap: show spinner until we know state.
-  if (loading && !hasRenderedStack.current) {
-    return (
-      <View style={[styles.center, { backgroundColor: colors.background }]}>
-        <LoadingState message="Loading..." />
-      </View>
-    );
-  }
-
-  // Guard is actively clearing a stale pointer.
-  if (redirecting) {
-    return (
-      <View style={[styles.center, { backgroundColor: colors.background }]}>
-        <LoadingState message="Loading..." />
-      </View>
-    );
-  }
-
-  // Render Stack for both Personal Mode (no society) and Society Mode.
-  return <Stack screenOptions={{ headerShown: false }} />;
+  const showOverlay = (loading && !hasRenderedStack.current) || redirecting;
+
+  // FIX React #310: Always render the Stack so expo-router can match child routes.
+  // Overlay loading/redirecting on top (matches root _layout.tsx pattern).
+  return (
+    <View style={{ flex: 1, backgroundColor: colors.background }}>
+      <Stack screenOptions={{ headerShown: false }} />
+      {showOverlay && (
+        <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: colors.background }]}>
+          <LoadingState message="Loading..." />
+        </View>
+      )}
+    </View>
+  );
 }
```

## Render Tree Above /event/[id]/players
1. RootLayout (app/_layout.tsx) — BootstrapProvider > RootNavigator
2. RootNavigator — Stack (always renders)
3. AppLayout (app/(app)/_layout.tsx) — layout for (app) segment
4. EventLayout (app/(app)/event/_layout.tsx) — layout for event segment
5. players.tsx (stub)

## Hook Order (app/(app)/_layout.tsx)
1. APP_LAYOUT_TOP
2. useSocietyMembershipGuard() → useBootstrap, usePathname, useRef×4, useEffect
3. APP_LAYOUT_AFTER_HOOK_1
4. getColors() (not a hook)
5. useRef(false)
6. APP_LAYOUT_AFTER_HOOK_2

## Hook Order (app/(app)/event/_layout.tsx)
- No hooks. EVENT_LAYOUT_TOP, EVENT_LAYOUT_AFTER_HOOK_1 only.

## Console Markers Added
- APP_LAYOUT_TOP, APP_LAYOUT_AFTER_HOOK_1, APP_LAYOUT_AFTER_HOOK_2
- EVENT_LAYOUT_TOP, EVENT_LAYOUT_AFTER_HOOK_1
- ROUTE_GUARD_TOP, ROUTE_GUARD_AFTER_HOOK_1, ROUTE_GUARD_AFTER_HOOK_2, ROUTE_GUARD_BEFORE_RETURN
- SCREEN_WRAPPER_TOP (in Screen.tsx — not hit by stub)
