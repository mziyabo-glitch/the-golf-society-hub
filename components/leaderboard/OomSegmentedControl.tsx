import { Feather } from "@expo/vector-icons";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { getColors } from "@/lib/ui/theme";

export type OomSegmentId = "leaderboard" | "eventPoints";

type Props = {
  selectedId: OomSegmentId;
  onSelect: (id: OomSegmentId) => void;
};

/**
 * Two-segment control for Order of Merit: standings vs event-by-event matrix.
 * Labels must match product copy: "Leaderboard" and "Event Points".
 */
export function OomSegmentedControl({ selectedId, onSelect }: Props) {
  const colors = getColors();

  return (
    <SegmentedTabs<OomSegmentId>
      style={{ marginBottom: 0 }}
      items={[
        {
          id: "leaderboard",
          label: "Leaderboard",
          icon: (
            <Feather
              name="bar-chart-2"
              size={15}
              color={selectedId === "leaderboard" ? colors.primary : colors.textTertiary}
            />
          ),
        },
        {
          id: "eventPoints",
          label: "Event Points",
          icon: (
            <Feather name="grid" size={15} color={selectedId === "eventPoints" ? colors.primary : colors.textTertiary} />
          ),
        },
      ]}
      selectedId={selectedId}
      onSelect={onSelect}
    />
  );
}
