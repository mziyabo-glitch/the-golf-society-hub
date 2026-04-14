import { Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { getColors, radius, spacing } from "@/lib/ui/theme";

export type LatestResultsSnapshot = {
  eventId: string;
  eventName: string;
  rows: { rank: number; name: string; value: string; isGuest: boolean }[];
} | null;

type Props = {
  snapshot: LatestResultsSnapshot;
  onOpenEvent: (eventId: string) => void;
};

export function HomeLatestResultsCard({ snapshot, onOpenEvent }: Props) {
  const colors = getColors();

  if (!snapshot) {
    return (
      <AppCard style={[styles.card, { borderColor: colors.borderLight }]}>
        <AppText variant="bodyBold">Latest Results</AppText>
        <AppText variant="small" color="secondary" style={{ marginTop: 4 }}>
          Results will appear here after the event.
        </AppText>
      </AppCard>
    );
  }

  return (
    <Pressable onPress={() => onOpenEvent(snapshot.eventId)} style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}>
      <AppCard style={[styles.card, { borderColor: colors.borderLight }]}>
        <AppText variant="bodyBold">Latest Results</AppText>
        <AppText variant="caption" color="secondary" style={{ marginTop: 2 }}>
          Event Results (All Players)
        </AppText>
        <AppText variant="small" color="secondary" numberOfLines={1} style={{ marginTop: spacing.xs }}>
          {snapshot.eventName}
        </AppText>

        <View style={styles.rows}>
          {snapshot.rows.map((row) => (
            <View key={`${row.rank}-${row.name}`} style={[styles.row, { borderBottomColor: colors.borderLight }]}>
              <AppText variant="captionBold" color="primary" style={styles.rank}>
                {row.rank}.
              </AppText>
              <AppText variant="body" numberOfLines={1} style={styles.name}>
                {row.name}
              </AppText>
              {row.isGuest ? (
                <View style={[styles.guestBadge, { backgroundColor: colors.backgroundTertiary }]}>
                  <AppText variant="small" color="secondary">Guest</AppText>
                </View>
              ) : null}
              <AppText variant="captionBold" color="secondary">
                {row.value}
              </AppText>
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <AppText variant="small" color="primary">View Full Results</AppText>
          <Feather name="chevron-right" size={16} color={colors.primary} />
        </View>
      </AppCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.base,
  },
  rows: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingBottom: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rank: {
    width: 20,
  },
  name: {
    flex: 1,
  },
  guestBadge: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  footer: {
    marginTop: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 2,
  },
});

