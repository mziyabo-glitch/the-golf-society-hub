import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { StyleSheet, View } from "react-native";
import { BottomTabBar } from "@react-navigation/bottom-tabs";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { AppText } from "@/components/ui/AppText";
import { useBootstrap } from "@/lib/useBootstrap";
import { isCaptain } from "@/lib/rbac";
import { getColors } from "@/lib/ui/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function TabBarWithBranding(props: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.tabBarWrapper, { paddingBottom: insets.bottom }]}>
      <BottomTabBar {...props} />
      <View style={styles.brandingFooter}>
        <AppText variant="small" color="tertiary" style={styles.brandingText}>
          Golf Society Hub
        </AppText>
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const { member, activeSocietyId } = useBootstrap();
  const colors = getColors();
  const insets = useSafeAreaInsets();

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
        tabBar: TabBarWithBranding,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarHideOnKeyboard: true,
        tabBarShowLabel: false,
        tabBarIconStyle: styles.tabBarIcon,
        tabBarItemStyle: styles.tabBarItem,
        tabBarStyle: [
          styles.tabBar,
          {
            height: 56,
            paddingBottom: 0,
            paddingTop: 8,
            backgroundColor: "#FFFFFF",
            borderTopColor: colors.border,
          },
        ],
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Home", tabBarIcon: ({ color }) => <Feather name="home" color={color} size={22} /> }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: "Events",
          tabBarIcon: ({ color }) => <Feather name="calendar" color={color} size={22} />,
          href: societyTabHref,
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: "OOM",
          tabBarIcon: ({ color }) => <Feather name="award" color={color} size={22} />,
          href: societyTabHref,
        }}
      />
      <Tabs.Screen
        name="sinbook"
        options={{
          title: "Sinbook",
          tabBarIcon: ({ color }) => <Feather name="zap" color={color} size={22} />,
          // Sinbook is always visible — has its own paywall
        }}
      />
      <Tabs.Screen
        name="members"
        options={{
          title: "Members",
          tabBarIcon: ({ color }) => <Feather name="users" color={color} size={22} />,
          href: societyTabHref,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: "Settings", tabBarIcon: ({ color }) => <Feather name="settings" color={color} size={22} /> }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBarWrapper: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E6E8EC",
  },
  tabBar: {
    position: "relative",
    borderTopWidth: 0,
  },
  tabBarIcon: {
    marginBottom: 0,
  },
  tabBarItem: {
    height: 46,
    justifyContent: "center",
    alignItems: "center",
  },
  brandingFooter: {
    alignItems: "center",
    paddingVertical: 4,
  },
  brandingText: {
    fontSize: 10,
    opacity: 0.7,
  },
});
