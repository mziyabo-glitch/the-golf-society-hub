import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { getColors, spacing } from "@/lib/ui/theme";

type ManageEventSectionProps = {
  title: string;
  description?: string;
  children: ReactNode;
  /** When false, omits the top divider (use for the first section on the screen). */
  showDivider?: boolean;
};

/**
 * Presentational wrapper for the Manage Event screen — section chrome only (no data logic).
 */
export function ManageEventSection({
  title,
  description,
  children,
  showDivider = true,
}: ManageEventSectionProps) {
  const colors = getColors();
  return (
    <View style={styles.wrap}>
      {showDivider ? (
        <View style={[styles.rule, { backgroundColor: colors.borderLight }]} />
      ) : null}
      <AppText variant="subheading" color="primary" style={styles.title}>
        {title}
      </AppText>
      {description ? (
        <AppText variant="small" color="muted" style={styles.description}>
          {description}
        </AppText>
      ) : null}
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.lg,
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    marginBottom: spacing.md,
  },
  title: {
    marginBottom: spacing.xs,
    letterSpacing: 0.2,
  },
  description: {
    marginBottom: spacing.md,
    maxWidth: "100%",
  },
  body: {
    gap: 0,
  },
});
