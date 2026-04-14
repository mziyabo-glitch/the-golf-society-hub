/**
 * Hero next-event: concise, high-signal snapshot for Home.
 */

import { View, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppText } from "@/components/ui/AppText";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PrimaryButton } from "@/components/ui/Button";
import type { EventDoc } from "@/lib/db_supabase/eventRepo";
import type { EventRegistration } from "@/lib/db_supabase/eventRegistrationRepo";
import { getColors, spacing, radius } from "@/lib/ui/theme";
import { dashboardShell } from "./dashboardCardStyles";

type Props = {
  nextEvent: EventDoc | null;
  nextEventIsJoint: boolean;
  myReg: EventRegistration | null;
  formatEventDate: (dateStr?: string) => string;
  formatFormatLabel: (format?: string) => string;
  formatClassification: (classification?: string) => string;
  onOpenEvent: () => void;
};

function playingBlock(
  nextEventIsJoint: boolean,
  myReg: EventRegistration | null,
): { label: string; tone: "success" | "neutral" | "primary" } {
  if (nextEventIsJoint) {
    if (myReg?.status === "in") return { label: "Playing", tone: "success" };
    if (myReg?.status === "out") return { label: "Not Playing", tone: "neutral" };
    return { label: "Not Playing", tone: "primary" };
  }
  if (myReg?.status === "in") return { label: "Playing", tone: "success" };
  if (myReg?.status === "out") return { label: "Not Playing", tone: "neutral" };
  return { label: "Not Playing", tone: "primary" };
}

export function DashboardHeroEventCard({
  nextEvent,
  nextEventIsJoint,
  myReg,
  formatEventDate,
  formatFormatLabel,
  formatClassification,
  onOpenEvent,
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
  );

  const formatBadge = [
    nextEvent.format ? formatFormatLabel(nextEvent.format) : "",
    nextEvent.classification ? formatClassification(nextEvent.classification) : "",
  ]
    .filter(Boolean)
    .join(" • ");

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
        <AppText variant="small" color="secondary" style={styles.heroDate} numberOfLines={2}>
          {`${formatEventDate(nextEvent.date)}${nextEvent.courseName ? ` • ${String(nextEvent.courseName)}` : ""}`}
        </AppText>
      </Pressable>

      <View style={styles.badgesRow}>
        <StatusBadge
          label={playing.label}
          tone={playing.tone === "success" ? "success" : playing.tone === "neutral" ? "neutral" : "primary"}
        />
        {nextEvent.isOOM ? <StatusBadge label="OOM" tone="info" /> : null}
        {formatBadge ? <StatusBadge label={formatBadge} tone="neutral" /> : null}
      </View>

      <PrimaryButton onPress={onOpenEvent} size="sm" style={styles.cta}>
        View event
      </PrimaryButton>
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
  badgesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm + 2,
  },
  cta: {
    marginTop: spacing.md,
  },
});
