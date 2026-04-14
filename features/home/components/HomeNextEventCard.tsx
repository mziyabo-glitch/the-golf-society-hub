import { StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { SecondaryButton } from "@/components/ui/Button";
import { DashboardHeroEventCard } from "@/components/dashboard/DashboardHeroEventCard";
import type { EventDoc } from "@/lib/db_supabase/eventRepo";
import type { EventRegistration } from "@/lib/db_supabase/eventRegistrationRepo";
import type { HeroTeeInfo } from "@/components/dashboard/DashboardHeroEventCard";
import { getColors, radius, spacing } from "@/lib/ui/theme";

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
    <View>
      <DashboardHeroEventCard
        nextEvent={props.nextEvent}
        nextEventIsJoint={props.nextEventIsJoint}
        myReg={props.myReg}
        myTeeTimeInfo={props.myTeeTimeInfo}
        canAccessNextEventTeeSheet={props.canAccessNextEventTeeSheet}
        formatEventDate={props.formatEventDate}
        formatFormatLabel={props.formatFormatLabel}
        formatClassification={props.formatClassification}
        onOpenEvent={props.onOpenEvent}
        onOpenTeeSheet={props.onOpenTeeSheet}
      />
      {props.canManage ? (
        <SecondaryButton size="sm" onPress={props.onOpenEvent} style={styles.manageBtn}>
          Manage Event
        </SecondaryButton>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  emptyCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyIcon: {
    marginBottom: spacing.sm,
  },
  manageBtn: {
    marginTop: spacing.xs,
  },
});

