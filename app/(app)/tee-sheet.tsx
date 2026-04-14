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

import React, { useCallback, useEffect, useState } from "react";
import { Alert, Platform, StyleSheet, View, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
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
import { getEventGuests } from "@/lib/db_supabase/eventGuestRepo";
import {
  upsertTeeSheet,
  clearPersistedTeeSheet,
} from "@/lib/db_supabase/teeGroupsRepo";
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
  selectTeeByGender,
  formatHandicap,
  DEFAULT_ALLOWANCE,
} from "@/lib/whs";
import { parseHoleNumbers, formatHoleNumbers, calculateGroupSizes } from "@/lib/teeSheetGrouping";
import { buildSocietyIdToNameMap } from "@/lib/jointEventSocietyLabel";
import { expandJointTeeSheetReplaceRowsForParticipatingSocieties } from "@/lib/jointPersonDedupe";
import { getColors, spacing, radius } from "@/lib/ui/theme";
import { assertPngExportOnly } from "@/lib/share/pngExportGuard";
import { formatError, type FormattedError } from "@/lib/ui/formatError";
import type { TeeSheetData } from "@/lib/teeSheetPdf";
import {
  loadCanonicalTeeSheet,
  buildTeeSheetDataFromCanonical,
  type CanonicalTeeSheetResult,
} from "@/lib/teeSheet/canonicalTeeSheet";
import { getSocietyLogoUrl } from "@/lib/societyLogo";
import { getCache, invalidateCache, invalidateCachePrefix, setCache } from "@/lib/cache/clientCache";

type EditablePlayer = {
  id: string;
  name: string;
  handicapIndex: number | null;
  playingHandicap: number | null;
  gender: Gender;
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
  const [eventMemberPool, setEventMemberPool] = useState<MemberDoc[]>([]);
  const [, setSelectedEventRegistrations] = useState<EventRegistration[]>([]);
  const [showGroupEditor, setShowGroupEditor] = useState(false);
  const [manCo, setManCo] = useState<ManCoDetails>({ captain: null, secretary: null, treasurer: null, handicapper: null });
  const [isJointEventTeeSheet, setIsJointEventTeeSheet] = useState(false);
  const [jointTeeSheetData, setJointTeeSheetData] = useState<JointEventTeeSheet | null>(null);
  const [eventDetailsRefreshing, setEventDetailsRefreshing] = useState(false);
  const [hasHydratedIndexCache, setHasHydratedIndexCache] = useState(false);
  const eventLoadSeqRef = React.useRef(0);

  const permissions = getPermissionsForMember(member);
  const canGenerateTeeSheet = permissions.canGenerateTeeSheet;

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

      const upcomingEvents = eventsData.filter((e) => !e.isCompleted);
      setEvents(upcomingEvents);
      setMembers(membersData);
      setManCo(manCoData);
      await setCache(`society:${societyId}:tee-sheet:index`, {
        events: upcomingEvents,
        members: membersData,
        manCo: manCoData,
      }, { ttlMs: 1000 * 60 * 5 });

      // Keep selection if still in this society’s list; otherwise first upcoming (fixes stale id after society switch)
      setSelectedEventId((prev) => {
        if (prev && upcomingEvents.some((e) => e.id === prev)) return prev;
        return upcomingEvents[0]?.id ?? null;
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

  // Load selected event details and initialize groups (standard or joint path)
  useEffect(() => {
    const loadEventDetails = async () => {
      if (!selectedEventId) {
        setSelectedEvent(null);
        setSelectedEventRegistrations([]);
        setGroups([]);
        setSelectedPlayerIds([]);
        setEventMemberPool([]);
        setIsJointEventTeeSheet(false);
        setJointTeeSheetData(null);
        return;
      }

      setNotice(null);
      const seq = ++eventLoadSeqRef.current;
      try {
        setEventDetailsRefreshing(true);
        const listHit = events.find((e) => e.id === selectedEventId);
        let joint = listHit?.is_joint_event === true;
        if (listHit === undefined) {
          const m = await getJointMetaForEventIds([selectedEventId]);
          joint = m.get(selectedEventId)?.is_joint_event ?? false;
        }
        if (joint) {
          const teeSheet = await getJointEventTeeSheet(selectedEventId);
          if (!teeSheet) {
            setSelectedEvent(null);
            setJointTeeSheetData(null);
            setIsJointEventTeeSheet(false);
            setGroups([]);
            setSelectedPlayerIds([]);
            setEventMemberPool([]);
            return;
          }
          setJointTeeSheetData(teeSheet);
          setIsJointEventTeeSheet(true);
          setSelectedEvent(mapJointEventToEventDoc(teeSheet.event) as EventDoc);
          const regs = await getEventRegistrations(selectedEventId);
          setSelectedEventRegistrations(regs);

          const ev = teeSheet.event;
          const persistedNtp = formatHoleNumbers(ev.nearest_pin_holes ?? []);
          const persistedLd = formatHoleNumbers(ev.longest_drive_holes ?? []);
          setNtpHolesInput(persistedNtp);
          setLdHolesInput(persistedLd);
          if (__DEV__) {
            console.log("[tee-competition-holes][load]", {
              source: "joint_event_detail",
              eventId: selectedEventId,
              nearestPinHoles: ev.nearest_pin_holes ?? [],
              longestDriveHoles: ev.longest_drive_holes ?? [],
            });
          }
          if (ev.tee_time_start) setStartTime(ev.tee_time_start);
          if (ev.tee_time_interval != null && ev.tee_time_interval > 0) {
            setTeeInterval(String(ev.tee_time_interval));
          }

          const participantSocietyIds =
            teeSheet.participating_societies?.map((s) => s.society_id).filter(Boolean) ?? [];
          const lists = await Promise.all(participantSocietyIds.map((sid) => getMembersBySocietyId(sid)));
          const pooled = lists.flat();
          const candidate = await getJointTeeSheetCandidatePoolForEvent(selectedEventId, participantSocietyIds);
          const candidateIdSet = new Set(candidate.memberIds);
          const candidateMembers = pooled.filter((m) => candidateIdSet.has(String(m.id)));
          setEventMemberPool(candidateMembers);
          setSelectedPlayerIds(candidate.memberIds);
          setSelectedEventRegistrations(candidate.registrations);
          const persistedGroups: PlayerGroup[] = normalizeGroups(
            (teeSheet.groups ?? []).map((g, groupIdx) => ({
              groupNumber: g.group_number,
              players: (g.entries ?? []).map((e) => jointTeeSheetEntryToEditable(e, groupIdx)),
            })),
          );
          const persistedIds = groupsToPlayerIdsFrom(persistedGroups);
          if (persistedIds.length > 0) {
            setGroups(persistedGroups);
            setSelectedPlayerIds(persistedIds);
            if (__DEV__) {
              console.log("[teesheet] reload source", {
                eventId: selectedEventId,
                source: "joint_event_entries",
                groupCount: persistedGroups.length,
                rowCount: persistedGroups.flatMap((g) => g.players).length,
                fallbackUsed: false,
              });
            }
            logSelectedPlayersDev("[teesheet] selected players (after ManCo edits)", selectedEventId, persistedIds);
          } else {
            initializeGroups(mapJointEventToEventDoc(teeSheet.event) as EventDoc, candidate.memberIds, candidateMembers, []);
            if (__DEV__) {
              console.log("[teesheet] reload source", {
                eventId: selectedEventId,
                source: "joint_event_entries",
                groupCount: 0,
                rowCount: 0,
                fallbackUsed: true,
                fallback: "candidate_member_pool_generated_groups",
              });
            }
            logSelectedPlayersDev("[teesheet] selected players (after ManCo edits)", selectedEventId, candidate.memberIds);
          }
          if (eventLoadSeqRef.current === seq) {
            await setCache(`event:${selectedEventId}:tee-sheet`, {
              selectedEvent: mapJointEventToEventDoc(teeSheet.event) as EventDoc,
              selectedEventRegistrations: regs,
              groups: persistedIds.length > 0 ? persistedGroups : [],
              selectedPlayerIds: persistedIds.length > 0 ? persistedIds : candidate.memberIds,
              eventMemberPool: candidateMembers,
              isJointEventTeeSheet: true,
              jointTeeSheetData: teeSheet,
              startTime: teeSheet.event.tee_time_start || "08:00",
              teeInterval: String(teeSheet.event.tee_time_interval ?? 10),
              ntpHolesInput: persistedNtp,
              ldHolesInput: persistedLd,
            }, { ttlMs: 1000 * 60 * 5 });
          }
          return;
        }

        setIsJointEventTeeSheet(false);
        setJointTeeSheetData(null);

        const [event, registrations, guests] = await Promise.all([
          getEvent(selectedEventId),
          getEventRegistrations(selectedEventId),
          getEventGuests(selectedEventId),
        ]);
        setSelectedEvent(event);
        setSelectedEventRegistrations(registrations ?? []);

        if (!event) return;

        setNtpHolesInput(formatHoleNumbers(event.nearestPinHoles));
        setLdHolesInput(formatHoleNumbers(event.longestDriveHoles));
        if (__DEV__) {
          console.log("[tee-competition-holes][load]", {
            source: "event_row",
            eventId: selectedEventId,
            nearestPinHoles: event.nearestPinHoles ?? [],
            longestDriveHoles: event.longestDriveHoles ?? [],
          });
        }
        if (event.teeTimeStart) setStartTime(event.teeTimeStart);
        if (event.teeTimeInterval != null && event.teeTimeInterval > 0) {
          setTeeInterval(String(event.teeTimeInterval));
        }

        const hostIdStd = event.society_id ?? societyId ?? null;
        const membersStd = await getMembersBySocietyId(hostIdStd ?? "");
        setEventMemberPool(membersStd);
        const eligibleIds = await getTeeSheetEligibleMemberIdsForEvent(selectedEventId);
        setSelectedPlayerIds(eligibleIds);
        logSelectedPlayersDev("[teesheet] tee-sheet eligible (paid + in)", selectedEventId, eligibleIds);
        const canonical = await loadCanonicalTeeSheet(selectedEventId);
        const hasPersistedGroups =
          canonical != null &&
          canonical.source === "tee_groups" &&
          canonical.groups.length > 0;
        let groupsForCache: PlayerGroup[] = [];
        let selectedIdsForCache = eligibleIds;
        if (hasPersistedGroups) {
          const persistedGroups = groupsFromCanonical(event, canonical, membersStd);
          const persistedIds = groupsToPlayerIdsFrom(persistedGroups);
          setGroups(persistedGroups);
          setSelectedPlayerIds(persistedIds);
          groupsForCache = persistedGroups;
          selectedIdsForCache = persistedIds;
          if (__DEV__) {
            console.log("[teesheet] reload source", {
              eventId: selectedEventId,
              source: canonical.source,
              published: canonical.published,
              groupCount: canonical.groups.length,
              rowCount: canonical.groups.flatMap((g) => g.players).length,
              fallbackUsed: false,
            });
          }
          logSelectedPlayersDev("[teesheet] selected players (after ManCo edits)", selectedEventId, persistedIds);
        } else {
          initializeGroups(event, eligibleIds, membersStd, guests ?? []);
          if (__DEV__) {
            console.log("[teesheet] reload source", {
              eventId: selectedEventId,
              source: canonical?.source ?? "none",
              published: canonical?.published ?? false,
              groupCount: canonical?.groups.length ?? 0,
              rowCount: canonical?.groups.flatMap((g) => g.players).length ?? 0,
              fallbackUsed: true,
              fallback: "eligible_registrations_generated_groups",
            });
          }
          logSelectedPlayersDev("[teesheet] selected players (after ManCo edits)", selectedEventId, eligibleIds);
        }
        if (eventLoadSeqRef.current === seq) {
          await setCache(`event:${selectedEventId}:tee-sheet`, {
            selectedEvent: event,
            selectedEventRegistrations: registrations ?? [],
            groups: groupsForCache,
            selectedPlayerIds: selectedIdsForCache,
            eventMemberPool: membersStd,
            isJointEventTeeSheet: false,
            jointTeeSheetData: null,
            startTime: event.teeTimeStart || "08:00",
            teeInterval: String(event.teeTimeInterval ?? 10),
            ntpHolesInput: formatHoleNumbers(event.nearestPinHoles),
            ldHolesInput: formatHoleNumbers(event.longestDriveHoles),
          }, { ttlMs: 1000 * 60 * 5 });
        }
      } catch (err) {
        console.error("[TeeSheet] loadEventDetails error:", err);
        setNotice({ type: "error", ...formatError(err) });
      } finally {
        if (eventLoadSeqRef.current === seq) {
          setEventDetailsRefreshing(false);
        }
      }
    };

    loadEventDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEventId, members, events]);

  useEffect(() => {
    if (!selectedEventId) return;
    void (async () => {
      const cached = await getCache<{
        selectedEvent: EventDoc | null;
        selectedEventRegistrations: EventRegistration[];
        groups: PlayerGroup[];
        selectedPlayerIds: string[];
        eventMemberPool: MemberDoc[];
        isJointEventTeeSheet: boolean;
        jointTeeSheetData: JointEventTeeSheet | null;
        startTime: string;
        teeInterval: string;
        ntpHolesInput: string;
        ldHolesInput: string;
      }>(`event:${selectedEventId}:tee-sheet`, { maxAgeMs: 1000 * 60 * 60 });
      if (!cached) {
        return;
      }
      setSelectedEvent(cached.value.selectedEvent ?? null);
      setSelectedEventRegistrations(cached.value.selectedEventRegistrations ?? []);
      setGroups(cached.value.groups ?? []);
      setSelectedPlayerIds(cached.value.selectedPlayerIds ?? []);
      setEventMemberPool(cached.value.eventMemberPool ?? []);
      setIsJointEventTeeSheet(cached.value.isJointEventTeeSheet ?? false);
      setJointTeeSheetData(cached.value.jointTeeSheetData ?? null);
      setStartTime(cached.value.startTime || "08:00");
      setTeeInterval(cached.value.teeInterval || "10");
      setNtpHolesInput(cached.value.ntpHolesInput ?? "");
      setLdHolesInput(cached.value.ldHolesInput ?? "");
      setLoading(false);
    })();
  }, [selectedEventId]);

  const groupsFromCanonical = (
    event: EventDoc,
    canonical: CanonicalTeeSheetResult,
    membersList: MemberDoc[],
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

    return normalizeGroups(
      canonical.groups.map((g, groupIdx) => ({
        groupNumber: g.groupNumber,
        players: g.players.map((p) => {
          const member = membersList.find((m) => m.id === p.id);
          const gender = member?.gender ?? null;
          const hi = member?.handicapIndex ?? member?.handicap_index ?? p.handicapIndex ?? null;
          const playerTee = selectTeeByGender(gender, menTee, ladiesTee);
          const courseHandicap = calcCourseHandicap(hi, playerTee);
          const playingHandicap = calcPlayingHandicap(courseHandicap, allowance);
          return {
            id: p.id,
            name: p.name || member?.name || member?.displayName || "Member",
            handicapIndex: hi,
            playingHandicap,
            gender,
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

    const allPlayers = [...eventMembers, ...guestPlayers];

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

    // Preserve selected player order.
    const sorted = allPlayers;

    // Calculate group sizes
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
        const hi = m.handicapIndex ?? m.handicap_index ?? null;

        // Calculate playing handicap based on gender and tee settings
        const playerTee = selectTeeByGender(gender, menTee, ladiesTee);
        const courseHandicap = calcCourseHandicap(hi, playerTee);
        const playingHandicap = calcPlayingHandicap(courseHandicap, allowance);

        groupPlayers.push({
          id: m.id,
          name: m.name || m.displayName || "Member",
          handicapIndex: hi,
          playingHandicap,
          gender,
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

  // Refresh on focus
  useFocusEffect(
    useCallback(() => {
      if (societyId) {
        loadData();
      }
      setGenerating(false);
    }, [societyId, loadData])
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

  // Flatten groups to playerIds (member IDs only)
  const groupsToPlayerIdsFrom = (groupsArg: PlayerGroup[]): string[] =>
    groupsArg.flatMap((g) => g.players).map((p) => p.id).filter((id) => !id.startsWith("guest-"));

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
        const [evt, guestList] = await Promise.all([
          getEvent(selectedEventId),
          getEventGuests(selectedEventId),
        ]);
        if (evt) {
          setSelectedEvent(evt);
          const eligibleIds = await getTeeSheetEligibleMemberIdsForEvent(selectedEventId);
          setSelectedPlayerIds(eligibleIds);
          logSelectedPlayersDev("[teesheet] tee-sheet eligible (paid + in)", selectedEventId, eligibleIds);
          initializeGroups(evt, eligibleIds, eventMemberPool.length > 0 ? eventMemberPool : members, guestList ?? []);
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

  // Save tee sheet (groups + tee times) without publishing — editable, re-issue when ready
  const handleSaveTeeSheet = async () => {
    if (!guardPaidAction()) return;
    if (!selectedEventId || !selectedEvent) return;
    const nonEmptyGroups = groups.filter((g) => g.players.length > 0);
    if (nonEmptyGroups.length === 0) {
      setNotice({ type: "error", message: "No players added", detail: "Add players to groups before saving." });
      return;
    }
    setNotice(null);
    setSaving(true);
    try {
      const interval = parseInt(teeInterval, 10) || 10;
      const ntpHoles = parseHoleNumbers(ntpHolesInput === "-" ? "" : ntpHolesInput);
      const ldHoles = parseHoleNumbers(ldHolesInput === "-" ? "" : ldHolesInput);
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
        if (__DEV__) {
          console.log("[teesheet] save db response", {
            eventId: selectedEventId,
            source: "joint_event_entries",
            rowsWritten: replaceRows.length,
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
        setToast({ visible: true, message: "Tee sheet saved", type: "success" });
        const tsSaved = await getJointEventTeeSheet(selectedEventId);
        if (tsSaved) {
          setJointTeeSheetData(tsSaved);
          const newGroups: PlayerGroup[] = normalizeGroups((tsSaved.groups ?? []).map((g, groupIdx) => ({
            groupNumber: g.group_number,
            players: (g.entries ?? []).map((e) => jointTeeSheetEntryToEditable(e, groupIdx)),
          })));
          setGroups(newGroups.length > 0 ? newGroups : []);
          const ids = groupsToPlayerIdsFrom(newGroups);
          setSelectedPlayerIds(ids);
          logSelectedPlayersDev("[teesheet] selected players (after ManCo edits)", selectedEventId, ids);
        }
        loadData();
        await invalidateCache(`event:${selectedEventId}:tee-sheet`);
        await invalidateCache(`event:${selectedEventId}:detail`);
        if (societyId) await invalidateCachePrefix(`society:${societyId}:`);
        return;
      }

      const mismatchStd = validateGroupsMatchSelectedIds(nonEmptyGroups, selectedPlayerIds);
      if (mismatchStd) {
        setNotice({ type: "error", message: "Tee sheet out of sync", detail: mismatchStd });
        return;
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
      const canonicalAfterSave = await loadCanonicalTeeSheet(selectedEventId);
      if (__DEV__) {
        console.log("[teesheet] row count after reload", {
          eventId: selectedEventId,
          source: canonicalAfterSave?.source ?? "none",
          rowCount: canonicalAfterSave?.groups.flatMap((g) => g.players).length ?? 0,
          groupCount: canonicalAfterSave?.groups.length ?? 0,
        });
      }
      setToast({ visible: true, message: "Tee sheet saved", type: "success" });
      await invalidateCache(`event:${selectedEventId}:tee-sheet`);
      await invalidateCache(`event:${selectedEventId}:detail`);
      if (societyId) await invalidateCachePrefix(`society:${societyId}:`);
      loadData();
    } catch (err: any) {
      console.error("[teesheet] handleSaveTeeSheet", err);
      const formatted = formatError(err);
      setNotice({ type: "error", message: formatted.message, detail: formatted.detail });
    } finally {
      setSaving(false);
    }
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

  const addPlayerToField = (m: MemberDoc) => {
    const id = String(m.id);
    if (!id || selectedPlayerIds.includes(id)) return;
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

  const handleGenerateTeeSheet = async () => {
    if (!guardPaidAction()) return;
    if (!selectedEvent || !societyId) return;

    const nonEmptyGroups = groups.filter((g) => g.players.length > 0);
    if (nonEmptyGroups.length === 0) {
      setNotice({ type: "error", message: "No players added", detail: "Add players to the event before generating the tee sheet." });
      return;
    }

    if (nonEmptyGroups.length > MAX_TEE_TIMES) {
      setToast({ visible: true, message: `Max ${MAX_TEE_TIMES} tee times — split into 2 exports.`, type: "error" });
    }

    const groupsForExport = nonEmptyGroups.slice(0, MAX_TEE_TIMES);

    setNotice(null);
    setGenerating(true);
    try {
      const interval = parseInt(teeInterval, 10) || 10;
      const ntpHoles = parseHoleNumbers(ntpHolesInput === "-" ? "" : ntpHolesInput);
      const ldHoles = parseHoleNumbers(ldHolesInput === "-" ? "" : ldHolesInput);
      if (__DEV__) {
        console.log("[teesheet] publish start", {
          eventId: selectedEvent.id,
          societyId: selectedEvent.society_id ?? societyId ?? null,
          isJointEvent: isJointEventTeeSheet,
          groups: nonEmptyGroups.length,
          rowCount: nonEmptyGroups.flatMap((g) => g.players).length,
          teeTimeStart: startTime || "08:00",
          teeTimeInterval: interval,
        });
      }

      if (isJointEventTeeSheet && selectedEventId) {
        const finalPlayerIds = groupsToPlayerIdsFrom(nonEmptyGroups);
        const mismatch = validateGroupsMatchSelectedIds(nonEmptyGroups, selectedPlayerIds);
        if (__DEV__ && mismatch) {
          console.warn("[teesheet] publish mismatch warning", { eventId: selectedEventId, mismatch });
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
            action: "publish",
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
        if (__DEV__) {
          console.log("[teesheet] save db response", {
            eventId: selectedEventId,
            source: "joint_event_entries",
            action: "publish",
            rowsWritten: replaceRows.length,
          });
        }
        await logPostSaveJointRead(selectedEventId, finalPlayerIds);
        logSelectedPlayersDev("[teesheet] final published players", selectedEventId, finalPlayerIds);
        const refreshed = await publishTeeTime(selectedEventId, startTime || "08:00", interval);
        if (refreshed) {
          setSelectedEvent(refreshed);
        }
        if (__DEV__) {
          console.log("[tee-competition-holes][save]", {
            path: "joint_publish",
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
      } else {
        const mismatchPub = validateGroupsMatchSelectedIds(groupsForExport, selectedPlayerIds);
        if (mismatchPub) {
          setNotice({ type: "error", message: "Tee sheet out of sync", detail: mismatchPub });
          return;
        }
        const refreshed = await publishTeeTime(selectedEvent.id, startTime || "08:00", interval);
        if (refreshed) setSelectedEvent(refreshed);

        const teeGroupInputs = groupsForExport.map((g) => ({
          group_number: g.groupNumber,
          tee_time: computeTeeTimeForGroup(g.groupNumber),
        }));
        const teePlayerInputs = groupsForExport.flatMap((g) =>
          g.players.map((p, idx) => ({ player_id: p.id, group_number: g.groupNumber, position: idx }))
        );
        if (__DEV__) {
          console.log("[teesheet] payload write", {
            eventId: selectedEvent.id,
            source: "tee_groups",
            action: "publish",
            payload: {
              teeGroups: teeGroupInputs,
              teeGroupPlayers: teePlayerInputs,
            },
          });
        }
        const upsertResult = await upsertTeeSheet(selectedEvent.id, teeGroupInputs, teePlayerInputs);
        if (__DEV__) {
          console.log("[teesheet] save db response", {
            source: "tee_groups",
            action: "publish",
            ...upsertResult,
          });
        }

        const playerIds = selectedPlayerIds.filter((id) => !id.startsWith("guest-"));
        if (__DEV__) {
          console.log("[tee-competition-holes][save]", {
            path: "standard_publish",
            eventId: selectedEvent.id,
            payload: {
              playerIds,
              nearestPinHoles: ntpHoles,
              longestDriveHoles: ldHoles,
            },
          });
        }
        await updateEvent(selectedEvent.id, {
          playerIds,
          nearestPinHoles: ntpHoles,
          longestDriveHoles: ldHoles,
        });
        logSelectedPlayersDev("[teesheet] final published players", selectedEventId!, playerIds);
      }

      if (__DEV__) {
        const roundTrip = await getEvent(selectedEventId!);
        console.log("[tee-competition-holes][roundtrip]", {
          path: isJointEventTeeSheet ? "joint_publish" : "standard_publish",
          eventId: selectedEventId,
          savedNearestPinHoles: ntpHoles,
          savedLongestDriveHoles: ldHoles,
          persistedNearestPinHoles: roundTrip?.nearestPinHoles ?? [],
          persistedLongestDriveHoles: roundTrip?.longestDriveHoles ?? [],
        });
      }

      const canonical = await loadCanonicalTeeSheet(selectedEventId!);
      if (!canonical) {
        throw new Error("Could not load tee sheet after publish");
      }
      if (__DEV__) {
        console.log("[teesheet] row count after reload", {
          eventId: selectedEventId!,
          source: canonical.source,
          rowCount: canonical.groups.flatMap((g) => g.players).length,
          groupCount: canonical.groups.length,
          published: canonical.published,
          fallbackUsed: canonical.source === "computed_fallback",
        });
      }

      const societyNameExport =
        isJointEventTeeSheet && jointTeeSheetData?.participating_societies?.length
          ? `Joint: ${jointTeeSheetData.participating_societies.map((s: { society_name: string }) => s.society_name).filter(Boolean).join(" & ")}`
          : (society?.name || "Golf Society");

      let exportData: TeeSheetData = buildTeeSheetDataFromCanonical(canonical, {
        societyId,
        societyName: societyNameExport,
        logoUrl,
        jointSocieties:
          canonical.isJoint && canonical.jointParticipatingSocieties?.length
            ? canonical.jointParticipatingSocieties.map((s) => ({
                societyId: s.society_id,
                societyName: s.society_name || s.society_id,
                logoUrl: null,
              }))
            : undefined,
        manCo,
        nearestPinHoles: ntpHoles.length > 0 ? ntpHoles : null,
        longestDriveHoles: ldHoles.length > 0 ? ldHoles : null,
        startTime: startTime || null,
        teeTimeInterval: interval,
      });

      const genderById = new Map<string, "male" | "female" | null>(
        groupsForExport.flatMap((g) => g.players.map((p) => [p.id, p.gender ?? null] as const)),
      );
      exportData = {
        ...exportData,
        players: exportData.players.map((p) => ({
          ...p,
          gender: (p.id ? genderById.get(p.id) : null) ?? p.gender ?? null,
        })),
      };
      assertPngExportOnly("Tee Sheet export");

      setToast({
        visible: true,
        message: "Tee times published — members can now see their slot.",
        type: "success",
      });
      await new Promise((r) => setTimeout(r, 1200));

      const payload = encodeURIComponent(JSON.stringify(exportData));
      router.push({
        pathname: "/(share)/tee-sheet",
        params: { payload },
      });
    } catch (err: any) {
      console.error("[TeeSheet] share tee sheet error:", err);
      const formatted = formatError(err);
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
  const selectedIdSet = new Set(selectedPlayerIds);
  const addablePlayers = eventMemberPool.filter((m) => !selectedIdSet.has(String(m.id)));

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
        Tee sheet defaults to confirmed attendees. ManCo can manually add or remove players before publishing.
      </AppText>
      {(refreshing || eventDetailsRefreshing) ? (
        <AppText variant="small" color="muted" style={{ marginBottom: spacing.sm }}>
          Refreshing...
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
          title="No Upcoming Events"
          message="Create an event first to generate a tee sheet."
          action={{ label: "Go to Events", onPress: () => router.push("/(app)/(tabs)/events") }}
        />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Event Selection */}
          <AppText variant="heading" style={styles.sectionTitle}>Select Event</AppText>
          <View style={styles.eventList}>
            {events.map((event) => {
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
                      isSelected && { borderWidth: 2, borderColor: colors.primary },
                    ]}
                  >
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

          {selectedEvent && (
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
                  <AppCard>
                    <AppText variant="captionBold" color="primary">
                      ✔ Attending players (default)
                    </AppText>
                    <AppText variant="small" color="secondary" style={{ marginTop: 4 }}>
                      ➕ Add player from event societies, or ❌ remove from current field.
                    </AppText>
                    {addablePlayers.length === 0 ? (
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
                        const [evt, guestList] = await Promise.all([
                          getEvent(selectedEventId),
                          getEventGuests(selectedEventId),
                        ]);
                        if (!evt) return;
                        const eligibleIds = await getTeeSheetEligibleMemberIdsForEvent(selectedEventId);
                        setSelectedPlayerIds(eligibleIds);
                        logSelectedPlayersDev("[teesheet] tee-sheet eligible (paid + in)", selectedEventId, eligibleIds);
                        initializeGroups(evt, eligibleIds, eventMemberPool.length > 0 ? eventMemberPool : members, guestList ?? []);
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

              {/* Save (persist without publishing) and Share */}
              <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.sm }}>
                <SecondaryButton
                  onPress={handleSaveTeeSheet}
                  loading={saving}
                  disabled={selectedPlayerCount === 0}
                  style={{ flex: 1 }}
                >
                  <Feather name="save" size={18} color={colors.primary} />
                  {" Save Tee Sheet"}
                </SecondaryButton>
                <PrimaryButton
                  onPress={handleGenerateTeeSheet}
                  loading={generating}
                  disabled={selectedPlayerCount === 0}
                  style={{ flex: 1 }}
                >
                  <Feather name="share-2" size={18} color={colors.textInverse} />
                  {" Share Tee Sheet"}
                </PrimaryButton>
              </View>
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
            )
          )}
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
