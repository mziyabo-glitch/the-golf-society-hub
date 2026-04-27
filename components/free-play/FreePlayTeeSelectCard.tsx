import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/AppText";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { getColors, radius, spacing } from "@/lib/ui/theme";
import { freePlayPremium } from "@/lib/ui/freePlayPremiumTheme";
import type { CourseHoleRow, CourseTee } from "@/lib/db_supabase/courseRepo";

type FreePlayTeeSelectCardProps = {
  tees: CourseTee[];
  selectedTeeId: string | null;
  onSelectTee: (teeId: string) => void;
  selectedTee: CourseTee | null;
  holes: CourseHoleRow[];
};

function holesWithRealStrokeIndex(holes: CourseHoleRow[]): number {
  return holes.filter((h) => Number.isFinite(Number(h.stroke_index)) && Number(h.stroke_index) > 0).length;
}

export function FreePlayTeeSelectCard({ tees, selectedTeeId, onSelectTee, selectedTee, holes }: FreePlayTeeSelectCardProps) {
  const colors = getColors();
  const siLoaded = holesWithRealStrokeIndex(holes);
  const siIncomplete = holes.length > 0 && siLoaded < holes.length;
  const siMissing = holes.length === 0 || siIncomplete;

  const yardsLabel =
    selectedTee && Number.isFinite(Number(selectedTee.yards)) && Number(selectedTee.yards) > 0
      ? `${Math.round(Number(selectedTee.yards))} yds`
      : selectedTee && Number.isFinite(Number(selectedTee.total_meters)) && Number(selectedTee.total_meters) > 0
        ? `${Math.round(Number(selectedTee.total_meters))} m`
        : "—";

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderLight }, freePlayPremium.cardShadow]}>
      <AppText variant="captionBold" style={{ color: freePlayPremium.accentDeepGreen, letterSpacing: 0.8 }}>
        TEE
      </AppText>
      <AppText variant="h2" style={{ marginTop: spacing.xs }}>
        Pick your tee
      </AppText>

      {tees.length > 0 ? (
        <View style={styles.chipWrap}>
          {tees.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => onSelectTee(t.id)}
              style={[
                styles.chip,
                {
                  borderColor: t.id === selectedTeeId ? colors.primary : colors.borderLight,
                  backgroundColor: t.id === selectedTeeId ? `${colors.primary}16` : colors.surface,
                },
              ]}
            >
              <AppText variant="captionBold" color={t.id === selectedTeeId ? "primary" : "secondary"}>
                {t.tee_name}
              </AppText>
            </Pressable>
          ))}
        </View>
      ) : (
        <InlineNotice
          variant="info"
          message="No tee data found for this course yet. You can still create the round with a general tee."
          style={{ marginTop: spacing.md }}
        />
      )}

      {selectedTee ? (
        <View style={[styles.detailCard, { borderColor: freePlayPremium.accentNavy + "33", backgroundColor: freePlayPremium.creamSurface }]}>
          <View style={styles.detailHeader}>
            <AppText variant="h2" numberOfLines={2}>
              {selectedTee.tee_name}
            </AppText>
            {selectedTee.tee_color ? (
              <View style={[styles.colorDot, { borderColor: colors.borderLight }]}>
                <AppText variant="captionBold" color="secondary">
                  {selectedTee.tee_color}
                </AppText>
              </View>
            ) : null}
          </View>

          <View style={styles.grid}>
            <View style={styles.cell}>
              <AppText variant="caption" color="tertiary">
                Par
              </AppText>
              <AppText variant="bodyBold">
                {Number.isFinite(Number(selectedTee.par_total)) && Number(selectedTee.par_total) > 0
                  ? String(Math.round(Number(selectedTee.par_total)))
                  : "—"}
              </AppText>
            </View>
            <View style={styles.cell}>
              <AppText variant="caption" color="tertiary">
                Yardage
              </AppText>
              <AppText variant="bodyBold">{yardsLabel}</AppText>
            </View>
            <View style={styles.cell}>
              <AppText variant="caption" color="tertiary">
                Course rating
              </AppText>
              <AppText variant="bodyBold">
                {Number.isFinite(Number(selectedTee.course_rating)) && Number(selectedTee.course_rating) > 0
                  ? Number(selectedTee.course_rating).toFixed(1)
                  : "—"}
              </AppText>
            </View>
            <View style={styles.cell}>
              <AppText variant="caption" color="tertiary">
                Slope
              </AppText>
              <AppText variant="bodyBold">
                {Number.isFinite(Number(selectedTee.slope_rating)) && Number(selectedTee.slope_rating) > 0
                  ? String(Math.round(Number(selectedTee.slope_rating)))
                  : "—"}
              </AppText>
            </View>
          </View>

          <View style={[styles.metaLine, { borderTopColor: colors.borderLight }]}>
            <AppText variant="small" color="secondary">
              Holes loaded: {holes.length}
            </AppText>
            <AppText variant="small" color={siMissing ? "warning" : "secondary"}>
              SI: {siIncomplete ? `Incomplete (${siLoaded}/${holes.length})` : holes.length ? "Complete" : "Unavailable"}
            </AppText>
          </View>

          {siMissing ? (
            <InlineNotice
              variant="info"
              message="Stroke indexes missing for this tee. Stableford points may be unavailable or inaccurate until SI data is added."
              style={{ marginTop: spacing.sm }}
            />
          ) : null}
        </View>
      ) : null}
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
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  chip: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  detailCard: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.base,
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  colorDot: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  cell: {
    width: "44%",
    minWidth: 120,
  },
  metaLine: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
});
