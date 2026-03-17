import { Stack } from "expo-router";

export default function EventLayout() {
  console.log("EVENT_LAYOUT_TOP");
  // No hooks in EventLayout
  console.log("EVENT_LAYOUT_AFTER_HOOK_1");
  return <Stack screenOptions={{ headerShown: false }} />;
}
