import { StyleSheet } from "react-native";
import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { DashboardPrizePoolHomeCard } from "@/components/dashboard/DashboardPrizePoolHomeCard";
import type { EventPrizePoolEntryRow } from "@/lib/event-prize-pools-types";
import { getColors, radius, spacing } from "@/lib/ui/theme";

type Props = {
  eventId: string | null;
  myMemberId: string | undefined;
  managerName: string | null;
  paymentInstructions: string | null | undefined;
  entry: EventPrizePoolEntryRow | null;
  loading: boolean;
  onChanged: () => void;
};

export function HomePrizePoolCard({
  eventId,
  myMemberId,
  managerName,
  paymentInstructions,
  entry,
  loading,
  onChanged,
}: Props) {
  const colors = getColors();

  if (!eventId || !myMemberId) {
    return (
      <AppCard style={[styles.emptyCard, { borderColor: colors.borderLight }]}>
        <AppText variant="bodyBold">Prize Pool</AppText>
        <AppText variant="small" color="secondary" style={{ marginTop: 4 }}>
          No Prize Pool for this event.
        </AppText>
      </AppCard>
    );
  }

  return (
    <DashboardPrizePoolHomeCard
      eventId={eventId}
      myMemberId={myMemberId}
      managerName={managerName}
      paymentInstructions={paymentInstructions}
      entry={entry}
      loading={loading}
      onChanged={onChanged}
    />
  );
}

const styles = StyleSheet.create({
  emptyCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.base,
  },
});

