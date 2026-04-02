/**
 * Hero next-event: headline, meta, entry fee, playing + payment status, CTA.
 */

import { View, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppText } from "@/components/ui/AppText";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Chip } from "@/components/ui/Chip";
import { PrimaryButton } from "@/components/ui/Button";
import type { EventDoc } from "@/lib/db_supabase/eventRepo";
import type { EventRegistration } from "@/lib/db_supabase/eventRegistrationRepo";
import { getColors, spacing, radius } from "@/lib/ui/theme";
import { JOINT_EVENT_CHIP_SHORT } from "@/lib/eventModuleUi";
import { dashboardShell } from "./dashboardCardStyles";

export type HeroTeeInfo = {
  teeTime: string;
  groupNumber: number;
} | null;

type Props = {
  nextEvent: EventDoc | null;
  nextEventIsJoint: boolean;
  myReg: EventRegistration | null;
  myTeeTimeInfo: HeroTeeInfo;
  canAccessNextEventTeeSheet: boolean;
  formatEventDate: (dateStr?: string) => string;
  formatFormatLabel: (format?: string) => string;
  formatClassification: (classification?: string) => string;
  onOpenEvent: () => void;
  onOpenTeeSheet: () => void;
};

type PlayingTone = "success" | "warning" | "muted" | "default";

function playingBlock(
  nextEventIsJoint: boolean,
  myReg: EventRegistration | null,
  canAccessNextEventTeeSheet: boolean,
  myTeeTimeInfo: HeroTeeInfo,
  nextEvent: EventDoc,
): { label: string; tone: PlayingTone; teeHint?: string } {
  if (nextEventIsJoint) {
    if (myReg?.status === "in") {
      const hint =
        nextEvent.teeTimePublishedAt && canAccessNextEventTeeSheet && myTeeTimeInfo
          ? `Tee ${myTeeTimeInfo.teeTime} · G${myTeeTimeInfo.groupNumber}`
          : undefined;
      return { label: "Playing", tone: "success", teeHint: hint };
    }
    if (myReg?.status === "out") return { label: "Not playing", tone: "muted" };
    return { label: "RSVP via home society", tone: "default" };
  }
  if (myReg?.status === "in") {
    const hint =
      nextEvent.teeTimePublishedAt && canAccessNextEventTeeSheet && myTeeTimeInfo
        ? `Tee ${myTeeTimeInfo.teeTime} · G${myTeeTimeInfo.groupNumber}`
        : undefined;
    return { label: "Playing", tone: "success", teeHint: hint };
  }
  if (myReg?.status === "out") return { label: "Not playing", tone: "muted" };
  return { label: "Not registered", tone: "default" };
}

export function DashboardHeroEventCard({
  nextEvent,
  nextEventIsJoint,
  myReg,
  myTeeTimeInfo,
  canAccessNextEventTeeSheet,
  formatEventDate,
  formatFormatLabel,
  formatClassification,
  onOpenEvent,
  onOpenTeeSheet,
}: Props) {
  const colors = getColors();
  const borderCol = `${colors.primary}28`;
  const bgCol = `${colors.primary}0A`;

  if (!nextEvent) {
    return (
      <View style={[dashboardShell.card, { borderColor: colors.borderLight, backgroundColor: colors.surface }]}>
        <View style={dashboardShell.sectionEyebrow}>
          <Feather name="calendar" size={16} color={colors.textTertiary} />
          <AppText variant="captionBold" color="muted">
            Next event
          </AppText>
        </View>
        <AppText variant="h2" style={styles.heroTitle}>
          Nothing scheduled
        </AppText>
        <AppText variant="small" color="secondary" style={styles.heroCourse}>
          Check back soon for the next society day.
        </AppText>
      </View>
    );
  }

  const playing = playingBlock(
    nextEventIsJoint,
    myReg,
    canAccessNextEventTeeSheet,
    myTeeTimeInfo,
    nextEvent,
  );

  const showPaymentRow = myReg?.status === "in";
  const isPaid = myReg?.paid === true;

  const playingPillBg =
    playing.tone === "success"
      ? `${colors.success}14`
      : playing.tone === "muted"
        ? colors.backgroundTertiary
        : `${colors.primary}0C`;
  const playingPillBorder =
    playing.tone === "success"
      ? `${colors.success}40`
      : playing.tone === "muted"
        ? colors.borderLight
        : `${colors.primary}25`;
  const playingPillText =
    playing.tone === "success"
      ? colors.success
      : playing.tone === "muted"
        ? colors.textTertiary
        : colors.textSecondary;

  const fee = nextEvent.entryFeeDisplay?.trim();

  const showTeeCta = Boolean(nextEvent.teeTimePublishedAt && canAccessNextEventTeeSheet);
  const primaryLabel = showTeeCta ? "View tee sheet" : "View event";
  const primaryAction = showTeeCta ? onOpenTeeSheet : onOpenEvent;

  return (
    <View style={[dashboardShell.card, { borderColor: borderCol, backgroundColor: bgCol }]}>
      <View style={dashboardShell.sectionEyebrow}>
        <Feather name="flag" size={16} color={colors.primary} />
        <AppText variant="captionBold" color="primary">
          Next event
        </AppText>
      </View>

      <Pressable onPress={onOpenEvent} accessibilityRole="button" accessibilityLabel="Open event details">
        <AppText variant="title" style={[styles.heroTitle, { color: colors.text }]} numberOfLines={3}>
          {String(nextEvent.name ?? "Event")}
        </AppText>
        <AppText variant="small" color="secondary" style={styles.heroDate}>
          {formatEventDate(nextEvent.date)}
        </AppText>
        {nextEvent.courseName ? (
          <AppText variant="small" color="muted" style={styles.heroCourse} numberOfLines={2}>
            {String(nextEvent.courseName)}
          </AppText>
        ) : null}
      </Pressable>

      <View style={styles.compactStatusRow}>
        {fee ? (
          <View style={[styles.entryChip, { backgroundColor: colors.surface, borderColor: `${colors.primary}30` }]}>
            <Feather name="credit-card" size={12} color={colors.primary} />
            <AppText variant="captionBold" style={{ color: colors.text }} numberOfLines={1}>
              Entry {fee}
            </AppText>
          </View>
        ) : null}

        <View
          style={[
            styles.playingPill,
            { backgroundColor: playingPillBg, borderColor: playingPillBorder },
          ]}
        >
          <View style={[styles.playingDot, { backgroundColor: playingPillText }]} />
          <AppText variant="captionBold" style={{ color: playingPillText }} numberOfLines={1}>
            {playing.label}
          </AppText>
        </View>
      </View>

      {playing.teeHint ? (
        <AppText variant="caption" color="secondary" style={styles.teeHint} numberOfLines={1}>
          {playing.teeHint}
        </AppText>
      ) : null}

      <View style={styles.chipsRow}>
        {nextEvent.format ? <Chip>{formatFormatLabel(nextEvent.format)}</Chip> : null}
        {nextEvent.classification ? <Chip>{formatClassification(nextEvent.classification)}</Chip> : null}
        {nextEventIsJoint ? (
          <View style={[styles.jointChip, { borderColor: `${colors.info}55`, backgroundColor: `${colors.info}12` }]}>
            <Feather name="link" size={10} color={colors.info} />
            <AppText variant="small" style={{ color: colors.info, fontWeight: "600" }}>
              {JOINT_EVENT_CHIP_SHORT}
            </AppText>
          </View>
        ) : null}
      </View>

      {nextEvent.isOOM ? (
        <View
          style={[
            styles.oomPill,
            { backgroundColor: colors.highlightMuted, borderColor: `${colors.highlight}4D` },
          ]}
        >
          <Feather name="award" size={12} color={colors.highlight} />
          <AppText variant="small" style={[styles.oomPillText, { color: colors.highlight }]}>
            Order of Merit
          </AppText>
        </View>
      ) : null}

      {showPaymentRow ? (
        <View style={styles.paymentWrap}>
          <StatusBadge label={isPaid ? "Paid" : "Not paid"} tone={isPaid ? "success" : "warning"} />
        </View>
      ) : null}

      <PrimaryButton onPress={primaryAction} size="sm" style={styles.cta}>
        {primaryLabel}
      </PrimaryButton>

      {!showTeeCta && nextEvent.teeTimePublishedAt && !canAccessNextEventTeeSheet ? (
        <AppText variant="small" color="muted" style={styles.hint}>
          Tee sheet is available to participating societies.
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  heroTitle: {
    letterSpacing: -0.35,
    fontWeight: "800",
  },
  heroDate: {
    marginTop: spacing.xs,
    fontWeight: "600",
  },
  heroCourse: {
    marginTop: 4,
  },
  compactStatusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm + 2,
  },
  entryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    maxWidth: "100%",
  },
  playingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  playingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  teeHint: {
    marginTop: spacing.xs,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.sm,
    alignItems: "center",
  },
  jointChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  oomPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderWidth: 1,
    marginTop: spacing.sm,
  },
  oomPillText: {
    fontWeight: "600",
    marginLeft: 4,
  },
  paymentWrap: {
    marginTop: spacing.sm + 2,
  },
  cta: {
    marginTop: spacing.md,
  },
  hint: {
    marginTop: spacing.sm,
    textAlign: "center",
  },
});
