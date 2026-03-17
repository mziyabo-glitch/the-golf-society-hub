import { Stack } from "expo-router";

export default function EventLayout() {
  console.log("EVENT_LAYOUT_TOP");
  return <Stack screenOptions={{ headerShown: false }} />;
}
