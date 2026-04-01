/**
 * Member Home Screen
 * Premium, personal home landing for logged-in members.
 * Read-only, member-first experience with society context.
 *
 * Cards (top to bottom):
 *  A) App bar + member identity (logo, name, society, role, handicap + edit)
 *  B) Profile / licence banners (when applicable)
 *  C) OOM rank + points (side-by-side; stack on narrow width)
 *  D) Hero next-event — fee, payment/playing, CTA
 *  E) Your Status — RSVP / payment admin for that event
 *  F) Course playability mini (same bundle as Weather tab)
 *  G) Tee-times-published banner (when fresh), then upcoming, leaderboard, activity
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View, Pressable, Image, type PressableStateCallbackType } from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { DashboardMemberIdentityCard } from "@/components/dashboard/DashboardMemberIdentityCard";
import { getSocietyLogoUrl } from "@/lib/societyLogo";
import { DashboardHeroEventCard } from "@/components/dashboard/DashboardHeroEventCard";
import { DashboardPlayabilityMiniCard } from "@/components/dashboard/DashboardPlayabilityMiniCard";
import { DashboardOomTopMetricsRow } from "@/components/dashboard/DashboardOomTopMetricsRow";
import { DashboardYourStatusCard } from "@/components/dashboard/DashboardYourStatusCard";
import { DashboardUpcomingList } from "@/components/dashboard/DashboardUpcomingList";
import { DashboardLeaderboardPreview } from "@/components/dashboard/DashboardLeaderboardPreview";
import { PrimaryButton } from "@/components/ui/Button";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { Toast } from "@/components/ui/Toast";
import { useBootstrap } from "@/lib/useBootstrap";
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
import { colors, getColors, spacing, radius, typography } from "@/lib/ui/theme";
import { formatError, type FormattedError } from "@/lib/ui/formatError";
import { isActiveSocietyParticipantForEvent, isJointEventFromMeta } from "@/lib/jointEventAccess";
import { getMySinbooks, type SinbookWithParticipants } from "@/lib/db_supabase/sinbookRepo";
import {
  getMyRegistration,
  getEventRegistrations,
  scopeEventRegistrations,
  setMyStatus,
  markMePaid,
  type EventRegistration,
} from "@/lib/db_supabase/eventRegistrationRepo";
import { blurWebActiveElement } from "@/lib/ui/focus";
import { SocietySwitcherPill } from "@/components/SocietySwitcher";
import { HeaderSettingsPill } from "@/components/navigation/HeaderSettingsPill";
import { getCache, setCache, invalidateCache } from "@/lib/cache/clientCache";

const appIcon = require("@/assets/images/app-icon.png");

// ============================================================================
// Helpers
// ============================================================================

/** Format a role string for display as a badge label */
function formatRole(role?: string): string {
  if (!role) return "Member";
  const r = role.toLowerCase();
  const map: Record<string, string> = {
    captain: "Captain",
    secretary: "Secretary",
    treasurer: "Treasurer",
    handicapper: "Handicapper",
    member: "Member",
  };
  return map[r] || "Member";
}

/** Pretty-print a date string as "Sun 12 Apr" style */
function formatEventDate(dateStr?: string): string {
  if (!dateStr) return "TBD";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  } catch {
    return "TBD";
  }
}

/** Short date for compact display: "12 Apr" */
function formatShortDate(dateStr?: string): string {
  if (!dateStr) return "TBD";
  try {
    return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  } catch {
    return "TBD";
  }
}

/** Format event format label for display */
function formatFormatLabel(format?: string): string {
  if (!format) return "";
  const map: Record<string, string> = {
    stableford: "Stableford",
    strokeplay_net: "Strokeplay (Net)",
    strokeplay_gross: "Strokeplay (Gross)",
    medal: "Medal",
  };
  return map[format.toLowerCase()] || format;
}

/** Format event classification for display */
function formatClassification(classification?: string): string {
  if (!classification) return "General";
  const map: Record<string, string> = {
    general: "General",
    oom: "Order of Merit",
    major: "Major",
    friendly: "Friendly",
  };
  return map[classification.toLowerCase()] || classification;
}

/** Format OOM points nicely */
function formatPoints(pts: number): string {
  if (pts === Math.floor(pts)) return pts.toString();
  return pts.toFixed(1);
}

function HomeAppBar({
  colors,
  onOpenSettings,
}: {
  colors: ReturnType<typeof getColors>;
  onOpenSettings: () => void;
}) {
  return (
    <View style={[styles.appBarTier, { borderBottomColor: colors.borderLight }]}>
      <SocietySwitcherPill />

      <HeaderSettingsPill onPress={onOpenSettings} />
    </View>
  );
}

function PoweredByFooter({
  colors,
}: {
  colors: ReturnType<typeof getColors>;
}) {
  return (
    <View style={styles.poweredByWrap}>
      <Image source={appIcon} style={styles.poweredByIcon} resizeMode="contain" />
      <AppText style={[styles.poweredByText, { color: colors.textTertiary }]}>
        Powered by Golf Society Hub
      </AppText>
    </View>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function HomeScreen() {
  const router = useRouter();
  const { society, member, societyId, memberships, profile, userId, loading: bootstrapLoading } =
    useBootstrap();
  const colors = getColors();
  const tabBarHeight = useBottomTabBarHeight();
  const tabContentStyle = {
    paddingTop: 16,
    paddingBottom: tabBarHeight + 24,
  };

  // Data state
  const [events, setEvents] = useState<EventDoc[]>([]);
  const [members, setMembers] = useState<MemberDoc[]>([]);
  const [oomStandings, setOomStandings] = useState<OrderOfMeritEntry[]>([]);
  const [recentResultsMap, setRecentResultsMap] = useState<Record<string, EventResultDoc[]>>({});
  const [dataLoading, setDataLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<FormattedError | null>(null);
  const [activeSinbook, setActiveSinbook] = useState<SinbookWithParticipants | null>(null);

  // Event registration state
  const [myReg, setMyReg] = useState<EventRegistration | null>(null);
  const [nextEventRegistrations, setNextEventRegistrations] = useState<EventRegistration[]>([]);
  const [canonicalNextEventTee, setCanonicalNextEventTee] = useState<CanonicalTeeSheetResult | null>(null);
  /** Joint events: member rows for all societies in canonical groups (home only loads active society by default). */
  const [jointTeeMemberAugment, setJointTeeMemberAugment] = useState<MemberDoc[]>([]);
  const [regBusy, setRegBusy] = useState(false);

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
      const [eventsData, standingsData, membersData] = await Promise.all([
        getEventsForSociety(societyId),
        getOrderOfMeritTotals(societyId),
        getMembersBySocietyId(societyId),
      ]);
      setEvents(eventsData);
      setOomStandings(standingsData);
      setMembers(membersData);

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

  // Load all registrations for next event when tee times published (for societies using In/Out)
  useEffect(() => {
    if (!nextEventId || !nextEvent?.teeTimePublishedAt || !societyId || !nextEvent) {
      setNextEventRegistrations([]);
      return;
    }
    const ev = nextEvent;
    let cancelled = false;
    void (async () => {
      const cacheKey = `event:${nextEventId}:registrations`;
      const cached = await getCache<EventRegistration[]>(cacheKey, { maxAgeMs: 1000 * 60 * 30 });
      if (cached && !cancelled) {
        const raw = cached.value;
        if (!Array.isArray(raw)) {
          if (__DEV__) {
            console.warn("[home] registrations cache was not an array; clearing", cacheKey);
          }
          await invalidateCache(cacheKey);
        } else {
          const scopedCached = nextEventIsJoint
            ? scopeEventRegistrations(raw, { kind: "joint_home", activeSocietyId: societyId })
            : scopeEventRegistrations(raw, {
                kind: "standard",
                hostSocietyId: ev.society_id ?? societyId,
              });
          setNextEventRegistrations(scopedCached);
        }
      }
      const regs = await getEventRegistrations(nextEventId);
      if (cancelled) return;
      await setCache(cacheKey, regs, { ttlMs: 1000 * 60 * 2 });
      const scoped = nextEventIsJoint
        ? scopeEventRegistrations(regs, { kind: "joint_home", activeSocietyId: societyId })
        : scopeEventRegistrations(regs, {
            kind: "standard",
            hostSocietyId: ev.society_id ?? societyId,
          });
      setNextEventRegistrations(scoped);
    })();
    return () => { cancelled = true; };
  }, [
    nextEventId,
    nextEvent,
    nextEvent?.teeTimePublishedAt,
    nextEvent?.society_id,
    nextEventIsJoint,
    societyId,
  ]);

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
    return events
      .filter((e) => e.isCompleted)
      .slice(0, 3);
  }, [events]);

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

  const openWeatherTab = useCallback(() => {
    router.push("/(app)/(tabs)/weather");
  }, [router]);

  // ============================================================================
  // Loading / No Society States
  // ============================================================================

  if (bootstrapLoading && dataLoading) {
    return (
      <Screen
        scrollable
        style={{ backgroundColor: colors.backgroundSecondary }}
        contentStyle={[styles.screenContent, tabContentStyle]}
      >
        <SkeletonCards colors={colors} />
      </Screen>
    );
  }

  if (!societyId || !society) {
    return <PersonalModeHome colors={colors} router={router} />;
  }

  // ============================================================================
  // Render
  // ============================================================================

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
  const cardPressStyle = ({ pressed }: PressableStateCallbackType) => [
    styles.cardPressable,
    pressed && styles.cardPressablePressed,
  ];

  return (
    <Screen
      style={{ backgroundColor: colors.backgroundSecondary }}
      contentStyle={[styles.screenContent, tabContentStyle]}
    >
      <HomeAppBar
        colors={colors}
        onOpenSettings={() => pushWithBlur("/(app)/(tabs)/settings")}
      />

      <DashboardMemberIdentityCard
        logoUrl={logoUrl}
        societyName={String(society?.name ?? "Society")}
        memberName={memberDisplayName}
        roleLabel={roleLabel}
        handicapIndexDisplay={handicapIndexDisplay}
        onEditHandicap={() => pushWithBlur("/(app)/my-profile")}
      />

      {loadError && (
        <InlineNotice
          variant="error"
          message={loadError.message}
          detail={loadError.detail}
          style={{ marginBottom: spacing.base }}
        />
      )}
      {refreshing && (
        <AppText variant="small" color="tertiary" style={{ marginBottom: spacing.xs }}>
          Refreshing...
        </AppText>
      )}

      {/* ================================================================== */}
      {/* COMPLETE PROFILE BANNER                                            */}
      {/* ================================================================== */}
      {!profileComplete && (
        <Pressable onPress={() => pushWithBlur("/(app)/my-profile")} style={cardPressStyle}>
          <AppCard style={[styles.premiumCard, styles.profileBanner, { borderColor: colors.info + "40" }]}>
            <View style={styles.profileBannerRow}>
              <View style={[styles.profileBannerIcon, { backgroundColor: colors.info + "18" }]}>
                <Feather name="user" size={20} color={colors.info} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyBold">Complete your profile</AppText>
                <AppText variant="small" color="secondary" style={{ marginTop: 2 }}>
                  Add your name and details to get the most out of the app.
                </AppText>
              </View>
              <Feather name="chevron-right" size={18} color={colors.info} />
            </View>
          </AppCard>
        </Pressable>
      )}

      {/* ================================================================== */}
      {/* LICENCE BANNER — non-captain members without a seat                */}
      {/* ================================================================== */}
      {showLicenceBanner && (
        <AppCard style={[styles.premiumCard, styles.licenceBanner, { borderColor: colors.warning + "40" }]}>
          <View style={styles.licenceBannerHeader}>
            <View style={[styles.licenceBannerIcon, { backgroundColor: colors.warning + "18" }]}>
              <Feather name="alert-circle" size={20} color={colors.warning} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="bodyBold">Licence required</AppText>
              <AppText variant="small" color="secondary" style={{ marginTop: 2 }}>
                {requestAlreadySent
                  ? "Your request has been sent. Waiting for your Captain to assign a licence."
                  : "Your Captain hasn\u2019t assigned you a licence yet."}
              </AppText>
            </View>
          </View>
          <View style={styles.licenceBannerActions}>
            {!requestAlreadySent ? (
              <PrimaryButton
                onPress={handleRequestAccess}
                loading={requestSending}
                disabled={requestSending}
                size="sm"
              >
                Request access
              </PrimaryButton>
            ) : (
              <View style={[styles.requestSentBadge, { backgroundColor: colors.success + "14" }]}>
                <Feather name="check-circle" size={14} color={colors.success} />
                <AppText variant="small" style={{ color: colors.success, marginLeft: 4 }}>
                  Request sent
                </AppText>
              </View>
            )}
          </View>
        </AppCard>
      )}

      {/* Licence Toast */}
      <Toast
        visible={licenceToast.visible}
        message={licenceToast.message}
        type={licenceToast.type}
        onHide={() => setLicenceToast((t) => ({ ...t, visible: false }))}
      />

      {/* ================================================================== */}
      {/* GATED CONTENT — only for licensed members / captains               */}
      {/* ================================================================== */}
      {(memberHasSeat || memberIsCaptain) && (<>

      <DashboardOomTopMetricsRow
        oomRankMain={oomRankMain}
        showUnrankedHint={showUnrankedHint}
        oomPointsMain={oomPointsMain}
        canOpenLeaderboard={canOpenLeaderboard}
        onOpenLeaderboard={openLeaderboard}
      />

      <DashboardHeroEventCard
        nextEvent={nextEvent}
        nextEventIsJoint={nextEventIsJoint}
        myReg={myReg}
        myTeeTimeInfo={heroTeePreview}
        canAccessNextEventTeeSheet={canAccessNextEventTeeSheet}
        formatEventDate={formatEventDate}
        formatFormatLabel={formatFormatLabel}
        formatClassification={formatClassification}
        onOpenEvent={() => nextEvent && openEvent(nextEvent.id)}
        onOpenTeeSheet={() =>
          nextEvent && router.push({ pathname: "/(app)/event/[id]/tee-sheet", params: { id: nextEvent.id } })
        }
      />

      {nextEvent ? (
        <DashboardYourStatusCard
          nextEvent={nextEvent}
          nextEventIsJoint={nextEventIsJoint}
          myReg={myReg}
          regBusy={regBusy}
          canAdmin={canAdmin}
          showAdmin={showAdmin}
          onToggleAdmin={() => setShowAdmin((v) => !v)}
          onToggleIn={() => toggleRegistration("in")}
          onToggleOut={() => toggleRegistration("out")}
          onMarkPaid={handleMarkPaid}
        />
      ) : null}

      <DashboardPlayabilityMiniCard
        nextEvent={nextEvent}
        enabled={!!societyId && !!memberId}
        onOpenWeatherTab={openWeatherTab}
        preferredTeeTimeLocal={heroTeePreview?.teeTime ?? null}
      />

      {/* Tee times published — after priority cards so OOM stays directly under identity */}
      {nextEvent?.teeTimePublishedAt && canAccessNextEventTeeSheet && (() => {
        const publishedAt = new Date(nextEvent.teeTimePublishedAt!);
        const daysSince = (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince > 7) return null;
        return (
          <Pressable
            onPress={() => router.push({ pathname: "/(app)/event/[id]/tee-sheet", params: { id: nextEvent.id } })}
            style={cardPressStyle}
          >
            <View style={[styles.notificationBanner, { backgroundColor: colors.success + "15", borderColor: colors.success + "30" }]}>
              <Feather name="bell" size={16} color={colors.success} />
              <View style={{ flex: 1 }}>
                <AppText variant="bodyBold" style={{ color: colors.success }}>
                  Tee times now available for this event
                </AppText>
                <AppText variant="small" color="secondary">
                  Tap to view your tee time and full tee sheet
                </AppText>
              </View>
              <Feather name="chevron-right" size={16} color={colors.success} />
            </View>
          </Pressable>
        );
      })()}

      <DashboardUpcomingList
        events={upcomingAfterNext}
        formatShortDate={formatShortDate}
        onOpenEvent={openEvent}
      />

      {oomStandings.length > 0 && canOpenLeaderboard ? (
        <DashboardLeaderboardPreview
          entries={oomStandings.slice(0, 3)}
          memberId={memberId}
          formatPoints={(pts) => `${formatPoints(pts)} pts`}
          onOpenLeaderboard={openLeaderboard}
        />
      ) : null}

      {/* ================================================================== */}
      {/* E) RECENT ACTIVITY                                                 */}
      {/* ================================================================== */}
      {recentEvents.length > 0 && (
        <View>
          <AppText variant="h2" style={styles.sectionTitle}>Recent Activity</AppText>

          {recentEvents.map((event) => {
            const results = recentResultsMap[event.id] ?? [];
            const hasResults = results.length > 0;
            const myResult = hasResults
              ? results.find((r) => r.member_id === memberId)
              : null;

            // Determine status text — guard against non-primitive points values
            let statusText = "Results pending";
            let statusColor: string = colors.textTertiary;
            if (hasResults && event.isOOM && myResult) {
              const pts = Number(myResult.points) || 0;
              statusText = `${formatPoints(pts)} Order of Merit pts`;
              statusColor = colors.primary;
            } else if (hasResults && event.isOOM && !myResult) {
              statusText = "No Order of Merit points";
              statusColor = colors.textSecondary;
            } else if (hasResults && !event.isOOM) {
              statusText = "Results available";
              statusColor = colors.success;
            }

            return (
              <Pressable key={event.id} onPress={() => openEvent(event.id)} style={cardPressStyle}>
                <AppCard style={[styles.recentCard, styles.premiumCard]}>
                  <View style={styles.recentRow}>
                    <View style={[styles.recentDateBadge, { backgroundColor: colors.backgroundTertiary }]}>
                      <AppText variant="captionBold" color="primary">
                        {formatShortDate(typeof event.date === "string" ? event.date : undefined)}
                      </AppText>
                    </View>
                    <View style={{ flex: 1 }}>
                      <AppText variant="bodyBold" numberOfLines={1}>{String(event.name ?? "Event")}</AppText>
                      <AppText variant="small" style={{ color: statusColor }}>{statusText}</AppText>
                    </View>
                    <Feather name="chevron-right" size={18} color={colors.textTertiary} />
                  </View>
                </AppCard>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Empty state if absolutely no events */}
      {events.length === 0 && !nextEvent && recentEvents.length === 0 && (
        <AppCard style={[styles.premiumCard, { marginTop: spacing.sm }]}>
          <View style={styles.emptyState}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.backgroundTertiary }]}>
              <Feather name="calendar" size={24} color={colors.textTertiary} />
            </View>
            <AppText variant="body" color="secondary" style={{ textAlign: "center" }}>
              No events yet. Your society captain will create events soon.
            </AppText>
          </View>
        </AppCard>
      )}

      {/* ================================================================== */}
      {/* F) SINBOOK TEASER CARD                                             */}
      {/* ================================================================== */}
      <Pressable onPress={() => pushWithBlur("/(app)/(tabs)/sinbook")} style={cardPressStyle}>
        <AppCard style={styles.premiumCard}>
          <View style={styles.cardTitleRow}>
            <Feather name="zap" size={16} color={colors.primary} />
            <AppText variant="captionBold" color="primary">Rivalries</AppText>
          </View>
          {activeSinbook ? (
            <View style={{ marginTop: spacing.xs }}>
              <AppText variant="bodyBold" numberOfLines={1}>{activeSinbook.title?.trim() || "Rivalry"}</AppText>
              <AppText variant="caption" color="secondary">
                {(() => {
                  if (!userId) return "Awaiting opponent";
                  const opp = activeSinbook.participants.find((p) => p.user_id !== userId && p.status === "accepted");
                  return opp ? (opp.display_name?.trim() || "Opponent") : "Awaiting opponent";
                })()}
              </AppText>
            </View>
          ) : (
            <AppText variant="body" color="secondary" style={{ marginTop: spacing.xs }}>
              Start a rivalry with a mate. Track head-to-head results all season — for fun, not wagers.
            </AppText>
          )}
          <View style={styles.chevronHint}>
            <AppText variant="small" color="tertiary">
              {activeSinbook ? "View rivalry" : "Get started"}
            </AppText>
            <Feather name="chevron-right" size={16} color={colors.textTertiary} />
          </View>
        </AppCard>
      </Pressable>

      </>)}

      <PoweredByFooter colors={colors} />
    </Screen>
  );
}

// ============================================================================
// Skeleton Loading Placeholders
// ============================================================================

function PersonalModeHome({
  colors,
  router,
}: {
  colors: ReturnType<typeof getColors>;
  router: ReturnType<typeof useRouter>;
}) {
  const tabBarHeight = useBottomTabBarHeight();
  const tabContentStyle = {
    paddingTop: 16,
    paddingBottom: tabBarHeight + 24,
  };
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const { profile: pmProfile } = useBootstrap();
  const pmProfileComplete = pmProfile?.profile_complete === true;
  const cardPressStyle = ({ pressed }: PressableStateCallbackType) => [
    styles.cardPressable,
    pressed && styles.cardPressablePressed,
  ];
  const pushWithBlur = (href: Parameters<typeof router.push>[0]) => {
    blurWebActiveElement();
    router.push(href);
  };
  const openJoinByCode = () => {
    const targetPath = "/join?mode=join";
    console.log("ENTER JOIN CODE CLICK", targetPath);
    blurWebActiveElement();
    router.push({ pathname: "/join", params: { mode: "join" } });
  };
  const openCreateSociety = () => {
    blurWebActiveElement();
    router.push({ pathname: "/onboarding", params: { mode: "create" } });
  };

  return (
    <Screen
      style={{ backgroundColor: colors.backgroundSecondary }}
      contentStyle={[styles.screenContent, tabContentStyle]}
    >
      <HomeAppBar
        colors={colors}
        onOpenSettings={() => pushWithBlur("/(app)/(tabs)/settings")}
      />

      {/* Welcome header */}
      <AppCard style={[styles.premiumCard, personalStyles.welcomeSection, { borderColor: colors.borderLight }]}>
        <View style={[personalStyles.welcomeShield, { backgroundColor: colors.primary + "12" }]}>
          <Image source={appIcon} style={personalStyles.welcomeShieldIcon} resizeMode="contain" />
        </View>
        <AppText variant="title" style={personalStyles.welcomeTitle}>
          Welcome
        </AppText>
        <AppText variant="body" color="secondary" style={personalStyles.welcomeSubtitle}>
          Use the app as an individual, or join a society when you are ready.
        </AppText>
      </AppCard>

      {/* Complete profile banner */}
      {!pmProfileComplete && (
        <Pressable onPress={() => pushWithBlur("/(app)/my-profile")} style={cardPressStyle}>
          <AppCard style={[styles.premiumCard, styles.profileBanner, { borderColor: colors.info + "40" }]}>
            <View style={styles.profileBannerRow}>
              <View style={[styles.profileBannerIcon, { backgroundColor: colors.info + "18" }]}>
                <Feather name="user" size={20} color={colors.info} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyBold">Complete your profile</AppText>
                <AppText variant="small" color="secondary" style={{ marginTop: 2 }}>
                  Add your name and details to get started.
                </AppText>
              </View>
              <Feather name="chevron-right" size={18} color={colors.info} />
            </View>
          </AppCard>
        </Pressable>
      )}

      {/* Feature cards */}
      <Pressable onPress={() => pushWithBlur("/(app)/(tabs)/sinbook")} style={cardPressStyle}>
        <AppCard style={styles.premiumCard}>
          <View style={personalStyles.featureRow}>
            <View style={[personalStyles.featureIcon, { backgroundColor: colors.primary + "14" }]}>
              <Feather name="zap" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="bodyBold">Rivalries</AppText>
              <AppText variant="small" color="secondary">
                Challenge a mate and track friendly head-to-head results — not real-money betting.
              </AppText>
            </View>
            <Feather name="chevron-right" size={18} color={colors.textTertiary} />
          </View>
        </AppCard>
      </Pressable>

      <AppCard style={styles.premiumCard}>
        <View style={personalStyles.featureRow}>
          <View style={[personalStyles.featureIcon, { backgroundColor: colors.info + "14" }]}>
            <Feather name="cloud" size={20} color={colors.info} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="bodyBold">Weather</AppText>
            <AppText variant="small" color="secondary">
              Course-specific forecasts for your round
            </AppText>
          </View>
          <View style={[personalStyles.comingSoonBadge, { backgroundColor: colors.backgroundTertiary }]}>
            <AppText variant="small" color="tertiary">Soon</AppText>
          </View>
        </View>
      </AppCard>

      <Pressable onPress={() => pushWithBlur("/(app)/(tabs)/settings")} style={cardPressStyle}>
        <AppCard style={styles.premiumCard}>
          <View style={personalStyles.featureRow}>
            <View style={[personalStyles.featureIcon, { backgroundColor: colors.backgroundTertiary }]}>
              <Feather name="user" size={20} color={colors.textSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="bodyBold">Profile</AppText>
              <AppText variant="small" color="secondary">
                Your account and preferences
              </AppText>
            </View>
            <Feather name="chevron-right" size={18} color={colors.textTertiary} />
          </View>
        </AppCard>
      </Pressable>

      {/* Society join nudge — subtle card */}
      {!nudgeDismissed && (
        <AppCard style={[styles.premiumCard, personalStyles.nudgeCard, { borderColor: colors.primary + "25" }]}>
          <View style={personalStyles.nudgeHeader}>
            <View style={[personalStyles.nudgeIcon, { backgroundColor: colors.primary + "14" }]}>
              <Feather name="users" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="bodyBold">Join a Society</AppText>
              <AppText variant="small" color="secondary" style={{ marginTop: 2 }}>
                Get events, tee sheets, and leaderboards when you join your society.
              </AppText>
            </View>
          </View>

          <View style={personalStyles.nudgeActions}>
            <PrimaryButton
              onPress={openJoinByCode}
              size="sm"
              style={{ flex: 1 }}
            >
              Enter join code
            </PrimaryButton>
            <Pressable
              onPress={openCreateSociety}
              style={({ pressed }) => [
                personalStyles.nudgeSecondary,
                { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <AppText variant="small" color="primary" style={{ fontWeight: "600" }}>
                Create a society
              </AppText>
            </Pressable>
          </View>

          <Pressable
            onPress={() => setNudgeDismissed(true)}
            style={personalStyles.nudgeDismiss}
            hitSlop={8}
          >
            <AppText variant="small" color="tertiary">Not now</AppText>
          </Pressable>
        </AppCard>
      )}

      <PoweredByFooter colors={colors} />
    </Screen>
  );
}

const personalStyles = StyleSheet.create({
  welcomeSection: {
    alignItems: "center",
    paddingVertical: spacing.xl,
    marginBottom: spacing.xs,
  },
  welcomeShield: {
    width: 50,
    height: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  welcomeShieldIcon: {
    width: 32,
    height: 32,
  },
  welcomeTitle: {
    textAlign: "center",
    marginBottom: spacing.xs,
  },
  welcomeSubtitle: {
    textAlign: "center",
    paddingHorizontal: spacing.lg,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  comingSoonBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  nudgeCard: {
    borderWidth: 1,
    marginTop: spacing.md,
  },
  nudgeHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  nudgeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  nudgeActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  nudgeSecondary: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
  },
  nudgeDismiss: {
    alignSelf: "center",
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
  },
});

// ============================================================================
// Skeleton Loading Placeholders
// ============================================================================

function SkeletonCards({ colors }: { colors: ReturnType<typeof getColors> }) {
  const shimmer = colors.backgroundTertiary;

  return (
    <>
      {/* Two-tier header skeleton */}
      <View style={[styles.appBarTier, { borderBottomColor: colors.borderLight }]}>
        <View style={styles.appBarSpacer} />
        <View style={[styles.appBarAction, { backgroundColor: shimmer, borderColor: colors.borderLight }]} />
      </View>
      <AppCard style={[styles.skeletonHeaderCard, styles.premiumCard]}>
        <View style={[styles.skeletonLogoFrame, { backgroundColor: shimmer }]} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={[styles.skeletonLine, { width: "70%", backgroundColor: shimmer }]} />
          <View style={[styles.skeletonLine, { width: "50%", backgroundColor: shimmer, marginTop: 6 }]} />
        </View>
      </AppCard>

      {/* Hero + position skeletons */}
      <AppCard style={styles.premiumCard}>
        <View style={[styles.skeletonLine, { width: "28%", backgroundColor: shimmer }]} />
        <View style={[styles.skeletonLine, { width: "85%", backgroundColor: shimmer, marginTop: 12 }]} />
        <View style={[styles.skeletonLine, { width: "55%", backgroundColor: shimmer, marginTop: 8 }]} />
        <View style={[styles.skeletonLine, { width: "100%", height: 44, backgroundColor: shimmer, marginTop: spacing.md, borderRadius: 12 }]} />
      </AppCard>

      <AppCard style={styles.premiumCard}>
        <View style={[styles.skeletonLine, { width: "40%", backgroundColor: shimmer }]} />
        <View style={[styles.skeletonLine, { width: "42%", backgroundColor: shimmer, marginTop: spacing.md, height: 48 }]} />
      </AppCard>
    </>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  screenContent: {
    backgroundColor: "transparent",
    paddingTop: spacing.md,
    gap: spacing.base,
  },
  premiumCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  cardPressable: {
    borderRadius: 22,
  },
  cardPressablePressed: {
    opacity: 0.94,
    transform: [{ scale: 0.995 }],
  },

  // Premium two-tier header
  appBarTier: {
    minHeight: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.xs,
  },
  appBarSpacer: {
    width: 30,
    height: 30,
  },
  appBarAction: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  appBarActionPressed: {
    opacity: 0.75,
  },
  poweredByWrap: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  poweredByIcon: {
    width: 14,
    height: 14,
    opacity: 0.55,
  },
  poweredByText: {
    fontSize: typography.small.fontSize,
    lineHeight: typography.small.lineHeight,
    opacity: 0.8,
  },
  societyHeroCard: {
    alignItems: "center",
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.base,
  },
  heroLogoFrame: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  heroLogoImage: {
    width: 52,
    height: 52,
  },
  heroSocietyName: {
    marginTop: spacing.sm,
    textAlign: "center",
    fontWeight: "700",
  },
  heroSecondaryText: {
    marginTop: 4,
    textAlign: "center",
  },
  headerDivider: {
    height: 1,
    opacity: 0.7,
    marginTop: spacing.xs,
  },
  atGlanceRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  statTilePressable: {
    flex: 1,
  },
  statTileCard: {
    marginBottom: 0,
    minHeight: 118,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  statTileIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  statTileTextWrap: {
    minHeight: 62,
    justifyContent: "space-between",
  },
  statTileValue: {
    marginTop: 2,
    marginBottom: 1,
  },

  // Profile banner
  profileBanner: {
    borderWidth: 1,
    marginBottom: spacing.base,
  },
  profileBannerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  profileBannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },

  // Licence banner
  licenceBanner: {
    borderWidth: 1,
    marginBottom: spacing.base,
  },
  licenceBannerHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  licenceBannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  licenceBannerActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  requestSentBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },

  // Notification banner
  notificationBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.base,
  },

  // Weather card
  weatherCard: {
    marginBottom: spacing.xs,
  },
  weatherHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  weatherIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },

  // Card title row
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: 2,
  },

  // Next Event Card
  nextEventCard: {
    marginBottom: spacing.md,
  },
  nextEventTitle: {
    marginTop: spacing.xs,
  },
  nextEventMeta: {
    marginTop: 4,
  },
  regRow: {
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
    borderTopWidth: 1,
  },
  regStatusWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  regBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  regActions: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  regBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  paidPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  paidPillText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: typography.small.fontSize,
  },
  nextEventDetails: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.sm,
    alignItems: "center",
  },
  jointChipHome: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  oomPremiumPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    backgroundColor: colors.light.highlightMuted,
    borderWidth: 1,
    borderColor: `${colors.light.highlight}4D`,
    marginTop: spacing.sm,
  },
  oomPremiumPillText: {
    color: colors.light.highlight,
    fontWeight: "600",
    marginLeft: 4,
  },
  oomBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    marginTop: spacing.sm,
  },
  yourTeeTimeCard: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  yourTeeTimeLabel: {
    marginBottom: 4,
  },
  yourTeeTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  groupPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  playingWithRow: {
    marginTop: spacing.xs,
  },
  viewTeeSheetBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: spacing.sm,
  },
  teeTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
  },

  // Chevron hint
  chevronHint: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    marginTop: spacing.md,
  },

  // Season Snapshot
  snapshotGrid: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.md,
  },
  snapshotItem: {
    flex: 1,
    alignItems: "center",
  },
  snapshotDivider: {
    width: 1,
    height: 36,
  },

  // OOM Teaser
  oomRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  oomRank: {
    width: 28,
    textAlign: "center",
  },
  pinnedSeparator: {
    borderTopWidth: 1,
    borderStyle: "dashed",
    marginVertical: 2,
  },

  // Recent Activity
  sectionTitle: {
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  recentCard: {
    marginBottom: spacing.sm,
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  recentDateBadge: {
    width: 50,
    height: 50,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },

  // Empty state
  emptyState: {
    alignItems: "center",
    paddingVertical: spacing.xl,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },

  // Skeleton
  skeletonLine: {
    height: 14,
    borderRadius: 7,
  },
  skeletonBadge: {
    width: 80,
    height: 24,
    borderRadius: 12,
  },
  skeletonCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  skeletonHeaderCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    gap: spacing.md,
  },
  skeletonLogoFrame: {
    width: 80,
    height: 80,
    borderRadius: 18,
  },
  skeletonStatCard: {
    flex: 1,
    padding: spacing.md,
    minHeight: 88,
  },
  skeletonIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginBottom: spacing.sm,
  },
});
