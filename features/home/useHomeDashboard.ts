import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";

import { isCaptain, canManageEventPaymentsForSociety } from "@/lib/rbac";
import { supabase } from "@/lib/supabase";
import { getEventsForSociety, type EventDoc } from "@/lib/db_supabase/eventRepo";
import { getMembersBySocietyId, getMembersByIds, type MemberDoc } from "@/lib/db_supabase/memberRepo";
import { buildSocietyIdToNameMap } from "@/lib/jointEventSocietyLabel";
import {
  loadCanonicalTeeSheet,
  findMemberGroupInfoFromCanonical,
  type CanonicalTeeSheetResult,
} from "@/lib/teeSheet/canonicalTeeSheet";
import {
  getOrderOfMeritTotals,
  getEventResults,
  type OrderOfMeritEntry,
  type EventResultDoc,
} from "@/lib/db_supabase/resultsRepo";
import {
  getActiveBirdiesLeague,
  getBirdiesLeagueStandings,
  pickBirdiesStandingForMember,
  type BirdiesLeagueRow,
  type BirdiesLeagueStandingRow,
} from "@/lib/db_supabase/birdiesLeagueRepo";
import { getColors, spacing } from "@/lib/ui/theme";
import { formatError, type FormattedError } from "@/lib/ui/formatError";
import { isActiveSocietyParticipantForEvent, isJointEventFromMeta } from "@/lib/jointEventAccess";
import { getMySinbooks, type SinbookWithParticipants } from "@/lib/db_supabase/sinbookRepo";
import {
  getMyRegistration,
  getEventRegistrations,
  scopeEventRegistrations,
  summarizeEventRegistrations,
  setMyStatus,
  markMePaid,
  type EventRegistration,
} from "@/lib/db_supabase/eventRegistrationRepo";
import { getEventGuests } from "@/lib/db_supabase/eventGuestRepo";
import {
  listEventPrizePoolResults,
  listEventPrizePools,
  getEventPrizePoolManagerInfo,
  getMyPrizePoolEntry,
  getEventPrizePoolRules,
  getConfirmedPrizePoolEntrantCountForDisplay,
} from "@/lib/db_supabase/eventPrizePoolRepo";
import type { HomePrizePoolRowVm } from "@/lib/event-prize-pools-types";
import { derivePrizePoolTotalAmountPence } from "@/lib/event-prize-pools-calc";
import { blurWebActiveElement } from "@/lib/ui/focus";
import { getCache, setCache } from "@/lib/cache/clientCache";
import { useBootstrap } from "@/lib/useBootstrap";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { getSocietyLogoUrl } from "@/lib/societyLogo";
import { measureAsync } from "@/lib/perf/perf";
import { buildRecentActivityRows } from "./homeRecentActivityVm";
import {
  formatRole,
  formatPoints,
  formatEventDate,
  formatShortDate,
  formatFormatLabel,
  formatClassification,
} from "./homeFormatters";
import type { LatestResultsSnapshot } from "./components/HomeLatestResultsCard";

export function useHomeDashboard() {
  const router = useRouter();
  const { society, member, societyId, memberships, profile, userId, loading: bootstrapLoading } =
    useBootstrap();
  const colors = getColors();
  const tabBarHeight = useBottomTabBarHeight();
  const reduceMotion = useReducedMotion();
  const tabContentStyle = {
    paddingTop: spacing.lg,
    paddingBottom: tabBarHeight + spacing.lg,
  };

  // Data state
  const [events, setEvents] = useState<EventDoc[]>([]);
  const [members, setMembers] = useState<MemberDoc[]>([]);
  const [oomStandings, setOomStandings] = useState<OrderOfMeritEntry[]>([]);
  const [birdiesLeague, setBirdiesLeague] = useState<BirdiesLeagueRow | null>(null);
  const [birdiesStandings, setBirdiesStandings] = useState<BirdiesLeagueStandingRow[]>([]);
  const [recentResultsMap, setRecentResultsMap] = useState<Record<string, EventResultDoc[]>>({});
  const [dataLoading, setDataLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<FormattedError | null>(null);
  const [activeSinbook, setActiveSinbook] = useState<SinbookWithParticipants | null>(null);

  // Event registration state
  const [myReg, setMyReg] = useState<EventRegistration | null>(null);
  const [nextEventAttendance, setNextEventAttendance] = useState<{
    attendingCount: number;
    guestCount: number;
  }>({ attendingCount: 0, guestCount: 0 });
  const [canonicalNextEventTee, setCanonicalNextEventTee] = useState<CanonicalTeeSheetResult | null>(null);
  /** Joint events: member rows for all societies in canonical groups (home only loads active society by default). */
  const [jointTeeMemberAugment, setJointTeeMemberAugment] = useState<MemberDoc[]>([]);
  const [regBusy, setRegBusy] = useState(false);
  const [latestGuestNameMap, setLatestGuestNameMap] = useState<Record<string, string>>({});

  // Licence banner state
  const [requestSending, setRequestSending] = useState(false);
  const [requestAlreadySent, setRequestAlreadySent] = useState(false);
  const [licenceToast, setLicenceToast] = useState<{ visible: boolean; message: string; type: "success" | "error" | "info" }>({
    visible: false, message: "", type: "success",
  });

  const profileComplete = profile?.profile_complete === true;

  const memberHasSeat = (member as any)?.has_seat === true;
  const memberIsCaptain = isCaptain(member as any);
  const showLicenceBanner = !!societyId && !!member && !memberHasSeat && !memberIsCaptain;

  // Check for existing pending request on mount
  useEffect(() => {
    if (!societyId || !member || memberHasSeat || memberIsCaptain) return;
    supabase
      .from("licence_requests")
      .select("id")
      .eq("society_id", societyId)
      .eq("requester_user_id", (member as any)?.user_id)
      .eq("status", "pending")
      .maybeSingle()
      .then(({ data }) => {
        if (data) setRequestAlreadySent(true);
      });
  }, [societyId, member, memberHasSeat, memberIsCaptain]);

  const handleRequestAccess = async () => {
    if (!societyId || requestSending) return;
    setRequestSending(true);
    try {
      const { error } = await supabase.rpc("create_licence_request", {
        p_society_id: societyId,
      });
      if (error) {
        if (error.message?.includes("already have a licence")) {
          setLicenceToast({ visible: true, message: "You already have a licence!", type: "info" });
        } else {
          setLicenceToast({ visible: true, message: error.message || "Failed to send request.", type: "error" });
        }
        return;
      }
      setRequestAlreadySent(true);
      setLicenceToast({ visible: true, message: "Request sent to your Captain.", type: "success" });
    } catch (e: any) {
      setLicenceToast({ visible: true, message: e?.message || "Something went wrong.", type: "error" });
    } finally {
      setRequestSending(false);
    }
  };

  // ============================================================================
  // Data Loading
  // ============================================================================

  const cacheKey = societyId ? `society:${societyId}:home-summary` : null;
  const lastLoadAtRef = useRef(0);

  const loadData = useCallback(async () => {
    if (!societyId || (!memberHasSeat && !memberIsCaptain)) {
      setDataLoading(false);
      return;
    }

    if (Date.now() - lastLoadAtRef.current < 5000) return;
    lastLoadAtRef.current = Date.now();
    setRefreshing(events.length > 0 || members.length > 0 || oomStandings.length > 0);
    setDataLoading(!(events.length > 0 || members.length > 0 || oomStandings.length > 0));
    setLoadError(null);
    try {
      const [eventsData, standingsData, membersData] = await measureAsync("home.load", () =>
        Promise.all([
          getEventsForSociety(societyId),
          getOrderOfMeritTotals(societyId),
          getMembersBySocietyId(societyId),
        ]),
      );
      setEvents(eventsData);
      setOomStandings(standingsData);
      setMembers(membersData);

      try {
        const bl = await getActiveBirdiesLeague(societyId);
        setBirdiesLeague(bl);
        if (bl) {
          const st = await getBirdiesLeagueStandings(societyId, bl, eventsData);
          setBirdiesStandings(st);
        } else {
          setBirdiesStandings([]);
        }
      } catch (blErr) {
        console.warn("[Home] Birdies League load skipped:", blErr);
        setBirdiesLeague(null);
        setBirdiesStandings([]);
      }

      // Fetch results for the last 3 completed events (for Recent Activity card)
      const pastEvents = eventsData
        .filter((e) => e.isCompleted)
        .slice(0, 3);

      const resultsFetches = await Promise.all(
        pastEvents.map(async (event) => {
          try {
            const results = await getEventResults(event.id);
            return { eventId: event.id, results };
          } catch {
            return { eventId: event.id, results: [] as EventResultDoc[] };
          }
        })
      );

      const resultsMap: Record<string, EventResultDoc[]> = {};
      for (const { eventId, results } of resultsFetches) {
        resultsMap[eventId] = results;
      }
      setRecentResultsMap(resultsMap);

      // Load first active sinbook for teaser card (non-blocking)
      try {
        const sbs = await getMySinbooks();
        const active = sbs.find((s) =>
          s.participants.some((p) => p.status === "accepted")
        );
        setActiveSinbook(active ?? null);
      } catch {
        // Non-critical — silently ignore
      }
      if (cacheKey) {
        await setCache(cacheKey, {
          events: eventsData,
          members: membersData,
          oomStandings: standingsData,
          recentResultsMap: resultsMap,
        }, { ttlMs: 1000 * 60 * 5 });
      }
    } catch (err) {
      console.error("[Home] Failed to load data:", err);
      setLoadError(formatError(err));
    } finally {
      setDataLoading(false);
      setRefreshing(false);
    }
  }, [societyId, memberHasSeat, memberIsCaptain, cacheKey, events.length, members.length, oomStandings.length]);

  useEffect(() => {
    void (async () => {
      if (cacheKey) {
        const cached = await getCache<{
          events: EventDoc[];
          members: MemberDoc[];
          oomStandings: OrderOfMeritEntry[];
          recentResultsMap: Record<string, EventResultDoc[]>;
        }>(cacheKey, { maxAgeMs: 1000 * 60 * 60 });
        if (cached) {
          setEvents(cached.value.events ?? []);
          setMembers(cached.value.members ?? []);
          setOomStandings(cached.value.oomStandings ?? []);
          setRecentResultsMap(cached.value.recentResultsMap ?? {});
          setDataLoading(false);
        }
      }
      loadData();
    })();
  }, [loadData, cacheKey]);

  useFocusEffect(
    useCallback(() => {
      if (societyId && (memberHasSeat || memberIsCaptain)) {
        loadData();
      }
      // Refetch per-pool confirmed counts / effective pot when returning to Home (e.g. after Pot Master changes).
      setPrizePoolReloadNonce((n) => n + 1);
    }, [societyId, memberHasSeat, memberIsCaptain, loadData])
  );

  // ============================================================================
  // Derived Data
  // ============================================================================

  const memberId = member?.id;

  /** Local calendar date as YYYY-MM-DD (avoids UTC midnight issues with date-only strings). */
  const todayLocalKey = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }, []);

  // Next upcoming event (date >= today in local calendar, not completed, sorted ascending)
  const nextEvent = useMemo(() => {
    const upcoming = events.filter(
      (e) =>
        !e.isCompleted &&
        e.date &&
        /^\d{4}-\d{2}-\d{2}$/.test(e.date.trim()) &&
        e.date.trim() >= todayLocalKey
    );
    upcoming.sort((a, b) => {
      const da = a.date!.trim();
      const db = b.date!.trim();
      if (da !== db) return da.localeCompare(db);
      return (a.name || "").localeCompare(b.name || "");
    });
    return upcoming[0] ?? null;
  }, [events, todayLocalKey]);

  /** Further upcoming events after the hero “next” (same ordering rules as nextEvent). */
  const upcomingAfterNext = useMemo(() => {
    const upcoming = events.filter(
      (e) =>
        !e.isCompleted &&
        e.date &&
        /^\d{4}-\d{2}-\d{2}$/.test(e.date.trim()) &&
        e.date.trim() >= todayLocalKey
    );
    upcoming.sort((a, b) => {
      const da = a.date!.trim();
      const db = b.date!.trim();
      if (da !== db) return da.localeCompare(db);
      return (a.name || "").localeCompare(b.name || "");
    });
    return upcoming.slice(1, 4);
  }, [events, todayLocalKey]);

  const nextEventId = nextEvent?.id ?? null;

  /** Joint truth from event_societies-derived fields — not raw events.is_joint_event alone. */
  const nextEventIsJoint = useMemo(
    () =>
      isJointEventFromMeta(nextEvent?.participant_society_ids, nextEvent?.linked_society_count) ||
      nextEvent?.is_joint_event === true,
    [
      nextEvent?.participant_society_ids,
      nextEvent?.linked_society_count,
      nextEvent?.is_joint_event,
    ],
  );

  const canAccessNextEventTeeSheet = useMemo(() => {
    if (!nextEvent?.society_id || !societyId) return false;
    return isActiveSocietyParticipantForEvent(
      societyId,
      nextEvent.society_id,
      nextEvent.participant_society_ids ?? [],
    );
  }, [nextEvent, societyId]);

  const [prizePoolReloadNonce, setPrizePoolReloadNonce] = useState(0);
  const [prizePoolCard, setPrizePoolCard] = useState<{
    managerName: string | null;
    poolRows: HomePrizePoolRowVm[];
    loading: boolean;
  } | null>(null);

  const bumpPrizePoolHomeCard = useCallback(() => {
    setPrizePoolReloadNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!nextEvent?.prizePoolEnabled || !memberId || !societyId || !nextEvent.id) {
      setPrizePoolCard(null);
      return;
    }
    if (
      !isActiveSocietyParticipantForEvent(
        societyId,
        nextEvent.society_id,
        nextEvent.participant_society_ids ?? [],
      )
    ) {
      setPrizePoolCard(null);
      return;
    }
    let cancelled = false;
    setPrizePoolCard((p) => ({
      managerName: p?.managerName ?? null,
      poolRows: p?.poolRows ?? [],
      loading: true,
    }));
    void (async () => {
      try {
        const [mgr, pools] = await Promise.all([
          getEventPrizePoolManagerInfo(nextEvent.id),
          listEventPrizePools(nextEvent.id),
        ]);
        const poolRows: HomePrizePoolRowVm[] = await Promise.all(
          pools.map(async (pool) => {
            const [entry, rules, results, confirmedEntrantCount] = await Promise.all([
              getMyPrizePoolEntry(pool.id, memberId),
              getEventPrizePoolRules(pool.id),
              pool.status === "finalised" || pool.status === "calculated"
                ? listEventPrizePoolResults(pool.id)
                : Promise.resolve([]),
              getConfirmedPrizePoolEntrantCountForDisplay(pool.id),
            ]);
            const sortedRules = [...rules].sort((a, b) => a.position - b.position);
            const hasPublishedResults = pool.status === "finalised" || pool.status === "calculated";
            const effectiveDisplayPotPence = derivePrizePoolTotalAmountPence({
              totalAmountMode: pool.total_amount_mode ?? "manual",
              manualTotalAmountPence: pool.total_amount_pence,
              potEntryValuePence: pool.pot_entry_value_pence ?? null,
              confirmedEntrantCount,
            });
            return {
              pool,
              entry,
              rules: sortedRules,
              hasPublishedResults,
              myResult: results.find((r) => String(r.member_id ?? "") === String(memberId)) ?? null,
              confirmedEntrantCount,
              effectiveDisplayPotPence,
            };
          }),
        );
        if (cancelled) return;
        setPrizePoolCard({
          managerName: mgr?.displayName ?? null,
          poolRows,
          loading: false,
        });
      } catch (err: unknown) {
        console.error("[useHomeDashboard] prize pool card load failed:", err);
        if (!cancelled) {
          setPrizePoolCard({
            managerName: null,
            poolRows: [],
            loading: false,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    nextEvent?.id,
    nextEvent?.prizePoolEnabled,
    nextEvent?.society_id,
    nextEvent?.participant_society_ids,
    societyId,
    memberId,
    prizePoolReloadNonce,
  ]);

  useEffect(() => {
    if (!nextEventId) return;
    if (!__DEV__) return;
    console.log("[dashboard] joint mode decision", {
      source: "app/(app)/(tabs)/index.tsx::nextEventDerived",
      eventId: nextEventId,
      event_is_joint_event: nextEvent?.is_joint_event ?? null,
      linkedSocietiesCount: nextEvent?.linked_society_count ?? null,
      participantSocietiesCount: canonicalNextEventTee?.jointParticipatingSocieties?.length ?? null,
      jointDecision: nextEventIsJoint,
    });
  }, [
    nextEventId,
    nextEvent?.is_joint_event,
    nextEvent?.linked_society_count,
    nextEventIsJoint,
    canonicalNextEventTee?.jointParticipatingSocieties,
  ]);

  useEffect(() => {
    if (!nextEvent?.id || !societyId || !__DEV__) return;
    console.log("[joint-access] home next-event tee gate", {
      eventId: nextEvent.id,
      activeSocietyId: societyId,
      hostSocietyId: nextEvent.society_id,
      participantSocietyIds: nextEvent.participant_society_ids ?? [],
      nextEventIsJoint,
      canViewTeeNav: canAccessNextEventTeeSheet,
    });
  }, [nextEvent, societyId, nextEventIsJoint, canAccessNextEventTeeSheet]);

  // Load registration for the next event whenever it changes
  useEffect(() => {
    if (!nextEventId || !memberId) {
      setMyReg(null);
      return;
    }
    let cancelled = false;
    getMyRegistration(nextEventId, memberId).then((reg) => {
      if (!cancelled) setMyReg(reg);
    });
    return () => { cancelled = true; };
  }, [nextEventId, memberId]);

  // Attendance snapshot for next event (status=in), plus guest count if available.
  useEffect(() => {
    if (!nextEventId || !nextEvent || !societyId) {
      setNextEventAttendance({ attendingCount: 0, guestCount: 0 });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [regs, guests] = await Promise.all([
          getEventRegistrations(nextEventId),
          getEventGuests(nextEventId),
        ]);
        if (cancelled) return;
        const scopedRegs = nextEventIsJoint
          ? scopeEventRegistrations(regs, { kind: "joint_home", activeSocietyId: societyId })
          : scopeEventRegistrations(regs, {
              kind: "standard",
              hostSocietyId: nextEvent.society_id ?? societyId,
            });
        const summary = summarizeEventRegistrations(scopedRegs);
        setNextEventAttendance({
          attendingCount: summary.attendingCount,
          guestCount: Array.isArray(guests) ? guests.length : 0,
        });
      } catch {
        if (!cancelled) setNextEventAttendance({ attendingCount: 0, guestCount: 0 });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nextEventId, nextEvent, nextEventIsJoint, societyId]);

  // Canonical tee sheet for next event (joint entries, tee_groups snapshot, or computed fallback)
  useEffect(() => {
    if (!nextEventId || !nextEvent?.teeTimePublishedAt) {
      setCanonicalNextEventTee(null);
      setJointTeeMemberAugment([]);
      return;
    }
    let cancelled = false;
    loadCanonicalTeeSheet(nextEventId).then((c) => {
      if (!cancelled) setCanonicalNextEventTee(c);
    });
    return () => {
      cancelled = true;
    };
  }, [nextEventId, nextEvent?.teeTimePublishedAt]);

  // Hydrate members from all participant societies for joint "my tee time" (representative / dual membership)
  useEffect(() => {
    if (!canonicalNextEventTee?.isJoint || !canonicalNextEventTee.groups.length) {
      setJointTeeMemberAugment([]);
      return;
    }
    const ids = [
      ...new Set(
        canonicalNextEventTee.groups.flatMap((g) => g.players.map((p) => p.id)),
      ),
    ].filter((id) => id && !String(id).startsWith("guest-"));
    const need = ids.filter((id) => !members.some((m) => m.id === id));
    if (need.length === 0) {
      setJointTeeMemberAugment([]);
      return;
    }
    let cancelled = false;
    getMembersByIds(need).then((extra) => {
      if (cancelled) return;
      setJointTeeMemberAugment((prev) => {
        const byId = new Map(prev.map((m) => [m.id, m]));
        for (const m of extra) {
          if (m?.id) byId.set(m.id, m);
        }
        return Array.from(byId.values());
      });
    });
    return () => {
      cancelled = true;
    };
  }, [canonicalNextEventTee, members]);

  // Past events (completed, sorted desc) — last 3
  const recentEvents = useMemo(() => {
    return [...events]
      .filter((e) => e.isCompleted)
      .sort((a, b) => {
        const da = (a.date ?? "").trim();
        const db = (b.date ?? "").trim();
        if (da && db && da !== db) return db.localeCompare(da);
        return (b.updated_at ?? "").localeCompare(a.updated_at ?? "");
      })
      .slice(0, 3);
  }, [events]);

  const latestResultsEvent = useMemo(
    () => recentEvents.find((event) => (recentResultsMap[event.id]?.length ?? 0) > 0) ?? null,
    [recentEvents, recentResultsMap],
  );

  useEffect(() => {
    if (!latestResultsEvent?.id) {
      setLatestGuestNameMap({});
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const guests = await getEventGuests(latestResultsEvent.id);
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const g of guests) {
          if (g.id) map[String(g.id)] = g.name || "Guest";
        }
        setLatestGuestNameMap(map);
      } catch {
        if (!cancelled) setLatestGuestNameMap({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [latestResultsEvent?.id]);

  const latestResultsSnapshot: LatestResultsSnapshot = useMemo(() => {
    if (!latestResultsEvent) return null;
    const raw = (recentResultsMap[latestResultsEvent.id] ?? []).slice();
    if (raw.length === 0) return null;
    raw.sort((a, b) => {
      const pa = Number.isFinite(Number(a.position)) ? Number(a.position) : Number.MAX_SAFE_INTEGER;
      const pb = Number.isFinite(Number(b.position)) ? Number(b.position) : Number.MAX_SAFE_INTEGER;
      if (pa !== pb) return pa - pb;
      const va = Number.isFinite(Number(a.day_value)) ? Number(a.day_value) : Number(a.points);
      const vb = Number.isFinite(Number(b.day_value)) ? Number(b.day_value) : Number(b.points);
      return vb - va;
    });

    const topRows = raw.slice(0, 3).map((r, idx) => {
      const isGuest = !!r.event_guest_id;
      const memberName =
        !isGuest && r.member_id
          ? members.find((m) => m.id === r.member_id)?.displayName ??
            members.find((m) => m.id === r.member_id)?.name ??
            "Member"
          : null;
      const guestName = isGuest ? latestGuestNameMap[String(r.event_guest_id)] ?? "Guest" : null;
      const valueNum =
        Number.isFinite(Number(r.day_value)) && r.day_value != null ? Number(r.day_value) : Number(r.points) || 0;
      return {
        rank: Number.isFinite(Number(r.position)) && (Number(r.position) || 0) > 0 ? Number(r.position) : idx + 1,
        name: (memberName ?? guestName ?? "Player").trim(),
        value: `${valueNum % 1 === 0 ? valueNum.toFixed(0) : valueNum.toFixed(1)} pts`,
        isGuest,
      };
    });

    return {
      eventId: latestResultsEvent.id,
      eventName: latestResultsEvent.name || "Event",
      rows: topRows,
    };
  }, [latestResultsEvent, recentResultsMap, members, latestGuestNameMap]);

  const recentActivityRows = useMemo(
    () => buildRecentActivityRows(recentEvents, recentResultsMap, memberId, colors),
    [recentEvents, recentResultsMap, memberId, colors],
  );

  // My season snapshot (year-based)
  const mySnapshot = useMemo(() => {
    if (!memberId) return null;

    // Find current user in OOM standings
    const myOomEntry = oomStandings.find((s) => s.memberId === memberId);
    const membersWithPoints = oomStandings.filter((s) => s.totalPoints > 0);

    return {
      totalPoints: myOomEntry?.totalPoints ?? 0,
      rank: myOomEntry?.rank ?? 0,
      totalWithPoints: membersWithPoints.length,
    };
  }, [memberId, oomStandings]);

  const birdiesMy = useMemo(() => {
    if (!memberId) return { rank: null as number | null, total: null as number | null, events: null as number | null };
    const hit = pickBirdiesStandingForMember(birdiesStandings, memberId, members);
    if (!hit) return { rank: null, total: null, events: null };
    return { rank: hit.rank, total: hit.totalBirdies, events: hit.eventsCounted };
  }, [memberId, birdiesStandings, members]);

  const birdiesPreviewRows = useMemo(() => birdiesStandings.slice(0, 3), [birdiesStandings]);

  const nextEventJointSocietyMap = useMemo(() => {
    if (!canonicalNextEventTee?.isJoint || !canonicalNextEventTee.jointParticipatingSocieties?.length) {
      return undefined;
    }
    return buildSocietyIdToNameMap(canonicalNextEventTee.jointParticipatingSocieties);
  }, [canonicalNextEventTee?.isJoint, canonicalNextEventTee?.jointParticipatingSocieties]);

  const membersForJointTeeCanonical = useMemo(() => {
    if (jointTeeMemberAugment.length === 0) return members;
    const byId = new Map(members.map((m) => [m.id, m]));
    for (const m of jointTeeMemberAugment) byId.set(m.id, m);
    return Array.from(byId.values());
  }, [members, jointTeeMemberAugment]);

  /**
   * HARD RULE:
   * For joint events, tee sheets are event-scoped. Do not filter by society.
   * Always read canonical published groups for dashboard slot lookup.
   */
  // My tee time for next event (when published) — same canonical payload as member tee sheet / ManCo
  const myTeeTimeInfo = useMemo(() => {
    if (!memberId || !nextEvent?.teeTimePublishedAt || !nextEvent || !canonicalNextEventTee) return null;
    const linkedMemberIds =
      canonicalNextEventTee.isJoint && userId
        ? [
            ...new Set(
              membersForJointTeeCanonical
                .filter((m) => String(m.user_id ?? "") === String(userId))
                .map((m) => String(m.id)),
            ),
          ]
        : [memberId];
    const idsToCheck = linkedMemberIds.length > 0 ? linkedMemberIds : [memberId];

    const found = idsToCheck
      .map((id) =>
        findMemberGroupInfoFromCanonical(
          id,
          canonicalNextEventTee,
          membersForJointTeeCanonical,
          nextEventJointSocietyMap,
        ),
      )
      .find(Boolean) ?? null;

    if (__DEV__) {
      console.log("[dashboard] published teesheet snapshot", {
        eventId: canonicalNextEventTee.eventId,
        isJoint: canonicalNextEventTee.isJoint,
        source: `canonical:${canonicalNextEventTee.source}`,
        playerIds: canonicalNextEventTee.groups.flatMap((g) => g.players.map((p) => p.id)),
        societiesRepresented: [
          ...new Set(
            canonicalNextEventTee.groups.flatMap((g) => g.players.map((p) => p.societyLabel).filter(Boolean)),
          ),
        ],
      });
      console.log("[dashboard] player lookup", {
        userId,
        signedInUserId: userId,
        memberIdsChecked: idsToCheck,
        matchedMemberId: found
          ? idsToCheck.find((id) =>
              canonicalNextEventTee.groups.some((g) => g.players.some((p) => p.id === id)),
            ) ?? null
          : null,
        found: !!found,
        eventId: canonicalNextEventTee.eventId,
      });
    }
    return found;
  }, [
    memberId,
    nextEvent,
    membersForJointTeeCanonical,
    canonicalNextEventTee,
    nextEventJointSocietyMap,
    userId,
  ]);

  // ============================================================================
  // Registration Helpers
  // ============================================================================

  /** Cap/Treas in active society (memberships), not a random multi-society row */
  const canAdmin = useMemo(
    () => canManageEventPaymentsForSociety(memberships, societyId),
    [memberships, societyId],
  );
  const [showAdmin, setShowAdmin] = useState(false);

  const toggleRegistration = async (newStatus: "in" | "out") => {
    if (!nextEvent || !societyId || !memberId || regBusy) return;
    setRegBusy(true);
    try {
      const updated = await setMyStatus({ eventId: nextEvent.id, societyId, memberId, status: newStatus });
      setMyReg(updated);
    } catch {
      // silently degrade — user can retry
    } finally {
      setRegBusy(false);
    }
  };

  const handleMarkPaid = async (paid: boolean) => {
    if (!nextEvent || !memberId || !societyId || regBusy) return;
    setRegBusy(true);
    try {
      await markMePaid(nextEvent.id, memberId, paid, societyId);
      const refreshed = await getMyRegistration(nextEvent.id, memberId);
      setMyReg(refreshed);
    } catch {
      // silently degrade
    } finally {
      setRegBusy(false);
    }
  };

  // ============================================================================
  // Navigation Helpers
  // ============================================================================

  const pushWithBlur = (href: Parameters<typeof router.push>[0]) => {
    blurWebActiveElement();
    router.push(href);
  };

  const openEvent = (eventId: string) => {
    if (!eventId) return;
    pushWithBlur({ pathname: "/(app)/event/[id]", params: { id: eventId } });
  };

  const openLeaderboard = () => {
    pushWithBlur("/(app)/(tabs)/leaderboard");
  };

  const openBirdiesLeague = () => {
    pushWithBlur("/(app)/birdies-league" as never);
  };

  const openWeatherTab = useCallback(() => {
    router.push("/(app)/(tabs)/weather");
  }, [router]);

  if (bootstrapLoading && dataLoading) {
    return { phase: "loading" as const, tabContentStyle, colors };
  }
  if (!societyId || !society) {
    return { phase: "personal" as const, colors, router, tabContentStyle };
  }

  const memberDisplayName = String(member?.displayName || member?.name || "Member");
  const logoUrl = getSocietyLogoUrl(society);
  const roleLabel = formatRole(member?.role ?? member?.roles?.[0]);
  const hiRaw = member?.handicapIndex ?? member?.handicap_index;
  const handicapIndexDisplay =
    hiRaw != null && Number.isFinite(Number(hiRaw)) ? Number(hiRaw).toFixed(1) : null;
  const canOpenLeaderboard = memberHasSeat || memberIsCaptain;
  const oomTotalPoints = Number(mySnapshot?.totalPoints) || 0;
  const oomPointsMain = formatPoints(oomTotalPoints);
  const oomRankMain =
    mySnapshot && (mySnapshot.rank ?? 0) > 0 ? String(mySnapshot.rank) : "—";
  const showUnrankedHint = !mySnapshot || (mySnapshot.rank ?? 0) <= 0;
  const heroTeePreview = myTeeTimeInfo
    ? { teeTime: myTeeTimeInfo.teeTime, groupNumber: myTeeTimeInfo.groupNumber }
    : null;

  return {
    phase: "society" as const,
    tabContentStyle,
    colors,
    reduceMotion,
    router,
    society,
    memberId,
    userId,
    events,
    nextEvent,
    upcomingAfterNext,
    latestResultsSnapshot,
    recentActivityRows,
    oomStandings,
    loadError,
    refreshing,
    profileComplete,
    licenceToast,
    setLicenceToast,
    showLicenceBanner,
    requestAlreadySent,
    requestSending,
    handleRequestAccess,
    memberHasSeat,
    memberIsCaptain,
    memberDisplayName,
    logoUrl,
    roleLabel,
    handicapIndexDisplay,
    canOpenLeaderboard,
    oomPointsMain,
    oomRankMain,
    showUnrankedHint,
    heroTeePreview,
    nextEventAttendance,
    myReg,
    regBusy,
    canAdmin,
    showAdmin,
    setShowAdmin,
    toggleRegistration,
    handleMarkPaid,
    pushWithBlur,
    openEvent,
    openLeaderboard,
    openWeatherTab,
    nextEventIsJoint,
    canAccessNextEventTeeSheet,
    societyId,
    activeSinbook,
    formatEventDate,
    formatFormatLabel,
    formatClassification,
    formatShortDate,
    formatPoints,
    prizePoolCard,
    bumpPrizePoolHomeCard,
    birdiesLeague,
    birdiesMyRank: birdiesMy.rank,
    birdiesMyTotal: birdiesMy.total,
    birdiesMyEvents: birdiesMy.events,
    birdiesPreviewRows,
    openBirdiesLeague,
  };
}

export type HomeSocietyDashboardVm = Omit<
  Extract<ReturnType<typeof useHomeDashboard>, { phase: "society" }>,
  "phase"
>;
