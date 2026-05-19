import { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/AppText";
import { getColors, radius, spacing } from "@/lib/ui/theme";
import { getPwaPlatform, isStandalonePwa, isWebRuntime } from "@/lib/pwa/runtime";

type Props = {
  dismissed: boolean;
  onDismiss: () => void;
};

function getInstallHint(platform: ReturnType<typeof getPwaPlatform>): string {
  if (platform === "android") {
    return "Chrome menu → Install app or Add to Home screen. That opens without the address bar.";
  }
  if (platform === "ios") {
    return "Safari Share → Add to Home Screen. That opens without the Safari URL bar.";
  }
  return "Use your browser’s install or “Add to Home screen” option to open without the address bar.";
}

export function PwaInstallNotice({ dismissed, onDismiss }: Props) {
  const colors = getColors();
  const platform = useMemo(() => getPwaPlatform(), []);
  const shouldShow = isWebRuntime() && !dismissed && !isStandalonePwa();
  if (!shouldShow) return null;

  return (
    <View style={[styles.wrap, { borderColor: colors.borderLight, backgroundColor: colors.backgroundSecondary }]}>
      <View style={{ flex: 1 }}>
        <AppText variant="captionBold">You’re in a browser tab — not the Play Store app</AppText>
        <AppText variant="caption" color="secondary" style={styles.line}>
          The URL bar at the top is normal here. It does not mean the Android app is broken.
        </AppText>
        <AppText variant="caption" color="secondary" style={styles.line}>
          For Google Play: install the native build (internal testing or production), package
          com.godskid.golfsocietyhub, built with eas build --platform android --profile play.
        </AppText>
        <AppText variant="caption" color="secondary" style={styles.line}>
          For web only: {getInstallHint(platform)}
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
    alignItems: "flex-start",
    gap: spacing.sm,
    zIndex: 9999,
    maxWidth: 560,
    alignSelf: "center",
  },
  line: {
    marginTop: 4,
  },
});
