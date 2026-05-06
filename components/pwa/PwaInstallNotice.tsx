import { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/AppText";
import { getColors, radius, spacing } from "@/lib/ui/theme";
import { getPwaPlatform, isStandalonePwa, isWebRuntime } from "@/lib/pwa/runtime";

type Props = {
  dismissed: boolean;
  onDismiss: () => void;
};

export function PwaInstallNotice({ dismissed, onDismiss }: Props) {
  const colors = getColors();
  const platform = useMemo(() => getPwaPlatform(), []);
  const shouldShow = isWebRuntime() && !dismissed && !isStandalonePwa();
  if (!shouldShow) return null;

  const hint =
    platform === "android"
      ? "Android Chrome: open browser menu and tap Install app / Add to Home screen."
      : platform === "ios"
        ? "iOS Safari: tap Share, then Add to Home Screen."
        : "Use your browser install option to launch as an app.";

  return (
    <View style={[styles.wrap, { borderColor: colors.borderLight, backgroundColor: colors.backgroundSecondary }]}>
      <View style={{ flex: 1 }}>
        <AppText variant="captionBold">Install The Golf Society Hub for the best app experience.</AppText>
        <AppText variant="caption" color="secondary" style={{ marginTop: 4 }}>
          {hint}
        </AppText>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss install notice"
        onPress={onDismiss}
        style={({ pressed }) => [{ paddingHorizontal: spacing.sm, opacity: pressed ? 0.72 : 1 }]}
      >
        <AppText variant="captionBold" color="secondary">
          Dismiss
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: spacing.sm,
    right: spacing.sm,
    bottom: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    zIndex: 9999,
  },
});
