import { StyleSheet, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { getColors, spacing, radius, typography } from "@/lib/ui/theme";

type Props = {
  /** e.g. "M4 + ZGS" when exactly two participant clubs */
  pairSubtitle?: string | null;
};

/**
 * Subtle indicator for joint-event rows: same person belongs to both participating societies.
 * Display-only; does not imply payment scope.
 */
export function DualMemberBadge({ pairSubtitle }: Props) {
  const colors = getColors();
  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: colors.backgroundSecondary,
          borderColor: colors.border,
        },
      ]}
      accessibilityRole="text"
      accessibilityLabel={
        pairSubtitle
          ? `Dual member, also in ${pairSubtitle.replace(" + ", " and ")}`
          : "Dual member of both participating societies"
      }
    >
      <AppText variant="caption" style={[styles.primary, { color: colors.textSecondary }]}>
        Dual Member
      </AppText>
      {pairSubtitle ? (
        <AppText
          variant="caption"
          numberOfLines={1}
          style={[styles.sub, { color: colors.textTertiary }]}
        >
          {pairSubtitle}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: "flex-start",
    marginTop: spacing.xs / 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: "100%",
  },
  primary: {
    fontSize: typography.caption.fontSize - 1,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  sub: {
    fontSize: typography.caption.fontSize - 2,
    marginTop: 1,
    fontWeight: "500",
  },
});
