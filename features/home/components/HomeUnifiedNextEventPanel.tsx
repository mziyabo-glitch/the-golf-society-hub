import { Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ReliablePressable } from "@/components/ui/ReliablePressable";
import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { EventDoc } from "@/lib/db_supabase/eventRepo";
import type { EventRegistration } from "@/lib/db_supabase/eventRegistrationRepo";
import { getColors, radius, spacing } from "@/lib/ui/theme";

type AttendanceSummary = {
  attendingCount: number;
  guestCount: number;
};

type Props = {
  nextEvent: EventDoc | null;
  nextEventIsJoint: boolean;
  myReg: EventRegistration | null;
  nextEventAttendance: AttendanceSummary;
  formatEventDate: (dateStr?: string) => string;
  formatFormatLabel: (format?: string) => string;
  formatClassification: (classification?: string) => string;
  onOpenEvent: () => void;
  canManage: boolean;
  /** Licensed members: RSVP, payment row, admin tools */
  interactive: boolean;
  regBusy: boolean;
  canAdmin: boolean;
  showAdmin: boolean;
  onToggleAdmin: () => void;
  onToggleRegistration: (status: "in" | "out") => void;
  onMarkPaid: (paid: boolean) => void;
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

function StatPill({
  icon,
  label,
  value,
  colors,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  colors: ReturnType<typeof getColors>;
}) {
  return (
    <View
      style={[
        styles.statPill,
        { borderColor: colors.borderLight, backgroundColor: colors.backgroundSecondary, flex: 1 },
      ]}
    >
      <View style={styles.statPillIconRow}>
        <Feather name={icon} size={14} color={colors.primary} />
        <AppText variant="captionBold" color="muted" numberOfLines={1}>
          {label}
        </AppText>
      </View>
      <AppText variant="bodyBold" style={{ color: colors.text, marginTop: 4 }} numberOfLines={1}>
        {value}
      </AppText>
    </View>
  );
}

export function HomeUnifiedNextEventPanel({
  nextEvent,
  nextEventIsJoint,
  myReg,
  nextEventAttendance,
  formatEventDate,
  formatFormatLabel,
  formatClassification,
  onOpenEvent,
  canManage,
  interactive,
  regBusy,
  canAdmin,
  showAdmin,
  onToggleAdmin,
  onToggleRegistration,
  onMarkPaid,
}: Props) {
  const colors = getColors();

  if (!nextEvent) {
    return (
      <AppCard style={[styles.emptyCard, { borderColor: colors.borderLight, backgroundColor: colors.surface }]}>
        <View style={styles.emptyIcon}>
          <Feather name="calendar" size={22} color={colors.textTertiary} />
        </View>
        <AppText variant="bodyBold">No upcoming event</AppText>
        <AppText variant="small" color="secondary" style={{ marginTop: 4, textAlign: "center" }}>
          Your next society event will appear here.
        </AppText>
      </AppCard>
    );
  }

  const playing = playingBlock(nextEventIsJoint, myReg);
  const formatLabel = nextEvent.format ? formatFormatLabel(nextEvent.format) : "";
  const classificationLabel = nextEvent.classification ? formatClassification(nextEvent.classification) : "";
  const fee = nextEvent.entryFeeDisplay?.trim();
  const venue = nextEvent.courseName ? String(nextEvent.courseName) : "";
  const playingActive = myReg?.status === "in";
  const notPlayingActive = myReg?.status === "out";

  return (
    <AppCard
      style={[
        styles.card,
        {
          borderColor: `${colors.primary}30`,
          backgroundColor: colors.surface,
        },
      ]}
    >
      <Pressable onPress={onOpenEvent} accessibilityRole="button" accessibilityLabel="Open event details">
        <AppText variant="captionBold" color="primary" style={styles.eyebrow}>
          Next event
        </AppText>
        <AppText variant="h2" style={styles.title} numberOfLines={3}>
          {String(nextEvent.name ?? "Event")}
        </AppText>
        <AppText variant="bodyBold" style={styles.dateLine} numberOfLines={2}>
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

      {interactive ? (
        <>
          <View style={styles.statRow}>
            <StatPill icon="user-check" label="Attending" value={String(nextEventAttendance.attendingCount)} colors={colors} />
            <StatPill
              icon="coffee"
              label="Guests"
              value={nextEventAttendance.guestCount > 0 ? String(nextEventAttendance.guestCount) : "—"}
              colors={colors}
            />
          </View>

          <View style={[styles.metaRow, { borderColor: colors.borderLight, backgroundColor: colors.backgroundSecondary }]}>
            <Feather name="credit-card" size={16} color={colors.textSecondary} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText variant="captionBold" color="muted">
                Event fee
              </AppText>
              <AppText variant="small" color="secondary" style={{ marginTop: 2 }} numberOfLines={2}>
                {fee || "Not set"}
              </AppText>
            </View>
            <View
              style={[
                styles.paymentPill,
                {
                  backgroundColor: myReg?.paid ? `${colors.success}18` : `${colors.warning}14`,
                  borderColor: myReg?.paid ? `${colors.success}45` : `${colors.warning}40`,
                },
              ]}
            >
              <Feather
                name={myReg?.paid ? "check-circle" : "alert-circle"}
                size={14}
                color={myReg?.paid ? colors.success : colors.warning}
              />
              <AppText
                variant="captionBold"
                style={{ marginLeft: 6, color: myReg?.paid ? colors.success : colors.warning }}
              >
                {myReg?.paid ? "Paid" : "Outstanding"}
              </AppText>
            </View>
          </View>

          <AppText variant="captionBold" color="muted" style={styles.rsvpLabel}>
            Your attendance
          </AppText>
          <View style={[styles.segmentShell, { borderColor: colors.borderLight, backgroundColor: colors.backgroundSecondary }]}>
            <ReliablePressable
              onPress={() => onToggleRegistration("in")}
              disabled={regBusy}
              hitSlop={8}
              accessibilityLabel="Mark as playing"
              style={[
                styles.segmentBtn,
                {
                  backgroundColor: playingActive ? colors.primary : "transparent",
                  borderColor: playingActive ? colors.primary : "transparent",
                },
              ]}
            >
              <Feather name="sun" size={16} color={playingActive ? colors.textInverse : colors.textSecondary} />
              <AppText variant="bodyBold" style={{ marginTop: 4, color: playingActive ? colors.textInverse : colors.text }}>
                Playing
              </AppText>
            </ReliablePressable>
            <ReliablePressable
              onPress={() => onToggleRegistration("out")}
              disabled={regBusy}
              hitSlop={8}
              accessibilityLabel="Mark as not playing"
              style={[
                styles.segmentBtn,
                {
                  backgroundColor: notPlayingActive ? colors.textSecondary : "transparent",
                  borderColor: notPlayingActive ? colors.textSecondary : "transparent",
                },
              ]}
            >
              <Feather name="moon" size={16} color={notPlayingActive ? colors.textInverse : colors.textSecondary} />
              <AppText variant="bodyBold" style={{ marginTop: 4, color: notPlayingActive ? colors.textInverse : colors.text }}>
                Not playing
              </AppText>
            </ReliablePressable>
          </View>

          {canAdmin ? (
            <View style={{ marginTop: spacing.md }}>
              <Pressable
                onPress={onToggleAdmin}
                style={({ pressed }) => [
                  styles.adminTrigger,
                  {
                    borderColor: colors.borderLight,
                    backgroundColor: showAdmin ? `${colors.primary}0C` : colors.backgroundSecondary,
                    opacity: pressed ? 0.9 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={showAdmin ? "Hide admin actions" : "Show admin actions"}
              >
                <View style={[styles.adminIcon, { backgroundColor: `${colors.primary}14` }]}>
                  <Feather name="settings" size={16} color={colors.primary} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AppText variant="bodyBold">Event management</AppText>
                  <AppText variant="small" color="secondary" style={{ marginTop: 2 }}>
                    Mark paid or unpaid for your registration.
                  </AppText>
                </View>
                <Feather name={showAdmin ? "chevron-up" : "chevron-down"} size={20} color={colors.textTertiary} />
              </Pressable>

              {showAdmin ? (
                <View style={styles.adminActions}>
                  <PrimaryButton size="sm" onPress={() => onMarkPaid(true)} loading={regBusy} disabled={regBusy} style={{ flex: 1 }}>
                    Mark paid
                  </PrimaryButton>
                  <PrimaryButton size="sm" onPress={() => onMarkPaid(false)} loading={regBusy} disabled={regBusy} style={{ flex: 1 }}>
                    Mark unpaid
                  </PrimaryButton>
                </View>
              ) : null}
            </View>
          ) : null}
        </>
      ) : fee ? (
        <View style={[styles.metaRow, { borderColor: colors.borderLight, backgroundColor: colors.backgroundSecondary, marginTop: spacing.md }]}>
          <Feather name="tag" size={16} color={colors.primary} />
          <AppText variant="small" color="secondary" style={{ flex: 1 }} numberOfLines={2}>
            {fee}
          </AppText>
        </View>
      ) : null}

      <View style={styles.actions}>
        <PrimaryButton onPress={onOpenEvent} size="md" style={styles.cta}>
          View event
        </PrimaryButton>
        {canManage ? (
          <SecondaryButton size="md" onPress={onOpenEvent} style={styles.cta}>
            Manage event
          </SecondaryButton>
        ) : null}
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.base + 2,
  },
  emptyCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg + 4,
    alignItems: "center",
  },
  emptyIcon: {
    marginBottom: spacing.sm,
  },
  eyebrow: {
    letterSpacing: 0.6,
    textTransform: "uppercase",
    fontSize: 11,
  },
  title: {
    letterSpacing: -0.4,
    fontWeight: "800",
    marginTop: spacing.xs,
  },
  dateLine: {
    marginTop: spacing.sm,
  },
  venueRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: spacing.xs,
  },
  venueText: {
    flex: 1,
    fontWeight: "500",
    lineHeight: 20,
  },
  badgesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  statRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  statPill: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    minWidth: 0,
  },
  statPillIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.sm + 2,
  },
  paymentPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  rsvpLabel: {
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  segmentShell: {
    flexDirection: "row",
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 4,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  adminTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.sm + 2,
    minHeight: 48,
  },
  adminIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  adminActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  actions: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  cta: {
    alignSelf: "stretch",
    minHeight: 48,
  },
});
