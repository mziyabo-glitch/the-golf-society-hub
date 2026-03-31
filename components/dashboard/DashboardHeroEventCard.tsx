/**
 * Hero-first next-event surface: headline, compact meta, live status, primary CTA.
 */

import { View, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppText } from "@/components/ui/AppText";
import { Chip } from "@/components/ui/Chip";
import { PrimaryButton } from "@/components/ui/Button";
import type { EventDoc } from "@/lib/db_supabase/eventRepo";
import type { EventRegistration } from "@/lib/db_supabase/eventRegistrationRepo";
import { getColors, spacing, radius, typography } from "@/lib/ui/theme";
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

function buildStatusLine(
  nextEvent: EventDoc,
  nextEventIsJoint: boolean,
  myReg: EventRegistration | null,
  myTeeTimeInfo: HeroTeeInfo,
  canAccessNextEventTeeSheet: boolean,
  colors: ReturnType<typeof getColors>,
): { text: string; tone: "success" | "warning" | "muted" | "default" } {
  if (nextEventIsJoint) {
    if (myReg?.status === "in") {
      return { text: "Registered for joint event", tone: "success" };
    }
    if (myReg?.status === "out") {
      return { text: "Marked as not playing", tone: "muted" };
    }
    return { text: "RSVP with your home society", tone: "default" };
  }
  if (myReg?.status === "in") {
    const paid = myReg.paid === true;
    if (nextEvent.teeTimePublishedAt && canAccessNextEventTeeSheet && myTeeTimeInfo) {
      const teeBit = `Tee ${myTeeTimeInfo.teeTime} · Group ${myTeeTimeInfo.groupNumber}`;
      return {
        text: paid ? `${teeBit} · Paid` : `${teeBit} · Payment due`,
        tone: paid ? "success" : "warning",
      };
    }
    return {
      text: paid ? "Confirmed · Paid" : "Confirmed · Payment due",
      tone: paid ? "success" : "warning",
    };
  }
  if (myReg?.status === "out") {
    return { text: "Not playing", tone: "muted" };
  }
  return { text: "Not registered yet", tone: "default" };
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
  const borderCol = `${colors.primary}33`;
  const bgCol = `${colors.primary}0F`;

  if (!nextEvent) {
    return (
      <View style={[dashboardShell.card, { borderColor: colors.borderLight, backgroundColor: colors.surface }]}>
        <View style={dashboardShell.sectionEyebrow}>
      <Feather name="calendar" size={16} color={colors.textTertiary} />
          <AppText variant="captionBold" color="tertiary">
            Next event
          </AppText>
        </View>
        <AppText variant="h2" style={styles.heroTitle}>
          Nothing scheduled
        </AppText>
        <AppText variant="small" color="secondary" style={styles.heroMeta}>
          Check back soon for the next society day.
        </AppText>
      </View>
    );
  }

  const status = buildStatusLine(
    nextEvent,
    nextEventIsJoint,
    myReg,
    myTeeTimeInfo,
    canAccessNextEventTeeSheet,
    colors,
  );
  const statusColor =
    status.tone === "success"
      ? colors.success
      : status.tone === "warning"
        ? colors.warning
        : status.tone === "muted"
          ? colors.textTertiary
          : colors.textSecondary;

  const showTeeCta =
    Boolean(nextEvent.teeTimePublishedAt && canAccessNextEventTeeSheet);
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
        <AppText variant="title" style={[styles.heroTitle, { color: colors.text }]}>
          {String(nextEvent.name ?? "Event")}
        </AppText>
        <AppText variant="small" color="secondary" style={styles.heroMeta}>
          {formatEventDate(nextEvent.date)}
          {nextEvent.courseName ? ` · ${String(nextEvent.courseName)}` : ""}
        </AppText>
      </Pressable>

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

      <View style={[styles.statusPill, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <AppText variant="small" style={[styles.statusText, { color: statusColor }]}>
          {status.text}
        </AppText>
      </View>

      <PrimaryButton onPress={primaryAction} size="md" style={styles.cta}>
        {primaryLabel}
      </PrimaryButton>

      {!showTeeCta && nextEvent.teeTimePublishedAt && !canAccessNextEventTeeSheet ? (
        <AppText variant="small" color="tertiary" style={styles.hint}>
          Tee sheet is available to participating societies.
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  heroTitle: {
    letterSpacing: -0.3,
  },
  heroMeta: {
    marginTop: 4,
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
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    flex: 1,
    fontWeight: "600",
    fontSize: typography.small.fontSize,
  },
  cta: {
    marginTop: spacing.md,
  },
  hint: {
    marginTop: spacing.sm,
    textAlign: "center",
  },
});
