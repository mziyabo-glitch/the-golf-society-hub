import { useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { SecondaryButton } from "@/components/ui/Button";
import type {
  EventPrizePoolEntryRow,
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

function StatusBadgePill({
  text,
  tone,
}: {
  text: string;
  tone: "muted" | "primary" | "secondary";
}) {
  const colors = getColors();
  const borderColor =
    tone === "primary" ? colors.primary : tone === "secondary" ? `${colors.textSecondary}55` : `${colors.textTertiary}45`;
  const bg =
    tone === "primary" ? `${colors.primary}16` : tone === "secondary" ? `${colors.textSecondary}0D` : `${colors.textTertiary}0A`;
  const textColor: "secondary" | "primary" | "muted" =
    tone === "muted" ? "muted" : tone === "primary" ? "primary" : "secondary";

  return (
    <View style={[styles.statusPill, { borderColor, backgroundColor: bg }]}>
      <AppText variant="captionBold" color={textColor} numberOfLines={1}>
        {text}
      </AppText>
    </View>
  );
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
    <AppCard style={[styles.shellCard, { borderColor: `${colors.primary}34`, backgroundColor: `${colors.primary}07` }]}>
      <View style={styles.headerRow}>
        <View style={[styles.iconWrap, { backgroundColor: `${colors.primary}1A` }]}>
          <Feather name="award" size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText variant="bodyBold" style={{ color: colors.text }}>
            Pool entries
          </AppText>
          <AppText variant="small" color="secondary" style={{ marginTop: 4 }}>
            Tap Yes or No on each card; expand details for notes and payouts.
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
          {poolRows.map(({ pool, entry, rules, hasPublishedResults, myResult, confirmedEntrantCount, effectiveDisplayPotPence }, idx) => {
            const compName = (pool.competition_name || pool.name || "Prize pool").trim();
            const status = entryStatusLabel(entry);
            const hasEntry = entry != null;
            const selectedYes = entry?.opted_in === true;
            const selectedNo = hasEntry && entry.opted_in === false;
            const isOpen = expanded[pool.id] === true;
            const isPerEntrant = pool.total_amount_mode === "per_entrant";

            return (
              <View
                key={pool.id}
                style={[
                  styles.poolCard,
                  {
                    borderColor: selectedYes ? `${colors.primary}55` : colors.borderLight,
                    backgroundColor: colors.surface,
                    marginTop: idx === 0 ? spacing.sm : spacing.md,
                  },
                ]}
              >
                <View style={styles.poolHeaderRow}>
                  <AppText variant="bodyBold" style={{ color: colors.text, flex: 1, minWidth: 0 }} numberOfLines={2}>
                    {compName}
                  </AppText>
                  <StatusBadgePill text={status.text} tone={status.tone} />
                </View>

                <View style={styles.metaRow}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText variant="captionBold" color="muted">
                      Pot master
                    </AppText>
                    <AppText variant="small" color="secondary" numberOfLines={1} style={{ marginTop: 2 }}>
                      {managerName ?? "—"}
                    </AppText>
                  </View>
                  <View style={{ alignItems: "flex-end", maxWidth: "48%" }}>
                    <AppText variant="captionBold" color="muted">
                      Entry
                    </AppText>
                    <AppText variant="small" color="secondary" numberOfLines={1} style={{ marginTop: 2, fontWeight: "600" }}>
                      {entryValueLine(pool)}
                    </AppText>
                  </View>
                </View>

                <View style={styles.statsGrid}>
                  <View style={[styles.statBox, { borderColor: colors.borderLight, backgroundColor: colors.backgroundSecondary }]}>
                    <AppText variant="captionBold" color="muted">
                      PM confirmed
                    </AppText>
                    <AppText variant="title" style={{ color: colors.text, marginTop: 4 }}>
                      {confirmedEntrantCount}
                    </AppText>
                    <AppText variant="caption" color="secondary" style={{ marginTop: 2 }}>
                      entrants
                    </AppText>
                  </View>
                  <View style={[styles.statBox, { borderColor: colors.borderLight, backgroundColor: colors.backgroundSecondary }]}>
                    <AppText variant="captionBold" color="muted">
                      Total pot
                    </AppText>
                    <AppText variant="title" style={{ color: colors.primary, marginTop: 4 }} numberOfLines={1}>
                      {formatPenceGbp(effectiveDisplayPotPence)}
                    </AppText>
                    <AppText variant="caption" color="secondary" style={{ marginTop: 2 }} numberOfLines={1}>
                      {isPerEntrant ? "from entries" : "fixed pot"}
                    </AppText>
                  </View>
                </View>

                <AppText variant="captionBold" color="muted" style={{ marginTop: spacing.md, marginBottom: spacing.xs }}>
                  Your entry
                </AppText>
                <View style={styles.actionRow}>
                  <SecondaryButton
                    size="md"
                    loading={busy}
                    disabled={busy}
                    onPress={() => void setOptIn(pool.id, true)}
                    style={{
                      ...styles.yesNoBtn,
                      ...(selectedYes
                        ? { borderWidth: 2, borderColor: colors.primary, backgroundColor: `${colors.primary}10` }
                        : {}),
                    }}
                  >
                    Yes
                  </SecondaryButton>
                  <SecondaryButton
                    size="md"
                    loading={busy}
                    disabled={busy}
                    onPress={() => void setOptIn(pool.id, false)}
                    style={{
                      ...styles.yesNoBtn,
                      ...(selectedNo
                        ? {
                            borderWidth: 2,
                            borderColor: colors.textSecondary,
                            backgroundColor: `${colors.textSecondary}12`,
                          }
                        : {}),
                    }}
                  >
                    No
                  </SecondaryButton>
                </View>

                <Pressable
                  onPress={() => toggleExpanded(pool.id)}
                  style={({ pressed }) => [
                    styles.detailsBar,
                    {
                      borderTopColor: colors.borderLight,
                      backgroundColor: `${colors.primary}06`,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={isOpen ? "Hide pool details" : "Show pool details"}
                >
                  <AppText variant="captionBold" color="primary">
                    {isOpen ? "Hide details" : "Show details"}
                  </AppText>
                  <Feather name={isOpen ? "chevron-up" : "chevron-down"} size={18} color={colors.primary} />
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
                      {isPerEntrant
                        ? `Total pot: ${formatPenceGbp(effectiveDisplayPotPence)} (${formatPenceGbp(pool.pot_entry_value_pence ?? 0)} × ${confirmedEntrantCount} confirmed)`
                        : `Total pot: ${formatPenceGbp(effectiveDisplayPotPence)} (manual fixed total)`}
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
  shellCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.base + 2,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  poolCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.base,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  poolHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  statusPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 1,
    maxWidth: "40%",
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
    marginTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(128,128,128,0.2)",
  },
  statsGrid: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  statBox: {
    flex: 1,
    borderRadius: radius.sm,
    borderWidth: 1,
    padding: spacing.sm,
    minHeight: 88,
  },
  actionRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  yesNoBtn: {
    flex: 1,
    minHeight: 48,
  },
  detailsBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
  },
  detailsBody: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
  },
});
