import { DashboardPrizePoolHomeCard } from "@/components/dashboard/DashboardPrizePoolHomeCard";
import type { HomePrizePoolRowVm } from "@/lib/event-prize-pools-types";

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
  if (!eventId || !myMemberId) {
    return null;
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
