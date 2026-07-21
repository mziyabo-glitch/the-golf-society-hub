import { Stack } from "expo-router";

export default function AdminLayout() {
  return (
    <Stack screenOptions={{ headerShown: true, headerBackTitle: "Back" }}>
      <Stack.Screen name="usage-report/index" options={{ title: "Usage report" }} />
      <Stack.Screen name="course-domains/index" options={{ title: "Course domains" }} />
    </Stack>
  );
}
