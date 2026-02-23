import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { StyleSheet } from "react-native";
import { useBootstrap } from "@/lib/useBootstrap";
import { isCaptain } from "@/lib/rbac";
import { getColors, radius } from "@/lib/ui/theme";

export default function TabsLayout() {
  const { member, activeSocietyId } = useBootstrap();
  const colors = getColors();

  const hasSociety = !!activeSocietyId && !!member;

  // Captains always have full access; regular members need a licence (seat)
  const hasFullAccess =
    hasSociety && (isCaptain(member as any) || (member as any)?.has_seat === true);

  // Society-only tabs are hidden in Personal Mode or when unlicensed
  const societyTabHref = hasFullAccess ? undefined : null;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarIconStyle: styles.tabBarIcon,
        tabBarItemStyle: styles.tabBarItem,
        tabBarStyle: [
          styles.tabBar,
          { backgroundColor: "rgba(255,255,255,0.94)", borderTopColor: colors.borderLight },
        ],
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Home", tabBarIcon: ({ color }) => <Feather name="home" color={color} size={20} /> }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: "Events",
          tabBarIcon: ({ color }) => <Feather name="calendar" color={color} size={20} />,
          href: societyTabHref,
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: "OOM",
          tabBarIcon: ({ color }) => <Feather name="award" color={color} size={20} />,
          href: societyTabHref,
        }}
      />
      <Tabs.Screen
        name="sinbook"
        options={{
          title: "Sinbook",
          tabBarIcon: ({ color }) => <Feather name="zap" color={color} size={20} />,
          // Sinbook is always visible — has its own paywall
        }}
      />
      <Tabs.Screen
        name="members"
        options={{
          title: "Members",
          tabBarIcon: ({ color }) => <Feather name="users" color={color} size={20} />,
          href: societyTabHref,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: "Settings", tabBarIcon: ({ color }) => <Feather name="settings" color={color} size={20} /> }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: "absolute",
    height: 66,
    paddingTop: 8,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -1 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 6,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 1,
  },
  tabBarIcon: {
    marginBottom: 1,
  },
  tabBarItem: {
    paddingTop: 2,
  },
});
