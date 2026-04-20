import { StyleSheet, View, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { getColors, radius, spacing, iconSize } from "@/lib/ui/theme";
import type { BirdiesLeagueStandingRow } from "@/lib/db_supabase/birdiesLeagueRepo";

type Props = {
  myRank: number | null;
  myTotalBirdies: number | null;
  myEventsCounted: number | null;
  previewRows: BirdiesLeagueStandingRow[];
  onOpen: () => void;
};

function ordinalLabel(rank: number | null): string {
  if (rank == null || !Number.isFinite(rank) || rank <= 0) return "—";
  const n = rank;
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  if (n % 10 === 1) return `${n}st`;
  if (n % 10 === 2) return `${n}nd`;
  if (n % 10 === 3) return `${n}rd`;
  return `${n}th`;
}

export function HomeBirdiesLeagueCard({
  myRank,
  myTotalBirdies,
  myEventsCounted,
  previewRows,
  onOpen,
}: Props) {
  const colors = getColors();

  return (
    <Pressable onPress={onOpen} style={({ pressed }) => [{ opacity: pressed ? 0.92 : 1 }]}>
      <AppCard
        style={[
          styles.summaryCard,
          { borderColor: colors.borderLight, backgroundColor: colors.backgroundTertiary },
        ]}
      >
        <View style={styles.titleRow}>
          <View style={[styles.iconWrap, { backgroundColor: colors.primary + "18" }]}>
            <Feather name="target" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="bodyBold">Birdies League</AppText>
            <AppText variant="caption" color="secondary" style={{ marginTop: 2 }}>
              Official birdie counts from results
            </AppText>
          </View>
          <Feather name="chevron-right" size={iconSize.md} color={colors.textTertiary} />
        </View>

        <AppText variant="body" style={{ marginTop: spacing.sm }}>
          {myRank != null && myRank > 0 ? `You are ${ordinalLabel(myRank)}` : "You are not ranked yet"}
        </AppText>
        <AppText variant="small" color="secondary">
          {myTotalBirdies != null ? `${myTotalBirdies} birdies` : "0 birdies"}
          {myEventsCounted != null && myEventsCounted > 0 ? ` · ${myEventsCounted} events` : ""}
        </AppText>

        {previewRows.length > 0 ? (
          <View style={{ marginTop: spacing.md, gap: spacing.xs }}>
            <AppText variant="captionBold" color="secondary">
              Top {previewRows.length}
            </AppText>
            {previewRows.map((r) => (
              <View key={r.personKey} style={styles.previewRow}>
                <AppText variant="small" color="secondary" style={{ width: 40 }}>
                  {ordinalLabel(r.rank)}
                </AppText>
                <AppText variant="small" style={{ flex: 1 }} numberOfLines={1}>
                  {r.displayName}
                </AppText>
                <AppText variant="small" style={{ width: 56, textAlign: "right" }}>
                  {r.totalBirdies}
                </AppText>
              </View>
            ))}
          </View>
        ) : null}
      </AppCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  summaryCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.base,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
});
