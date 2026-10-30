/**
 * Publish / reopen official results from stored gross leaderboard (never from unsaved draft).
 */

import { useCallback, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import { EventScoringLeaderboardView } from "@/components/scoring/EventScoringLeaderboardView";
import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { goBack } from "@/lib/navigation";
import { getEvent, type EventDoc } from "@/lib/db_supabase/eventRepo";
import { getMembersByIds } from "@/lib/db_supabase/memberRepo";
import { getEventResultsForSociety } from "@/lib/db_supabase/resultsRepo";
import { getEventScoringLeaderboard } from "@/lib/services/eventPlayerScoringService";
import {
  publishEventScoringResults,
  reopenEventScoringResults,
  scoringPublishStatusFromEvent,
} from "@/lib/services/publishEventScoringService";
import { canPublishScoringResults, canReopenScoringResults, isOfficialScoringPublished } from "@/lib/scoring/eventScoringPublishStatus";
import { scoringOfficialBadgeLabel, scoringOfficialUiKind } from "@/lib/scoring/scoringOfficialUi";
import { getPermissionsForMember, isSecretary } from "@/lib/rbac";
import { useBootstrap } from "@/lib/useBootstrap";
import { invalidateCache, invalidateCachePrefix } from "@/lib/cache/clientCache";
import type { LeaderboardRow } from "@/types/eventPlayerScoring";
import type { EventFormat } from "@/lib/scoring/eventFormat";
import { spacing } from "@/lib/ui/theme";

export default function EventGrossScoresPublishScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const eventId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { societyId, member, loading: bootstrapLoading } = useBootstrap();
  const permissions = getPermissionsForMember(member);
  const canManage = permissions.canManageHandicaps || isSecretary(member);

  const [event, setEvent] = useState<EventDoc | null>(null);
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [fmt, setFmt] = useState<EventFormat | null>(null);
  const [playerNames, setPlayerNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [oomPointsByPlayerId, setOomPointsByPlayerId] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    if (!eventId || !societyId) {
      setError("Missing event or society.");
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const [ev, board] = await Promise.all([getEvent(eventId), getEventScoringLeaderboard(eventId)]);
      setEvent(ev);
      setRows(board);
      setFmt((ev?.format as EventFormat) ?? "stableford");
      const st = scoringPublishStatusFromEvent(ev);
      const isOom = Boolean(ev?.isOOM ?? ev?.classification === "oom");
      if (isOfficialScoringPublished(st) && isOom) {
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
          const n = (m.displayName || m.display_name || m.name || "").trim();
          if (n) map[m.id] = n;
        }
        setPlayerNames(map);
      } else {
        setPlayerNames({});
      }
    } catch (e) {
      setEvent(null);
      setRows([]);
      setFmt(null);
      setError(e instanceof Error ? e.message : "Load failed.");
    } finally {
      setLoading(false);
    }
  }, [eventId, societyId]);

  useFocusEffect(
    useCallback(() => {
      if (bootstrapLoading) return;
      setLoading(true);
      void load();
    }, [bootstrapLoading, load]),
  );

  const status = scoringPublishStatusFromEvent(event);
  const officialKind = scoringOfficialUiKind(event?.scoring_results_status ?? event?.scoringResultsStatus);
  const isOomEvent = Boolean(event?.isOOM ?? event?.classification === "oom");
  const leaderboardColumnOpts =
    fmt && isOomEvent && isOfficialScoringPublished(status)
      ? { includeOomPointsColumn: true as const, oomPointsByPlayerId }
      : undefined;

  const runPublish = async () => {
    if (!eventId || !societyId) return;
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const summary = await publishEventScoringResults(eventId, societyId);
      const when = new Date(summary.publishedAt).toLocaleString("en-GB");
      setNotice(
        `Official results published (${summary.resultCount} row${summary.resultCount === 1 ? "" : "s"}). Version ${summary.publishVersion} · ${when}. Order of Merit totals now include this event.`,
      );
      await invalidateCache(`event:${eventId}:detail`);
      if (societyId) await invalidateCachePrefix(`society:${societyId}:`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publish failed.");
    } finally {
      setBusy(false);
    }
  };

  const requestPublish = () => {
    if (!eventId || !societyId) return;
    const title = "Publish official results?";
    const msg =
      `This writes official placings to event results for your society on “${event?.name ?? "this event"}”. ` +
      (isOomEvent
        ? "Order of Merit points are applied from this publish onward. "
        : "") +
      "To change scores later, use Reopen (clears official rows for your society until you publish again).";

    if (Platform.OS === "web") {
      const ok =
        typeof globalThis !== "undefined" &&
        typeof (globalThis as unknown as { confirm?: (s: string) => boolean }).confirm === "function" &&
        (globalThis as unknown as { confirm: (s: string) => boolean }).confirm(`${title}\n\n${msg}`);
      if (ok) void runPublish();
      return;
    }
    Alert.alert(title, msg, [
      { text: "Cancel", style: "cancel" },
      { text: "Publish", onPress: () => void runPublish() },
    ]);
  };

  const onReopen = () => {
    if (!eventId || !societyId) return;
    const run = async () => {
      setBusy(true);
      setNotice(null);
      setError(null);
      try {
        await reopenEventScoringResults(eventId, societyId);
        setNotice(
          "Scoring is back to Draft (reopened). Official event results for your society were removed from this event; Order of Merit no longer counts this round until you publish again. You can edit gross cards, then publish when ready.",
        );
        await invalidateCache(`event:${eventId}:detail`);
        if (societyId) await invalidateCachePrefix(`society:${societyId}:`);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Reopen failed.");
      } finally {
        setBusy(false);
      }
    };

    const msg =
      "This clears official event_results rows for your society only (joint events: other societies are unchanged). Status becomes Draft (reopened). Order of Merit will stop counting this event until you publish again. Gross hole scores you already entered stay in place.";

    if (Platform.OS === "web") {
      const ok =
        typeof globalThis !== "undefined" &&
        typeof (globalThis as unknown as { confirm?: (s: string) => boolean }).confirm === "function" &&
        (globalThis as unknown as { confirm: (s: string) => boolean }).confirm(`Reopen scoring?\n\n${msg}`);
      if (ok) void run();
      return;
    }
    Alert.alert("Reopen scoring?", msg, [
      { text: "Cancel", style: "cancel" },
      { text: "Reopen", style: "destructive", onPress: () => void run() },
    ]);
  };

  if (bootstrapLoading || loading) {
    return (
      <Screen>
        <LoadingState message="Loading…" />
      </Screen>
    );
  }

  if (error && !event) {
    return (
      <Screen>
        <EmptyState title="Unable to load" message={error} />
        <SecondaryButton label="Back" onPress={() => goBack(router)} style={{ marginTop: spacing.base }} />
      </Screen>
    );
  }

  if (!canManage) {
    return (
      <Screen>
        <EmptyState title="No access" message="Only Captain, Secretary, or Handicapper can publish results." />
        <SecondaryButton label="Back" onPress={() => goBack(router)} style={{ marginTop: spacing.base }} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <SecondaryButton size="sm" label="Back" onPress={() => goBack(router)} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="heading">Publish results</AppText>
        <AppText variant="small" color="muted" style={{ marginBottom: spacing.base }}>
          Official placings and OOM points are written to event results only from this screen. The table below is the
          same order as the gross leaderboard (stored summaries).
        </AppText>

        <AppCard style={{ marginBottom: spacing.base }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap", marginBottom: spacing.xs }}>
            <AppText variant="bodyBold">Results status</AppText>
            <StatusBadge
              label={scoringOfficialBadgeLabel(officialKind)}
              tone={officialKind === "published" ? "success" : "warning"}
            />
            <AppText variant="caption" color="muted">
              ({status})
            </AppText>
          </View>
          {isOfficialScoringPublished(status) && event?.scoringPublishedAt ? (
            <AppText variant="small" color="secondary">
              Last published: {new Date(String(event.scoringPublishedAt)).toLocaleString("en-GB")}
              {event.scoringPublishVersion != null ? ` · version ${event.scoringPublishVersion}` : ""}
            </AppText>
          ) : officialKind === "reopened" ? (
            <AppText variant="small" color="secondary">
              Draft again: publish when corrections are complete to restore official results and OOM linkage.
            </AppText>
          ) : (
            <AppText variant="small" color="secondary">
              Not yet official: publish when the gross leaderboard is final.
            </AppText>
          )}
        </AppCard>

        {error ? <InlineNotice variant="error" message={error} style={{ marginBottom: spacing.sm }} /> : null}
        {notice ? <InlineNotice variant="success" message={notice} style={{ marginBottom: spacing.sm }} /> : null}

        {fmt ? (
          <>
            <AppText variant="subheading" style={{ marginBottom: spacing.sm }}>
              Leaderboard (stored)
            </AppText>
            <EventScoringLeaderboardView
              format={fmt}
              rows={rows}
              playerNames={playerNames}
              officialKind={officialKind}
              columnOpts={leaderboardColumnOpts}
            />
          </>
        ) : null}

        <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
          {canPublishScoringResults(status) ? (
            <PrimaryButton
              label={busy ? "Working…" : "Publish official results"}
              onPress={() => void requestPublish()}
              disabled={busy}
              loading={busy}
            />
          ) : (
            <AppText variant="small" color="muted">
              Publish is only available from draft or reopened state.
            </AppText>
          )}

          {canReopenScoringResults(status) ? (
            <SecondaryButton label={busy ? "Working…" : "Reopen scoring (clear official)"} onPress={onReopen} disabled={busy} />
          ) : null}

          <Pressable onPress={() => router.push({ pathname: "/(app)/event/[id]/gross-scores/leaderboard", params: { id: eventId! } } as never)}>
            <AppText variant="bodyBold" color="primary">
              Open read-only leaderboard view
            </AppText>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.base, paddingBottom: spacing.sm },
  content: { padding: spacing.base, paddingBottom: spacing.xl },
});
