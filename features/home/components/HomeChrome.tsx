import { View, Image, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";

import { AppText } from "@/components/ui/AppText";
import { SocietySwitcherPill } from "@/components/SocietySwitcher";

import { homeDashboardStyles as styles } from "../homeDashboardStyles";

const appIcon = require("@/assets/images/app-icon.png");

type Colors = ReturnType<typeof import("@/lib/ui/theme").getColors>;

export function HomeAppBar({
  colors,
  onOpenMore,
  onOpenProfile,
  memberInitials,
}: {
  colors: Colors;
  onOpenMore: () => void;
  onOpenProfile?: () => void;
  memberInitials?: string;
}) {
  const initials = (memberInitials?.trim() || "ME").slice(0, 2).toUpperCase();

  return (
    <View style={[styles.appBarTier, { borderBottomColor: colors.borderLight }]}>
      <View style={headerStyles.leading}>
        <SocietySwitcherPill />
      </View>
      <View style={headerStyles.trailing}>
        {onOpenProfile ? (
          <Pressable
            onPress={onOpenProfile}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Open my profile"
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.75 : 1,
              backgroundColor: colors.backgroundTertiary,
              borderWidth: 1,
              borderColor: colors.borderLight,
            })}
          >
            <AppText variant="captionBold" color="primary">
              {initials}
            </AppText>
          </Pressable>
        ) : null}
        <Pressable
          onPress={onOpenMore}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Open more menu"
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            minHeight: 44,
            paddingVertical: 8,
            paddingHorizontal: 10,
            borderRadius: 20,
            opacity: pressed ? 0.75 : 1,
            backgroundColor: colors.backgroundTertiary,
          })}
        >
          <Feather name="menu" size={18} color={colors.textSecondary} />
          <AppText variant="captionBold" color="secondary">
            More
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

const headerStyles = StyleSheet.create({
  leading: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  trailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
});

export function PoweredByFooter({ colors }: { colors: Colors }) {
  return (
    <View style={styles.poweredByWrap}>
      <Image source={appIcon} style={styles.poweredByIcon} resizeMode="contain" />
      <AppText variant="small" color="muted" style={styles.poweredByText}>
        Powered by Golf Society Hub
      </AppText>
    </View>
  );
}
