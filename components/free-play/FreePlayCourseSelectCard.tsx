import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText, type TextColorRole } from "@/components/ui/AppText";
import { AppInput } from "@/components/ui/AppInput";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { getColors, radius, spacing } from "@/lib/ui/theme";
import { freePlayPremium } from "@/lib/ui/freePlayPremiumTheme";
import type { CourseSearchHit } from "@/lib/db_supabase/courseRepo";
import {
  deriveFreePlayTrustLabel,
  getFreePlayTrustCopy,
  type FreePlayTrustLabel,
} from "@/lib/course/freePlayTrustPresentation";

import {
  deriveFreePlayDataTrustBadge,
  freePlayDataTrustBadgeLabel,
  type FreePlayDataTrustBadge,
} from "@/components/free-play/freePlaySetupTrust";

type FreePlayCourseSelectCardProps = {
  courseQuery: string;
  onCourseQueryChange: (q: string) => void;
  courseHits: CourseSearchHit[];
  /** Catalog name matches not shown (incomplete scorecard data or duplicate display name). */
  courseSearchHiddenIncompleteCount: number | null;
  selectedCourse: CourseSearchHit | null;
  onSelectCourse: (c: CourseSearchHit) => void;
  /** Holes count for selected tee context (or best available). */
  holesAvailable: number | null;
  teeCount: number;
  /** When course selected and trust resolved — drives “data trust” badge. */
  selectedTrustLabel: FreePlayTrustLabel | null;
  strokeIndexIncomplete: boolean;
  holesUnavailable: boolean;
  /** Trust / contribution panel rendered below the course summary. */
  trustPanel?: ReactNode;
};

function badgeColors(colors: ReturnType<typeof getColors>, badge: FreePlayDataTrustBadge) {
  switch (badge) {
    case "verified":
      return { border: colors.success + "66", text: "success" as TextColorRole };
    case "partial":
      return { border: colors.primary + "66", text: "primary" as TextColorRole };
    case "missing_si":
      return { border: colors.warning + "66", text: "warning" as TextColorRole };
    default:
      return { border: colors.borderLight, text: "secondary" as TextColorRole };
  }
}

export function FreePlayCourseSelectCard({
  courseQuery,
  onCourseQueryChange,
  courseHits,
  courseSearchHiddenIncompleteCount,
  selectedCourse,
  onSelectCourse,
  holesAvailable,
  teeCount,
  selectedTrustLabel,
  strokeIndexIncomplete,
  holesUnavailable,
  trustPanel,
}: FreePlayCourseSelectCardProps) {
  const colors = getColors();
  const dataBadge =
    selectedCourse && selectedTrustLabel
      ? deriveFreePlayDataTrustBadge({
          trustLabel: selectedTrustLabel,
          strokeIndexIncomplete,
          holesUnavailable,
        })
      : null;
  const bc = dataBadge ? badgeColors(colors, dataBadge) : null;

  const helperVerified = "Verified course data. Ready for scoring and Stableford calculations.";
  const helperRisk =
    "Some course data may be incomplete. You can still play, but scoring checks may be limited.";

  const helperCopy =
    dataBadge === "verified" && !strokeIndexIncomplete && !holesUnavailable ? helperVerified : helperRisk;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderLight }, freePlayPremium.cardShadow]}>
      <View style={styles.sectionHead}>
        <AppText variant="captionBold" style={{ color: freePlayPremium.accentDeepGreen, letterSpacing: 0.8 }}>
          COURSE
        </AppText>
        <AppText variant="h2" style={{ marginTop: spacing.xs }}>
          Where are you playing?
        </AppText>
      </View>

      <AppInput
        value={courseQuery}
        onChangeText={onCourseQueryChange}
        placeholder="Search by course or club"
        style={{ marginTop: spacing.md }}
      />

      {!selectedCourse &&
      courseSearchHiddenIncompleteCount != null &&
      courseSearchHiddenIncompleteCount > 0 &&
      courseHits.length > 0 ? (
        <InlineNotice
          variant="info"
          message={`${courseSearchHiddenIncompleteCount} catalog match${courseSearchHiddenIncompleteCount === 1 ? "" : "es"} hidden — not scorecard-ready yet or needs duplicate-name review.`}
          style={{ marginTop: spacing.sm }}
        />
      ) : null}
      {!selectedCourse && courseQuery.trim().length >= 2 && courseHits.length === 0 ? (
        <InlineNotice
          variant="info"
          message={
            courseSearchHiddenIncompleteCount != null && courseSearchHiddenIncompleteCount > 0
              ? `This course is not scorecard-ready yet. We're still importing tee, rating and stroke index data. ${courseSearchHiddenIncompleteCount} catalog row${courseSearchHiddenIncompleteCount === 1 ? "" : "s"} matched your search but are hidden until data is complete.`
              : "This course is not scorecard-ready yet. We're still importing tee, rating and stroke index data."
          }
          style={{ marginTop: spacing.sm }}
        />
      ) : null}

      {courseHits.slice(0, 6).map((c) => {
        const label = deriveFreePlayTrustLabel({
          globalStatus: c.golfer_data_status ?? null,
          societyApproved: Boolean(c.societyApprovedForSociety),
          pendingSubmission: Boolean(c.pendingCourseDataReview),
        });
        const copy = getFreePlayTrustCopy(label);
        const border =
          label === "verified"
            ? colors.success + "66"
            : label === "society_approved"
              ? colors.primary + "66"
              : label === "pending_review"
                ? colors.warning + "66"
                : colors.borderLight;
        const textColor: TextColorRole =
          label === "verified"
            ? "success"
            : label === "society_approved"
              ? "primary"
              : label === "pending_review"
                ? "warning"
                : "secondary";
        return (
          <Pressable
            key={c.id}
            onPress={() => onSelectCourse(c)}
            style={({ pressed }) => [styles.hitRow, { opacity: pressed ? 0.88 : 1, borderColor: colors.borderLight }]}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs, flexWrap: "wrap" }}>
              <AppText variant="bodyBold">{c.name}</AppText>
              <View style={[styles.miniBadge, { borderColor: border }]}>
                <AppText variant="captionBold" color={textColor}>
                  {copy.badge}
                </AppText>
              </View>
            </View>
            <AppText variant="caption" color="tertiary" style={{ marginTop: 4 }} numberOfLines={3}>
              {copy.detail}
            </AppText>
            {!!c.location ? (
              <AppText variant="small" color="secondary" style={{ marginTop: 2 }}>
                {c.location}
              </AppText>
            ) : null}
          </Pressable>
        );
      })}

      {selectedCourse ? (
        <View style={[styles.selectedShell, { borderColor: freePlayPremium.accentDeepGreen + "44", backgroundColor: freePlayPremium.creamSurface }]}>
          <View style={styles.selectedTop}>
            <View style={{ flex: 1 }}>
              <AppText variant="h2" numberOfLines={2}>
                {selectedCourse.name}
              </AppText>
              {!!selectedCourse.location ? (
                <AppText variant="small" color="secondary" style={{ marginTop: spacing.xs }}>
                  {selectedCourse.location}
                </AppText>
              ) : null}
            </View>
            {dataBadge && bc ? (
              <View style={[styles.trustPill, { borderColor: bc.border }]}>
                <AppText variant="captionBold" color={bc.text}>
                  {freePlayDataTrustBadgeLabel(dataBadge)}
                </AppText>
              </View>
            ) : null}
          </View>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <AppText variant="caption" color="tertiary">
                Holes
              </AppText>
              <AppText variant="bodyBold">{holesAvailable != null && holesAvailable > 0 ? String(holesAvailable) : "—"}</AppText>
            </View>
            <View style={styles.stat}>
              <AppText variant="caption" color="tertiary">
                Tees
              </AppText>
              <AppText variant="bodyBold">{teeCount}</AppText>
            </View>
          </View>
          <AppText variant="small" color="secondary" style={{ marginTop: spacing.sm }}>
            {helperCopy}
          </AppText>
          {trustPanel}
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
  sectionHead: {
    marginBottom: spacing.xs,
  },
  hitRow: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  miniBadge: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  selectedShell: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.base,
  },
  selectedTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  trustPill: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  statsRow: {
    flexDirection: "row",
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  stat: {
    minWidth: 72,
  },
});
