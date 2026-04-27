import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/AppText";
import { getColors, radius, spacing } from "@/lib/ui/theme";
import { freePlayPremium } from "@/lib/ui/freePlayPremiumTheme";

export type FreePlayHandicapReviewRow = {
  id: string;
  name: string;
  hi: number;
  ch: number | null;
  ph: number | null;
  source: "calculated" | "manual";
};

type FreePlayHandicapReviewCardProps = {
  rows: FreePlayHandicapReviewRow[];
};

export function FreePlayHandicapReviewCard({ rows }: FreePlayHandicapReviewCardProps) {
  const colors = getColors();
  if (rows.length === 0) return null;

  return (
    <View style={[styles.card, { borderColor: colors.borderLight, backgroundColor: freePlayPremium.creamSurface }, freePlayPremium.cardShadow]}>
      <AppText variant="captionBold" style={{ color: freePlayPremium.accentDeepGreen, letterSpacing: 0.6 }}>
        PLAYING HANDICAPS
      </AppText>
      <AppText variant="h2" style={{ marginTop: spacing.xs }}>
        Review before tee off
      </AppText>
      <AppText variant="small" color="secondary" style={{ marginTop: spacing.sm }}>
        You can adjust handicaps for guests or casual rounds before scoring starts.
      </AppText>

      <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
        {rows.map((r) => (
          <View key={r.id} style={[styles.row, { borderColor: colors.borderLight }]}>
            <View style={{ flex: 1 }}>
              <AppText variant="bodyBold" numberOfLines={1}>
                {r.name}
              </AppText>
              <AppText variant="small" color="secondary" style={{ marginTop: 4 }}>
                HI {r.hi.toFixed(1)}
                {r.ch != null ? ` · CH ${r.ch}` : ""}
                {r.ph != null ? ` · PH ${r.ph}` : ""}
              </AppText>
            </View>
            <View style={[styles.sourcePill, { borderColor: r.source === "manual" ? colors.warning + "55" : colors.success + "55" }]}>
              <AppText variant="captionBold" color={r.source === "manual" ? "warning" : "success"}>
                {r.source === "manual" ? "Manual" : "Calculated"}
              </AppText>
            </View>
          </View>
        ))}
      </View>

      <AppText variant="caption" color="tertiary" style={{ marginTop: spacing.md }}>
        HI = Handicap Index · CH = Course Handicap · PH = Playing Handicap
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: freePlayPremium.heroRadius,
    padding: spacing.base,
    marginTop: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  sourcePill: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
});
