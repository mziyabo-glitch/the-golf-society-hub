/**
 * Compact status label — shared pill for chips (Waiting, Live, Paid, etc.).
 */

import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { AppText, type TextColorRole } from "./AppText";
import { getColors, radius, spacing } from "@/lib/ui/theme";

export type StatusBadgeTone = "neutral" | "primary" | "success" | "warning" | "danger" | "info";

type StatusBadgeProps = {
  label: string;
  tone?: StatusBadgeTone;
  style?: StyleProp<ViewStyle>;
};

const TONE_TO_TEXT: Record<StatusBadgeTone, TextColorRole> = {
  neutral: "secondary",
  primary: "primary",
  success: "success",
  warning: "warning",
  danger: "danger",
  info: "info",
};

export function StatusBadge({ label, tone = "neutral", style }: StatusBadgeProps) {
  const colors = getColors();
  const bg =
    tone === "neutral"
      ? colors.backgroundTertiary
      : tone === "primary"
        ? colors.primary + "14"
        : tone === "success"
          ? colors.success + "14"
          : tone === "warning"
            ? colors.warning + "14"
            : tone === "danger"
              ? colors.error + "14"
              : colors.info + "14";

  return (
    <View style={[styles.wrap, { backgroundColor: bg }, style]}>
      <AppText variant="captionBold" color={TONE_TO_TEXT[tone]}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
});
