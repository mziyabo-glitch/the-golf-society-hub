/**
 * StatCard Component
 *
 * A polished stat card for displaying key metrics.
 * Supports emphasis mode for highlighting important values.
 */

import { StyleSheet, View, Pressable } from "react-native";
import { AppText } from "./AppText";
import { getColors, spacing, radius } from "@/lib/ui/theme";

type StatCardProps = {
  label: string;
  value: string;
  /** Optional hint text below the value */
  hint?: string;
  /** Visual emphasis - makes the card stand out */
  emphasis?: boolean;
  /** Color variant for the value */
  variant?: "default" | "success" | "error" | "muted";
  /** Optional icon to show before label */
  icon?: React.ReactNode;
  /** Make card tappable */
  onPress?: () => void;
};

export function StatCard({
  label,
  value,
  hint,
  emphasis = false,
  variant = "default",
  icon,
  onPress,
}: StatCardProps) {
  const colors = getColors();

  const getValueColor = () => {
    switch (variant) {
      case "success":
        return colors.success;
      case "error":
        return colors.error;
      case "muted":
        return colors.textTertiary;
      default:
        return emphasis ? colors.primary : colors.text;
    }
  };

  const content = (
    <View
      style={[
        styles.card,
        {
          backgroundColor: emphasis ? colors.primary + "10" : colors.surface,
          borderColor: emphasis ? colors.primary : colors.border,
          borderWidth: emphasis ? 2 : 1,
        },
      ]}
    >
      <View style={styles.labelRow}>
        {icon && <View style={styles.icon}>{icon}</View>}
        <AppText variant="caption" color="secondary" style={styles.label}>
          {label}
        </AppText>
      </View>
      <AppText
        variant={emphasis ? "title" : "h1"}
        style={[styles.value, { color: getValueColor() }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </AppText>
      {hint && (
        <AppText variant="small" color="tertiary" style={styles.hint}>
          {hint}
        </AppText>
      )}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        style={({ pressed }) => [styles.wrapper, { opacity: pressed ? 0.8 : 1 }]}
        onPress={onPress}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={styles.wrapper}>{content}</View>;
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    minWidth: "45%",
  },
  card: {
    borderRadius: radius.lg,
    padding: spacing.base,
    minHeight: 90,
    justifyContent: "center",
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  icon: {
    marginRight: spacing.xs,
  },
  label: {
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontSize: 11,
  },
  value: {
    fontVariant: ["tabular-nums"],
  },
  hint: {
    marginTop: 2,
  },
});
