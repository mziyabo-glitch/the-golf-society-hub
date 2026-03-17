import { Stack } from "expo-router";

export default function EventLayout() {
  console.log("EVENT_ID_LAYOUT_TOP");
  // No hooks in EventLayout
  console.log("EVENT_ID_LAYOUT_AFTER_HOOK_1");
  console.log("EVENT_ID_LAYOUT_AFTER_HOOK_2");
  return <Stack screenOptions={{ headerShown: false }} />;
}
