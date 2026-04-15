import { StyleSheet } from "react-native";
import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { DashboardPrizePoolHomeCard } from "@/components/dashboard/DashboardPrizePoolHomeCard";
import type { HomePrizePoolRowVm } from "@/lib/event-prize-pools-types";
import { getColors, radius, spacing } from "@/lib/ui/theme";

type Props = {
  eventId: string | null;
  myMemberId: string | undefined;
  managerName: string | null;
  paymentInstructions: string | null | undefined;
  poolRows: HomePrizePoolRowVm[];
  loading: boolean;
  onChanged: () => void;
};

export function HomePrizePoolCard({
  eventId,
  myMemberId,
  managerName,
  paymentInstructions,
  poolRows,
  loading,
  onChanged,
}: Props) {
  const colors = getColors();

  if (!eventId || !myMemberId) {
    return (
      <AppCard
        style={[
          styles.emptyCard,
          { borderColor: colors.borderLight, backgroundColor: colors.backgroundTertiary },
        ]}
      >
        <AppText variant="bodyBold">Prize Pools</AppText>
        <AppText variant="small" color="secondary" style={{ marginTop: 4 }}>
          No prize pools for this event.
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
      poolRows={poolRows}
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
