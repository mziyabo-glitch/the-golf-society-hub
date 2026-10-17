/**
 * Gross score entry hub: pick a player from the scoring context (same roster as scoring engine).
 */

import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { SecondaryButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { goBack } from "@/lib/navigation";
import { getEvent } from "@/lib/db_supabase/eventRepo";
import { loadEventScoringContext } from "@/lib/scoring/loadEventScoringContext";
import type { EventScoringContext } from "@/lib/scoring/eventScoringTypes";
import { scoringOfficialBadgeLabel, scoringOfficialUiKind } from "@/lib/scoring/scoringOfficialUi";
import { isOfficialScoringPublished } from "@/lib/scoring/eventScoringPublishStatus";
import { scoringPublishStatusFromEvent } from "@/lib/services/publishEventScoringService";
import { getPermissionsForMember, isSecretary } from "@/lib/rbac";
import { useBootstrap } from "@/lib/useBootstrap";
import { usePaidAccess } from "@/lib/access/usePaidAccess";
import { getColors, iconSize, spacing } from "@/lib/ui/theme";

export default function EventGrossScoresHubScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const eventId = Array.isArray(params.id) ? params.id[0] : params.id;
  const colors = getColors();
  const { member, loading: bootstrapLoading } = useBootstrap();
  const permissions = getPermissionsForMember(member);
  const canEnterGrossScores = permissions.canManageHandicaps || isSecretary(member);
  const { needsLicence, guardPaidAction } = usePaidAccess();

  const [ctx, setCtx] = useState<EventScoringContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [officialKind, setOfficialKind] = useState<ReturnType<typeof scoringOfficialUiKind>>("draft");
  const [officialPublished, setOfficialPublished] = useState(false);

  const load = useCallback(async () => {
    if (!eventId) {
      setError("Missing event.");
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const [c, ev] = await Promise.all([loadEventScoringContext(eventId), getEvent(eventId)]);
      setCtx(c);
      setOfficialKind(scoringOfficialUiKind(ev?.scoring_results_status ?? ev?.scoringResultsStatus));
      setOfficialPublished(isOfficialScoringPublished(scoringPublishStatusFromEvent(ev)));
    } catch (e) {
      setCtx(null);
      setOfficialKind("draft");
      setOfficialPublished(false);
      setError(e instanceof Error ? e.message : "Could not load scoring context.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [eventId]);

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
        <LoadingState message="Loading players…" />
      </Screen>
    );
  }

  if (error || !ctx) {
    return (
      <Screen>
        <EmptyState title="Scoring not ready" message={error ?? "Unknown error."} />
        <SecondaryButton label="Back" onPress={() => goBack(router)} style={{ marginTop: spacing.base }} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.topBar}>
        <SecondaryButton size="sm" label="Back" onPress={() => goBack(router)} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <Pressable
            style={styles.leaderLink}
            onPress={() =>
              router.push({ pathname: "/(app)/event/[id]/gross-scores/leaderboard", params: { id: eventId } } as never)
            }
          >
            <AppText variant="bodyBold" color="primary">
              Leaderboard
            </AppText>
            <Feather name="chevron-right" size={iconSize.sm} color={colors.primary} />
          </Pressable>
          {canEnterGrossScores ? (
            <Pressable
              style={styles.leaderLink}
              onPress={() =>
                router.push({ pathname: "/(app)/event/[id]/gross-scores/publish", params: { id: eventId } } as never)
              }
            >
              <AppText variant="bodyBold" color="primary">
                Publish
              </AppText>
              <Feather name="chevron-right" size={iconSize.sm} color={colors.primary} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
      >
        <View style={[styles.titleRow, { marginBottom: spacing.xs }]}>
          <AppText variant="heading">Gross score entry</AppText>
          <StatusBadge
            label={scoringOfficialBadgeLabel(officialKind)}
            tone={officialKind === "published" ? "success" : "warning"}
          />
        </View>
        <AppText variant="small" color="muted" style={styles.sub}>
          Totals and ranks come from saved data (same engine as the leaderboard). Official placings / OOM apply only
          after publish. Choose a player to enter or edit their card.
        </AppText>

        {!canEnterGrossScores ? (
          <InlineNotice
            variant="info"
            message="Only Captain, Secretary, or Handicapper can enter gross scores (per society rules)."
          />
        ) : null}

        {ctx.players.map((p) => (
          <AppCard key={p.memberId} style={styles.card}>
            <Pressable
              disabled={!canEnterGrossScores}
              onPress={() => {
                if (!guardPaidAction()) return;
                router.push({
                  pathname: "/(app)/event/[id]/gross-scores/[playerId]",
                  params: { id: eventId!, playerId: p.memberId },
                } as never);
              }}
              style={styles.playerRow}
            >
              <View style={{ flex: 1 }}>
                <AppText variant="bodyBold">{p.displayName}</AppText>
                <AppText variant="caption" color="muted">
                  PH {p.playingHandicap != null ? Math.round(p.playingHandicap) : "—"}
                </AppText>
              </View>
              <Feather name="edit-3" size={20} color={canEnterGrossScores ? colors.primary : colors.textTertiary} />
            </Pressable>
          </AppCard>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
  },
  leaderLink: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  content: { padding: spacing.base, gap: spacing.sm, paddingBottom: spacing.xl },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  sub: { marginBottom: spacing.base },
  card: { padding: 0, overflow: "hidden" },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.base,
  },
});
