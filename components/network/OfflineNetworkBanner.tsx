import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import { useNetwork } from "@/lib/network/NetworkContext";
import { AppText } from "@/components/ui/AppText";
import { getColors, spacing } from "@/lib/ui/theme";

/**
 * Non-blocking banner when the device is offline or has no usable internet.
 * Render once near the root (e.g. under status bar).
 */
export function OfflineNetworkBanner() {
  const { isOffline } = useNetwork();
  const insets = useSafeAreaInsets();
  const colors = getColors();

  if (!isOffline) return null;

  return (
    <View
      style={[
        styles.bar,
        {
          paddingTop: Math.max(insets.top, spacing.sm),
          backgroundColor: colors.warning + "E8",
          borderBottomColor: colors.warning,
        },
      ]}
      accessibilityRole="alert"
    >
      <Feather name="wifi-off" size={16} color={colors.text} style={{ marginRight: spacing.sm }} />
      <View style={{ flex: 1 }}>
        <AppText variant="captionBold" color="primary">
          No connection
        </AppText>
        <AppText variant="small" color="secondary" numberOfLines={2}>
          You can still browse saved content. Reconnect to refresh and sync.
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
