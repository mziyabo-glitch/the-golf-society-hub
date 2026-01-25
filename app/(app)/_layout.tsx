// app/(app)/_layout.tsx
import { Stack } from "expo-router";

export default function AppLayout() {
  // Keep this simple: the tab group is the main entry inside (app).
  // Other standalone routes are handled by app/_layout.tsx at the root.
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
