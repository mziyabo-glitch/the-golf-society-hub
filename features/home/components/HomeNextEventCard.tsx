import { StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { SecondaryButton } from "@/components/ui/Button";
import { DashboardHeroEventCard } from "@/components/dashboard/DashboardHeroEventCard";
import type { EventDoc } from "@/lib/db_supabase/eventRepo";
import type { EventRegistration } from "@/lib/db_supabase/eventRegistrationRepo";
import { getColors, radius, spacing } from "@/lib/ui/theme";

type Props = {
  nextEvent: EventDoc | null;
  nextEventIsJoint: boolean;
  myReg: EventRegistration | null;
  formatEventDate: (dateStr?: string) => string;
  formatFormatLabel: (format?: string) => string;
  formatClassification: (classification?: string) => string;
  onOpenEvent: () => void;
  canManage: boolean;
};

export function HomeNextEventCard(props: Props) {
  const colors = getColors();

  if (!props.nextEvent) {
    return (
      <AppCard style={[styles.emptyCard, { borderColor: colors.borderLight }]}>
        <View style={styles.emptyIcon}>
          <Feather name="calendar" size={20} color={colors.textTertiary} />
        </View>
        <AppText variant="bodyBold">No upcoming event</AppText>
        <AppText variant="small" color="secondary" style={{ marginTop: 4 }}>
          Your next society event will appear here.
        </AppText>
      </AppCard>
    );
  }

  return (
    <View style={styles.wrap}>
      <DashboardHeroEventCard
        nextEvent={props.nextEvent}
        nextEventIsJoint={props.nextEventIsJoint}
        myReg={props.myReg}
        formatEventDate={props.formatEventDate}
        formatFormatLabel={props.formatFormatLabel}
        formatClassification={props.formatClassification}
        onOpenEvent={props.onOpenEvent}
      />
      {props.canManage ? (
        <SecondaryButton size="md" onPress={props.onOpenEvent} style={styles.manageBtn}>
          Manage event
        </SecondaryButton>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  emptyCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg + 4,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyIcon: {
    marginBottom: spacing.sm,
  },
  manageBtn: {
    marginTop: spacing.xs,
    alignSelf: "stretch",
    minHeight: 48,
  },
});

