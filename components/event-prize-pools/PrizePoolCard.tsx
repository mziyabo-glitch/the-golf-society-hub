import { Pressable, View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { PrizePoolStatusBadge } from "@/components/event-prize-pools/PrizePoolStatusBadge";
import type { EventPrizePoolRow } from "@/lib/event-prize-pools-types";
import { formatPenceGbp } from "@/lib/db_supabase/eventPrizePoolRepo";
import { getColors, spacing, radius, iconSize } from "@/lib/ui/theme";

export function PrizePoolCard(props: {
  pool: EventPrizePoolRow;
  onOpen: () => void;
}) {
  const { pool, onOpen } = props;
  const colors = getColors();
  const eligibility = [
    pool.require_confirmed ? "Confirmed" : null,
    pool.require_paid ? "Paid" : null,
    pool.include_guests ? "Guests included" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Pressable onPress={onOpen} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      <AppCard style={{ borderRadius: radius.md }}>
        <View style={styles.top}>
          <View style={{ flex: 1 }}>
            <AppText variant="bodyBold" numberOfLines={2}>
              {pool.name}
            </AppText>
            <AppText variant="caption" color="secondary" style={{ marginTop: 4 }}>
              {formatPenceGbp(pool.total_amount_pence)} · {pool.places_paid} places paid
            </AppText>
          </View>
          <PrizePoolStatusBadge status={pool.status} />
        </View>
        <View style={styles.badges}>
          <View style={[styles.miniBadge, { borderColor: colors.border, backgroundColor: colors.backgroundSecondary }]}>
            <AppText variant="caption">
              {pool.payout_mode === "overall" ? "Overall payout" : "Division payout"}
            </AppText>
          </View>
        </View>
        {eligibility ? (
          <AppText variant="small" color="muted" style={{ marginTop: spacing.xs }}>
            {eligibility}
          </AppText>
        ) : null}
        {pool.last_calculated_at ? (
          <AppText variant="small" color="muted" style={{ marginTop: 4 }}>
            Last calculated {new Date(pool.last_calculated_at).toLocaleString("en-GB")}
          </AppText>
        ) : null}
        <View style={[styles.footer, { borderTopColor: colors.borderLight }]}>
          <AppText variant="captionBold" color="primary">
            View / edit
          </AppText>
          <Feather name="chevron-right" size={iconSize.sm} color={colors.primary} />
        </View>
      </AppCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-start",
  },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  miniBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
});
