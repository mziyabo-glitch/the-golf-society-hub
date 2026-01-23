import { Stack } from "expo-router";

import { RequireAuth, RequireSociety } from "@/components/guards/RouteGuards";

export default function AppLayout() {
  return (
    <RequireAuth>
      <RequireSociety>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="society" />
          <Stack.Screen name="add-member" />
          <Stack.Screen name="create-event" />
          <Stack.Screen name="finance" />
          <Stack.Screen name="finance-events" />
          <Stack.Screen name="event" />
          <Stack.Screen name="modal" options={{ presentation: "modal" }} />
          <Stack.Screen name="tees-teesheet" />
          <Stack.Screen name="venue-info" />
          <Stack.Screen name="handicaps" />
          <Stack.Screen name="roles" />
          <Stack.Screen name="members" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="history" />
          <Stack.Screen name="leaderboard" />
          <Stack.Screen name="settings" />
        </Stack>
      </RequireSociety>
    </RequireAuth>
  );
}
