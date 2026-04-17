import { Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { PrimaryButton } from "@/components/ui/Button";
import type { EventDoc } from "@/lib/db_supabase/eventRepo";
import type { EventRegistration } from "@/lib/db_supabase/eventRegistrationRepo";
import { getColors, radius, spacing } from "@/lib/ui/theme";

type AttendanceSummary = {
  attendingCount: number;
  guestCount: number;
};

type Props = {
  nextEvent: EventDoc;
  nextEventAttendance: AttendanceSummary;
  myReg: EventRegistration | null;
  regBusy: boolean;
  canAccessNextEventTeeSheet: boolean;
  canAdmin: boolean;
  showAdmin: boolean;
  onToggleAdmin: () => void;
  onToggleRegistration: (status: "in" | "out") => void;
  onMarkPaid: (paid: boolean) => void;
  onOpenTeeSheet: () => void;
};

function StatPill({
  icon,
  label,
  value,
  colors,
  flex,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  colors: ReturnType<typeof getColors>;
  flex?: number;
}) {
  return (
    <View
      style={[
        styles.statPill,
        { borderColor: colors.borderLight, backgroundColor: colors.backgroundSecondary, flex: flex ?? 1 },
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

export function HomeEventAttendanceCard({
  nextEvent,
  nextEventAttendance,
  myReg,
  regBusy,
  canAccessNextEventTeeSheet,
  canAdmin,
  showAdmin,
  onToggleAdmin,
  onToggleRegistration,
  onMarkPaid,
  onOpenTeeSheet,
}: Props) {
  const colors = getColors();
  const fee = nextEvent.entryFeeDisplay?.trim();
  const playingActive = myReg?.status === "in";
  const notPlayingActive = myReg?.status === "out";

  return (
    <AppCard
      style={[
        styles.card,
        {
          borderColor: colors.borderLight,
          backgroundColor: colors.surface,
        },
      ]}
    >
      <View style={styles.titleRow}>
        <View style={[styles.titleIcon, { backgroundColor: `${colors.primary}14` }]}>
          <Feather name="users" size={16} color={colors.primary} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText variant="captionBold" color="secondary" style={styles.eyebrow}>
            Event status
          </AppText>
          <AppText variant="bodyBold" style={{ color: colors.text }}>
            RSVP & payment
          </AppText>
        </View>
      </View>

      <View style={styles.statRow}>
        <StatPill
          icon="user-check"
          label="Attending"
          value={String(nextEventAttendance.attendingCount)}
          colors={colors}
        />
        <StatPill
          icon="coffee"
          label="Guests"
          value={nextEventAttendance.guestCount > 0 ? String(nextEventAttendance.guestCount) : "—"}
          colors={colors}
        />
      </View>

      <View
        style={[
          styles.costRow,
          { borderColor: colors.borderLight, backgroundColor: colors.backgroundSecondary },
        ]}
      >
        <Feather name="credit-card" size={16} color={colors.textSecondary} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText variant="captionBold" color="muted">
            Event cost
          </AppText>
          <AppText variant="small" color="secondary" style={{ marginTop: 2 }} numberOfLines={2}>
            {fee || "Not set"}
          </AppText>
        </View>
      </View>

      <View style={styles.paymentRow}>
        <AppText variant="captionBold" color="muted">
          Payment
        </AppText>
        <View
          style={[
            styles.paymentPill,
            {
              backgroundColor: myReg?.paid ? `${colors.success}18` : `${colors.warning}14`,
              borderColor: myReg?.paid ? `${colors.success}45` : `${colors.warning}40`,
            },
          ]}
        >
          <Feather name={myReg?.paid ? "check-circle" : "alert-circle"} size={14} color={myReg?.paid ? colors.success : colors.warning} />
          <AppText
            variant="captionBold"
            style={{ marginLeft: 6, color: myReg?.paid ? colors.success : colors.warning }}
          >
            {myReg?.paid ? "Paid" : "Outstanding"}
          </AppText>
        </View>
      </View>

      <AppText variant="captionBold" color="muted" style={{ marginTop: spacing.md, marginBottom: spacing.xs }}>
        Your attendance
      </AppText>
      <View style={[styles.segmentShell, { borderColor: colors.borderLight, backgroundColor: colors.backgroundSecondary }]}>
        <Pressable
          onPress={() => onToggleRegistration("in")}
          disabled={regBusy}
          style={({ pressed }) => [
            styles.segmentBtn,
            {
              backgroundColor: playingActive ? colors.primary : "transparent",
              borderColor: playingActive ? colors.primary : "transparent",
              opacity: pressed ? 0.88 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityState={{ selected: playingActive }}
          accessibilityLabel="Mark as playing"
        >
          <Feather name="sun" size={16} color={playingActive ? colors.textInverse : colors.textSecondary} />
          <AppText variant="bodyBold" style={{ marginTop: 4, color: playingActive ? colors.textInverse : colors.text }}>
            Playing
          </AppText>
        </Pressable>
        <Pressable
          onPress={() => onToggleRegistration("out")}
          disabled={regBusy}
          style={({ pressed }) => [
            styles.segmentBtn,
            {
              backgroundColor: notPlayingActive ? colors.textSecondary : "transparent",
              borderColor: notPlayingActive ? colors.textSecondary : "transparent",
              opacity: pressed ? 0.88 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityState={{ selected: notPlayingActive }}
          accessibilityLabel="Mark as not playing"
        >
          <Feather name="moon" size={16} color={notPlayingActive ? colors.textInverse : colors.textSecondary} />
          <AppText variant="bodyBold" style={{ marginTop: 4, color: notPlayingActive ? colors.textInverse : colors.text }}>
            Not playing
          </AppText>
        </Pressable>
      </View>

      {nextEvent.teeTimePublishedAt && canAccessNextEventTeeSheet ? (
        <Pressable
          onPress={onOpenTeeSheet}
          style={({ pressed }) => [
            styles.teeCard,
            {
              borderColor: `${colors.success}55`,
              backgroundColor: `${colors.success}10`,
              opacity: pressed ? 0.92 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Open tee sheet"
        >
          <View style={[styles.teeIconCircle, { backgroundColor: `${colors.success}22` }]}>
            <Feather name="flag" size={18} color={colors.success} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.teeTitleRow}>
              <AppText variant="bodyBold" style={{ color: colors.success }}>
                Tee times now available
              </AppText>
              <View style={[styles.liveBadge, { backgroundColor: `${colors.success}24` }]}>
                <AppText variant="captionBold" style={{ color: colors.success }}>
                  Live
                </AppText>
              </View>
            </View>
            <AppText variant="small" color="secondary" style={{ marginTop: 4 }}>
              Tap to view your tee time and full tee sheet.
            </AppText>
          </View>
          <Feather name="chevron-right" size={22} color={colors.success} />
        </Pressable>
      ) : null}

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
            <View style={[styles.titleIcon, { backgroundColor: `${colors.primary}14` }]}>
              <Feather name="settings" size={16} color={colors.primary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText variant="bodyBold" style={{ color: colors.text }}>
                Event management
              </AppText>
              <AppText variant="small" color="secondary" style={{ marginTop: 2 }}>
                Mark paid, adjust records, and other captain tools.
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
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: spacing.base + 2,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  titleIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    letterSpacing: 0.4,
    textTransform: "uppercase",
    fontSize: 10,
    marginBottom: 2,
  },
  statRow: {
    flexDirection: "row",
    gap: spacing.sm,
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
  costRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginTop: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.sm + 2,
  },
  paymentRow: {
    marginTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  paymentPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
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
    minHeight: 52,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  teeCard: {
    marginTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm + 2,
  },
  teeIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  teeTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  liveBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  adminTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.sm + 2,
  },
  adminActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
