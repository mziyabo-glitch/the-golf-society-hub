import { View, Image, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";

import { AppText } from "@/components/ui/AppText";
import { SocietySwitcherPill } from "@/components/SocietySwitcher";

import { homeDashboardStyles as styles } from "../homeDashboardStyles";

const appIcon = require("@/assets/images/app-icon.png");

type Colors = ReturnType<typeof import("@/lib/ui/theme").getColors>;

export function HomeAppBar({
  colors,
  onOpenMore,
}: {
  colors: Colors;
  onOpenMore: () => void;
}) {
  return (
    <View style={[styles.appBarTier, { borderBottomColor: colors.borderLight }]}>
      <SocietySwitcherPill />
      <Pressable
        onPress={onOpenMore}
        hitSlop={12}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
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
  );
}

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
