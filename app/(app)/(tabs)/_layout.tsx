import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useBootstrap } from "@/lib/useBootstrap";

export default function TabsLayout() {
  const { activeSocietyId } = useBootstrap();

  const hasSociety = !!activeSocietyId;
  // Keep tab tree stable during auth/member hydration to avoid route-tree churn.
  // Feature-level access is still enforced inside each screen.
  const societyTabHref = hasSociety ? undefined : null;

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
          href: societyTabHref,
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: "OOM",
          tabBarIcon: ({ color, size }) => <Feather name="award" color={color} size={size} />,
          href: societyTabHref,
        }}
      />
      <Tabs.Screen
        name="sinbook"
        options={{
          title: "Sinbook",
          tabBarIcon: ({ color, size }) => <Feather name="zap" color={color} size={size} />,
          // Sinbook is always visible — has its own paywall
        }}
      />
      <Tabs.Screen
        name="members"
        options={{
          title: "Members",
          tabBarIcon: ({ color, size }) => <Feather name="users" color={color} size={size} />,
          href: societyTabHref,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: "Settings", tabBarIcon: ({ color, size }) => <Feather name="settings" color={color} size={size} /> }}
      />
    </Tabs>
  );
}
