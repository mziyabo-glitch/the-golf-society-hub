import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";

import { useBootstrap } from "@/lib/useBootstrap";
import { isCaptain } from "@/lib/rbac";
import { PremiumTabBar } from "@/components/navigation/PremiumTabBar";

export default function TabsLayout() {
  const { member, activeSocietyId } = useBootstrap();

  const hasSociety = !!activeSocietyId && !!member;

  const hasFullAccess =
    hasSociety && (isCaptain(member as any) || (member as any)?.has_seat === true);

  const societyTabHref = hasFullAccess ? undefined : null;
  const rivalriesTabHref = hasSociety ? undefined : null;

  return (
    <Tabs
      tabBar={(props) => <PremiumTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Home", tabBarIcon: ({ color }) => <Feather name="home" color={color} size={24} /> }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: "Events",
          tabBarIcon: ({ color }) => <Feather name="calendar" color={color} size={24} />,
          href: societyTabHref,
        }}
      />
      {/* Temporarily hidden from navigation; screen remains routable for guarded direct access */}
      <Tabs.Screen name="scorecard" options={{ href: null }} />
      <Tabs.Screen
        name="sinbook"
        options={{
          title: "Rivalries",
          tabBarAccessibilityLabel: "Rivalries",
          tabBarIcon: ({ color }) => <Feather name="zap" color={color} size={24} />,
          href: rivalriesTabHref,
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: "OOM",
          tabBarAccessibilityLabel: "Order of Merit",
          tabBarIcon: ({ color }) => <Feather name="award" color={color} size={24} />,
          href: societyTabHref,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarIcon: ({ color }) => <Feather name="more-horizontal" color={color} size={24} />,
        }}
      />
      {/* Routable from More / deep links; not shown in tab bar */}
      <Tabs.Screen name="weather" options={{ href: null }} />
      <Tabs.Screen name="members" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  );
}
