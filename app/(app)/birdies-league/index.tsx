/**
 * Birdies League — cumulative official birdies from the next unplayed event onward.
 */

import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { useBootstrap } from "@/lib/useBootstrap";
import { getPermissionsForMember } from "@/lib/rbac";
import { getColors, spacing, radius, iconSize } from "@/lib/ui/theme";
import { goBack } from "@/lib/navigation";
import { getEventsForSociety } from "@/lib/db_supabase/eventRepo";
import type { EventDoc } from "@/lib/db_supabase/eventRepo";
import {
  createBirdiesLeague,
  describeBirdiesLeagueStart,
  getActiveBirdiesLeague,
  getBirdiesLeagueStandings,
  scopeLabel,
  type BirdiesLeagueRow,
  type BirdiesLeagueStandingRow,
} from "@/lib/db_supabase/birdiesLeagueRepo";
import type { BirdiesLeagueEventScope } from "@/lib/birdiesLeague/eventEligibility";
import { findNextUnplayedEligibleBirdiesEvent } from "@/lib/birdiesLeague/eventEligibility";
import { formatEventDate } from "@/features/home/homeFormatters";
import { showAlert } from "@/lib/ui/alert";

function ordinalRank(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  if (n % 10 === 1) return `${n}st`;
  if (n % 10 === 2) return `${n}nd`;
  if (n % 10 === 3) return `${n}rd`;
  return `${n}th`;
}

export default function BirdiesLeagueScreen() {
  const { society, societyId, member } = useBootstrap();
  const router = useRouter();
  const navigation = useNavigation();
  const colors = getColors();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const canManage = getPermissionsForMember(member).canManageBirdiesLeague;

  const [events, setEvents] = useState<EventDoc[]>([]);
  const [league, setLeague] = useState<BirdiesLeagueRow | null>(null);
  const [standings, setStandings] = useState<BirdiesLeagueStandingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scopeDraft, setScopeDraft] = useState<BirdiesLeagueEventScope>("all_official");

  const handleBack = () => {
    if (navigation.canGoBack()) {
      goBack(router, "/(app)/(tabs)/settings");
    } else {
      router.replace("/(app)/(tabs)");
    }
  };

  const loadData = useCallback(async () => {
    if (!societyId) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const [evs, active] = await Promise.all([getEventsForSociety(societyId), getActiveBirdiesLeague(societyId)]);
      setEvents(evs);
      setLeague(active);
      if (active) {
        const rows = await getBirdiesLeagueStandings(societyId, active, evs);
        setStandings(rows);
      } else {
        setStandings([]);
      }
    } catch (err: unknown) {
      console.error("[birdies-league] load error:", err);
      setError(err instanceof Error ? err.message : "Failed to load Birdies League");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [societyId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      if (societyId) void loadData();
    }, [societyId, loadData]),
  );

  const nextStart = useMemo(
    () => findNextUnplayedEligibleBirdiesEvent(events, scopeDraft),
    [events, scopeDraft],
  );

  const startSummary = useMemo(() => {
    if (!league) return null;
    return describeBirdiesLeagueStart(league, events);
  }, [league, events]);

  const handleCreate = async () => {
    if (!societyId || creating) return;
    setCreating(true);
    try {
      const created = await createBirdiesLeague({ societyId, eventScope: scopeDraft });
      setLeague(created);
      const evs = events.length ? events : await getEventsForSociety(societyId);
      setEvents(evs);
      const rows = await getBirdiesLeagueStandings(societyId, created, evs);
      setStandings(rows);
      showAlert("Birdies League started", "The leaderboard will fill as official results are saved for each event.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not start league";
      showAlert("Could not start", msg);
    } finally {
      setCreating(false);
    }
  };

  if (!societyId) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <EmptyState title="No society" message="Join a society to use Birdies League." />
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <LoadingState message="Loading Birdies League…" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={["top", "left", "right"]}>
      <View style={styles.headerRow}>
        <Pressable onPress={handleBack} hitSlop={12} style={styles.backBtn}>
          <Feather name="arrow-left" size={iconSize.md} color={colors.text} />
        </Pressable>
        <AppText variant="h2" style={styles.headerTitle}>
          Birdies League
        </AppText>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: tabBarHeight + spacing.xl }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {
          setRefreshing(true);
          void loadData();
        }} />}
      >
        <AppText variant="small" color="secondary" style={{ marginBottom: spacing.md }}>
          {society?.name ?? "Society"}
        </AppText>

        {error ? (
          <InlineNotice variant="error" message={error} style={{ marginBottom: spacing.md }} />
        ) : null}

        <InlineNotice
          variant="info"
          message="Birdies totals use the official birdie count saved with event results (Captain/Handicapper). They are never inferred from gross score."
          style={{ marginBottom: spacing.md }}
        />

        {!league && canManage ? (
          <AppCard style={{ marginBottom: spacing.lg }}>
            <AppText variant="subheading" style={{ marginBottom: spacing.sm }}>
              Start Birdies League
            </AppText>
            <AppText variant="small" color="secondary" style={{ marginBottom: spacing.md }}>
              Counts only from the next unplayed event that matches your scope — nothing earlier is backfilled.
            </AppText>

            <AppText variant="captionBold" color="secondary" style={{ marginBottom: spacing.xs }}>
              Event scope
            </AppText>
            <View style={styles.scopeRow}>
              <Pressable
                onPress={() => setScopeDraft("all_official")}
                style={[
                  styles.scopeChip,
                  {
                    borderColor: scopeDraft === "all_official" ? colors.primary : colors.borderLight,
                    backgroundColor: scopeDraft === "all_official" ? colors.primary + "12" : colors.backgroundTertiary,
                  },
                ]}
              >
                <AppText variant="bodyBold">All official</AppText>
                <AppText variant="caption" color="secondary">
                  Excludes friendlies
                </AppText>
              </Pressable>
              <Pressable
                onPress={() => setScopeDraft("oom_only")}
                style={[
                  styles.scopeChip,
                  {
                    borderColor: scopeDraft === "oom_only" ? colors.primary : colors.borderLight,
                    backgroundColor: scopeDraft === "oom_only" ? colors.primary + "12" : colors.backgroundTertiary,
                  },
                ]}
              >
                <AppText variant="bodyBold">OOM only</AppText>
                <AppText variant="caption" color="secondary">
                  Order of Merit events
                </AppText>
              </Pressable>
            </View>

            <AppText variant="captionBold" color="secondary" style={{ marginTop: spacing.md, marginBottom: spacing.xs }}>
              Setup summary
            </AppText>
            {nextStart ? (
              <>
                <AppText variant="body">
                  Starts from:{" "}
                  <AppText variant="bodyBold">
                    {nextStart.name}
                    {nextStart.date ? ` · ${formatEventDate(nextStart.date)}` : ""}
                  </AppText>
                </AppText>
                <AppText variant="small" color="secondary" style={{ marginTop: spacing.xs }}>
                  Scope: {scopeLabel(scopeDraft)}
                </AppText>
              </>
            ) : (
              <AppText variant="body" color="warning">
                No unplayed event matches this scope. Add a future event or choose a different scope.
              </AppText>
            )}

            <PrimaryButton
              onPress={() => void handleCreate()}
              loading={creating}
              disabled={creating || !nextStart}
              style={{ marginTop: spacing.lg }}
            >
              Start Birdies League
            </PrimaryButton>
          </AppCard>
        ) : null}

        {!league && !canManage ? (
          <EmptyState
            title="No active Birdies League"
            message="Ask your Captain or Handicapper to start one from Settings → Birdies League."
          />
        ) : null}

        {league ? (
          <>
            <AppCard style={{ marginBottom: spacing.lg }}>
              <AppText variant="subheading" style={{ marginBottom: spacing.sm }}>
                {league.name}
              </AppText>
              {league.season_label ? (
                <AppText variant="small" color="secondary" style={{ marginBottom: spacing.xs }}>
                  {league.season_label}
                </AppText>
              ) : null}
              <AppText variant="body" style={{ marginTop: spacing.xs }}>
                Starts from:{" "}
                <AppText variant="bodyBold">
                  {startSummary?.title ?? "—"}
                  {startSummary?.subtitle ? ` · ${formatEventDate(startSummary.subtitle)}` : ""}
                </AppText>
              </AppText>
              <AppText variant="small" color="secondary" style={{ marginTop: spacing.xs }}>
                Scope: {scopeLabel(league.event_scope)}
              </AppText>
            </AppCard>

            <AppText variant="captionBold" color="primary" style={{ marginBottom: spacing.sm }}>
              Leaderboard
            </AppText>

            {standings.length === 0 ? (
              <AppCard>
                <AppText variant="body" color="secondary">
                  No official results yet for eligible completed events. Totals appear after scores (including birdie
                  counts) are saved on the event results screen.
                </AppText>
              </AppCard>
            ) : (
              <AppCard padding="xs">
                <View style={[styles.tableHeader, { borderBottomColor: colors.borderLight }]}>
                  <AppText variant="captionBold" style={styles.colRank}>
                    Rank
                  </AppText>
                  <AppText variant="captionBold" style={styles.colMember}>
                    Member
                  </AppText>
                  <AppText variant="captionBold" style={styles.colNum}>
                    Birdies
                  </AppText>
                  <AppText variant="captionBold" style={styles.colNum}>
                    Events
                  </AppText>
                </View>
                {standings.map((row) => (
                  <View
                    key={row.personKey}
                    style={[styles.tableRow, { borderBottomColor: colors.borderLight }]}
                  >
                    <AppText variant="small" style={styles.colRank}>
                      {ordinalRank(row.rank)}
                    </AppText>
                    <AppText variant="small" style={styles.colMember} numberOfLines={2}>
                      {row.displayName}
                    </AppText>
                    <AppText variant="small" style={styles.colNum}>
                      {row.totalBirdies}
                    </AppText>
                    <AppText variant="small" style={styles.colNum}>
                      {row.eventsCounted}
                    </AppText>
                  </View>
                ))}
              </AppCard>
            )}
          </>
        ) : null}

        {league && canManage ? (
          <SecondaryButton
            size="sm"
            onPress={() => router.push("/(app)/(tabs)/settings" as never)}
            style={{ marginTop: spacing.lg, alignSelf: "flex-start" }}
          >
            Society settings
          </SecondaryButton>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backBtn: { padding: spacing.xs },
  headerTitle: { flex: 1, textAlign: "center" },
  scroll: { paddingHorizontal: spacing.md },
  scopeRow: { flexDirection: "row", gap: spacing.sm },
  scopeChip: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  colRank: { width: 52 },
  colMember: { flex: 1, paddingRight: spacing.xs },
  colNum: { width: 56, textAlign: "right" },
});
