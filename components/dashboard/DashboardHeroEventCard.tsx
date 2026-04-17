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
import { getColors, radius, spacing } from "@/lib/ui/theme";
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
  const borderCol = `${colors.primary}38`;
  const bgCol = `${colors.primary}0C`;

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
        <AppText variant="small" color="secondary" style={styles.heroSubtitle}>
          Check back soon for the next society day.
        </AppText>
      </View>
    );
  }

  const playing = playingBlock(nextEventIsJoint, myReg);
  const formatLabel = nextEvent.format ? formatFormatLabel(nextEvent.format) : "";
  const classificationLabel = nextEvent.classification ? formatClassification(nextEvent.classification) : "";
  const fee = nextEvent.entryFeeDisplay?.trim();
  const venue = nextEvent.courseName ? String(nextEvent.courseName) : "";

  return (
    <View style={[dashboardShell.card, { borderColor: borderCol, backgroundColor: bgCol, marginBottom: 0 }]}>
      <View style={dashboardShell.sectionEyebrow}>
        <Feather name="flag" size={16} color={colors.primary} />
        <AppText variant="captionBold" color="primary">
          Next event
        </AppText>
      </View>

      <Pressable onPress={onOpenEvent} accessibilityRole="button" accessibilityLabel="Open event details">
        <AppText variant="h2" style={[styles.heroTitle, { color: colors.text }]} numberOfLines={3}>
          {String(nextEvent.name ?? "Event")}
        </AppText>
        <AppText variant="bodyBold" color="default" style={styles.heroDate} numberOfLines={2}>
          {formatEventDate(nextEvent.date)}
        </AppText>
        {venue ? (
          <View style={styles.venueRow}>
            <Feather name="map-pin" size={14} color={colors.textSecondary} />
            <AppText variant="small" color="secondary" style={styles.venueText} numberOfLines={2}>
              {venue}
            </AppText>
          </View>
        ) : null}
      </Pressable>

      {fee ? (
        <View style={[styles.feeStrip, { borderColor: `${colors.primary}28`, backgroundColor: colors.surface }]}>
          <Feather name="tag" size={14} color={colors.primary} />
          <AppText variant="small" color="secondary" style={{ flex: 1 }} numberOfLines={2}>
            {fee}
          </AppText>
        </View>
      ) : null}

      <View style={styles.badgesRow}>
        <StatusBadge
          label={playing.label}
          tone={playing.tone === "success" ? "success" : playing.tone === "neutral" ? "neutral" : "primary"}
        />
        {nextEvent.isOOM ? <StatusBadge label="OOM" tone="info" /> : null}
        {formatLabel ? <StatusBadge label={formatLabel} tone="neutral" /> : null}
        {classificationLabel && classificationLabel !== formatLabel ? (
          <StatusBadge label={classificationLabel} tone="neutral" />
        ) : null}
      </View>

      <PrimaryButton onPress={onOpenEvent} size="md" style={styles.cta}>
        View event
      </PrimaryButton>
    </View>
  );
}

const styles = StyleSheet.create({
  heroTitle: {
    letterSpacing: -0.4,
    fontWeight: "800",
    marginTop: spacing.xs,
  },
  heroSubtitle: {
    marginTop: spacing.xs,
  },
  heroDate: {
    marginTop: spacing.sm,
    letterSpacing: -0.1,
  },
  venueRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: spacing.xs,
    paddingRight: spacing.xs,
  },
  venueText: {
    flex: 1,
    fontWeight: "500",
    lineHeight: 20,
  },
  feeStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  badgesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  cta: {
    marginTop: spacing.md + 2,
    alignSelf: "stretch",
    minHeight: 48,
  },
});
