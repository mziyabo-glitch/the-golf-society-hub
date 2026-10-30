import { View, StyleSheet } from "react-native";

import { AppText } from "@/components/ui/AppText";
import { getColors, radius, spacing } from "@/lib/ui/theme";
import { freePlayPremium } from "@/lib/ui/freePlayPremiumTheme";

import type { FreePlayDataTrustBadge } from "@/components/free-play/freePlaySetupTrust";

type FreePlayDataQualityNoticeProps = {
  badge: FreePlayDataTrustBadge;
  /** When true, emphasise Stableford limitations. */
  stablefordSelected: boolean;
};

export function FreePlayDataQualityNotice({ badge, stablefordSelected }: FreePlayDataQualityNoticeProps) {
  const colors = getColors();
  const border =
    badge === "verified"
      ? colors.success + "55"
      : badge === "missing_si"
        ? colors.warning + "66"
        : colors.borderLight;

  const title =
    badge === "verified"
      ? "Verified course data"
      : badge === "missing_si"
        ? "Stroke index data needed"
        : "Course data may be incomplete";

  const body =
    badge === "verified" && !stablefordSelected
      ? "Ready for scoring and Stableford calculations."
      : badge === "verified" && stablefordSelected
        ? "Ready for scoring and Stableford calculations."
        : "Some course data may be incomplete. You can still play, but scoring checks may be limited.";

  const sfExtra =
    stablefordSelected && badge !== "verified"
      ? " Stableford points depend on accurate stroke indexes — double-check before relying on the leaderboard."
      : "";

  return (
    <View style={[styles.wrap, { borderColor: border, backgroundColor: colors.surface }, freePlayPremium.cardShadow]}>
      <AppText variant="captionBold" color="secondary">
        Data quality
      </AppText>
      <AppText variant="bodyBold" style={{ marginTop: spacing.xs }}>
        {title}
      </AppText>
      <AppText variant="small" color="secondary" style={{ marginTop: spacing.xs }}>
        {body}
        {sfExtra}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderRadius: freePlayPremium.cardRadius,
    padding: spacing.base,
    marginTop: spacing.md,
  },
});
