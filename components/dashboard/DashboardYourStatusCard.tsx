/**
 * RSVP, payment, captain/treasurer tools, and tee-time publish summary for the next event.
 * Presentational only — callbacks owned by the home screen.
 */

import { View, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppText } from "@/components/ui/AppText";
import type { EventDoc } from "@/lib/db_supabase/eventRepo";
import type { EventRegistration } from "@/lib/db_supabase/eventRegistrationRepo";
import { getColors, spacing, radius, typography } from "@/lib/ui/theme";
import { PaymentStatus, JOINT_HOME_RSVP_NOTE } from "@/lib/eventModuleUi";
import { dashboardShell } from "./dashboardCardStyles";

type Props = {
  nextEvent: EventDoc;
  nextEventIsJoint: boolean;
  myReg: EventRegistration | null;
  regBusy: boolean;
  canAdmin: boolean;
  showAdmin: boolean;
  onToggleAdmin: () => void;
  onToggleIn: () => void;
  onToggleOut: () => void;
  onMarkPaid: (paid: boolean) => void;
};

export function DashboardYourStatusCard({
  nextEvent,
  nextEventIsJoint,
  myReg,
  regBusy,
  canAdmin,
  showAdmin,
  onToggleAdmin,
  onToggleIn,
  onToggleOut,
  onMarkPaid,
}: Props) {
  const colors = getColors();

  return (
    <View style={[dashboardShell.card, { borderColor: colors.borderLight, backgroundColor: colors.surface }]}>
      <View style={dashboardShell.sectionEyebrow}>
        <Feather name="user-check" size={16} color={colors.primary} />
        <AppText variant="captionBold" color="primary">
          Your status
        </AppText>
      </View>

      <AppText variant="small" color="secondary" style={styles.caption}>
        For this event — fees and RSVP are managed here.
      </AppText>

      <View style={[styles.block, { borderTopColor: colors.borderLight }]}>
        <View style={{ flex: 1, gap: spacing.xs }}>
          {nextEventIsJoint ? (
            <AppText variant="small" color="tertiary" style={{ marginBottom: 2 }}>
              {JOINT_HOME_RSVP_NOTE}
            </AppText>
          ) : null}
          <View style={styles.regStatusWrap}>
            <AppText variant="small" color="secondary" style={{ fontWeight: "600" }}>
              You:
            </AppText>
            {myReg?.status === "in" ? (
              <>
                <View style={[styles.regBadge, { backgroundColor: `${colors.success}18` }]}>
                  <Feather name="check-circle" size={12} color={colors.success} />
                  <AppText variant="small" style={{ color: colors.success, fontWeight: "700" }}>
                    CONFIRMED
                  </AppText>
                </View>
                {!nextEventIsJoint ? (
                  myReg.paid ? (
                    <View style={[styles.paidPill, { backgroundColor: colors.success }]}>
                      <AppText style={styles.paidPillText}>PAID</AppText>
                    </View>
                  ) : (
                    <View style={[styles.paidPill, { backgroundColor: `${colors.warning}40` }]}>
                      <AppText style={[styles.paidPillText, { color: colors.warning }]}>{PaymentStatus.unpaid}</AppText>
                    </View>
                  )
                ) : null}
              </>
            ) : myReg?.status === "out" ? (
              <View style={[styles.regBadge, { backgroundColor: `${colors.textTertiary}18` }]}>
                <Feather name="x-circle" size={12} color={colors.textTertiary} />
                <AppText variant="small" style={{ color: colors.textTertiary, fontWeight: "700" }}>
                  OUT
                </AppText>
              </View>
            ) : (
              <AppText variant="small" color="tertiary">
                Not registered
              </AppText>
            )}
          </View>

          <View style={styles.regActions}>
            {myReg?.status === "in" ? (
              <Pressable
                hitSlop={8}
                disabled={regBusy}
                onPress={onToggleOut}
                style={[styles.regBtn, { borderColor: colors.border }]}
              >
                <AppText variant="small" color="secondary">
                  Can&apos;t make it
                </AppText>
              </Pressable>
            ) : (
              <Pressable
                hitSlop={8}
                disabled={regBusy}
                onPress={onToggleIn}
                style={[styles.regBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
              >
                <AppText variant="small" style={{ color: "#fff", fontWeight: "600" }}>
                  I&apos;m playing
                </AppText>
              </Pressable>
            )}

            {canAdmin ? (
              <Pressable hitSlop={8} onPress={onToggleAdmin} style={[styles.regBtn, { borderColor: colors.border }]}>
                <Feather name="shield" size={12} color={colors.textSecondary} />
                <AppText variant="small" color="secondary">
                  Admin
                </AppText>
              </Pressable>
            ) : null}
          </View>

          {canAdmin && showAdmin && !nextEventIsJoint ? (
            <View style={[styles.regActions, { marginTop: 2 }]}>
              <Pressable
                hitSlop={8}
                disabled={regBusy}
                onPress={() => onMarkPaid(true)}
                style={[styles.regBtn, { backgroundColor: colors.success, borderColor: colors.success }]}
              >
                <AppText variant="small" style={{ color: "#fff", fontWeight: "600" }}>
                  Mark me paid (confirms me)
                </AppText>
              </Pressable>
              <Pressable
                hitSlop={8}
                disabled={regBusy}
                onPress={() => onMarkPaid(false)}
                style={[styles.regBtn, { backgroundColor: colors.error, borderColor: colors.error }]}
              >
                <AppText variant="small" style={{ color: "#fff", fontWeight: "600" }}>
                  Mark me unpaid
                </AppText>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>

      <View style={[styles.teeRow, { borderTopColor: colors.borderLight }]}>
        <Feather name="clock" size={14} color={nextEvent.teeTimePublishedAt ? colors.success : colors.textSecondary} />
        {nextEvent.teeTimePublishedAt ? (
          <AppText variant="small" style={{ color: colors.success, fontWeight: "600", flex: 1 }}>
            Tee times live — first tee {String(nextEvent.teeTimeStart || "TBC")}
            {nextEvent.teeTimeInterval ? ` · ${String(nextEvent.teeTimeInterval)} min` : ""}
          </AppText>
        ) : (
          <AppText variant="small" color="secondary" style={{ flex: 1 }}>
            Tee times not published yet
          </AppText>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  caption: {
    marginTop: 2,
  },
  block: {
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
    borderTopWidth: 1,
  },
  regStatusWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexWrap: "wrap",
  },
  regBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  regActions: {
    flexDirection: "row",
    gap: spacing.xs,
    flexWrap: "wrap",
  },
  regBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  paidPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  paidPillText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: typography.small.fontSize,
  },
  teeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
    borderTopWidth: 1,
  },
});
