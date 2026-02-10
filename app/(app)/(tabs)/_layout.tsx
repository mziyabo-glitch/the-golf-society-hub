import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useBootstrap } from "@/lib/useBootstrap";
import { isCaptain } from "@/lib/rbac";

export default function TabsLayout() {
  const { member } = useBootstrap();

  // Captains always have full access; regular members need a licence (seat)
  const hasFullAccess =
    isCaptain(member as any) || (member as any)?.has_seat === true;

  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen
        name="index"
        options={{ title: "Home", tabBarIcon: ({ color, size }) => <Feather name="home" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: "Events",
          tabBarIcon: ({ color, size }) => <Feather name="calendar" color={color} size={size} />,
          href: hasFullAccess ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: "OOM",
          tabBarIcon: ({ color, size }) => <Feather name="award" color={color} size={size} />,
          href: hasFullAccess ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="sinbook"
        options={{
          title: "Sinbook",
          tabBarIcon: ({ color, size }) => <Feather name="zap" color={color} size={size} />,
          href: hasFullAccess ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="members"
        options={{
          title: "Members",
          tabBarIcon: ({ color, size }) => <Feather name="users" color={color} size={size} />,
          href: hasFullAccess ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: "Settings", tabBarIcon: ({ color, size }) => <Feather name="settings" color={color} size={size} /> }}
      />
    </Tabs>
  );
}

