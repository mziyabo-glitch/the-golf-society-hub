import { Stack } from "expo-router";

/**
 * Platform admin screens. Access is gated inside each screen via isPlatformAdmin().
 * Root layout must not redirect these routes back to app tabs (see isAdminRoute).
 */
export default function AdminLayout() {
  return (
    <Stack screenOptions={{ headerShown: true, headerBackTitle: "Back" }}>
      <Stack.Screen name="usage-report/index" options={{ title: "Usage report" }} />
      <Stack.Screen name="course-domains/index" options={{ title: "Course domains" }} />
    </Stack>
  );
}
