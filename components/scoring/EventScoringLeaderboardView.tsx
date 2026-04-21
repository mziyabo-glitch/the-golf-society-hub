/**
 * Read-only leaderboard: consumes rows from {@link getEventScoringLeaderboard} — **no ranking** here.
 */

import { ScrollView, StyleSheet, View } from "react-native";

import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { EventFormat } from "@/lib/scoring/eventFormat";
import type { ScoringOfficialUiKind } from "@/lib/scoring/scoringOfficialUi";
import { scoringOfficialBadgeLabel } from "@/lib/scoring/scoringOfficialUi";
import {
  leaderboardColumnDefs,
  leaderboardRowCellArray,
  type LeaderboardColumnOptions,
  type LeaderboardRowCellOptions,
} from "@/lib/ui/eventScoringLeaderboardModel";
import type { LeaderboardRow } from "@/types/eventPlayerScoring";
import { getColors, spacing } from "@/lib/ui/theme";

type Props = {
  format: EventFormat;
  rows: readonly LeaderboardRow[];
  playerNames?: Readonly<Record<string, string>>;
  /** Draft vs official context for the strip above the table. */
  officialKind?: ScoringOfficialUiKind;
  /** When set with an OOM event, shows per-player OOM points from official `event_results`. */
  columnOpts?: LeaderboardColumnOptions & LeaderboardRowCellOptions;
};

function cellMinWidth(key: string): number {
  if (key === "player") return 132;
  if (key === "rank") return 44;
  if (key === "tie") return 40;
  if (key === "oom_points") return 72;
  if (key === "holes_played") return 56;
  if (key === "card") return 88;
  if (key === "stableford_points") return 84;
  return 72;
}

function podiumBackground(rank: number, eligible: boolean, colors: ReturnType<typeof getColors>): string | undefined {
  if (!eligible || rank < 1 || rank > 3) return undefined;
  if (rank === 1) return colors.highlightMuted;
  if (rank === 2) return colors.backgroundTertiary;
  return colors.success + "12";
}

export function EventScoringLeaderboardView({ format, rows, playerNames, officialKind, columnOpts }: Props) {
  const colors = getColors();
  const defs = leaderboardColumnDefs(format, columnOpts);
  const includeOom = Boolean(columnOpts?.includeOomPointsColumn);

  if (rows.length === 0) {
    return (
      <AppCard>
        <AppText variant="body" color="muted">
          No saved rounds yet. Enter gross scores to populate the leaderboard.
        </AppText>
      </AppCard>
    );
  }

  return (
    <View>
      {officialKind ? (
        <View style={[styles.statusStrip, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <StatusBadge
            label={scoringOfficialBadgeLabel(officialKind)}
            tone={officialKind === "published" ? "success" : "warning"}
          />
          {includeOom ? (
            <AppText variant="caption" color="muted" style={{ flex: 1, marginLeft: spacing.sm }}>
              OOM column shows society official points (after publish only).
            </AppText>
          ) : (
            <AppText variant="caption" color="muted" style={{ flex: 1, marginLeft: spacing.sm }}>
              Top three complete cards highlighted. Order is from saved summaries.
            </AppText>
          )}
        </View>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={styles.table}>
          <View style={[styles.row, styles.headerRow, { borderBottomColor: colors.border }]}>
            {defs.map((d) => (
              <View key={d.key} style={[styles.cell, { minWidth: cellMinWidth(d.key) }]}>
                <AppText variant="captionBold" color="muted">
                  {d.label}
                </AppText>
              </View>
            ))}
          </View>
          {rows.map((row) => {
            const cells = leaderboardRowCellArray(format, row, playerNames, columnOpts);
            const podiumBg = podiumBackground(row.rank, row.eligible_for_primary_rank, colors);
            return (
              <View
                key={row.player_id}
                style={[
                  styles.row,
                  { borderBottomColor: colors.border },
                  podiumBg ? { backgroundColor: podiumBg } : null,
                  !row.eligible_for_primary_rank ? { opacity: 0.78 } : null,
                ]}
              >
                {cells.map((text, i) => (
                  <View key={defs[i]!.key} style={[styles.cell, { minWidth: cellMinWidth(defs[i]!.key) }]}>
                    <AppText variant={defs[i]!.key === "player" ? "bodyBold" : "body"} numberOfLines={defs[i]!.key === "player" ? 2 : 1}>
                      {text}
                    </AppText>
                  </View>
                ))}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  statusStrip: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.sm,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.sm,
  },
  table: {
    paddingBottom: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm,
    paddingHorizontal: 2,
    borderRadius: 6,
  },
  headerRow: {
    paddingTop: 0,
    backgroundColor: "transparent",
  },
  cell: {
    paddingRight: spacing.sm,
  },
});
