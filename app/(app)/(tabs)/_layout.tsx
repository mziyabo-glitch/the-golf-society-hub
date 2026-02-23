import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { StyleSheet } from "react-native";
import { useBootstrap } from "@/lib/useBootstrap";
import { isCaptain } from "@/lib/rbac";
import { getColors } from "@/lib/ui/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function TabsLayout() {
  const { member, activeSocietyId } = useBootstrap();
  const colors = getColors();
  const insets = useSafeAreaInsets();

  const hasSociety = !!activeSocietyId && !!member;
  const tabBarHeight = 64 + insets.bottom;

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
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarIconStyle: styles.tabBarIcon,
        tabBarItemStyle: styles.tabBarItem,
        tabBarStyle: [
          styles.tabBar,
          {
            height: tabBarHeight,
            paddingBottom: Math.max(insets.bottom, 10),
            paddingTop: 8,
            backgroundColor: "#FFFFFF",
            borderTopColor: colors.border,
          },
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
    position: "relative",
    borderTopWidth: 1,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 14,
    textAlign: "center",
    marginTop: 2,
  },
  tabBarIcon: {
    marginTop: 1,
  },
  tabBarItem: {
    height: 46,
    justifyContent: "center",
    alignItems: "center",
  },
});
