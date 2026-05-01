import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { RetryErrorBlock } from "@/components/ui/RetryErrorBlock";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { SocietyBadge } from "@/components/ui/SocietyHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { scoringOfficialBadgeLabel, scoringOfficialUiKind } from "@/lib/scoring/scoringOfficialUi";
import { EVENT_CLASSIFICATIONS, EVENT_FORMATS, getEvent, type EventDoc } from "@/lib/db_supabase/eventRepo";
import { getEventGuests } from "@/lib/db_supabase/eventGuestRepo";
import { getEventRegistrations, type EventRegistration } from "@/lib/db_supabase/eventRegistrationRepo";
import { listEventPrizePools } from "@/lib/db_supabase/eventPrizePoolRepo";
import { getEventResultsForSociety } from "@/lib/db_supabase/resultsRepo";
import { getColors, iconSize, radius, spacing } from "@/lib/ui/theme";
import { useBootstrap } from "@/lib/useBootstrap";
import {
  canManageEventPaymentsForSociety,
  canManageEventRosterForSociety,
  getPermissionsForMember,
  isSecretary,
} from "@/lib/rbac";
import { isActiveSocietyParticipantForEvent } from "@/lib/jointEventAccess";
import { getJointEventDetail, mapJointEventToEventDoc } from "@/lib/db_supabase/jointEventRepo";
import { getCache, setCache } from "@/lib/cache/clientCache";

function formatEventDate(value?: string): string {
  if (!value?.trim()) return "Date TBD";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getMemberRegistration(regs: EventRegistration[], memberId?: string | null) {
  if (!memberId) return null;
  return regs.find((r) => String(r.member_id) === String(memberId)) ?? null;
}

type EventOverviewCache = {
  event: EventDoc;
  participantSocietyIds: string[];
  registrations: EventRegistration[];
  guestCount: number;
  hasResults: boolean;
  poolCount: number;
};

export default function EventOverviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const eventId = Array.isArray(params.id) ? params.id[0] : params.id;
  const colors = getColors();
  const navigation = useNavigation();
  const {
    loading: bootstrapLoading,
    society,
    societyId,
    member: currentMember,
    memberships,
  } = useBootstrap();

  const permissions = getPermissionsForMember(currentMember);
  const canEnterGrossScores = useMemo(
    () => permissions.canManageHandicaps || isSecretary(currentMember),
    [currentMember, permissions.canManageHandicaps],
  );
  const canAccessScorecardUi = canEnterGrossScores;
  const canManagePayments = canManageEventPaymentsForSociety(memberships, societyId);
  const canManageRoster = canManageEventRosterForSociety(memberships, societyId);
  const canManageEvent =
    permissions.canCreateEvents ||
    permissions.canManageHandicaps ||
    permissions.canDeleteEvents ||
    canManagePayments ||
    canManageRoster;

  const [event, setEvent] = useState<EventDoc | null>(null);
  const [participantSocietyIds, setParticipantSocietyIds] = useState<string[]>([]);
  const [registrations, setRegistrations] = useState<EventRegistration[]>([]);
  const [guestCount, setGuestCount] = useState(0);
  const [hasResults, setHasResults] = useState(false);
  const [poolCount, setPoolCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const eventRef = useRef<EventDoc | null>(null);
  eventRef.current = event;

  const overviewCacheKey = eventId ? `event:${eventId}:overview` : null;

  const applyOverviewCache = useCallback((payload: EventOverviewCache) => {
    setEvent(payload.event);
    setParticipantSocietyIds(payload.participantSocietyIds ?? []);
    setRegistrations(payload.registrations ?? []);
    setGuestCount(payload.guestCount ?? 0);
    setHasResults(payload.hasResults ?? false);
    setPoolCount(payload.poolCount ?? 0);
  }, []);

  const loadEventOverview = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!eventId) {
        setError("Missing event id.");
        setLoading(false);
        return;
      }

      const silent = !!opts?.silent;
      if (silent) {
        setRefreshing(true);
        setRefreshError(null);
      } else {
        setLoading(true);
        setError(null);
        setRefreshError(null);
      }

      try {
        let detail = await getEvent(eventId);
        let participants = (detail?.participant_society_ids ?? []).filter(Boolean);
        if (!detail) {
          const joint = await getJointEventDetail(eventId);
          if (!joint) {
            setError("Event not found.");
            setEvent(null);
            setLoading(false);
            setRefreshing(false);
            return;
          }
          detail = mapJointEventToEventDoc(joint.event) as EventDoc;
          participants = joint.participating_societies.map((s) => s.society_id).filter(Boolean);
        }
        setEvent(detail);
        setParticipantSocietyIds([...new Set(participants)]);

        const [allRegs, guests, pools, results] = await Promise.all([
          getEventRegistrations(eventId),
          getEventGuests(eventId),
          listEventPrizePools(eventId).catch(() => []),
          societyId ? getEventResultsForSociety(eventId, societyId).catch(() => []) : Promise.resolve([]),
        ]);

        const scopedRegs = societyId
          ? allRegs.filter((r) => String(r.society_id) === String(societyId))
          : allRegs;

        setRegistrations(scopedRegs);
        const scopedGuests = societyId
          ? guests.filter((g) => String(g.society_id) === String(societyId))
          : guests;
        const nextGuestCount = scopedGuests.length;
        const nextPoolCount = pools.length;
        const nextHasResults = results.length > 0;
        setGuestCount(nextGuestCount);
        setPoolCount(nextPoolCount);
        setHasResults(nextHasResults);

        const cachePayload: EventOverviewCache = {
          event: detail,
          participantSocietyIds: [...new Set(participants)],
          registrations: scopedRegs,
          guestCount: nextGuestCount,
          hasResults: nextHasResults,
          poolCount: nextPoolCount,
        };
        if (overviewCacheKey) {
          await setCache(overviewCacheKey, cachePayload, { ttlMs: 1000 * 60 * 30 });
        }
        setRefreshError(null);
        setError(null);
      } catch (e: any) {
        const msg = e?.message ?? "Failed to load event overview.";
        if (eventRef.current) {
          setRefreshError(msg);
        } else {
          setError(msg);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [eventId, societyId, overviewCacheKey],
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        if (!eventId) return;
        if (overviewCacheKey) {
          const cached = await getCache<EventOverviewCache>(overviewCacheKey, { maxAgeMs: 1000 * 60 * 60 * 24 });
          if (cancelled) return;
          if (cached?.value?.event) {
            applyOverviewCache(cached.value);
            setLoading(false);
            await loadEventOverview({ silent: true });
            return;
          }
        }
        if (cancelled) return;
        await loadEventOverview({ silent: false });
      })();
      return () => {
        cancelled = true;
      };
    }, [eventId, overviewCacheKey, applyOverviewCache, loadEventOverview]),
  );

  useEffect(() => {
    if (!event?.name) return;
    navigation.setOptions({ title: event.name });
  }, [event?.name, navigation]);

  const myRegistration = useMemo(
    () => getMemberRegistration(registrations, currentMember?.id),
    [registrations, currentMember?.id],
  );

  const attendanceSummary = useMemo(() => {
    const inCount = registrations.filter((r) => r.status === "in").length;
    const outCount = registrations.filter((r) => r.status === "out").length;
    const paidCount = registrations.filter((r) => r.paid).length;
    return { inCount, outCount, paidCount };
  }, [registrations]);

  const canViewTeeSheet = useMemo(() => {
    if (!event?.teeTimePublishedAt || !event.society_id || !societyId) return false;
    return isActiveSocietyParticipantForEvent(
      societyId,
      event.society_id,
      participantSocietyIds,
    );
  }, [event?.teeTimePublishedAt, event?.society_id, participantSocietyIds, societyId]);

  const canOpenWeatherFromEvent = useMemo(() => {
    if (!event?.society_id || !societyId) return false;
    return isActiveSocietyParticipantForEvent(
      societyId,
      event.society_id,
      participantSocietyIds,
    );
  }, [event?.society_id, participantSocietyIds, societyId]);

  const openEventWeatherForecast = useCallback(() => {
    if (!event) return;
    const courseId = (event.courseId ?? event.course_id ?? null) as string | null | undefined;
    const rawApi = (event as { api_course_id?: string | number | null }).api_course_id;
    const apiCourseId =
      typeof rawApi === "number" && Number.isFinite(rawApi)
        ? String(rawApi)
        : typeof rawApi === "string" && /^\d+$/.test(rawApi.trim())
          ? rawApi.trim()
          : undefined;
    const eventDate = event.date?.trim();
    const courseName = event.courseName?.trim();
    router.push({
      pathname: "/(app)/(tabs)/weather",
      params: {
        ...(courseId ? { courseId: String(courseId) } : {}),
        ...(apiCourseId && !courseId ? { apiCourseId } : {}),
        ...(eventDate && /^\d{4}-\d{2}-\d{2}$/.test(eventDate) ? { eventDate } : {}),
        ...(courseName ? { courseName } : {}),
      },
    } as never);
  }, [event, router]);

  const formatLabel =
    EVENT_FORMATS.find((f) => f.value === event?.format)?.label ?? event?.format ?? "Format TBD";
  const classificationLabel =
    EVENT_CLASSIFICATIONS.find((c) => c.value === event?.classification)?.label ??
    event?.classification ??
    "General";

  const scoringOfficialKind = useMemo(
    () => scoringOfficialUiKind(event?.scoring_results_status ?? event?.scoringResultsStatus),
    [event?.scoring_results_status, event?.scoringResultsStatus],
  );
  const scoringOverviewLine = useMemo(() => {
    const isOom = Boolean(event?.isOOM ?? event?.classification === "oom");
    if (scoringOfficialKind === "published") {
      return isOom
        ? "Gross-based results are official for your society on this event. Order of Merit includes this round."
        : "Gross-based results are official for your society on this event.";
    }
    if (scoringOfficialKind === "reopened") {
      return "Scoring is draft again (reopened). Official rows for your society were cleared; republish when the card is correct.";
    }
    return "Gross leaderboard is draft until Captain / Secretary / Handicapper publishes official results.";
  }, [event, scoringOfficialKind]);

  if ((bootstrapLoading || loading) && !event) {
    return (
      <Screen>
        <LoadingState message="Loading event overview..." />
      </Screen>
    );
  }

  if (!event && error) {
    return (
      <Screen>
        <RetryErrorBlock
          title="Unable to load event"
          message={error}
          onRetry={() => {
            setError(null);
            void loadEventOverview({ silent: false });
          }}
          retrying={loading || refreshing}
        />
      </Screen>
    );
  }

  if (!event) {
    return (
      <Screen>
        <EmptyState title="Event not found" message="This event is no longer available." />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void loadEventOverview({ silent: true });
            }}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {refreshError ? (
          <RetryErrorBlock
            title="Could not refresh"
            message={refreshError}
            staleHint="Showing the last loaded details below."
            onRetry={() => void loadEventOverview({ silent: true })}
            retrying={refreshing}
            style={{ marginBottom: spacing.md }}
          />
        ) : null}
        <View style={styles.topActions}>
          <SecondaryButton
            size="sm"
            onPress={() => router.push("/(app)/(tabs)/events")}
            icon={<Feather name="arrow-left" size={iconSize.sm} color={colors.primary} />}
          >
            Events
          </SecondaryButton>
          {canManageEvent ? (
            <SecondaryButton
              size="sm"
              onPress={() =>
                router.push({
                  pathname: "/(app)/event/[id]/manage",
                  params: { id: event.id },
                } as never)
              }
              icon={<Feather name="settings" size={iconSize.sm} color={colors.primary} />}
            >
              Manage Event
            </SecondaryButton>
          ) : null}
        </View>

        <AppCard style={styles.headerCard}>
          <View style={styles.headerTop}>
            <SocietyBadge
              societyName={String(society?.name ?? "Golf Society")}
              logoUrl={(society?.logo_url as string | null | undefined) ?? null}
              size="sm"
            />
            <View style={styles.badges}>
              <StatusBadge label={formatLabel} tone="info" />
              <StatusBadge label={classificationLabel} tone="neutral" />
            </View>
          </View>
          <AppText variant="h1" style={styles.eventTitle}>
            {event.name}
          </AppText>
          <View style={styles.metaRow}>
            <Feather name="map-pin" size={16} color={colors.textSecondary} />
            <AppText variant="body" color="secondary">
              {event.courseName?.trim() || "Course TBD"}
            </AppText>
          </View>
          <View style={styles.metaRow}>
            <Feather name="calendar" size={16} color={colors.textSecondary} />
            <AppText variant="body" color="secondary">
              {formatEventDate(event.date)}
            </AppText>
          </View>
        </AppCard>

        {canOpenWeatherFromEvent ? (
          <AppCard style={{ borderRadius: radius.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.xs }}>
              <Feather name="cloud" size={20} color={colors.primary} />
              <AppText variant="subheading">Playability</AppText>
            </View>
            <AppText variant="small" color="secondary" style={{ marginBottom: spacing.md }}>
              Check the 5-day forecast and best playing windows.
            </AppText>
            <PrimaryButton onPress={openEventWeatherForecast}>View forecast</PrimaryButton>
          </AppCard>
        ) : null}

        <AppCard>
          <AppText variant="subheading" style={styles.cardTitle}>
            Your event status
          </AppText>
          <View style={styles.statusGrid}>
            <View style={styles.statusItem}>
              <AppText variant="caption" color="muted">
                Playing
              </AppText>
              <StatusBadge
                label={myRegistration?.status === "in" ? "Yes" : "No"}
                tone={myRegistration?.status === "in" ? "success" : "warning"}
              />
            </View>
            <View style={styles.statusItem}>
              <AppText variant="caption" color="muted">
                Payment
              </AppText>
              <StatusBadge
                label={myRegistration?.paid ? "Paid" : "Unpaid"}
                tone={myRegistration?.paid ? "success" : "warning"}
              />
            </View>
            <View style={styles.statusItem}>
              <AppText variant="caption" color="muted">
                Attendance
              </AppText>
              <AppText variant="bodyBold">
                {attendanceSummary.inCount} in · {attendanceSummary.outCount} out
              </AppText>
            </View>
            <View style={styles.statusItem}>
              <AppText variant="caption" color="muted">
                Paid players
              </AppText>
              <AppText variant="bodyBold">
                {attendanceSummary.paidCount}
              </AppText>
            </View>
          </View>
          {guestCount > 0 ? (
            <AppText variant="small" color="muted" style={{ marginTop: spacing.sm }}>
              {guestCount} guest{guestCount === 1 ? "" : "s"} currently linked to this event.
            </AppText>
          ) : null}
        </AppCard>

        <AppCard>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap", marginBottom: spacing.xs }}>
            <AppText variant="subheading" style={{ marginBottom: 0 }}>
              Scoring status
            </AppText>
            <StatusBadge
              label={scoringOfficialBadgeLabel(scoringOfficialKind)}
              tone={scoringOfficialKind === "published" ? "success" : "warning"}
            />
          </View>
          <AppText variant="small" color="secondary">
            {scoringOverviewLine}
          </AppText>
        </AppCard>

        <AppCard>
          <AppText variant="subheading" style={styles.cardTitle}>
            Quick actions
          </AppText>
          <View style={styles.actionsStack}>
            <Pressable
              style={styles.quickAction}
              onPress={() =>
                router.push({
                  pathname: "/(app)/event/[id]/players",
                  params: { id: event.id },
                } as never)
              }
            >
              <View style={styles.quickActionLeft}>
                <Feather name="users" size={18} color={colors.primary} />
                <View>
                  <AppText variant="bodyBold">Players</AppText>
                  <AppText variant="small" color="secondary">
                    View player and attendee list
                  </AppText>
                </View>
              </View>
              <Feather name="chevron-right" size={18} color={colors.textTertiary} />
            </Pressable>

            {canAccessScorecardUi ? (
              <Pressable
                style={styles.quickAction}
                onPress={() =>
                  router.push({
                    pathname: "/(app)/event/[id]/gross-scores/leaderboard",
                    params: { id: event.id },
                  } as never)
                }
              >
                <View style={styles.quickActionLeft}>
                  <Feather name="list" size={18} color={colors.primary} />
                  <View>
                    <AppText variant="bodyBold">Scoring leaderboard</AppText>
                    <AppText variant="small" color="secondary">
                      Gross-based order (Draft vs Official shown on screen)
                    </AppText>
                  </View>
                </View>
                <Feather name="chevron-right" size={18} color={colors.textTertiary} />
              </Pressable>
            ) : null}

            {canEnterGrossScores ? (
              <Pressable
                style={styles.quickAction}
                onPress={() =>
                  router.push({
                    pathname: "/(app)/event/[id]/gross-scores",
                    params: { id: event.id },
                  } as never)
                }
              >
                <View style={styles.quickActionLeft}>
                  <Feather name="edit-3" size={18} color={colors.success} />
                  <View>
                    <AppText variant="bodyBold">Gross score entry</AppText>
                    <AppText variant="small" color="secondary">
                      Enter or edit per-hole gross scores
                    </AppText>
                  </View>
                </View>
                <Feather name="chevron-right" size={18} color={colors.textTertiary} />
              </Pressable>
            ) : null}

            {canEnterGrossScores ? (
              <Pressable
                style={styles.quickAction}
                onPress={() =>
                  router.push({
                    pathname: "/(app)/event/[id]/gross-scores/publish",
                    params: { id: event.id },
                  } as never)
                }
              >
                <View style={styles.quickActionLeft}>
                  <Feather name="check-circle" size={18} color={colors.primary} />
                  <View>
                    <AppText variant="bodyBold">Publish scoring results</AppText>
                    <AppText variant="small" color="secondary">
                      Write official placings from the gross leaderboard
                    </AppText>
                  </View>
                </View>
                <Feather name="chevron-right" size={18} color={colors.textTertiary} />
              </Pressable>
            ) : null}

            {canViewTeeSheet ? (
              <Pressable
                style={styles.quickAction}
                onPress={() =>
                  router.push({
                    pathname: "/(app)/event/[id]/tee-sheet",
                    params: { id: event.id },
                  } as never)
                }
              >
                <View style={styles.quickActionLeft}>
                  <Feather name="flag" size={18} color={colors.success} />
                  <View>
                    <AppText variant="bodyBold">Tee Sheet</AppText>
                    <AppText variant="small" color="secondary">
                      Published tee sheet is available
                    </AppText>
                  </View>
                </View>
                <Feather name="chevron-right" size={18} color={colors.textTertiary} />
              </Pressable>
            ) : null}

            {(hasResults || permissions.canManageHandicaps) ? (
              <Pressable
                style={styles.quickAction}
                onPress={() =>
                  router.push({
                    pathname: "/(app)/event/[id]/points",
                    params: { id: event.id },
                  } as never)
                }
              >
                <View style={styles.quickActionLeft}>
                  <Feather name="bar-chart-2" size={18} color={colors.warning} />
                  <View>
                    <AppText variant="bodyBold">
                      {permissions.canManageHandicaps ? "Enter Results" : "Event Results"}
                    </AppText>
                    <AppText variant="small" color="secondary">
                      {permissions.canManageHandicaps
                        ? "Manage official points and placements"
                        : "View official scoring progress"}
                    </AppText>
                  </View>
                </View>
                <Feather name="chevron-right" size={18} color={colors.textTertiary} />
              </Pressable>
            ) : null}

            {event.prizePoolEnabled ? (
              <Pressable
                style={styles.quickAction}
                onPress={() =>
                  router.push({
                    pathname: "/(app)/event/[id]/prize-pools",
                    params: { id: event.id },
                  } as never)
                }
              >
                <View style={styles.quickActionLeft}>
                  <Feather name="award" size={18} color={colors.primary} />
                  <View>
                    <AppText variant="bodyBold">Prize Pool</AppText>
                    <AppText variant="small" color="secondary">
                      {poolCount > 0 ? `${poolCount} pool${poolCount === 1 ? "" : "s"} configured` : "Prize pools enabled"}
                    </AppText>
                  </View>
                </View>
                <Feather name="chevron-right" size={18} color={colors.textTertiary} />
              </Pressable>
            ) : null}
          </View>
        </AppCard>

        {!canViewTeeSheet ? (
          <AppCard style={styles.compactNotice}>
            <AppText variant="small" color="secondary">
              Tee sheet access appears here once it has been published for your society view.
            </AppText>
          </AppCard>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.base,
    paddingBottom: spacing.xl,
  },
  topActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  headerCard: {
    gap: spacing.sm,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: spacing.xs,
  },
  eventTitle: {
    marginTop: spacing.xs,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  cardTitle: {
    marginBottom: spacing.sm,
  },
  statusGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  statusItem: {
    minWidth: "46%",
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    borderColor: "rgba(0,0,0,0.08)",
    padding: spacing.sm,
    gap: spacing.xs,
  },
  actionsStack: {
    gap: spacing.sm,
  },
  quickAction: {
    borderWidth: 1,
    borderRadius: radius.md,
    borderColor: "rgba(0,0,0,0.08)",
    padding: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  quickActionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  compactNotice: {
    borderStyle: "dashed",
  },
});
