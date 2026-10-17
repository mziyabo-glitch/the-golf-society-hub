import { Stack } from "expo-router";

/** Legacy admin group — screens redirect into /(app)/admin/*. */
export default function LegacyAdminLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
