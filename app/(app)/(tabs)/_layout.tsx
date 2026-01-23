// app/(app)/(tabs)/_layout.tsx
import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="event" />
      <Tabs.Screen name="members" />
      <Tabs.Screen name="leaderboard" />
      <Tabs.Screen name="profile" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}