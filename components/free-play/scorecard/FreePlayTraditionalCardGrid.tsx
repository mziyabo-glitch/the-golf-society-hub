import { ScrollView, StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/AppText";
import { AppInput } from "@/components/ui/AppInput";
import { PrimaryButton } from "@/components/ui/Button";
import { getColors, radius, spacing } from "@/lib/ui/theme";
import { freePlayPremium } from "@/lib/ui/freePlayPremiumTheme";
import type { CourseHoleRow } from "@/lib/db_supabase/courseRepo";

type FreePlayTraditionalCardGridProps = {
  holeNumbers: number[];
  holeMetaByNo: Map<number, CourseHoleRow>;
  holeInputs: Record<number, string>;
  onHoleInputChange: (hole: number, value: string) => void;
  metaParTotals: { outPar: number | null; inPar: number | null; totalPar: number | null };
  metaDistanceTotals: { outYards: number | null; inYards: number | null; totalYards: number | null };
  selectedScoreTotals: { out: number; inn: number; total: number };
  formatDistance: (yards: number | null | undefined) => string | null;
  formatScore: (score: number | null | undefined) => string;
  onSaveAll: () => void;
  saving: boolean;
  readOnly?: boolean;
};

export function FreePlayTraditionalCardGrid({
  holeNumbers,
  holeMetaByNo,
  holeInputs,
  onHoleInputChange,
  metaParTotals,
  metaDistanceTotals,
  selectedScoreTotals,
  formatDistance,
  formatScore,
  onSaveAll,
  saving,
  readOnly,
}: FreePlayTraditionalCardGridProps) {
  const colors = getColors();

  return (
    <View
      style={[
        styles.shell,
        { borderColor: freePlayPremium.accentDeepGreen + "33", backgroundColor: freePlayPremium.creamSurface },
        freePlayPremium.cardShadow,
      ]}
    >
      <AppText variant="h2">Scorecard</AppText>
      <AppText variant="small" color="secondary" style={{ marginTop: spacing.xs }}>
        Traditional card view — scroll horizontally for all holes.
      </AppText>

      <View style={[styles.holeSummaryCard, { borderColor: colors.borderLight, marginTop: spacing.md }]}>
        <View style={styles.holeSummaryRow}>
          <AppText variant="captionBold" color="muted">
            Segment
          </AppText>
          <AppText variant="captionBold" color="muted">
            Par
          </AppText>
          <AppText variant="captionBold" color="muted">
            Dist
          </AppText>
          <AppText variant="captionBold" color="muted">
            Score
          </AppText>
        </View>
        <View style={styles.holeSummaryRow}>
          <AppText variant="caption" color="secondary">
            OUT
          </AppText>
          <AppText variant="caption" color="secondary">
            {metaParTotals.outPar ?? "—"}
          </AppText>
          <AppText variant="caption" color="secondary">
            {formatDistance(metaDistanceTotals.outYards) ?? "—"}
          </AppText>
          <AppText variant="caption" color="secondary">
            {formatScore(selectedScoreTotals.out)}
          </AppText>
        </View>
        <View style={styles.holeSummaryRow}>
          <AppText variant="caption" color="secondary">
            IN
          </AppText>
          <AppText variant="caption" color="secondary">
            {metaParTotals.inPar ?? "—"}
          </AppText>
          <AppText variant="caption" color="secondary">
            {formatDistance(metaDistanceTotals.inYards) ?? "—"}
          </AppText>
          <AppText variant="caption" color="secondary">
            {formatScore(selectedScoreTotals.inn)}
          </AppText>
        </View>
        <View style={styles.holeSummaryRow}>
          <AppText variant="captionBold" color="primary">
            TOTAL
          </AppText>
          <AppText variant="captionBold" color="primary">
            {metaParTotals.totalPar ?? "—"}
          </AppText>
          <AppText variant="captionBold" color="primary">
            {formatDistance(metaDistanceTotals.totalYards) ?? "—"}
          </AppText>
          <AppText variant="captionBold" color="primary">
            {formatScore(selectedScoreTotals.total)}
          </AppText>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator style={{ marginTop: spacing.md }} contentContainerStyle={styles.hScroll}>
        {holeNumbers.map((hole) => (
          <View key={hole} style={[styles.holeCell, { borderColor: colors.borderLight }]}>
            <AppText variant="captionBold" color="muted">
              H{hole}
            </AppText>
            <AppText variant="caption" color="secondary" style={{ marginTop: 4 }}>
              Par {holeMetaByNo.get(hole)?.par ?? "—"}
            </AppText>
            <AppText variant="caption" color="secondary">
              SI {holeMetaByNo.get(hole)?.stroke_index ?? "—"}
            </AppText>
            <AppText variant="caption" color="secondary">
              {formatDistance(holeMetaByNo.get(hole)?.yardage) ?? "—"}
            </AppText>
            <AppInput
              value={holeInputs[hole] ?? ""}
              onChangeText={(v) => onHoleInputChange(hole, v)}
              keyboardType="number-pad"
              editable={!readOnly}
              style={{ marginTop: spacing.xs, minWidth: 52 }}
            />
          </View>
        ))}
      </ScrollView>
      {!readOnly ? (
        <PrimaryButton label="Save hole scores" onPress={onSaveAll} loading={saving} style={{ marginTop: spacing.md }} />
      ) : (
        <AppText variant="caption" color="tertiary" style={{ marginTop: spacing.md }}>
          Read-only scorecard view.
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderRadius: freePlayPremium.heroRadius,
    padding: spacing.base,
  },
  holeSummaryCard: {
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: 4,
  },
  holeSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  hScroll: {
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  holeCell: {
    width: 88,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginRight: spacing.sm,
  },
});
