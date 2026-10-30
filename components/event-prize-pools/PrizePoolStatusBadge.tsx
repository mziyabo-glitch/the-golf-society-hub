import { View, StyleSheet } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { getColors, radius, spacing } from "@/lib/ui/theme";
import type { PrizePoolStatus } from "@/lib/event-prize-pools-types";

const LABEL: Record<PrizePoolStatus, string> = {
  draft: "Draft",
  calculated: "Calculated",
  finalised: "Finalised",
};

export function PrizePoolStatusBadge({ status }: { status: PrizePoolStatus }) {
  const colors = getColors();
  const bg =
    status === "finalised"
      ? colors.success + "22"
      : status === "calculated"
        ? colors.primary + "18"
        : colors.backgroundSecondary;
  const fg =
    status === "finalised" ? colors.success : status === "calculated" ? colors.primary : colors.textSecondary;

  return (
    <View style={[styles.wrap, { backgroundColor: bg, borderColor: colors.borderLight }]}>
      <AppText variant="captionBold" style={{ color: fg }}>
        {LABEL[status]}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
});
