/**
 * Badge Component
 * Variants: role, paid, rsvp, status
 */

import { StyleSheet, View } from "react-native";
import { AppText } from "./AppText";
import { getColors, radius, spacing } from "@/lib/ui/theme";

type BadgeVariant = "role" | "paid" | "unpaid" | "rsvp" | "status" | "default";

type BadgeProps = {
  label: string;
  variant?: BadgeVariant;
  style?: any;
};

export function Badge({ label, variant = "default", style }: BadgeProps) {
  const colors = getColors();

  const getVariantStyles = () => {
    switch (variant) {
      case "role":
        return {
          backgroundColor: colors.primary + "15",
          borderColor: colors.primary,
          textColor: colors.primary,
        };
      case "paid":
        return {
          backgroundColor: colors.success + "15",
          borderColor: colors.success,
          textColor: colors.success,
        };
      case "unpaid":
        return {
          backgroundColor: colors.error + "15",
          borderColor: colors.error,
          textColor: colors.error,
        };
      case "rsvp":
        return {
          backgroundColor: colors.info + "15",
          borderColor: colors.info,
          textColor: colors.info,
        };
      case "status":
        return {
          backgroundColor: colors.warning + "15",
          borderColor: colors.warning,
          textColor: colors.warning,
        };
      default:
        return {
          backgroundColor: colors.backgroundSecondary,
          borderColor: colors.border,
          textColor: colors.textSecondary,
        };
    }
  };

  const variantStyles = getVariantStyles();

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: variantStyles.backgroundColor,
          borderColor: variantStyles.borderColor,
        },
        style,
      ]}
    >
      <AppText variant="small" style={{ color: variantStyles.textColor }}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
});














