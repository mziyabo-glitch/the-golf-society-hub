import { useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { SecondaryButton } from "@/components/ui/Button";
import type {
  EventPrizePoolEntryRow,
  EventPrizePoolResultRow,
  EventPrizePoolRow,
  EventPrizePoolRuleRow,
  HomePrizePoolRowVm,
} from "@/lib/event-prize-pools-types";
import { formatPenceGbp, upsertMyPrizePoolOptIn } from "@/lib/db_supabase/eventPrizePoolRepo";
import { getColors, radius, spacing } from "@/lib/ui/theme";

type Props = {
  eventId: string;
  myMemberId: string;
  managerName: string | null;
  paymentInstructions: string | null | undefined;
  poolRows: HomePrizePoolRowVm[];
  loading: boolean;
  onChanged: () => void;
};

function entryStatusLabel(entry: EventPrizePoolEntryRow | null): { text: string; tone: "muted" | "primary" | "secondary" } {
  if (!entry || !entry.opted_in) return { text: "Not entered", tone: "muted" };
  if (entry.confirmed_by_pot_master) return { text: "Confirmed", tone: "primary" };
  return { text: "Requested", tone: "secondary" };
}

function entryValueLine(pool: EventPrizePoolRow): string {
  if (pool.total_amount_mode === "per_entrant" && pool.pot_entry_value_pence != null) {
    return `${formatPenceGbp(pool.pot_entry_value_pence)} entry`;
  }
  return "—";
}

const SPLITTER_RULE_LABELS = ["Front 9", "Back 9", "Birdies", "Overall"] as const;

function splitterRulesConcise(rules: EventPrizePoolRuleRow[]): string {
  const sorted = [...rules].sort((a, b) => a.position - b.position);
  return sorted
    .map((r, i) => {
      const pct = r.percentage_basis_points / 100;
      const label = SPLITTER_RULE_LABELS[i] ?? `Pos ${r.position}`;
      return `${label} ${pct}%`;
    })
    .join(" • ");
}

function standardPayoutLines(rules: EventPrizePoolRuleRow[]): string[] {
  const sorted = [...rules].sort((a, b) => a.position - b.position);
  return sorted.map((r) => {
    const pct = r.percentage_basis_points / 100;
    const ord =
      r.position === 1 ? "1st" : r.position === 2 ? "2nd" : r.position === 3 ? "3rd" : `${r.position}th`;
    return `${ord}: ${pct}%`;
  });
}

export function DashboardPrizePoolHomeCard({
  eventId,
  myMemberId,
  managerName,
  paymentInstructions,
  poolRows,
  loading,
  onChanged,
}: Props) {
  const colors = getColors();
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const setOptIn = async (poolId: string, yes: boolean) => {
    if (!eventId || busy) return;
    setBusy(true);
    try {
      await upsertMyPrizePoolOptIn(poolId, myMemberId, yes);
      onChanged();
    } catch (e: unknown) {
      console.error("[DashboardPrizePoolHomeCard]", e);
      Alert.alert("Could not save", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const toggleExpanded = (poolId: string) => {
    setExpanded((p) => ({ ...p, [poolId]: !p[poolId] }));
  };

  return (
    <AppCard style={[styles.card, { borderColor: `${colors.primary}30`, backgroundColor: `${colors.primary}06` }]}>
      <View style={styles.headerRow}>
        <View style={[styles.iconWrap, { backgroundColor: `${colors.primary}18` }]}>
          <Feather name="award" size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="captionBold" color="primary">
            Prize Pools
          </AppText>
          <AppText variant="small" color="secondary" style={{ marginTop: 2 }}>
            Optional extras for this event
          </AppText>
        </View>
      </View>

      {loading ? (
        <AppText variant="small" color="secondary" style={{ marginTop: spacing.sm }}>
          Loading…
        </AppText>
      ) : poolRows.length === 0 ? (
        <AppText variant="small" color="secondary" style={{ marginTop: spacing.sm }}>
          No prize pool competitions for this event yet.
        </AppText>
      ) : (
        <>
          {poolRows.map(({ pool, entry, rules, hasPublishedResults, myResult }) => {
            const compName = (pool.competition_name || pool.name || "Prize pool").trim();
            const status = entryStatusLabel(entry);
            const optedIn = entry?.opted_in === true;
            const isOpen = expanded[pool.id] === true;

            return (
              <View
                key={pool.id}
                style={[
                  styles.poolBlock,
                  { borderColor: colors.borderLight, backgroundColor: colors.background },
                ]}
              >
                <View style={styles.compactRow}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText variant="captionBold" numberOfLines={2}>
                      {compName}
                    </AppText>
                    <AppText variant="caption" color="secondary" numberOfLines={1} style={{ marginTop: 2 }}>
                      Pot Master: {managerName ?? "—"}
                    </AppText>
                  </View>
                  <View
                    style={[
                      styles.badge,
                      {
                        borderColor:
                          status.tone === "primary" ? colors.primary : `${colors.textSecondary}40`,
                        backgroundColor:
                          status.tone === "primary" ? `${colors.primary}14` : `${colors.textSecondary}08`,
                      },
                    ]}
                  >
                    <AppText
                      variant="caption"
                      color={status.tone === "muted" ? "secondary" : status.tone === "primary" ? "primary" : "secondary"}
                      numberOfLines={1}
                    >
                      {status.text}
                    </AppText>
                  </View>
                </View>

                <View style={styles.compactRow}>
                  <AppText variant="caption" color="secondary">
                    {entryValueLine(pool)}
                  </AppText>
                  <View style={styles.actions}>
                    <SecondaryButton
                      size="sm"
                      loading={busy}
                      disabled={busy}
                      onPress={() => void setOptIn(pool.id, true)}
                      style={optedIn ? { borderWidth: 2, borderColor: colors.primary } : undefined}
                    >
                      Yes
                    </SecondaryButton>
                    <SecondaryButton
                      size="sm"
                      loading={busy}
                      disabled={busy}
                      onPress={() => void setOptIn(pool.id, false)}
                      style={
                        entry && !entry.opted_in ? { borderWidth: 2, borderColor: colors.primary } : undefined
                      }
                    >
                      No
                    </SecondaryButton>
                  </View>
                </View>

                <Pressable
                  onPress={() => toggleExpanded(pool.id)}
                  style={styles.detailsToggle}
                  hitSlop={8}
                >
                  <AppText variant="captionBold" color="primary">
                    {isOpen ? "Hide details" : "Show details"}
                  </AppText>
                  <Feather name={isOpen ? "chevron-up" : "chevron-down"} size={16} color={colors.primary} />
                </Pressable>

                {isOpen ? (
                  <View style={styles.detailsBody}>
                    {pool.notes ? (
                      <View style={{ marginBottom: spacing.sm }}>
                        <AppText variant="captionBold" color="secondary">
                          Notes from Pot Master
                        </AppText>
                        <AppText variant="small" style={{ marginTop: 4 }}>
                          {pool.notes}
                        </AppText>
                      </View>
                    ) : null}

                    <AppText variant="caption" color="secondary">
                      Total pot: {formatPenceGbp(pool.total_amount_pence)}
                      {pool.total_amount_mode === "per_entrant" ? " (updates when entrants are confirmed)" : ""}
                    </AppText>

                    {pool.competition_type === "splitter" ? (
                      <AppText variant="small" color="secondary" style={{ marginTop: spacing.xs }}>
                        {splitterRulesConcise(rules)}
                      </AppText>
                    ) : (
                      <>
                        <AppText variant="caption" color="secondary" style={{ marginTop: spacing.xs }}>
                          Places paying: {pool.places_paid}
                        </AppText>
                        {standardPayoutLines(rules).length ? (
                          <AppText variant="small" color="secondary" style={{ marginTop: 4 }}>
                            {standardPayoutLines(rules).join(" · ")}
                          </AppText>
                        ) : null}
                      </>
                    )}

                    {paymentInstructions ? (
                      <View style={{ marginTop: spacing.sm }}>
                        <AppText variant="captionBold" color="secondary">
                          Payment instructions
                        </AppText>
                        <AppText variant="small" style={{ marginTop: 4 }}>
                          {paymentInstructions}
                        </AppText>
                      </View>
                    ) : null}

                    {hasPublishedResults ? (
                      <AppText variant="small" color="primary" style={{ marginTop: spacing.sm }}>
                        {myResult
                          ? `Your result: Position ${myResult.finishing_position} · ${formatPenceGbp(myResult.payout_amount_pence)}`
                          : "Your result: not in paying positions"}
                      </AppText>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </>
      )}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.base,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  poolBlock: {
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
  compactRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    maxWidth: "42%",
  },
  actions: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  detailsToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: spacing.sm,
    alignSelf: "flex-start",
  },
  detailsBody: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(128,128,128,0.25)",
  },
});
