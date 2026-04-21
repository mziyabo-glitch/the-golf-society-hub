/**
 * Event gross-scoring leaderboard — data from {@link getEventScoringLeaderboard} only.
 */

import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";

import { EventScoringLeaderboardView } from "@/components/scoring/EventScoringLeaderboardView";
import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { goBack } from "@/lib/navigation";
import { getEvent } from "@/lib/db_supabase/eventRepo";
import { getEventResultsForSociety } from "@/lib/db_supabase/resultsRepo";
import { getEventScoringLeaderboard } from "@/lib/services/eventPlayerScoringService";
import { scoringPublishStatusFromEvent } from "@/lib/services/publishEventScoringService";
import { loadEventScoringContext } from "@/lib/scoring/loadEventScoringContext";
import { isOfficialScoringPublished } from "@/lib/scoring/eventScoringPublishStatus";
import type { ScoringOfficialUiKind } from "@/lib/scoring/scoringOfficialUi";
import { scoringLeaderboardStatusExplainer, scoringOfficialUiKind } from "@/lib/scoring/scoringOfficialUi";
import type { LeaderboardRow } from "@/types/eventPlayerScoring";
import { useBootstrap } from "@/lib/useBootstrap";
import { usePaidAccess } from "@/lib/access/usePaidAccess";
import { getMembersByIds } from "@/lib/db_supabase/memberRepo";
import type { EventFormat } from "@/lib/scoring/eventFormat";
import { spacing } from "@/lib/ui/theme";

export default function EventGrossScoresLeaderboardScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const eventId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { societyId, loading: bootstrapLoading } = useBootstrap();
  const { needsLicence } = usePaidAccess();

  const [premiumLiveBlocked, setPremiumLiveBlocked] = useState(false);
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [fmt, setFmt] = useState<EventFormat | null>(null);
  const [playerNames, setPlayerNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [publishStatusLine, setPublishStatusLine] = useState<string | null>(null);
  const [oomPointsByPlayerId, setOomPointsByPlayerId] = useState<Record<string, number>>({});
  const [officialUiKind, setOfficialUiKind] = useState<ScoringOfficialUiKind>("draft");
  const [isOomEvent, setIsOomEvent] = useState(false);

  const load = useCallback(async () => {
    if (!eventId) {
      setError("Missing event.");
      setLoading(false);
      return;
    }
    setError(null);
    try {
      setPremiumLiveBlocked(false);
      const ev = await getEvent(eventId);
      if (!ev?.id) {
        setError("Event not found.");
        return;
      }
      const st = scoringPublishStatusFromEvent(ev);
      const published = isOfficialScoringPublished(st);

      if (!published && needsLicence) {
        setPremiumLiveBlocked(true);
        setFmt(null);
        setRows([]);
        setPlayerNames({});
        setOomPointsByPlayerId({});
        setPublishStatusLine(null);
        const isOom = Boolean(ev?.isOOM ?? ev?.classification === "oom");
        setIsOomEvent(isOom);
        setOfficialUiKind(scoringOfficialUiKind(ev?.scoring_results_status ?? ev?.scoringResultsStatus));
        return;
      }

      const [ctx, board] = await Promise.all([loadEventScoringContext(eventId), getEventScoringLeaderboard(eventId)]);
      setFmt(ctx.format);
      setRows(board);
      const isOom = Boolean(ev?.isOOM ?? ev?.classification === "oom");
      setIsOomEvent(isOom);
      const hasAnySavedRound = board.some((r) => r.holes_played > 0);
      const uiKind = scoringOfficialUiKind(ev?.scoring_results_status ?? ev?.scoringResultsStatus);
      setOfficialUiKind(uiKind);
      setPublishStatusLine(
        scoringLeaderboardStatusExplainer(uiKind, { isOomEvent: isOom, hasAnySavedRound }),
      );
      if (published && societyId && isOom) {
        const res = await getEventResultsForSociety(eventId, societyId).catch(() => []);
        const map: Record<string, number> = {};
        for (const r of res) {
          if (r.member_id != null && String(r.member_id).length > 0) {
            map[String(r.member_id)] = Number(r.points) || 0;
          }
        }
        setOomPointsByPlayerId(map);
      } else {
        setOomPointsByPlayerId({});
      }
      const ids = [...new Set(board.map((r) => r.player_id))];
      if (ids.length) {
        const members = await getMembersByIds(ids);
        const map: Record<string, string> = {};
        for (const m of members) {
          const name = (m.displayName || m.display_name || m.name || "").trim();
          if (name) map[m.id] = name;
        }
        setPlayerNames(map);
      } else {
        setPlayerNames({});
      }
    } catch (e) {
      setPremiumLiveBlocked(false);
      setRows([]);
      setFmt(null);
      setPublishStatusLine(null);
      setOomPointsByPlayerId({});
      setIsOomEvent(false);
      setOfficialUiKind("draft");
      setError(e instanceof Error ? e.message : "Could not load leaderboard.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [eventId, societyId, needsLicence]);

  useFocusEffect(
    useCallback(() => {
      if (bootstrapLoading) return;
      setLoading(true);
      void load();
    }, [bootstrapLoading, load]),
  );

  if (bootstrapLoading || loading) {
    return (
      <Screen>
        <LoadingState message="Loading leaderboard…" />
      </Screen>
    );
  }

  if (premiumLiveBlocked) {
    return (
      <Screen>
        <View style={styles.header}>
          <SecondaryButton size="sm" label="Back" onPress={() => goBack(router)} />
        </View>
        <ScrollView contentContainerStyle={[styles.content, { paddingTop: spacing.md }]}>
          <EmptyState
            title="Live leaderboard is premium"
            message="While results are still open (draft), following the live order needs a society seat. Official published leaderboards stay free for everyone."
          />
          <PrimaryButton label="Unlock live scoring" onPress={() => router.push("/(app)/premium-scoring" as never)} />
        </ScrollView>
      </Screen>
    );
  }

  if (error || !fmt) {
    return (
      <Screen>
        <EmptyState title="Leaderboard unavailable" message={error ?? "Unknown error."} />
        <SecondaryButton label="Back" onPress={() => goBack(router)} style={{ marginTop: spacing.base }} />
      </Screen>
    );
  }

  const leaderboardColumnOpts =
    isOomEvent && officialUiKind === "published"
      ? { includeOomPointsColumn: true as const, oomPointsByPlayerId }
      : undefined;

  return (
    <Screen>
      <View style={styles.header}>
        <SecondaryButton size="sm" label="Back" onPress={() => goBack(router)} />
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
      >
        <View style={{ marginBottom: spacing.sm, gap: spacing.xs }}>
          <AppText variant="heading">Scoring leaderboard</AppText>
          <AppText variant="small" color="muted">
            Live order from gross entry · official placings / OOM from publish
          </AppText>
        </View>
        <InlineNotice
          variant="info"
          message="Order and ties are from saved round summaries. Incomplete cards are ranked after complete rounds."
        />
        {publishStatusLine ? <InlineNotice variant="info" message={publishStatusLine} style={{ marginTop: spacing.sm }} /> : null}
        <View style={{ marginTop: spacing.base }}>
          <EventScoringLeaderboardView
            format={fmt}
            rows={rows}
            playerNames={playerNames}
            officialKind={officialUiKind}
            columnOpts={leaderboardColumnOpts}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.base, paddingBottom: spacing.sm },
  content: { padding: spacing.base, paddingBottom: spacing.xl },
});
