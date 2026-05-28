/**
 * ManCo Tee Sheet Screen
 *
 * Allows ManCo to:
 * - Select an event
 * - Configure NTP/LD holes
 * - Set start time and interval
 * - Edit player groups (move players between groups)
 * - Generate grouped tee sheet PDF with gender-based tee settings
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Platform, StyleSheet, View, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { goBack } from "@/lib/navigation";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { RetryErrorBlock } from "@/components/ui/RetryErrorBlock";
import { Toast } from "@/components/ui/Toast";
import { LicenceRequiredModal } from "@/components/LicenceRequiredModal";
import { useBootstrap } from "@/lib/useBootstrap";
import { usePaidAccess } from "@/lib/access/usePaidAccess";
import {
  getEventsForTeeSheet,
  getEvent,
  updateEvent,
  publishTeeTime,
  unpublishTeeTimes,
  type EventDoc,
} from "@/lib/db_supabase/eventRepo";
import {
  getEventRegistrations,
  getTeeSheetEligibleMemberIdsForEvent,
  getJointTeeSheetCandidatePoolForEvent,
  type EventRegistration,
} from "@/lib/db_supabase/eventRegistrationRepo";
import { getTeeSheetEligibleGuestsForEvent, type EventGuest } from "@/lib/db_supabase/eventGuestRepo";
import {
  upsertTeeSheet,
  clearPersistedTeeSheet,
  getTeeGroupPlayers,
  getTeeSheetPlayerPolicy,
  replaceTeeSheetGuestAssignments,
  upsertTeeSheetPlayerPolicy,
  type TeeSheetPlayerPolicyRow,
} from "@/lib/db_supabase/teeGroupsRepo";
import { guestPlayerId, parseGuestPlayerId } from "@/lib/teeSheetEligibility";
import {
  editorGuestPlayerFromDoc,
  hydrateEditorGroupsWithPaidGuests,
} from "@/lib/teeSheet/teeSheetEditorGuests";
import {
  getJointEventTeeSheet,
  getJointMetaForEventIds,
  replaceJointEventTeeSheetEntries,
  mapJointEventToEventDoc,
  clearJointEventPairings,
  type JointEventTeeSheetReplaceRow,
} from "@/lib/db_supabase/jointEventRepo";
import type { JointEventTeeSheet, JointEventTeeSheetEntry } from "@/lib/db_supabase/jointEventTypes";
import { getMembersBySocietyId, getManCoRoleHolders, type MemberDoc, type Gender, type ManCoDetails } from "@/lib/db_supabase/memberRepo";
import { getPermissionsForMember } from "@/lib/rbac";
import {
  type TeeBlock,
  calcCourseHandicap,
  calcPlayingHandicap,
  formatHandicap,
  DEFAULT_ALLOWANCE,
} from "@/lib/whs";
import { parseHoleNumbers, formatHoleNumbers, calculateGroupSizes, sortPlayersByHandicap } from "@/lib/teeSheetGrouping";
import { buildSocietyIdToNameMap } from "@/lib/jointEventSocietyLabel";
import { expandJointTeeSheetReplaceRowsForParticipatingSocieties } from "@/lib/jointPersonDedupe";
import { getColors, spacing, radius } from "@/lib/ui/theme";
import { assertPngExportOnly } from "@/lib/share/pngExportGuard";
import { formatError, type FormattedError } from "@/lib/ui/formatError";
import {
  loadCanonicalTeeSheet,
  type CanonicalTeeSheetResult,
} from "@/lib/teeSheet/canonicalTeeSheet";
import { buildTeeSheetExportPayload } from "@/lib/teeSheet/buildTeeSheetExportPayload";
import { encodeTeeSheetShareRoutePayload } from "@/lib/teeSheet/encodeTeeSheetShareRoutePayload";
import { logShareError } from "@/lib/share/logShareError";
import {
  buildTeeSheetEditorSnapshot,
  teeSheetEditorSnapshotsEqual,
  type TeeSheetEditorSnapshot,
} from "@/lib/teeSheet/teeSheetEditorSnapshot";
import {
  isStaleTeeSheetLoad,
  teeSheetLoadElapsedMs,
  teeSheetLoadLog,
  teeSheetLoadStartedAt,
  validateCanonicalTeeGroupsForEditor,
  withTeeSheetLoadTimeout,
} from "@/lib/teeSheet/teeSheetEventLoadUtils";
import { getSocietyLogoUrl } from "@/lib/societyLogo";
import { getCache, invalidateCache, invalidateCachePrefix, setCache } from "@/lib/cache/clientCache";
import {
  isEventPastForList,
  partitionUpcomingPast,
  sortPastMostRecentFirst,
  sortUpcomingNearestFirst,
} from "@/lib/eventListGrouping";

const UPCOMING_EVENTS_TITLE = "Upcoming Events";
const PAST_EVENTS_TITLE = "Past Events";

type EditablePlayer = {
  id: string;
  name: string;
  handicapIndex: number | null;
  playingHandicap: number | null;
  gender: Gender;
  teeAssignment: "men" | "ladies" | null;
  manualGenderSet?: boolean;
  manualTeeOverride?: "men" | "ladies" | null;
  groupIndex: number;
  /** Set when built from joint event tee sheet (for save path) */
  event_entry_id?: string;
  /** All DB event_entry ids for this person (dual membership → same pairing on each row) */
  all_event_entry_ids?: string[];
  /** Society badge when joint event (e.g. society name or "Dual") */
  societyLabel?: string | null;
};

type PlayerGroup = {
  groupNumber: number;
  players: EditablePlayer[];
};

function teeAssignmentFromGender(
  gender: Gender,
  existing: "men" | "ladies" | null,
): "men" | "ladies" | null {
  if (gender === "female") return "ladies";
  if (gender === "male") return "men";
  return existing ?? null;
}

function policyByPlayerId(rows: TeeSheetPlayerPolicyRow[]): Map<string, TeeSheetPlayerPolicyRow> {
  return new Map(rows.map((r) => [String(r.player_id), r]));
}

function applySexPolicyToGroups(
  groups: PlayerGroup[],
  event: EventDoc,
  members: MemberDoc[],
  guests: EventGuest[],
  persistedPolicy?: Map<string, TeeSheetPlayerPolicyRow>,
): PlayerGroup[] {
  const menTee: TeeBlock | null =
    event.par != null && event.courseRating != null && event.slopeRating != null
      ? { par: event.par, courseRating: event.courseRating, slopeRating: event.slopeRating }
      : null;
  const ladiesTee: TeeBlock | null =
    event.ladiesPar != null && event.ladiesCourseRating != null && event.ladiesSlopeRating != null
      ? { par: event.ladiesPar, courseRating: event.ladiesCourseRating, slopeRating: event.ladiesSlopeRating }
      : null;
  const allowance = event.handicapAllowance ?? DEFAULT_ALLOWANCE;

  const memberById = new Map(members.map((m) => [String(m.id), m] as const));
  const guestByPlayerId = new Map(guests.map((g) => [guestPlayerId(g.id), g] as const));

  return groups.map((group, groupIndex) => ({
    ...group,
    players: group.players.map((player) => {
      const member = memberById.get(String(player.id));
      const guest = guestByPlayerId.get(String(player.id));
      const persisted = persistedPolicy?.get(String(player.id));
      const manualGender = (persisted?.manual_gender ?? null) as Gender;
      const manualTeeOverride = (persisted?.manual_tee_override ?? null) as "men" | "ladies" | null;
      const gender = (manualGender ?? member?.gender ?? guest?.sex ?? player.gender ?? null) as Gender;
      const teeAssignment = manualTeeOverride ?? teeAssignmentFromGender(gender, player.teeAssignment ?? null);
      const playerTee =
        teeAssignment === "ladies" ? ladiesTee : teeAssignment === "men" ? menTee : null;
      const hi = player.handicapIndex ?? member?.handicapIndex ?? member?.handicap_index ?? guest?.handicap_index ?? null;
      const courseHandicap = calcCourseHandicap(hi, playerTee);
      const playingHandicap = calcPlayingHandicap(courseHandicap, allowance);
      return {
        ...player,
        handicapIndex: hi,
        gender,
        teeAssignment,
        manualGenderSet: manualGender != null || player.manualGenderSet === true,
        manualTeeOverride,
        playingHandicap,
        groupIndex,
      };
    }),
  }));
}

function jointTeeSheetEntryToEditable(
  e: JointEventTeeSheetEntry,
  groupIndexZeroBased: number,
): EditablePlayer {
  const allIds =
    e.all_event_entry_ids?.length
      ? e.all_event_entry_ids
      : e.event_entry_id
        ? [e.event_entry_id]
        : [];
  return {
    id: e.player_id,
    name: e.player_name,
    handicapIndex: e.handicap_index ?? null,
    playingHandicap: null,
    gender: null as Gender,
    teeAssignment: null,
    manualGenderSet: false,
    manualTeeOverride: null,
    groupIndex: groupIndexZeroBased,
    event_entry_id: e.event_entry_id,
    all_event_entry_ids: allIds,
    societyLabel:
      (e.society_memberships?.length ?? 0) > 1
        ? e.society_memberships.join(" & ")
        : (e.primary_display_society ?? e.society_memberships?.[0] ?? null),
  };
}

function buildJointReplaceRowsFromGroups(groups: PlayerGroup[]): JointEventTeeSheetReplaceRow[] {
  return groups
    .filter((g) => g.players.length > 0)
    .flatMap((g) =>
      g.players
        .filter((p) => !String(p.id).startsWith("guest-"))
        .map((p, idx) => ({
          player_id: String(p.id),
          pairing_group: g.groupNumber === 0 ? null : g.groupNumber,
          pairing_position: g.groupNumber === 0 ? null : idx,
        })),
    );
}

/** Full replace must not collapse dual members to one id per person (same rule as Players save). */
async function buildJointExpandedReplaceRows(
  nonEmptyGroups: PlayerGroup[],
  jointTeeSheetData: JointEventTeeSheet | null,
  eventId: string,
): Promise<JointEventTeeSheetReplaceRow[]> {
  const base = buildJointReplaceRowsFromGroups(nonEmptyGroups);
  const societies = jointTeeSheetData?.participating_societies ?? [];
  const participantSocietyIds = societies.map((s) => s.society_id).filter(Boolean);
  if (participantSocietyIds.length === 0) return base;
  const societyMap = buildSocietyIdToNameMap(societies);
  const lists = await Promise.all(participantSocietyIds.map((sid) => getMembersBySocietyId(sid)));
  const pooled = lists.flat();
  const expanded = expandJointTeeSheetReplaceRowsForParticipatingSocieties(
    base,
    pooled,
    societyMap,
    participantSocietyIds,
  );
  if (__DEV__) {
    console.log("[teesheet] joint replace rows expanded for participating societies", {
      eventId,
      before: base.length,
      after: expanded.length,
    });
  }
  return expanded;
}

function validateGroupsMatchSelectedIds(nonEmptyGroups: PlayerGroup[], selectedIds: string[]): string | null {
  const fromGroups = nonEmptyGroups
    .flatMap((g) => g.players.map((p) => String(p.id)))
    .filter((id) => !id.startsWith("guest-"));
  const a = new Set(fromGroups);
  const b = new Set(selectedIds.map(String));
  if (a.size !== b.size) return "Group players and selected list differ in size.";
  for (const id of a) if (!b.has(id)) return "A player in groups is not in the selected list.";
  for (const id of b) if (!a.has(id)) return "A selected player is missing from groups.";
  return null;
}

function normalizeGroups(groups: PlayerGroup[]): PlayerGroup[] {
  return groups
    .filter((g) => g.players.length > 0)
    .map((g, i) => ({
      ...g,
      groupNumber: i + 1,
      players: g.players.map((p) => ({ ...p, groupIndex: i })),
    }));
}

function removePlayerFromGroups(groups: PlayerGroup[], playerId: string): PlayerGroup[] {
  const next = groups.map((g) => ({
    ...g,
    players: g.players.filter((p) => String(p.id) !== String(playerId)),
  }));
  return normalizeGroups(next);
}

function GroupNumInput({
  currentGroup,
  onMove,
}: {
  currentGroup: number;
  onMove: (value: string) => void;
}) {
  const [value, setValue] = useState(String(currentGroup));
  useEffect(() => setValue(String(currentGroup)), [currentGroup]);

  const handleBlur = () => {
    const v = value.trim();
    if (v) onMove(v);
  };

  return (
    <View style={styles.groupNumInputWrap}>
      <AppText variant="caption" color="muted" style={styles.groupNumLabel}>Grp</AppText>
      <AppInput
        style={styles.groupNumInput}
        value={value}
        onChangeText={setValue}
        placeholder={String(currentGroup)}
        keyboardType="number-pad"
        maxLength={2}
        onBlur={handleBlur}
        onSubmitEditing={handleBlur}
      />
    </View>
  );
}

const GroupTableCard = React.memo(function GroupTableCard({
  group,
  showSocietyBadge,
}: {
  group: PlayerGroup;
  showSocietyBadge?: boolean;
}) {
  return (
    <AppCard style={styles.groupTableCard}>
      <AppText variant="bodyBold" color="primary" style={styles.groupTitle}>
        {group.groupNumber === 0 ? "Unassigned" : `Group ${group.groupNumber}`}
      </AppText>
      <View style={styles.tableHeader}>
        <AppText variant="caption" color="secondary" style={styles.nameCol}>Name</AppText>
        <AppText variant="caption" color="secondary" style={styles.hiCol}>HI</AppText>
        <AppText variant="caption" color="secondary" style={styles.phCol}>PH</AppText>
      </View>
      {group.players.map((player) => (
        <View key={player.id} style={styles.tableRow}>
          <View style={styles.nameCol}>
            <AppText variant="body" numberOfLines={1}>
              {player.name}
            </AppText>
            {showSocietyBadge && (player as EditablePlayer).societyLabel ? (
              <AppText variant="small" color="muted" numberOfLines={1}>
                {(player as EditablePlayer).societyLabel}
              </AppText>
            ) : null}
          </View>
          <AppText variant="body" color="secondary" style={styles.hiCol}>
            {formatHandicap(player.handicapIndex, 1)}
          </AppText>
          <AppText variant="bodyBold" color="primary" style={styles.phCol}>
            {formatHandicap(player.playingHandicap)}
          </AppText>
        </View>
      ))}
    </AppCard>
  );
});

export default function TeeSheetScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { societyId, society, member, loading: bootstrapLoading } = useBootstrap();
  const { guardPaidAction, modalVisible, setModalVisible, societyId: guardSocietyId } = usePaidAccess();
  const colors = getColors();

  const [events, setEvents] = useState<EventDoc[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventDoc | null>(null);
  const [members, setMembers] = useState<MemberDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<FormattedError | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error" | "info"; message: string; detail?: string } | null>(null);
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: "success" | "error" | "info" }>({ visible: false, message: "", type: "success" });

  // Form state
  const [ntpHolesInput, setNtpHolesInput] = useState("");
  const [ldHolesInput, setLdHolesInput] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [teeInterval, setTeeInterval] = useState("10");

  // Editable groups state
  const [groups, setGroups] = useState<PlayerGroup[]>([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [eligibleMemberIds, setEligibleMemberIds] = useState<string[]>([]);
  const [eventMemberPool, setEventMemberPool] = useState<MemberDoc[]>([]);
  /** Paid event_guests for manual add + auto-hydration (id-based, not name). */
  const [eligiblePaidGuests, setEligiblePaidGuests] = useState<EventGuest[]>([]);
  const [, setSelectedEventRegistrations] = useState<EventRegistration[]>([]);
  const [showGroupEditor, setShowGroupEditor] = useState(false);
  const [manCo, setManCo] = useState<ManCoDetails>({ captain: null, secretary: null, treasurer: null, handicapper: null });
  const [isJointEventTeeSheet, setIsJointEventTeeSheet] = useState(false);
  const [jointTeeSheetData, setJointTeeSheetData] = useState<JointEventTeeSheet | null>(null);
  const [eventDetailsRefreshing, setEventDetailsRefreshing] = useState(false);
  const [eventDetailsError, setEventDetailsError] = useState<FormattedError | null>(null);
  const [hasHydratedIndexCache, setHasHydratedIndexCache] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const eventLoadSeqRef = React.useRef(0);
  const savedSnapshotRef = React.useRef<TeeSheetEditorSnapshot | null>(null);
  const societyIdRef = React.useRef(societyId);
  societyIdRef.current = societyId;

  const permissions = getPermissionsForMember(member);
  const canGenerateTeeSheet = permissions.canGenerateTeeSheet;

  const { upcomingEvents, pastEvents } = useMemo(() => {
    const { upcoming, past } = partitionUpcomingPast(events);
    return {
      upcomingEvents: sortUpcomingNearestFirst(upcoming),
      pastEvents: sortPastMostRecentFirst(past),
    };
  }, [events]);

  const isPastEventSelected = !!(selectedEvent && isEventPastForList(selectedEvent));

  // Get logo URL from society
  const logoUrl = getSocietyLogoUrl(society);
  // Load events (host + joint where society participates) and members
  const loadData = useCallback(async () => {
    if (!societyId) return;

    setRefreshing(events.length > 0 || members.length > 0);
    setLoading(!(events.length > 0 || members.length > 0));
    setLoadError(null);
    try {
      const [eventsData, membersData, manCoData] = await Promise.all([
        getEventsForTeeSheet(societyId),
        getMembersBySocietyId(societyId),
        getManCoRoleHolders(societyId),
      ]);

      const { upcoming, past } = partitionUpcomingPast(eventsData);
      const upcomingSorted = sortUpcomingNearestFirst(upcoming);
      const pastSorted = sortPastMostRecentFirst(past);
      const mergedForList = [...upcomingSorted, ...pastSorted];
      setEvents(mergedForList);
      setMembers(membersData);
      setManCo(manCoData);
      await setCache(`society:${societyId}:tee-sheet:index`, {
        events: mergedForList,
        members: membersData,
        manCo: manCoData,
      }, { ttlMs: 1000 * 60 * 5 });

      // Prefer keeping selection if still listed; otherwise default to nearest upcoming (then any event).
      setSelectedEventId((prev) => {
        if (prev && mergedForList.some((e) => e.id === prev)) return prev;
        return upcomingSorted[0]?.id ?? mergedForList[0]?.id ?? null;
      });
    } catch (err) {
      console.error("[TeeSheet] loadData error:", err);
      setLoadError(formatError(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [societyId, events.length, members.length]);

  useEffect(() => {
    if (!societyId) return;
    void (async () => {
      const cached = await getCache<{
        events: EventDoc[];
        members: MemberDoc[];
        manCo: ManCoDetails;
      }>(`society:${societyId}:tee-sheet:index`, { maxAgeMs: 1000 * 60 * 60 });
      if (cached) {
        setEvents(cached.value.events ?? []);
        setMembers(cached.value.members ?? []);
        setManCo(cached.value.manCo ?? { captain: null, secretary: null, treasurer: null, handicapper: null });
        setLoading(false);
      }
      setHasHydratedIndexCache(true);
      await loadData();
    })();
  }, [societyId, loadData]);

  const commitSavedSnapshotBaseline = useCallback(
    (snapshotInput: {
      groups: PlayerGroup[];
      startTime: string;
      teeInterval: string;
      ntpHolesInput: string;
      ldHolesInput: string;
      selectedPlayerIds: string[];
    }) => {
      savedSnapshotRef.current = buildTeeSheetEditorSnapshot(snapshotInput);
    },
    [],
  );

  const logSelectedPlayersDev = useCallback((label: string, eventId: string, ids: string[]) => {
    if (!__DEV__) return;
    const uniq = [...new Set(ids.map(String))];
    console.log(label, {
      eventId,
      count: uniq.length,
      ids: uniq,
    });
  }, []);

  const groupsToPlayerIdsFrom = (groupsArg: PlayerGroup[]): string[] =>
    groupsArg.flatMap((g) => g.players).map((p) => p.id).filter((id) => !id.startsWith("guest-"));

  // Load selected event details and initialize groups (standard or joint path)
  const reloadSelectedEventDetails = useCallback(async () => {
      const eventId = selectedEventId;
      const hostSocietyId = societyIdRef.current;

      if (!eventId) {
        setSelectedEvent(null);
        setSelectedEventRegistrations([]);
        setGroups([]);
        setSelectedPlayerIds([]);
        setEligibleMemberIds([]);
        setEventMemberPool([]);
        setEligiblePaidGuests([]);
        setIsJointEventTeeSheet(false);
        setJointTeeSheetData(null);
        setEventDetailsRefreshing(false);
        setEventDetailsError(null);
        return;
      }

      const startedAt = teeSheetLoadStartedAt();
      const seq = ++eventLoadSeqRef.current;
      teeSheetLoadLog("reload start", { selectedEventId: eventId, seq });

      setEventDetailsError(null);
      setEventDetailsRefreshing(true);

      const applyIfCurrent = (fn: () => void) => {
        if (!isStaleTeeSheetLoad(seq, eventLoadSeqRef.current)) fn();
      };

      const logStep = (step: string, extra?: Record<string, unknown>) => {
        teeSheetLoadLog(step, {
          selectedEventId: eventId,
          seq,
          elapsedMs: teeSheetLoadElapsedMs(startedAt),
          ...extra,
        });
      };

      try {
        await withTeeSheetLoadTimeout(
          (async () => {
            logStep("joint_meta");
            const jointMetaMap = await getJointMetaForEventIds([eventId]);
            const joint = jointMetaMap.get(eventId)?.is_joint_event ?? false;
            logStep("joint_meta done", { joint });

            if (joint) {
              logStep("joint_tee_sheet fetch");
              const teeSheet = await getJointEventTeeSheet(eventId);
              logStep("joint_tee_sheet done", { hasTeeSheet: !!teeSheet });
              if (!teeSheet) {
                throw new Error("Could not load joint event tee sheet.");
              }

              const ev = teeSheet.event;
              const persistedNtp = formatHoleNumbers(ev.nearest_pin_holes ?? []);
              const persistedLd = formatHoleNumbers(ev.longest_drive_holes ?? []);

              logStep("joint_regs");
              const regs = await getEventRegistrations(eventId);

              const participantSocietyIds =
                teeSheet.participating_societies?.map((s) => s.society_id).filter(Boolean) ?? [];
              logStep("joint_members", { societyCount: participantSocietyIds.length });
              const lists = await Promise.all(participantSocietyIds.map((sid) => getMembersBySocietyId(sid)));
              const pooled = lists.flat();
              const candidate = await getJointTeeSheetCandidatePoolForEvent(eventId, participantSocietyIds);
              const candidateIdSet = new Set(candidate.memberIds);
              const candidateMembers = pooled.filter((m) => candidateIdSet.has(String(m.id)));

              logStep("joint_guests");
              const [jointGuestAssignments, jointPaidGuests, jointPolicyRows] = await Promise.all([
                getTeeGroupPlayers(eventId).then((rows) =>
                  rows.filter((r) => parseGuestPlayerId(String(r.player_id)) != null),
                ),
                getTeeSheetEligibleGuestsForEvent(eventId),
                getTeeSheetPlayerPolicy(eventId),
              ]);

              let persistedGroups: PlayerGroup[] = normalizeGroups(
                (teeSheet.groups ?? []).map((g, groupIdx) => ({
                  groupNumber: g.group_number,
                  players: (g.entries ?? []).map((e) => jointTeeSheetEntryToEditable(e, groupIdx)),
                })),
              );
              persistedGroups = normalizeGroups(
                hydrateEditorGroupsWithPaidGuests(persistedGroups, jointPaidGuests, jointGuestAssignments),
              );
              const jointEventDoc = mapJointEventToEventDoc(teeSheet.event) as EventDoc;
              persistedGroups = applySexPolicyToGroups(
                persistedGroups,
                jointEventDoc,
                candidateMembers,
                jointPaidGuests,
                policyByPlayerId(jointPolicyRows),
              );
              const persistedIds = groupsToPlayerIdsFrom(persistedGroups);

              applyIfCurrent(() => {
                setJointTeeSheetData(teeSheet);
                setIsJointEventTeeSheet(true);
                setSelectedEvent(jointEventDoc);
                setSelectedEventRegistrations(regs);
                setNtpHolesInput(persistedNtp);
                setLdHolesInput(persistedLd);
                if (ev.tee_time_start) setStartTime(ev.tee_time_start);
                if (ev.tee_time_interval != null && ev.tee_time_interval > 0) {
                  setTeeInterval(String(ev.tee_time_interval));
                }
                setEventMemberPool(candidateMembers);
                setEligiblePaidGuests(jointPaidGuests);
                setEligibleMemberIds(candidate.memberIds);
                setSelectedEventRegistrations(candidate.registrations);

                if (persistedIds.length > 0 || persistedGroups.some((g) => g.players.length > 0)) {
                  setGroups(persistedGroups);
                  setSelectedPlayerIds(persistedIds);
                  commitSavedSnapshotBaseline({
                    groups: persistedGroups,
                    startTime: ev.tee_time_start || "08:00",
                    teeInterval: String(ev.tee_time_interval ?? 10),
                    ntpHolesInput: persistedNtp,
                    ldHolesInput: persistedLd,
                    selectedPlayerIds: persistedIds,
                  });
                  logSelectedPlayersDev("[teesheet] selected players (after ManCo edits)", eventId, persistedIds);
                } else {
                  setSelectedPlayerIds(candidate.memberIds);
                  initializeGroups(jointEventDoc, candidate.memberIds, candidateMembers, jointPaidGuests);
                  logSelectedPlayersDev("[teesheet] selected players (after ManCo edits)", eventId, candidate.memberIds);
                }
              });
              logStep("joint apply done");
              return;
            }

            logStep("standard_event fetch");
            applyIfCurrent(() => {
              setIsJointEventTeeSheet(false);
              setJointTeeSheetData(null);
            });

            const [event, registrations, paidGuests, persistedPolicyRows] = await Promise.all([
              getEvent(eventId),
              getEventRegistrations(eventId),
              getTeeSheetEligibleGuestsForEvent(eventId),
              getTeeSheetPlayerPolicy(eventId),
            ]);
            logStep("standard_event done", { hasEvent: !!event });

            if (!event) {
              throw new Error("Event not found.");
            }

            logStep("standard_members");
            const hostIdStd = event.society_id ?? hostSocietyId ?? null;
            const membersStd = await getMembersBySocietyId(hostIdStd ?? "");
            const eligibleIds = await getTeeSheetEligibleMemberIdsForEvent(eventId);
            logSelectedPlayersDev("[teesheet] tee-sheet eligible (paid + in)", eventId, eligibleIds);

            logStep("canonical_load");
            const canonical = await loadCanonicalTeeSheet(eventId, { preserveDraftPlayers: true });
            const badCanonical = validateCanonicalTeeGroupsForEditor(
              canonical?.source === "tee_groups" ? canonical : null,
            );
            if (badCanonical) {
              throw new Error(badCanonical);
            }
            logStep("canonical_load done", {
              source: canonical?.source ?? "none",
              groupCount: canonical?.groups.length ?? 0,
            });

            const hasPersistedGroups =
              canonical != null && canonical.source === "tee_groups" && canonical.groups.length > 0;

            applyIfCurrent(() => {
              setEligiblePaidGuests(paidGuests);
              setSelectedEvent(event);
              setSelectedEventRegistrations(registrations ?? []);
              setNtpHolesInput(formatHoleNumbers(event.nearestPinHoles));
              setLdHolesInput(formatHoleNumbers(event.longestDriveHoles));
              if (event.teeTimeStart) setStartTime(event.teeTimeStart);
              if (event.teeTimeInterval != null && event.teeTimeInterval > 0) {
                setTeeInterval(String(event.teeTimeInterval));
              }
              setEventMemberPool(membersStd);
              setEligibleMemberIds(eligibleIds);

              if (hasPersistedGroups && canonical) {
                let persistedGroups = groupsFromCanonical(
                  event,
                  canonical,
                  membersStd,
                  paidGuests,
                  policyByPlayerId(persistedPolicyRows),
                );
                persistedGroups = hydrateEditorGroupsWithPaidGuests(persistedGroups, paidGuests);
                const persistedIds = groupsToPlayerIdsFrom(persistedGroups);
                setGroups(persistedGroups);
                setSelectedPlayerIds(persistedIds);
                commitSavedSnapshotBaseline({
                  groups: persistedGroups,
                  startTime: event.teeTimeStart || "08:00",
                  teeInterval: String(event.teeTimeInterval ?? 10),
                  ntpHolesInput: formatHoleNumbers(event.nearestPinHoles),
                  ldHolesInput: formatHoleNumbers(event.longestDriveHoles),
                  selectedPlayerIds: persistedIds,
                });
                logSelectedPlayersDev("[teesheet] selected players (after ManCo edits)", eventId, persistedIds);
              } else {
                setSelectedPlayerIds(eligibleIds);
                initializeGroups(event, eligibleIds, membersStd, paidGuests);
                logSelectedPlayersDev("[teesheet] selected players (after ManCo edits)", eventId, eligibleIds);
              }
            });
            logStep("standard apply done");
          })(),
        );
        teeSheetLoadLog("reload success", {
          selectedEventId: eventId,
          seq,
          elapsedMs: teeSheetLoadElapsedMs(startedAt),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        teeSheetLoadLog("reload error", {
          selectedEventId: eventId,
          seq,
          elapsedMs: teeSheetLoadElapsedMs(startedAt),
          message,
        });
        console.error("[TeeSheet] reloadSelectedEventDetails error:", err);
        const formatted = formatError(err);
        applyIfCurrent(() => {
          setEventDetailsError(formatted);
          setNotice({ type: "error", ...formatted });
        });
      } finally {
        teeSheetLoadLog("reload finally", {
          selectedEventId: eventId,
          seq,
          elapsedMs: teeSheetLoadElapsedMs(startedAt),
        });
        setEventDetailsRefreshing(false);
      }
  }, [selectedEventId, commitSavedSnapshotBaseline, logSelectedPlayersDev]);

  useEffect(() => {
    void reloadSelectedEventDetails();
  }, [selectedEventId, societyId, reloadSelectedEventDetails]);

  const groupsFromCanonical = (
    event: EventDoc,
    canonical: CanonicalTeeSheetResult,
    membersList: MemberDoc[],
    guests: EventGuest[],
    persistedPolicy?: Map<string, TeeSheetPlayerPolicyRow>,
  ): PlayerGroup[] => {
    const menTee: TeeBlock | null =
      event.par != null && event.courseRating != null && event.slopeRating != null
        ? { par: event.par, courseRating: event.courseRating, slopeRating: event.slopeRating }
        : null;
    const ladiesTee: TeeBlock | null =
      event.ladiesPar != null && event.ladiesCourseRating != null && event.ladiesSlopeRating != null
        ? { par: event.ladiesPar, courseRating: event.ladiesCourseRating, slopeRating: event.ladiesSlopeRating }
        : null;
    const allowance = event.handicapAllowance ?? DEFAULT_ALLOWANCE;

    const guestByPlayerId = new Map(guests.map((g) => [`guest-${g.id}`, g] as const));

    return normalizeGroups(
      canonical.groups.map((g, groupIdx) => ({
        groupNumber: g.groupNumber,
        players: g.players.map((p) => {
          const member = membersList.find((m) => m.id === p.id);
          const guest = guestByPlayerId.get(p.id);
          const persisted = persistedPolicy?.get(String(p.id));
          const manualGender = (persisted?.manual_gender ?? null) as Gender;
          const gender = (manualGender ?? member?.gender ?? guest?.sex ?? null) as Gender;
          const teeAssignment = teeAssignmentFromGender(gender, null);
          const hi = member?.handicapIndex ?? member?.handicap_index ?? p.handicapIndex ?? null;
          const playerTee =
            teeAssignment === "ladies" ? ladiesTee : teeAssignment === "men" ? menTee : null;
          const courseHandicap = calcCourseHandicap(hi, playerTee);
          const playingHandicap = calcPlayingHandicap(courseHandicap, allowance);
          return {
            id: p.id,
            name: p.name || member?.name || member?.displayName || "Member",
            handicapIndex: hi,
            playingHandicap,
            gender,
            teeAssignment,
            groupIndex: groupIdx,
            societyLabel: p.societyLabel ?? null,
          } as EditablePlayer;
        }),
      })),
    );
  };

  // Initialize groups from selected member ids + guests
  const initializeGroups = (
    event: EventDoc,
    selectedIds: string[],
    membersList: MemberDoc[],
    guests: { id: string; name: string; sex: "male" | "female" | null; handicap_index: number | null }[] = []
  ) => {
    const playerIds = [...new Set(selectedIds.map(String).filter(Boolean))];
    const eventMembers = playerIds
      .map((id) => membersList.find((m) => m.id === id))
      .filter(Boolean) as typeof membersList;

    // Convert guests to same shape as members for grouping
    const guestPlayers = guests.map((g) => ({
      id: `guest-${g.id}`,
      name: g.name,
      handicapIndex: g.handicap_index ?? null,
      handicap_index: g.handicap_index ?? null,
      // null sex → men's tee block via selectTeeByGender (same as members with unknown gender)
      gender: (g.sex ?? null) as Gender,
      displayName: g.name,
    }));

    const allPlayers = sortPlayersByHandicap(
      [...eventMembers, ...guestPlayers].map((p) => ({
        ...p,
        handicapIndex: p.handicapIndex ?? p.handicap_index ?? null,
      })),
    );

    if (allPlayers.length === 0) {
      setGroups([]);
      return;
    }

    // Build tee settings for handicap calculations
    const menTee: TeeBlock | null =
      event.par != null && event.courseRating != null && event.slopeRating != null
        ? { par: event.par, courseRating: event.courseRating, slopeRating: event.slopeRating }
        : null;
    const ladiesTee: TeeBlock | null =
      event.ladiesPar != null && event.ladiesCourseRating != null && event.ladiesSlopeRating != null
        ? { par: event.ladiesPar, courseRating: event.ladiesCourseRating, slopeRating: event.ladiesSlopeRating }
        : null;
    const allowance = event.handicapAllowance ?? DEFAULT_ALLOWANCE;

    const sorted = allPlayers;

    const groupSizes = calculateGroupSizes(sorted.length);

    // Create groups
    const newGroups: PlayerGroup[] = [];
    let playerIndex = 0;

    for (let i = 0; i < groupSizes.length; i++) {
      const groupPlayers: EditablePlayer[] = [];
      const size = groupSizes[i];

      for (let j = 0; j < size && playerIndex < sorted.length; j++) {
        const m = sorted[playerIndex];
        const gender = m.gender ?? null;
        const teeAssignment = teeAssignmentFromGender(gender, null);
        const hi = m.handicapIndex ?? m.handicap_index ?? null;

        // Calculate playing handicap based on gender and tee settings
        const playerTee =
          teeAssignment === "ladies" ? ladiesTee : teeAssignment === "men" ? menTee : null;
        const courseHandicap = calcCourseHandicap(hi, playerTee);
        const playingHandicap = calcPlayingHandicap(courseHandicap, allowance);

        groupPlayers.push({
          id: m.id,
          name: m.name || m.displayName || "Member",
          handicapIndex: hi,
          playingHandicap,
          gender,
          teeAssignment,
          groupIndex: i,
        });
        playerIndex++;
      }

      newGroups.push({
        groupNumber: i + 1,
        players: groupPlayers,
      });
    }

    setGroups(newGroups);
  };

  const currentEditorSnapshot = useMemo(
    () =>
      buildTeeSheetEditorSnapshot({
        groups,
        startTime,
        teeInterval,
        ntpHolesInput,
        ldHolesInput,
        selectedPlayerIds,
      }),
    [groups, startTime, teeInterval, ntpHolesInput, ldHolesInput, selectedPlayerIds],
  );

  const isDirty = useMemo(() => {
    if (!savedSnapshotRef.current) {
      return currentEditorSnapshot.groups.length > 0;
    }
    return !teeSheetEditorSnapshotsEqual(currentEditorSnapshot, savedSnapshotRef.current);
  }, [currentEditorSnapshot]);

  useEffect(() => {
    if (!isDirty || saving || generating) return;
    const unsubscribe = navigation.addListener("beforeRemove", (e) => {
      e.preventDefault();
      const leave = () => navigation.dispatch(e.data.action);
      const message = "You have unsaved tee sheet changes. Leave without saving?";
      if (Platform.OS === "web" && typeof globalThis.confirm === "function") {
        if (globalThis.confirm(message)) leave();
        return;
      }
      Alert.alert("Unsaved changes", message, [
        { text: "Stay", style: "cancel" },
        { text: "Leave", style: "destructive", onPress: leave },
      ]);
    });
    return unsubscribe;
  }, [navigation, isDirty, saving, generating]);

  const markDraftSavedLocally = useCallback(() => {
    commitSavedSnapshotBaseline({
      groups,
      startTime,
      teeInterval,
      ntpHolesInput,
      ldHolesInput,
      selectedPlayerIds,
    });
    setLastSavedAt(new Date());
  }, [commitSavedSnapshotBaseline, groups, startTime, teeInterval, ntpHolesInput, ldHolesInput, selectedPlayerIds]);

  // Refresh on focus — always reload persisted draft from DB (same event id stays mounted in stack).
  useFocusEffect(
    useCallback(() => {
      if (societyId) {
        loadData();
      }
      if (selectedEventId) {
        void reloadSelectedEventDetails();
      }
      setGenerating(false);
    }, [societyId, loadData, selectedEventId, reloadSelectedEventDetails]),
  );

  const logPostSaveJointRead = useCallback(async (eventId: string, expectedMemberIds: string[]) => {
    if (!__DEV__) return;
    try {
      const ts = await getJointEventTeeSheet(eventId);
      const readIds = [...new Set(
        (ts?.groups ?? [])
          .flatMap((g) => g.entries ?? [])
          .map((e) => String(e.player_id))
      )];
      console.log("[teesheet] save readback", {
        eventId,
        source: "joint_event_entries",
        expectedCount: [...new Set(expectedMemberIds.map(String))].length,
        readCount: readIds.length,
        groups: ts?.groups?.length ?? 0,
        readIds,
      });
    } catch (err) {
      console.warn("[teesheet] save readback failed", { eventId, error: err });
    }
  }, []);

  useEffect(() => {
    if (!selectedEventId) return;
    logSelectedPlayersDev("[teesheet] selected players (after ManCo edits)", selectedEventId, selectedPlayerIds);
  }, [selectedEventId, selectedPlayerIds, logSelectedPlayersDev]);

  // Compute tee time for group number (1-based): start + (n-1) * interval
  const computeTeeTimeForGroup = (groupNumber: number): string => {
    const start = (startTime || "08:00").trim() || "08:00";
    const [h, m] = start.split(":").map(Number);
    const startMins = (isNaN(h) ? 8 : h) * 60 + (isNaN(m) ? 0 : m);
    const interval = parseInt(teeInterval, 10) || 10;
    const totalMins = startMins + (groupNumber - 1) * interval;
    const th = Math.floor(totalMins / 60);
    const tm = totalMins % 60;
    return `${String(th).padStart(2, "0")}:${String(tm).padStart(2, "0")}`;
  };

  /** Core clear logic after user confirms (unpublish first, then clear persisted groups). */
  const executeClearTeeSheetAfterConfirm = async () => {
    if (!selectedEventId) return;
    setSaving(true);
    setNotice(null);
    try {
      /**
       * Unpublish FIRST: clearing tee_groups / pairings can fail for participant ManCo (RLS),
       * but unpublish must always run so members no longer see a published tee sheet.
       */
      await unpublishTeeTimes(selectedEventId);
      if (isJointEventTeeSheet) {
        await clearJointEventPairings(selectedEventId);
      } else {
        await clearPersistedTeeSheet(selectedEventId);
      }

      if (isJointEventTeeSheet) {
        const teeSheet = await getJointEventTeeSheet(selectedEventId);
        if (teeSheet) {
          setJointTeeSheetData(teeSheet);
          setSelectedEvent(mapJointEventToEventDoc(teeSheet.event) as EventDoc);
          const newGroups: PlayerGroup[] = (teeSheet.groups ?? []).map((g, groupIdx) => ({
            groupNumber: g.group_number,
            players: (g.entries ?? []).map((e) => jointTeeSheetEntryToEditable(e, groupIdx)),
          }));
          setGroups(newGroups.length > 0 ? newGroups : []);
          const ids = groupsToPlayerIdsFrom(newGroups);
          setSelectedPlayerIds(ids);
          logSelectedPlayersDev("[teesheet] selected players (after ManCo edits)", selectedEventId, ids);
        } else {
          setGroups([]);
          setSelectedPlayerIds([]);
        }
      } else {
        const [evt, paidGuestList] = await Promise.all([
          getEvent(selectedEventId),
          getTeeSheetEligibleGuestsForEvent(selectedEventId),
        ]);
        if (evt) {
          setSelectedEvent(evt);
          setEligiblePaidGuests(paidGuestList);
          const eligibleIds = await getTeeSheetEligibleMemberIdsForEvent(selectedEventId);
          setSelectedPlayerIds(eligibleIds);
          setEligibleMemberIds(eligibleIds);
          logSelectedPlayersDev("[teesheet] tee-sheet eligible (paid + in)", selectedEventId, eligibleIds);
          initializeGroups(
            evt,
            eligibleIds,
            eventMemberPool.length > 0 ? eventMemberPool : members,
            paidGuestList,
          );
        }
      }
      setToast({ visible: true, message: "Tee sheet cleared", type: "success" });
      await invalidateCache(`event:${selectedEventId}:tee-sheet`);
      await invalidateCache(`event:${selectedEventId}:detail`);
      if (societyId) await invalidateCachePrefix(`society:${societyId}:`);
      loadData();
    } catch (err: unknown) {
      const formatted = formatError(err);
      setNotice({ type: "error", message: formatted.message, detail: formatted.detail });
    } finally {
      setSaving(false);
    }
  };

  /** Unpublish only — hides tee times from members without clearing groups (uses same RPC as full clear). */
  const executeUnpublishOnlyAfterConfirm = async () => {
    if (!selectedEventId) return;
    setSaving(true);
    setNotice(null);
    try {
      await unpublishTeeTimes(selectedEventId);
      if (isJointEventTeeSheet) {
        const ts = await getJointEventTeeSheet(selectedEventId);
        if (ts) {
          setJointTeeSheetData(ts);
          setSelectedEvent(mapJointEventToEventDoc(ts.event) as EventDoc);
        }
      } else {
        const evt = await getEvent(selectedEventId);
        if (evt) setSelectedEvent(evt);
      }
      setToast({
        visible: true,
        message: "Tee times unpublished — hidden from members until you publish again.",
        type: "success",
      });
      await invalidateCache(`event:${selectedEventId}:tee-sheet`);
      await invalidateCache(`event:${selectedEventId}:detail`);
      if (societyId) await invalidateCachePrefix(`society:${societyId}:`);
      loadData();
    } catch (err: unknown) {
      const formatted = formatError(err);
      setNotice({ type: "error", message: formatted.message, detail: formatted.detail });
    } finally {
      setSaving(false);
    }
  };

  /**
   * Web: React Native Alert often does not show a usable confirm dialog — use window.confirm.
   * Native: keep Alert.alert.
   */
  const handleClearTeeSheet = () => {
    if (!selectedEventId) return;
    const message = isJointEventTeeSheet
      ? "This removes all saved group assignments and unpublishes tee times. Members will not see a tee sheet until you save and publish again."
      : "This removes saved tee groups and unpublishes tee times. Groups will be rebuilt from the player list; members will not see tee times until you publish again.";

    const run = () => {
      if (!guardPaidAction()) return;
      void executeClearTeeSheetAfterConfirm();
    };

    if (Platform.OS === "web") {
      const ok =
        typeof globalThis !== "undefined" &&
        typeof (globalThis as unknown as { confirm?: (s: string) => boolean }).confirm === "function" &&
        (globalThis as unknown as { confirm: (s: string) => boolean }).confirm(`Clear tee sheet?\n\n${message}`);
      if (ok) run();
      return;
    }

    Alert.alert("Clear tee sheet?", message, [
      { text: "Cancel", style: "cancel" },
      { text: "Clear", style: "destructive", onPress: run },
    ]);
  };

  const handleUnpublishTeeTimesOnly = () => {
    if (!selectedEventId) return;
    const message =
      "Members will no longer see published tee times on home or the event. Your saved groups stay as they are until you clear or change them.";

    const run = () => {
      if (!guardPaidAction()) return;
      void executeUnpublishOnlyAfterConfirm();
    };

    if (Platform.OS === "web") {
      const ok =
        typeof globalThis !== "undefined" &&
        typeof (globalThis as unknown as { confirm?: (s: string) => boolean }).confirm === "function" &&
        (globalThis as unknown as { confirm: (s: string) => boolean }).confirm(`Unpublish tee times?\n\n${message}`);
      if (ok) run();
      return;
    }

    Alert.alert("Unpublish tee times?", message, [
      { text: "Cancel", style: "cancel" },
      { text: "Unpublish", style: "destructive", onPress: run },
    ]);
  };

  const navigateToTeeSheetShare = useCallback(
    async (canonical: CanonicalTeeSheetResult) => {
      if (!selectedEventId || !societyId) return;

      const interval = parseInt(teeInterval, 10) || 10;
      const ntpHoles = parseHoleNumbers(ntpHolesInput === "-" ? "" : ntpHolesInput);
      const ldHoles = parseHoleNumbers(ldHolesInput === "-" ? "" : ldHolesInput);
      const societyNameExport =
        isJointEventTeeSheet && jointTeeSheetData?.participating_societies?.length
          ? `Joint: ${jointTeeSheetData.participating_societies.map((s: { society_name: string }) => s.society_name).filter(Boolean).join(" & ")}`
          : (society?.name || "Golf Society");

      const exportData = buildTeeSheetExportPayload({
        canonical,
        societyId,
        societyName: societyNameExport,
        logoUrl,
        manCo,
        nearestPinHoles: ntpHoles.length > 0 ? ntpHoles : null,
        longestDriveHoles: ldHoles.length > 0 ? ldHoles : null,
        startTime: startTime || null,
        teeTimeInterval: interval,
        genderHints: groups.flatMap((g) =>
          g.players.map((p) => ({
            id: p.id,
            gender: p.gender ?? null,
            teeAssignment: p.teeAssignment ?? null,
            manualOverride: p.manualGenderSet === true || p.manualTeeOverride != null,
            playingHandicapSnapshot: p.playingHandicap ?? null,
          })),
        ),
      });

      assertPngExportOnly("Tee Sheet export");
      router.push({
        pathname: "/(share)/tee-sheet",
        params: { payload: encodeTeeSheetShareRoutePayload(exportData) },
      });
    },
    [
      groups,
      isJointEventTeeSheet,
      jointTeeSheetData,
      ldHolesInput,
      logoUrl,
      manCo,
      ntpHolesInput,
      router,
      society?.name,
      societyId,
      startTime,
      teeInterval,
    ],
  );

  /** Persist groups, tee times, competition holes, and player scope — does not publish. */
  const persistTeeSheetDraft = async (opts?: { quiet?: boolean }): Promise<boolean> => {
    if (!guardPaidAction()) return false;
    if (!selectedEventId || !selectedEvent) return false;
    const nonEmptyGroups = groups.filter((g) => g.players.length > 0);
    if (nonEmptyGroups.length === 0) {
      if (!opts?.quiet) {
        setNotice({ type: "error", message: "No players added", detail: "Add players to groups before saving." });
      }
      return false;
    }
    if (!opts?.quiet) {
      setNotice(null);
      setSaving(true);
    }
    try {
      const interval = parseInt(teeInterval, 10) || 10;
      const ntpHoles = parseHoleNumbers(ntpHolesInput === "-" ? "" : ntpHolesInput);
      const ldHoles = parseHoleNumbers(ldHolesInput === "-" ? "" : ldHolesInput);
      const manualPolicyInputs = nonEmptyGroups.flatMap((g) =>
        g.players.map((p) => ({
          player_id: p.id,
          manual_gender: p.manualGenderSet ? (p.gender ?? null) : null,
          manual_tee_assignment: p.teeAssignment ?? null,
          manual_tee_override: p.manualTeeOverride ?? null,
        })),
      );
      if (__DEV__) {
        console.log("[teesheet] save start", {
          eventId: selectedEventId,
          societyId: selectedEvent.society_id ?? societyId ?? null,
          isJointEvent: isJointEventTeeSheet,
          groups: nonEmptyGroups.length,
          rowCount: nonEmptyGroups.flatMap((g) => g.players).length,
          teeTimeStart: startTime || "08:00",
          teeTimeInterval: interval,
        });
      }

      if (isJointEventTeeSheet) {
        const finalPlayerIds = groupsToPlayerIdsFrom(nonEmptyGroups);
        const mismatch = validateGroupsMatchSelectedIds(nonEmptyGroups, selectedPlayerIds);
        if (__DEV__ && mismatch) {
          console.warn("[teesheet] save mismatch warning", { eventId: selectedEventId, mismatch });
        }
        const replaceRows = await buildJointExpandedReplaceRows(
          nonEmptyGroups,
          jointTeeSheetData,
          selectedEventId,
        );
        if (__DEV__) {
          console.log("[teesheet] payload write", {
            eventId: selectedEventId,
            source: "joint_event_entries",
            participatingSocieties: jointTeeSheetData?.participating_societies?.map((s) => s.society_id) ?? [],
            rowCount: replaceRows.length,
            rows: replaceRows,
          });
        }
        try {
          await replaceJointEventTeeSheetEntries(selectedEventId, replaceRows);
        } catch (e) {
          console.error("[teesheet] replaceJointEventTeeSheetEntries failed", e);
          throw e;
        }
        const jointTeeGroupInputs = nonEmptyGroups.map((g) => ({
          group_number: g.groupNumber,
          tee_time: computeTeeTimeForGroup(g.groupNumber),
        }));
        const jointTeePlayerInputs = nonEmptyGroups.flatMap((g) =>
          g.players.map((p, idx) => ({
            player_id: p.id,
            group_number: g.groupNumber,
            position: idx,
            manual_gender: p.manualGenderSet ? (p.gender ?? null) : null,
            manual_tee_assignment: p.teeAssignment ?? null,
            manual_tee_override: p.manualTeeOverride ?? null,
          })),
        );
        await replaceTeeSheetGuestAssignments(
          selectedEventId,
          jointTeeGroupInputs,
          jointTeePlayerInputs,
        );
        await upsertTeeSheetPlayerPolicy(selectedEventId, manualPolicyInputs);
        if (__DEV__) {
          console.log("[teesheet] save db response", {
            eventId: selectedEventId,
            source: "joint_event_entries",
            rowsWritten: replaceRows.length,
            guestRowsWritten: jointTeePlayerInputs.filter((p) =>
              String(p.player_id).startsWith("guest-"),
            ).length,
          });
        }
        const savePayloadJoint = {
          teeTimeStart: startTime || "08:00",
          teeTimeInterval: interval,
          nearestPinHoles: ntpHoles,
          longestDriveHoles: ldHoles,
        } as const;
        if (__DEV__) {
          console.log("[tee-competition-holes][save]", {
            path: "joint_save_tee_sheet",
            eventId: selectedEventId,
            payload: savePayloadJoint,
          });
        }
        await updateEvent(selectedEventId, savePayloadJoint);
        if (__DEV__) {
          const roundTrip = await getEvent(selectedEventId);
          console.log("[tee-competition-holes][roundtrip]", {
            path: "joint_save_tee_sheet",
            eventId: selectedEventId,
            savedNearestPinHoles: ntpHoles,
            savedLongestDriveHoles: ldHoles,
            persistedNearestPinHoles: roundTrip?.nearestPinHoles ?? [],
            persistedLongestDriveHoles: roundTrip?.longestDriveHoles ?? [],
          });
        }
        await logPostSaveJointRead(selectedEventId, finalPlayerIds);
        markDraftSavedLocally();
        if (!opts?.quiet) {
          setToast({ visible: true, message: "Draft saved", type: "success" });
        }
        const [tsSaved, jointGuestAssignmentsAfterSave, jointPaidGuestsAfterSave, jointPolicyRowsAfterSave] = await Promise.all([
          getJointEventTeeSheet(selectedEventId),
          getTeeGroupPlayers(selectedEventId).then((rows) =>
            rows.filter((r) => parseGuestPlayerId(String(r.player_id)) != null),
          ),
          getTeeSheetEligibleGuestsForEvent(selectedEventId),
          getTeeSheetPlayerPolicy(selectedEventId),
        ]);
        if (tsSaved) {
          setJointTeeSheetData(tsSaved);
          setEligiblePaidGuests(jointPaidGuestsAfterSave);
          const baseGroups: PlayerGroup[] = (tsSaved.groups ?? []).map((g, groupIdx) => ({
            groupNumber: g.group_number,
            players: (g.entries ?? []).map((e) => jointTeeSheetEntryToEditable(e, groupIdx)),
          }));
          let newGroups = normalizeGroups(
            hydrateEditorGroupsWithPaidGuests(
              baseGroups,
              jointPaidGuestsAfterSave,
              jointGuestAssignmentsAfterSave,
            ),
          );
          newGroups = applySexPolicyToGroups(
            newGroups,
            selectedEvent,
            eventMemberPool.length > 0 ? eventMemberPool : members,
            jointPaidGuestsAfterSave,
            policyByPlayerId(jointPolicyRowsAfterSave),
          );
          setGroups(newGroups.length > 0 ? newGroups : []);
          const ids = groupsToPlayerIdsFrom(newGroups);
          setSelectedPlayerIds(ids);
          logSelectedPlayersDev("[teesheet] selected players (after ManCo edits)", selectedEventId, ids);
        }
        loadData();
        await invalidateCache(`event:${selectedEventId}:tee-sheet`);
        await invalidateCache(`event:${selectedEventId}:detail`);
        if (societyId) await invalidateCachePrefix(`society:${societyId}:`);
        await reloadSelectedEventDetails();
        return true;
      }

      const mismatchStd = validateGroupsMatchSelectedIds(nonEmptyGroups, selectedPlayerIds);
      if (mismatchStd) {
        if (!opts?.quiet) {
          setNotice({ type: "error", message: "Tee sheet out of sync", detail: mismatchStd });
        }
        return false;
      }

      const playerIds = selectedPlayerIds.filter((id) => !id.startsWith("guest-"));
      const teeGroupInputs = nonEmptyGroups.map((g) => ({
        group_number: g.groupNumber,
        tee_time: computeTeeTimeForGroup(g.groupNumber),
      }));
      const teePlayerInputs = nonEmptyGroups.flatMap((g) =>
        g.players.map((p, idx) => ({
          player_id: p.id,
          group_number: g.groupNumber,
          position: idx,
          manual_gender: p.manualGenderSet ? (p.gender ?? null) : null,
          manual_tee_assignment: p.teeAssignment ?? null,
          manual_tee_override: p.manualTeeOverride ?? null,
        }))
      );
      if (__DEV__) {
        console.log("[teesheet] payload write", {
          eventId: selectedEventId,
          source: "tee_groups",
          payload: {
            teeGroups: teeGroupInputs,
            teeGroupPlayers: teePlayerInputs,
          },
        });
      }
      const upsertResult = await upsertTeeSheet(selectedEventId, teeGroupInputs, teePlayerInputs);
      await upsertTeeSheetPlayerPolicy(selectedEventId, manualPolicyInputs);
      if (__DEV__) {
        console.log("[teesheet] save db response", {
          source: "tee_groups",
          ...upsertResult,
        });
      }

      const savePayloadStandard = {
        playerIds,
        teeTimeStart: startTime || "08:00",
        teeTimeInterval: interval,
        nearestPinHoles: ntpHoles,
        longestDriveHoles: ldHoles,
      } as const;
      if (__DEV__) {
        console.log("[tee-competition-holes][save]", {
          path: "standard_save_tee_sheet",
          eventId: selectedEventId,
          payload: savePayloadStandard,
        });
      }
      await updateEvent(selectedEventId, savePayloadStandard);
      if (__DEV__) {
        const roundTrip = await getEvent(selectedEventId);
        console.log("[tee-competition-holes][roundtrip]", {
          path: "standard_save_tee_sheet",
          eventId: selectedEventId,
          savedNearestPinHoles: ntpHoles,
          savedLongestDriveHoles: ldHoles,
          persistedNearestPinHoles: roundTrip?.nearestPinHoles ?? [],
          persistedLongestDriveHoles: roundTrip?.longestDriveHoles ?? [],
        });
      }
      logSelectedPlayersDev("[teesheet] final published players", selectedEventId, playerIds);
      const canonicalAfterSave = await loadCanonicalTeeSheet(selectedEventId, { preserveDraftPlayers: true });
      if (__DEV__) {
        console.log("[teesheet] row count after reload", {
          eventId: selectedEventId,
          source: canonicalAfterSave?.source ?? "none",
          rowCount: canonicalAfterSave?.groups.flatMap((g) => g.players).length ?? 0,
          groupCount: canonicalAfterSave?.groups.length ?? 0,
        });
      }
      markDraftSavedLocally();
      if (!opts?.quiet) {
        setToast({ visible: true, message: "Draft saved", type: "success" });
      }
      await invalidateCache(`event:${selectedEventId}:tee-sheet`);
      await invalidateCache(`event:${selectedEventId}:detail`);
      if (societyId) await invalidateCachePrefix(`society:${societyId}:`);
      loadData();
      await reloadSelectedEventDetails();
      return true;
    } catch (err: unknown) {
      console.error("[teesheet] persistTeeSheetDraft", err);
      logShareError(err, { action: "save_draft", eventId: selectedEventId, screen: "tee-sheet" });
      const formatted = formatError(err);
      if (!opts?.quiet) {
        setNotice({ type: "error", message: formatted.message, detail: formatted.detail });
      }
      return false;
    } finally {
      if (!opts?.quiet) setSaving(false);
    }
  };

  const handleSaveTeeSheet = () => {
    void persistTeeSheetDraft();
  };

  // Save NTP/LD settings to event
  const handleSaveSettings = async () => {
    if (!selectedEventId) return;

    const ntpHoles = parseHoleNumbers(ntpHolesInput === "-" ? "" : ntpHolesInput);
    const ldHoles = parseHoleNumbers(ldHolesInput === "-" ? "" : ldHolesInput);

    setNotice(null);
    setSaving(true);
    try {
      if (__DEV__) {
        console.log("[tee-competition-holes][save]", {
          path: "save_settings",
          eventId: selectedEventId,
          payload: {
            nearestPinHoles: ntpHoles,
            longestDriveHoles: ldHoles,
          },
        });
      }
      await updateEvent(selectedEventId, {
        nearestPinHoles: ntpHoles,
        longestDriveHoles: ldHoles,
      });
      if (__DEV__) {
        const roundTrip = await getEvent(selectedEventId);
        console.log("[tee-competition-holes][roundtrip]", {
          path: "save_settings",
          eventId: selectedEventId,
          savedNearestPinHoles: ntpHoles,
          savedLongestDriveHoles: ldHoles,
          persistedNearestPinHoles: roundTrip?.nearestPinHoles ?? [],
          persistedLongestDriveHoles: roundTrip?.longestDriveHoles ?? [],
        });
      }
      setToast({ visible: true, message: "Settings saved", type: "success" });
      await invalidateCache(`event:${selectedEventId}:tee-sheet`);
      await invalidateCache(`event:${selectedEventId}:detail`);
      if (societyId) await invalidateCachePrefix(`society:${societyId}:`);
    } catch (err: any) {
      const formatted = formatError(err);
      setNotice({ type: "error", message: formatted.message, detail: formatted.detail });
    } finally {
      setSaving(false);
    }
  };

  // Move player to a different group by index (0-based)
  const movePlayer = (playerId: string, fromGroup: number, toGroup: number) => {
    if (fromGroup === toGroup) return;

    setGroups((prev) => {
      const newGroups = prev.map((g) => ({
        ...g,
        players: [...g.players],
      }));

      // Find and remove player from source group
      const sourceGroup = newGroups[fromGroup];
      const playerIndex = sourceGroup.players.findIndex((p) => p.id === playerId);
      if (playerIndex === -1) return prev;

      const [player] = sourceGroup.players.splice(playerIndex, 1);

      // Add to target group
      const targetGroup = newGroups[toGroup];
      player.groupIndex = toGroup;
      targetGroup.players.push(player);

      return newGroups;
    });
  };

  // Move player to group by number (1-based); called when user types group number
  const movePlayerToGroupNumber = (playerId: string, fromGroupIdx: number, groupNumStr: string) => {
    const n = parseInt(groupNumStr.trim(), 10);
    if (!Number.isFinite(n) || n < 1 || n > groups.length) return;
    const toGroupIdx = n - 1;
    if (fromGroupIdx === toGroupIdx) return;
    movePlayer(playerId, fromGroupIdx, toGroupIdx);
  };

  // Add an empty group
  const addGroup = () => {
    setGroups((prev) => [
      ...prev,
      {
        groupNumber: prev.length + 1,
        players: [],
      },
    ]);
  };

  // Remove empty groups
  const cleanupGroups = () => {
    setGroups((prev) => {
      const nonEmpty = prev.filter((g) => g.players.length > 0);
      return nonEmpty.map((g, i) => ({
        ...g,
        groupNumber: i + 1,
        players: g.players.map((p) => ({ ...p, groupIndex: i })),
      }));
    });
  };

  const removePlayerFromField = (playerId: string) => {
    const nextGroups = removePlayerFromGroups(groups, playerId);
    const nextSelectedIds = selectedPlayerIds.filter((id) => String(id) !== String(playerId));
    setGroups(nextGroups);
    setSelectedPlayerIds(nextSelectedIds);
    if (selectedEventId) {
      logSelectedPlayersDev("[teesheet] selected players (after ManCo edits)", selectedEventId, nextSelectedIds);
    }
  };

  const setPlayerSexFromEditor = (playerId: string, nextGender: Gender) => {
    if (!selectedEvent) return;
    const menTee: TeeBlock | null =
      selectedEvent.par != null && selectedEvent.courseRating != null && selectedEvent.slopeRating != null
        ? { par: selectedEvent.par, courseRating: selectedEvent.courseRating, slopeRating: selectedEvent.slopeRating }
        : null;
    const ladiesTee: TeeBlock | null =
      selectedEvent.ladiesPar != null && selectedEvent.ladiesCourseRating != null && selectedEvent.ladiesSlopeRating != null
        ? {
            par: selectedEvent.ladiesPar,
            courseRating: selectedEvent.ladiesCourseRating,
            slopeRating: selectedEvent.ladiesSlopeRating,
          }
        : null;
    const allowance = selectedEvent.handicapAllowance ?? DEFAULT_ALLOWANCE;
    setGroups((prev) =>
      prev.map((group) => ({
        ...group,
        players: group.players.map((player) => {
          if (String(player.id) !== String(playerId)) return player;
          const teeAssignment = teeAssignmentFromGender(nextGender, player.teeAssignment ?? null);
          const playerTee =
            teeAssignment === "ladies" ? ladiesTee : teeAssignment === "men" ? menTee : null;
          const courseHandicap = calcCourseHandicap(player.handicapIndex, playerTee);
          const playingHandicap = calcPlayingHandicap(courseHandicap, allowance);
          return {
            ...player,
            gender: nextGender,
            teeAssignment,
            manualGenderSet: nextGender != null,
            playingHandicap,
          };
        }),
      })),
    );
  };

  const resetToProfileDefaults = () => {
    if (!selectedEvent) return;
    const sourceMembers = eventMemberPool.length > 0 ? eventMemberPool : members;
    setGroups((prev) =>
      applySexPolicyToGroups(
        prev.map((g) => ({
          ...g,
          players: g.players.map((p) => ({
            ...p,
            manualGenderSet: false,
            manualTeeOverride: null,
          })),
        })),
        selectedEvent,
        sourceMembers,
        eligiblePaidGuests,
      ),
    );
  };

  const addGuestToField = (guest: EventGuest) => {
    const id = guestPlayerId(guest.id);
    if (groups.some((g) => g.players.some((p) => String(p.id) === id))) return;
    const player = editorGuestPlayerFromDoc(guest);
    setGroups((prev) => {
      const targetGroupIdx = prev.length > 0 ? 0 : -1;
      const editable: EditablePlayer = {
        id: player.id,
        name: player.name,
        handicapIndex: player.handicapIndex,
        playingHandicap: null,
        gender: player.gender,
        teeAssignment: teeAssignmentFromGender(player.gender, null),
        manualGenderSet: false,
        manualTeeOverride: null,
        groupIndex: targetGroupIdx >= 0 ? targetGroupIdx : 0,
      };
      if (targetGroupIdx === -1) {
        return [{ groupNumber: 1, players: [editable] }];
      }
      return prev.map((g, i) =>
        i === targetGroupIdx ? { ...g, players: [...g.players, editable] } : g,
      );
    });
  };

  const addPlayerToField = (m: MemberDoc) => {
    const id = String(m.id);
    if (!id || selectedPlayerIds.includes(id)) return;
    if (!isJointEventTeeSheet && !new Set(eligibleMemberIds.map(String)).has(id)) {
      setNotice({
        type: "error",
        message: "Player is not tee-sheet eligible",
        detail: "Only players with status 'in' and paid can be added to this tee sheet.",
      });
      return;
    }
    setSelectedPlayerIds((prev) => {
      const next = [...prev, id];
      if (selectedEventId) logSelectedPlayersDev("[teesheet] selected players (after ManCo edits)", selectedEventId, next);
      return next;
    });
    setGroups((prev) => {
      const targetGroupIdx = prev.length > 0 ? 0 : -1;
      const player: EditablePlayer = {
        id,
        name: m.name || m.displayName || "Member",
        handicapIndex: m.handicapIndex ?? m.handicap_index ?? null,
        playingHandicap: null,
        gender: m.gender ?? null,
        teeAssignment: teeAssignmentFromGender(m.gender ?? null, null),
        manualGenderSet: false,
        manualTeeOverride: null,
        groupIndex: targetGroupIdx >= 0 ? targetGroupIdx : 0,
      };
      if (targetGroupIdx === -1) {
        return [{ groupNumber: 1, players: [player] }];
      }
      return prev.map((g, i) =>
        i === targetGroupIdx ? { ...g, players: [...g.players, player] } : g,
      );
    });
  };

  // Share/export tee sheet
  const MAX_TEE_TIMES = 12;

  const handleShareExport = async () => {
    if (!guardPaidAction()) return;
    if (!selectedEventId || !selectedEvent || !societyId) return;

    const nonEmptyGroups = groups.filter((g) => g.players.length > 0);
    if (nonEmptyGroups.length === 0) {
      setNotice({
        type: "error",
        message: "Nothing to export",
        detail: "Add players to groups before sharing.",
      });
      return;
    }

    if (nonEmptyGroups.length > MAX_TEE_TIMES) {
      setToast({
        visible: true,
        message: `Max ${MAX_TEE_TIMES} tee times per image — remove extra groups or publish in two steps.`,
        type: "error",
      });
      return;
    }

    const runExport = async () => {
      setGenerating(true);
      setNotice(null);
      try {
        if (isDirty) {
          const saved = await persistTeeSheetDraft({ quiet: true });
          if (!saved) {
            setNotice({
              type: "error",
              message: "Could not save draft",
              detail: "Fix errors above, then try Share / Export again.",
            });
            return;
          }
        }

        const canonical = await loadCanonicalTeeSheet(selectedEventId, { preserveDraftPlayers: true });
        if (!canonical || canonical.groups.length === 0) {
          throw new Error("No saved tee sheet to export. Save draft first.");
        }

        await navigateToTeeSheetShare(canonical);
      } catch (err: unknown) {
        logShareError(err, { action: "export", eventId: selectedEventId, screen: "tee-sheet" });
        const formatted = formatError(err, "Couldn't export tee sheet.");
        setNotice({ type: "error", message: formatted.message, detail: formatted.detail });
      } finally {
        setGenerating(false);
      }
    };

    if (isDirty) {
      const message = "Save your latest groups before exporting?";
      if (Platform.OS === "web" && typeof globalThis.confirm === "function") {
        if (globalThis.confirm(`${message}\n\nOK saves draft then opens export.`)) {
          void runExport();
        }
        return;
      }
      Alert.alert("Unsaved changes", message, [
        { text: "Cancel", style: "cancel" },
        { text: "Save & export", onPress: () => void runExport() },
      ]);
      return;
    }

    void runExport();
  };

  const handleGenerateTeeSheet = async () => {
    if (!guardPaidAction()) return;
    if (!selectedEvent || !societyId || !selectedEventId) return;

    const nonEmptyGroups = groups.filter((g) => g.players.length > 0);
    if (nonEmptyGroups.length === 0) {
      setNotice({
        type: "error",
        message: "No players added",
        detail: "Add players to groups before publishing.",
      });
      return;
    }

    if (nonEmptyGroups.length > MAX_TEE_TIMES) {
      setToast({
        visible: true,
        message: `Max ${MAX_TEE_TIMES} tee times — remove extra groups before publishing.`,
        type: "error",
      });
      return;
    }

    setNotice(null);
    setGenerating(true);
    try {
      const interval = parseInt(teeInterval, 10) || 10;

      const saved = await persistTeeSheetDraft({ quiet: true });
      if (!saved) {
        setNotice({
          type: "error",
          message: "Could not save draft",
          detail: "Publishing was cancelled because the draft could not be saved.",
        });
        return;
      }

      const refreshed = await publishTeeTime(selectedEventId, startTime || "08:00", interval);
      if (refreshed) setSelectedEvent(refreshed);

      const canonical = await loadCanonicalTeeSheet(selectedEventId, { preserveDraftPlayers: true });
      if (!canonical) {
        throw new Error("Could not load tee sheet after publish");
      }

      await invalidateCache(`event:${selectedEventId}:tee-sheet`);
      await invalidateCache(`event:${selectedEventId}:detail`);
      if (societyId) await invalidateCachePrefix(`society:${societyId}:`);

      setToast({
        visible: true,
        message: "Tee times published — members can now see their slot.",
        type: "success",
      });

      await navigateToTeeSheetShare(canonical);
    } catch (err: unknown) {
      logShareError(err, { action: "publish", eventId: selectedEventId, screen: "tee-sheet" });
      const formatted = formatError(err, "Couldn't publish tee sheet.");
      setNotice({ type: "error", message: formatted.message, detail: formatted.detail });
    } finally {
      setGenerating(false);
    }
  };

  if ((bootstrapLoading && loading) || (!hasHydratedIndexCache && loading)) {
    return (
      <Screen>
        <LoadingState message="Loading..." />
      </Screen>
    );
  }

  if (!canGenerateTeeSheet) {
    return (
      <Screen>
        <View style={styles.header}>
          <SecondaryButton onPress={() => goBack(router, "/(app)/(tabs)/settings")} size="sm">
            <Feather name="arrow-left" size={16} color={colors.text} /> Back
          </SecondaryButton>
        </View>
        <EmptyState
          icon={<Feather name="lock" size={32} color={colors.textTertiary} />}
          title="Access Restricted"
          message="Only ManCo members (Captain, Secretary, Treasurer, Handicapper) can generate tee sheets."
        />
      </Screen>
    );
  }

  const selectedPlayerCount = groups.reduce((sum, g) => sum + g.players.length, 0);
  const groupCount = groups.filter((g) => g.players.length > 0).length;
  const womenCount = groups.reduce((sum, g) => sum + g.players.filter((p) => p.gender === "female").length, 0);
  const playersNeedingTeeConfirmation = groups.reduce(
    (sum, g) => sum + g.players.filter((p) => p.gender == null || p.teeAssignment == null).length,
    0,
  );
  const selectedIdSet = new Set(selectedPlayerIds);
  const eligibleIdSet = new Set(eligibleMemberIds.map(String));
  const playersInGroups = new Set(groups.flatMap((g) => g.players.map((p) => String(p.id))));
  const addablePlayers = eventMemberPool.filter((m) => {
    const id = String(m.id);
    if (selectedIdSet.has(id) || playersInGroups.has(id)) return false;
    if (!isJointEventTeeSheet && !eligibleIdSet.has(id)) return false;
    return true;
  });
  const addableGuests = eligiblePaidGuests.filter((g) => !playersInGroups.has(guestPlayerId(g.id)));

  // Check if we have tee settings configured
  const hasMenTees = selectedEvent?.par != null && selectedEvent?.slopeRating != null;
  const hasLadiesTees = selectedEvent?.ladiesPar != null && selectedEvent?.ladiesSlopeRating != null;

  return (
    <Screen>
      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast((t) => ({ ...t, visible: false }))}
      />
      {/* Header */}
      <View style={styles.header}>
        <SecondaryButton onPress={() => goBack(router, "/(app)/(tabs)/settings")} size="sm">
          <Feather name="arrow-left" size={16} color={colors.text} /> Back
        </SecondaryButton>
        <View style={{ flex: 1 }} />
      </View>

      <AppText variant="title" style={styles.title}>
        <Feather name="file-text" size={24} color={colors.primary} /> Tee Sheet
      </AppText>
      <AppText variant="body" color="secondary" style={{ marginBottom: spacing.sm }}>
        Generate grouped tee sheets with WHS handicaps for Men and Ladies.
      </AppText>
      <AppText variant="small" color="muted" style={{ marginBottom: spacing.lg }}>
        Tee sheet includes confirmed + paid players. ManCo can remove players, and can add only tee-sheet-eligible players.
      </AppText>
      {refreshing ? (
        <AppText variant="small" color="muted" style={{ marginBottom: spacing.sm }}>
          Refreshing event list...
        </AppText>
      ) : null}

      {loadError ? (
        <InlineNotice
          variant="error"
          message={loadError.message}
          detail={loadError.detail}
          style={{ marginBottom: spacing.sm }}
        />
      ) : null}

      {notice ? (
        <InlineNotice
          variant={notice.type}
          message={notice.message}
          detail={notice.detail}
          style={{ marginBottom: spacing.sm }}
        />
      ) : null}

      {events.length === 0 ? (
        <EmptyState
          icon={<Feather name="calendar" size={32} color={colors.textTertiary} />}
          title="No Events"
          message="Create an event first to generate a tee sheet."
          action={{ label: "Go to Events", onPress: () => router.push("/(app)/(tabs)/events") }}
        />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Event Selection */}
          <AppText variant="heading" style={styles.sectionTitle}>Select event</AppText>
          <AppText variant="small" color="muted" style={{ marginBottom: spacing.sm }}>
            Upcoming events are for generation and publishing. Past events are read-only here unless a tee sheet was published.
          </AppText>

          <AppText variant="subheading" color="primary" style={styles.eventGroupHeading}>
            {UPCOMING_EVENTS_TITLE}
          </AppText>
          {upcomingEvents.length === 0 ? (
            <AppText variant="small" color="muted" style={styles.eventsInlineEmpty}>
              No upcoming events — open Events to schedule one.
            </AppText>
          ) : (
            <View style={styles.eventList}>
              {upcomingEvents.map((event, index) => {
                const isSelected = event.id === selectedEventId;
                const playerCount = event.playerIds?.length || 0;
                const isNextUp = index === 0;
                return (
                  <Pressable
                    key={event.id}
                    onPress={() => setSelectedEventId(event.id)}
                  >
                    <AppCard
                      style={[
                        styles.eventCard,
                        isNextUp && { borderWidth: 1, borderColor: colors.primary + "66", backgroundColor: colors.primary + "0A" },
                        isSelected && { borderWidth: 2, borderColor: colors.primary },
                      ]}
                    >
                      {isNextUp ? (
                        <View style={[styles.teeSheetNextBadge, { backgroundColor: colors.primary + "22" }]}>
                          <Feather name="flag" size={12} color={colors.primary} />
                          <AppText variant="captionBold" color="primary" style={{ marginLeft: 4 }}>
                            Next up
                          </AppText>
                        </View>
                      ) : null}
                      <View style={styles.eventRow}>
                        <View style={styles.eventInfo}>
                          <AppText variant="bodyBold" numberOfLines={1}>
                            {event.name}
                          </AppText>
                          <AppText variant="caption" color="secondary">
                            {event.date
                              ? new Date(event.date).toLocaleDateString("en-GB", {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                })
                              : "Date TBC"}
                            {event.courseName ? ` • ${event.courseName}` : ""}
                          </AppText>
                          <AppText variant="small" color="muted">
                            {playerCount} player{playerCount !== 1 ? "s" : ""}
                          </AppText>
                        </View>
                        <Feather
                          name={isSelected ? "check-circle" : "circle"}
                          size={22}
                          color={isSelected ? colors.primary : colors.textTertiary}
                        />
                      </View>
                    </AppCard>
                  </Pressable>
                );
              })}
            </View>
          )}

          <AppText variant="subheading" color="secondary" style={[styles.eventGroupHeading, { marginTop: spacing.lg }]}>
            {PAST_EVENTS_TITLE}
          </AppText>
          {pastEvents.length === 0 ? (
            <AppText variant="small" color="muted" style={styles.eventsInlineEmpty}>
              No past events.
            </AppText>
          ) : (
            <View style={styles.eventList}>
              {pastEvents.map((event) => {
                const isSelected = event.id === selectedEventId;
                const playerCount = event.playerIds?.length || 0;
                return (
                  <Pressable
                    key={event.id}
                    onPress={() => setSelectedEventId(event.id)}
                  >
                    <AppCard
                      style={[
                        styles.eventCard,
                        { opacity: 0.88, backgroundColor: colors.backgroundTertiary },
                        isSelected && { borderWidth: 1, borderColor: colors.border },
                      ]}
                    >
                      <View style={styles.eventRow}>
                        <View style={[styles.eventInfo, { opacity: 0.92 }]}>
                          <AppText variant="bodyBold" numberOfLines={1} color="secondary">
                            {event.name}
                          </AppText>
                          <AppText variant="caption" color="secondary">
                            {event.date
                              ? new Date(event.date).toLocaleDateString("en-GB", {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                })
                              : "Date TBC"}
                            {event.courseName ? ` • ${event.courseName}` : ""}
                          </AppText>
                          <AppText variant="small" color="muted">
                            {playerCount} player{playerCount !== 1 ? "s" : ""}
                            {event.teeTimePublishedAt ? " · Tee sheet published" : ""}
                          </AppText>
                        </View>
                        <Feather
                          name={isSelected ? "check-circle" : "circle"}
                          size={20}
                          color={isSelected ? colors.textSecondary : colors.textTertiary}
                        />
                      </View>
                    </AppCard>
                  </Pressable>
                );
              })}
            </View>
          )}

          {selectedEventId && eventDetailsError ? (
            <RetryErrorBlock
              title="Could not load tee sheet"
              message={eventDetailsError.message}
              onRetry={() => void reloadSelectedEventDetails()}
              retrying={eventDetailsRefreshing}
              style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}
            />
          ) : null}

          {selectedEventId && eventDetailsRefreshing && !eventDetailsError && !selectedEvent ? (
            <LoadingState message="Loading tee sheet…" style={{ marginTop: spacing.lg }} />
          ) : null}

          {selectedEventId && eventDetailsRefreshing && !eventDetailsError && selectedEvent ? (
            <AppText variant="small" color="muted" style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
              Refreshing tee sheet…
            </AppText>
          ) : null}

          {selectedEvent && isPastEventSelected && (
            <View style={{ marginTop: spacing.lg }}>
              <InlineNotice
                variant="info"
                message="This event is in the past. Generation, save, publish, and clear are disabled — use upcoming events for tee sheet work."
                style={{ marginBottom: spacing.sm }}
              />
              {selectedEvent.teeTimePublishedAt ? (
                <SecondaryButton
                  onPress={() =>
                    router.push({
                      pathname: "/(app)/event/[id]/tee-sheet",
                      params: { id: selectedEvent.id },
                    })
                  }
                  icon={<Feather name="eye" size={18} color={colors.primary} />}
                >
                  View published tee sheet
                </SecondaryButton>
              ) : (
                <AppText variant="small" color="muted">
                  No published tee sheet for this event.
                </AppText>
              )}
            </View>
          )}

          {selectedEvent && !isPastEventSelected && (
            selectedPlayerCount === 0 ? (
              <EmptyState
                icon={<Feather name="users" size={32} color={colors.textTertiary} />}
                title={isJointEventTeeSheet ? "No entries yet" : "No players added"}
                message={isJointEventTeeSheet
                  ? "No tee-sheet-eligible players yet (confirmed + paid per society). Confirm entries on the event, then mark fees paid before building groups."
                  : "Add players to this event before generating the tee sheet."}
                action={!isJointEventTeeSheet ? {
                  label: "Add players",
                  onPress: () =>
                    router.push({
                      pathname: "/(app)/event/[id]/players",
                      params: { id: selectedEvent.id },
                    }),
                } : undefined}
              />
            ) : (
            <>
              {/* Joint Event indicator and participating societies */}
              {isJointEventTeeSheet && jointTeeSheetData && (
                <AppCard style={{ marginBottom: spacing.sm }}>
                  <AppText variant="captionBold" color="primary" style={{ marginBottom: spacing.xs }}>
                    Joint Event
                  </AppText>
                  <AppText variant="small" color="secondary">
                    {(jointTeeSheetData.participating_societies ?? [])
                      .map((s: { society_name: string }) => s.society_name)
                      .filter(Boolean)
                      .join(" • ") || "2+ societies"}
                  </AppText>
                </AppCard>
              )}

              {/* Tee Time Settings */}
              <AppText variant="heading" style={styles.sectionTitle}>Tee Times</AppText>
              <AppCard>
                <View style={styles.formRow}>
                  <View style={{ flex: 1 }}>
                    <AppText variant="caption" style={styles.label}>Start Time</AppText>
                    <AppInput
                      placeholder="08:00"
                      value={startTime}
                      onChangeText={setStartTime}
                      keyboardType="numbers-and-punctuation"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="caption" style={styles.label}>Interval (min)</AppText>
                    <AppInput
                      placeholder="10"
                      value={teeInterval}
                      onChangeText={setTeeInterval}
                      keyboardType="number-pad"
                    />
                  </View>
                </View>
                <AppText variant="small" color="muted" style={{ marginTop: spacing.xs }}>
                  {selectedPlayerCount} players → {groupCount} group{groupCount !== 1 ? "s" : ""}
                </AppText>
              </AppCard>

              {/* Group Editor Toggle */}
              <View style={styles.sectionHeader}>
                <AppText variant="heading">Player Groups</AppText>
                <SecondaryButton
                  size="sm"
                  onPress={() => setShowGroupEditor(!showGroupEditor)}
                >
                  <Feather name={showGroupEditor ? "eye-off" : "edit-2"} size={14} color={colors.text} />
                  {showGroupEditor ? " Hide Editor" : " Edit Groups"}
                </SecondaryButton>
              </View>

              {showGroupEditor ? (
                /* Editable Group View */
                <View style={styles.groupEditor}>
                  <SecondaryButton size="sm" onPress={resetToProfileDefaults}>
                    <Feather name="rotate-ccw" size={12} color={colors.text} /> Reset to profile defaults
                  </SecondaryButton>
                  {playersNeedingTeeConfirmation > 0 ? (
                    <InlineNotice
                      variant="warning"
                      message={`${playersNeedingTeeConfirmation} player${playersNeedingTeeConfirmation !== 1 ? "s" : ""} need tee confirmation`}
                      detail="Set sex to Male, Female, or Unknown. Unknown shows Tee TBC and PH remains '-' unless tee is explicitly set."
                    />
                  ) : null}
                  <AppCard>
                    <AppText variant="captionBold" color="primary">
                      ✔ Attending players (default)
                    </AppText>
                    <AppText variant="small" color="secondary" style={{ marginTop: 4 }}>
                      ➕ Add player from event societies, or ❌ remove from current field.
                    </AppText>
                    {addablePlayers.length === 0 && addableGuests.length === 0 ? (
                      <AppText variant="small" color="muted" style={{ marginTop: spacing.xs }}>
                        All available players are already selected.
                      </AppText>
                    ) : (
                      <View style={[styles.groupActions, { marginTop: spacing.xs }]}>
                        {addablePlayers.slice(0, 10).map((m) => (
                          <SecondaryButton key={m.id} size="sm" onPress={() => addPlayerToField(m)}>
                            <Feather name="plus" size={12} color={colors.text} /> {m.name || m.displayName || "Member"}
                          </SecondaryButton>
                        ))}
                        {addableGuests.map((g) => (
                          <SecondaryButton key={g.id} size="sm" onPress={() => addGuestToField(g)}>
                            <Feather name="plus" size={12} color={colors.text} /> {g.name} (guest)
                          </SecondaryButton>
                        ))}
                      </View>
                    )}
                  </AppCard>
                  {groups.map((group, groupIdx) => (
                    <AppCard key={groupIdx} style={styles.groupCard}>
                      <View style={styles.groupHeader}>
                        <AppText variant="bodyBold" color="primary">
                          {group.groupNumber === 0 ? "Unassigned" : `Group ${group.groupNumber}`}
                        </AppText>
                        <AppText variant="small" color="muted">
                          {group.players.length} player{group.players.length !== 1 ? "s" : ""}
                        </AppText>
                      </View>

                      {group.players.length === 0 ? (
                        <AppText variant="small" color="muted" style={{ fontStyle: "italic", paddingVertical: spacing.sm }}>
                          Empty group
                        </AppText>
                      ) : (
                        group.players.map((player) => (
                          <View key={player.id} style={styles.playerRow}>
                            <View style={styles.playerInfo}>
                              <AppText variant="body" numberOfLines={1}>
                                {player.name}
                              </AppText>
                              <AppText variant="caption" color="secondary">
                                HI: {player.handicapIndex != null ? player.handicapIndex.toFixed(1) : "-"}
                              </AppText>
                              <View style={styles.sexEditorRow}>
                                {(["male", "female", null] as const).map((sexOption) => {
                                  const active = player.gender === sexOption;
                                  const label = sexOption === "male" ? "Male" : sexOption === "female" ? "Female" : "Unknown";
                                  return (
                                    <Pressable
                                      key={`${player.id}-${label}`}
                                      style={[
                                        styles.sexChip,
                                        active ? styles.sexChipActive : null,
                                      ]}
                                      onPress={() => setPlayerSexFromEditor(player.id, sexOption)}
                                    >
                                      <AppText
                                        variant="caption"
                                        color="secondary"
                                        style={{ fontWeight: "600", color: active ? "#FFFFFF" : colors.textSecondary }}
                                      >
                                        {label}
                                      </AppText>
                                    </Pressable>
                                  );
                                })}
                              </View>
                              {player.gender == null || player.teeAssignment == null ? (
                                <View style={styles.policyWarningChip}>
                                  <Feather name="alert-circle" size={12} color={colors.warning} />
                                  <AppText variant="caption" style={{ color: colors.warning, marginLeft: 4 }}>
                                    Tee needs confirming
                                  </AppText>
                                </View>
                              ) : null}
                              {player.manualGenderSet || player.manualTeeOverride ? (
                                <View style={styles.overrideChip}>
                                  <Feather name="shield" size={12} color={colors.primary} />
                                  <AppText variant="caption" style={{ color: colors.primary, marginLeft: 4 }}>
                                    Manual tee override
                                  </AppText>
                                </View>
                              ) : null}
                            </View>

                            {/* Group number input — type target group and blur to move */}
                            <GroupNumInput
                              currentGroup={groupIdx + 1}
                              onMove={(v) => movePlayerToGroupNumber(player.id, groupIdx, v)}
                            />

                            {/* Move buttons */}
                            <View style={styles.moveButtons}>
                              {groupIdx > 0 && (
                                <Pressable
                                  style={({ pressed }) => [styles.moveBtn, pressed && { opacity: 0.6 }]}
                                  onPress={() => movePlayer(player.id, groupIdx, groupIdx - 1)}
                                >
                                  <Feather name="arrow-up" size={16} color={colors.primary} />
                                </Pressable>
                              )}
                              {groupIdx < groups.length - 1 && (
                                <Pressable
                                  style={({ pressed }) => [styles.moveBtn, pressed && { opacity: 0.6 }]}
                                  onPress={() => movePlayer(player.id, groupIdx, groupIdx + 1)}
                                >
                                  <Feather name="arrow-down" size={16} color={colors.primary} />
                                </Pressable>
                              )}
                              <Pressable
                                style={({ pressed }) => [styles.moveBtn, pressed && { opacity: 0.6 }]}
                                onPress={() => removePlayerFromField(player.id)}
                              >
                                <Feather name="x" size={16} color={colors.error} />
                              </Pressable>
                            </View>
                          </View>
                        ))
                      )}
                    </AppCard>
                  ))}

                  <View style={styles.groupActions}>
                    <SecondaryButton size="sm" onPress={addGroup}>
                      <Feather name="plus" size={14} color={colors.text} /> Add Group
                    </SecondaryButton>
                    <SecondaryButton size="sm" onPress={cleanupGroups}>
                      <Feather name="trash-2" size={14} color={colors.text} /> Remove Empty
                    </SecondaryButton>
                    <SecondaryButton
                      size="sm"
                      onPress={async () => {
                        if (!selectedEventId) return;
                        if (isJointEventTeeSheet) {
                          const tsReset = await getJointEventTeeSheet(selectedEventId);
                          if (!tsReset) return;
                          setJointTeeSheetData(tsReset);
                          const newGroups: PlayerGroup[] = (tsReset.groups ?? []).map((g, groupIdx) => ({
                            groupNumber: g.group_number,
                            players: (g.entries ?? []).map((e) => jointTeeSheetEntryToEditable(e, groupIdx)),
                          }));
                          setGroups(newGroups.length > 0 ? newGroups : []);
                          const ids = groupsToPlayerIdsFrom(newGroups);
                          setSelectedPlayerIds(ids);
                          logSelectedPlayersDev("[teesheet] selected players (after ManCo edits)", selectedEventId, ids);
                          return;
                        }
                        const [evt, paidGuestList] = await Promise.all([
                          getEvent(selectedEventId),
                          getTeeSheetEligibleGuestsForEvent(selectedEventId),
                        ]);
                        if (!evt) return;
                        setEligiblePaidGuests(paidGuestList);
                        const eligibleIds = await getTeeSheetEligibleMemberIdsForEvent(selectedEventId);
                        setSelectedPlayerIds(eligibleIds);
                        logSelectedPlayersDev("[teesheet] tee-sheet eligible (paid + in)", selectedEventId, eligibleIds);
                        initializeGroups(
                          evt,
                          eligibleIds,
                          eventMemberPool.length > 0 ? eventMemberPool : members,
                          paidGuestList,
                        );
                      }}
                    >
                      <Feather name="refresh-cw" size={14} color={colors.text} /> Reset
                    </SecondaryButton>
                  </View>
                </View>
              ) : (
                /* Compact Group Summary - Table format */
                <View style={styles.groupsContainer}>
                  {groups.filter((g) => g.players.length > 0).map((group) => (
                    <GroupTableCard key={group.groupNumber} group={group} showSocietyBadge={isJointEventTeeSheet} />
                  ))}
                </View>
              )}

              {/* Competition Holes */}
              <AppText variant="heading" style={styles.sectionTitle}>Competition Holes</AppText>
              <AppCard>
                <View style={styles.formField}>
                  <AppText variant="caption" style={styles.label}>
                    <Feather name="flag" size={12} color={colors.info} /> Nearest the Pin (holes 1-18)
                  </AppText>
                  <AppInput
                    placeholder="e.g. 3, 7, 14"
                    value={ntpHolesInput === "-" ? "" : ntpHolesInput}
                    onChangeText={setNtpHolesInput}
                    keyboardType="numbers-and-punctuation"
                  />
                  <AppText variant="small" color="muted">Comma-separated hole numbers</AppText>
                </View>

                <View style={styles.formField}>
                  <AppText variant="caption" style={styles.label}>
                    <Feather name="arrow-right" size={12} color={colors.warning} /> Longest Drive (holes 1-18)
                  </AppText>
                  <AppInput
                    placeholder="e.g. 10, 18"
                    value={ldHolesInput === "-" ? "" : ldHolesInput}
                    onChangeText={setLdHolesInput}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>

                <SecondaryButton
                  onPress={handleSaveSettings}
                  loading={saving}
                  size="sm"
                  style={{ marginTop: spacing.xs }}
                >
                  <Feather name="save" size={14} color={colors.text} /> Save to Event
                </SecondaryButton>
              </AppCard>

              {/* Course Setup Info */}
              {(hasMenTees || hasLadiesTees) && (
                <>
                  <AppText variant="heading" style={styles.sectionTitle}>Course Setup</AppText>
                  <AppCard>
                    {hasMenTees && (
                      <View style={styles.teeRow}>
                        <View style={[styles.teeColorDot, { backgroundColor: "#FFD700" }]} />
                        <AppText variant="bodyBold" style={{ minWidth: 60 }}>
                          {selectedEvent.teeName || "Men's"}
                        </AppText>
                        <AppText variant="small" color="secondary">
                          Par {selectedEvent.par} • CR {selectedEvent.courseRating} • Slope {selectedEvent.slopeRating}
                        </AppText>
                      </View>
                    )}
                    {hasLadiesTees && (
                      <View style={[styles.teeRow, { marginTop: spacing.xs }]}>
                        <View style={[styles.teeColorDot, { backgroundColor: "#E53935" }]} />
                        <AppText variant="bodyBold" style={{ minWidth: 60 }}>
                          {selectedEvent.ladiesTeeName || "Ladies'"}
                        </AppText>
                        <AppText variant="small" color="secondary">
                          Par {selectedEvent.ladiesPar} • CR {selectedEvent.ladiesCourseRating} • Slope {selectedEvent.ladiesSlopeRating}
                        </AppText>
                      </View>
                    )}
                    {selectedEvent.handicapAllowance != null && (
                      <AppText variant="small" color="muted" style={{ marginTop: spacing.sm }}>
                        Handicap Allowance: {Math.round(selectedEvent.handicapAllowance * 100)}%
                      </AppText>
                    )}
                    <AppText variant="small" color="muted" style={{ marginTop: spacing.xs }}>
                      WHS handicaps (HI, CH, PH) calculated per player&apos;s gender
                    </AppText>
                  </AppCard>
                </>
              )}

              {/* Warning if women but no ladies tees */}
              {womenCount > 0 && !hasLadiesTees && (
                <View style={[styles.warningBox, { backgroundColor: colors.warning + "20" }]}>
                  <Feather name="alert-triangle" size={16} color={colors.warning} />
                  <AppText variant="small" style={{ flex: 1, marginLeft: spacing.xs, color: colors.warning }}>
                    {womenCount} female player{womenCount !== 1 ? "s" : ""} but no Ladies&apos; tee configured. They will use Men&apos;s tee settings.
                  </AppText>
                </View>
              )}

              <View style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
                <AppText variant="small" color={isDirty ? "warning" : "muted"}>
                  {isDirty
                    ? "Unsaved changes — save draft before leaving"
                    : lastSavedAt
                      ? `Draft saved · Last saved at ${lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                      : selectedEvent?.teeTimePublishedAt
                        ? "Published — members see tee times"
                        : "No draft saved yet"}
                </AppText>
              </View>
              <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm }}>
                <SecondaryButton
                  onPress={handleSaveTeeSheet}
                  loading={saving}
                  disabled={selectedPlayerCount === 0 || isPastEventSelected}
                  style={{ flex: 1 }}
                >
                  <Feather name="save" size={18} color={colors.primary} />
                  {" Save Draft"}
                </SecondaryButton>
                <PrimaryButton
                  onPress={handleGenerateTeeSheet}
                  loading={generating}
                  disabled={selectedPlayerCount === 0 || isPastEventSelected}
                  style={{ flex: 1 }}
                >
                  <Feather name="upload-cloud" size={18} color={colors.textInverse} />
                  {" Publish"}
                </PrimaryButton>
              </View>
              <SecondaryButton
                onPress={handleShareExport}
                loading={generating}
                disabled={selectedPlayerCount === 0 || isPastEventSelected}
                style={{ marginBottom: spacing.sm }}
              >
                <Feather name="share-2" size={18} color={colors.primary} />
                {" Share / Export PNG"}
              </SecondaryButton>
              {!!selectedEvent?.teeTimePublishedAt && (
                <SecondaryButton
                  onPress={handleUnpublishTeeTimesOnly}
                  loading={saving}
                  disabled={!selectedEventId}
                  style={{ marginBottom: spacing.sm, borderColor: colors.warning + "99" }}
                >
                  <Feather name="eye-off" size={16} color={colors.warning} />
                  <AppText style={{ color: colors.warning, marginLeft: spacing.xs, fontWeight: "600" }}>
                    Unpublish tee times
                  </AppText>
                </SecondaryButton>
              )}
              <SecondaryButton
                onPress={handleClearTeeSheet}
                loading={saving}
                disabled={!selectedEventId}
                style={{ marginBottom: spacing.xl, borderColor: colors.error + "80" }}
              >
                <Feather name="rotate-ccw" size={16} color={colors.error} />
                <AppText style={{ color: colors.error, marginLeft: spacing.xs, fontWeight: "600" }}>
                  Clear tee sheet
                </AppText>
              </SecondaryButton>

            </>
          ))}
        </ScrollView>
      )}
      <LicenceRequiredModal visible={modalVisible} onClose={() => setModalVisible(false)} societyId={guardSocietyId} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  title: {
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    marginTop: spacing.base,
    marginBottom: spacing.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.base,
    marginBottom: spacing.sm,
  },
  eventList: {
    gap: spacing.xs,
  },
  eventGroupHeading: {
    marginBottom: spacing.xs,
    letterSpacing: 0.15,
  },
  eventsInlineEmpty: {
    marginBottom: spacing.sm,
    lineHeight: 20,
  },
  teeSheetNextBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    marginBottom: spacing.xs,
  },
  eventCard: {
    marginBottom: 0,
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  eventInfo: {
    flex: 1,
  },
  formRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  formField: {
    marginBottom: spacing.base,
  },
  label: {
    marginBottom: spacing.xs,
  },
  groupEditor: {
    gap: spacing.sm,
  },
  groupCard: {
    marginBottom: 0,
  },
  groupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  playerInfo: {
    flex: 1,
  },
  sexEditorRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 6,
    flexWrap: "wrap",
  },
  sexChip: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: "#F8FAFC",
  },
  sexChipActive: {
    backgroundColor: "#0B1F3A",
    borderColor: "#0B1F3A",
  },
  policyWarningChip: {
    marginTop: 6,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  overrideChip: {
    marginTop: 6,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#DBEAFE",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  groupNumInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: spacing.sm,
  },
  groupNumLabel: {
    marginRight: 4,
    minWidth: 24,
  },
  groupNumInput: {
    width: 40,
    minHeight: 32,
    paddingHorizontal: spacing.xs,
    textAlign: "center",
  },
  moveButtons: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  moveBtn: {
    padding: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: "#F3F4F6",
  },
  groupActions: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
    marginTop: spacing.xs,
  },
  groupsContainer: {
    gap: spacing.sm,
  },
  groupTableCard: {
    marginBottom: 14,
    padding: 18,
  },
  groupTitle: {
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  nameCol: {
    flex: 1.8,
  },
  hiCol: {
    flex: 0.6,
    textAlign: "center",
  },
  phCol: {
    flex: 0.6,
    textAlign: "center",
  },
  teeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  teeColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  warningBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.sm,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
});
