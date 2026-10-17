import { View, StyleSheet } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import type { EventPrizePoolResultRow, EventPrizePoolRow } from "@/lib/event-prize-pools-types";
import { formatPenceGbp } from "@/lib/db_supabase/eventPrizePoolRepo";
import { getColors, spacing, radius } from "@/lib/ui/theme";
import { EVENT_FORMATS, type EventFormat } from "@/lib/db_supabase/eventRepo";

const SPLITTER_CATEGORY_ORDER = [
  "Best Front 9",
  "Best Back 9",
  "Most Birdies",
  "Best Overall Score",
] as const;

function formatLabelForEvent(format: string | undefined): string {
  const f = (format ?? "stableford").toLowerCase();
  if (f === "medal") return "Medal";
  const hit = EVENT_FORMATS.find((x) => x.value === (f as EventFormat));
  return hit?.label ?? "Competition";
}

export function PrizePoolSummary(props: {
  pool: EventPrizePoolRow;
  results: EventPrizePoolResultRow[];
  eventFormat?: string;
  nameByMemberId: Map<string, string>;
  nameByGuestId?: Map<string, string>;
}) {
  const { pool, results, eventFormat, nameByMemberId, nameByGuestId } = props;
  const colors = getColors();
  const winners = results.filter((r) => r.payout_amount_pence > 0);
  const splitterRollNoteVisible = results.some((r) =>
    String(r.calculation_note ?? "").includes("birdie prize rolled into Best Overall Score"),
  );
  const isSplitter = pool.competition_type === "splitter";

  const byDivision = new Map<string | null, EventPrizePoolResultRow[]>();
  for (const r of results) {
    const k = r.division_name ?? null;
    if (!byDivision.has(k)) byDivision.set(k, []);
    byDivision.get(k)!.push(r);
  }

  const sections = [...byDivision.entries()].sort(([a], [b]) => {
    if (isSplitter) {
      const ai = SPLITTER_CATEGORY_ORDER.indexOf((a ?? "") as (typeof SPLITTER_CATEGORY_ORDER)[number]);
      const bi = SPLITTER_CATEGORY_ORDER.indexOf((b ?? "") as (typeof SPLITTER_CATEGORY_ORDER)[number]);
      if (ai !== -1 || bi !== -1) {
        const aa = ai === -1 ? 999 : ai;
        const bb = bi === -1 ? 999 : bi;
        return aa - bb;
      }
    }
    if (a == null && b == null) return 0;
    if (a == null) return -1;
    if (b == null) return 1;
    return a.localeCompare(b);
  });

  return (
    <View style={{ gap: spacing.md }}>
      <AppCard style={{ borderRadius: radius.md }}>
        <AppText variant="subheading" style={{ marginBottom: spacing.xs }}>
          Payout Summary
        </AppText>
        <AppText variant="caption" color="secondary" style={{ marginBottom: spacing.sm }}>
          Calculated from official event results · {formatLabelForEvent(eventFormat)}
        </AppText>
        <View style={styles.row}>
          <AppText variant="caption" color="secondary">
            Event pool
          </AppText>
          <AppText variant="bodyBold">{formatPenceGbp(pool.total_amount_pence)}</AppText>
        </View>
        <View style={styles.row}>
          <AppText variant="caption" color="secondary">
            Competition
          </AppText>
          <AppText variant="bodyBold">{pool.competition_name}</AppText>
        </View>
        <View style={styles.row}>
          <AppText variant="caption" color="secondary">
            Payout mode
          </AppText>
          <AppText variant="bodyBold">
            {isSplitter ? "Fixed Splitter categories" : pool.payout_mode === "overall" ? "Overall" : "Division"}
          </AppText>
        </View>
        <View style={styles.row}>
          <AppText variant="caption" color="secondary">
            Total mode
          </AppText>
          <AppText variant="bodyBold">
            {pool.total_amount_mode === "per_entrant" ? "Per entrant" : "Manual total"}
          </AppText>
        </View>
        <View style={styles.row}>
          <AppText variant="caption" color="secondary">
            Winners
          </AppText>
          <AppText variant="bodyBold">{winners.length}</AppText>
        </View>
        {splitterRollNoteVisible ? (
          <AppText variant="small" color="muted" style={{ marginTop: spacing.xs }}>
            Most Birdies rolled into Best Overall Score because no birdies were recorded.
          </AppText>
        ) : null}
      </AppCard>

      {sections.map(([divName, rows]) => (
        <AppCard key={divName ?? "overall"} style={{ borderRadius: radius.md }}>
          {divName != null && (
            <AppText variant="bodyBold" style={{ marginBottom: spacing.sm }}>
              {divName}
            </AppText>
          )}
          {[...rows]
            .sort((a, b) => {
              if (a.finishing_position !== b.finishing_position) return a.finishing_position - b.finishing_position;
              const ka = String(a.member_id ?? a.event_guest_id ?? a.id);
              const kb = String(b.member_id ?? b.event_guest_id ?? b.id);
              return ka.localeCompare(kb);
            })
            .map((r) => (
              <View
                key={`${r.id}`}
                style={[
                  styles.playerRow,
                  { borderBottomColor: colors.borderLight },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyBold">
                    {r.member_id
                      ? (nameByMemberId.get(String(r.member_id)) ?? "Member")
                      : r.event_guest_id
                        ? (nameByGuestId?.get(String(r.event_guest_id)) ?? "Guest")
                        : "—"}
                  </AppText>
                  <AppText variant="caption" color="secondary">
                    Position {r.finishing_position}
                    {r.tie_size > 1 ? ` · Tie ${r.tie_size}` : ""}
                  </AppText>
                  <AppText variant="caption" color="secondary">
                    {r.score_display ?? "—"}
                  </AppText>
                  {r.calculation_note ? (
                    <AppText variant="small" color="muted" style={{ marginTop: 4 }}>
                      {r.calculation_note}
                    </AppText>
                  ) : null}
                </View>
                <AppText variant="bodyBold" style={{ alignSelf: "center" }}>
                  {formatPenceGbp(r.payout_amount_pence)}
                </AppText>
              </View>
            ))}
        </AppCard>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  playerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
