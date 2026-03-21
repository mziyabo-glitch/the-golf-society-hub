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
  isTeeSheetEligible,
  scopeEventRegistrations,
  type EventRegistration,
} from "@/lib/db_supabase/eventRegistrationRepo";
import {
  eligibleMemberIdSetFromRegistrations,
  fetchEligibleMemberIdsForTeeSheetSave,
  filterPlayerIdsForTeeSheet,
  filterTeeGroupPlayersForEligibility,
  loadJointTeeSheetForManCo,
  sanitizePlayerGroupsForTeeSheetSave,
} from "@/lib/teeSheetEligibility";
import { getEventGuests } from "@/lib/db_supabase/eventGuestRepo";
import {
  loadTeeSheet,
  getTeeGroups,
  getTeeGroupPlayers,
  upsertTeeSheet,
  clearPersistedTeeSheet,
  teeTimeToDisplay,
  type TeeGroupRow,
  type TeeGroupPlayerRow,
} from "@/lib/db_supabase/teeGroupsRepo";
import {
  getJointMetaForEventIds,
  updateEventEntriesPairings,
  mapJointEventToEventDoc,
  clearJointEventPairings,
} from "@/lib/db_supabase/jointEventRepo";
import type { JointEventTeeSheet, JointEventTeeSheetEntry } from "@/lib/db_supabase/jointEventTypes";
import type { EventEntryPairingAssignment } from "@/lib/db_supabase/jointEventRepo";
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
import { getColors, spacing, radius } from "@/lib/ui/theme";
import { assertPngExportOnly } from "@/lib/share/pngExportGuard";
import { formatError, type FormattedError } from "@/lib/ui/formatError";
import type { TeeSheetData } from "@/lib/teeSheetPdf";
import { getSocietyLogoUrl } from "@/lib/societyLogo";

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

/** One assignment per `event_entry` row (dual membership ⇒ multiple ids, same slot). */
function jointPairingAssignmentsForGroup(
  players: EditablePlayer[],
  groupNumber: number,
): EventEntryPairingAssignment[] {
  const unassigned = groupNumber === 0;
  return players.flatMap((p, idx) => {
    const ids =
      p.all_event_entry_ids?.length
        ? p.all_event_entry_ids
        : p.event_entry_id
          ? [p.event_entry_id]
          : [];
    return ids.map((event_entry_id) => ({
      event_entry_id,
      pairing_group: unassigned ? null : groupNumber,
      pairing_position: unassigned ? null : idx,
    }));
  });
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
      <AppText variant="caption" color="tertiary" style={styles.groupNumLabel}>Grp</AppText>
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
              <AppText variant="small" color="tertiary" numberOfLines={1}>
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
  const [selectedEventRegistrations, setSelectedEventRegistrations] = useState<EventRegistration[]>([]);
  const [showGroupEditor, setShowGroupEditor] = useState(false);
  const [manCo, setManCo] = useState<ManCoDetails>({ captain: null, secretary: null, treasurer: null, handicapper: null });
  const [isJointEventTeeSheet, setIsJointEventTeeSheet] = useState(false);
  const [jointTeeSheetData, setJointTeeSheetData] = useState<JointEventTeeSheet | null>(null);

  const permissions = getPermissionsForMember(member as any);
  const canGenerateTeeSheet = permissions.canGenerateTeeSheet;

  // Get logo URL from society
  const logoUrl = getSocietyLogoUrl(society);

  // Load events (host + joint where society participates) and members
  const loadData = useCallback(async () => {
    if (!societyId) return;

    setLoading(true);
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
    }
  }, [societyId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load selected event details and initialize groups (standard or joint path)
  useEffect(() => {
    const loadEventDetails = async () => {
      if (!selectedEventId) {
        setSelectedEvent(null);
        setSelectedEventRegistrations([]);
        setGroups([]);
        setIsJointEventTeeSheet(false);
        setJointTeeSheetData(null);
        return;
      }

      setNotice(null);
      try {
        const listHit = events.find((e) => e.id === selectedEventId);
        let joint = listHit?.is_joint_event === true;
        if (listHit === undefined) {
          const m = await getJointMetaForEventIds([selectedEventId]);
          joint = m.get(selectedEventId)?.is_joint_event ?? false;
        }
        if (joint) {
          const loaded = await loadJointTeeSheetForManCo(selectedEventId);
          if (!loaded) {
            setSelectedEvent(null);
            setJointTeeSheetData(null);
            setIsJointEventTeeSheet(false);
            setGroups([]);
            return;
          }
          const { teeSheet } = loaded;
          setJointTeeSheetData(teeSheet);
          setIsJointEventTeeSheet(true);
          setSelectedEvent(mapJointEventToEventDoc(teeSheet.event) as EventDoc);
          setSelectedEventRegistrations([]);

          setNtpHolesInput("-");
          setLdHolesInput("-");
          const ev = teeSheet.event;
          if (ev.tee_time_start) setStartTime(ev.tee_time_start);
          if (ev.tee_time_interval != null && ev.tee_time_interval > 0) {
            setTeeInterval(String(ev.tee_time_interval));
          }

          const newGroups: PlayerGroup[] = (teeSheet.groups ?? []).map((g, groupIdx) => ({
            groupNumber: g.group_number,
            players: (g.entries ?? []).map((e) => jointTeeSheetEntryToEditable(e, groupIdx)),
          }));
          setGroups(newGroups.length > 0 ? newGroups : []);
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
        const hostIdStd = event?.society_id ?? societyId ?? null;
        setSelectedEventRegistrations(
          scopeEventRegistrations(registrations ?? [], { kind: "standard", hostSocietyId: hostIdStd }),
        );

        if (!event) return;

        setNtpHolesInput(formatHoleNumbers(event.nearestPinHoles));
        setLdHolesInput(formatHoleNumbers(event.longestDriveHoles));
        if (event.teeTimeStart) setStartTime(event.teeTimeStart);
        if (event.teeTimeInterval != null && event.teeTimeInterval > 0) {
          setTeeInterval(String(event.teeTimeInterval));
        }

        const { groups: teeGroups, players: teeGroupPlayers } = await loadTeeSheet(selectedEventId);
        const scopedRegs = scopeEventRegistrations(registrations ?? [], {
          kind: "standard",
          hostSocietyId: hostIdStd,
        });
        const eligibleIds = eligibleMemberIdSetFromRegistrations(scopedRegs);
        const groupsExist = teeGroups.length > 0 && teeGroupPlayers.length > 0;
        if (groupsExist) {
          const filteredPlayers = filterTeeGroupPlayersForEligibility(teeGroupPlayers, eligibleIds);
          setGroups(rebuildGroups(teeGroups, filteredPlayers, members, guests ?? [], event));
        } else {
          const playerIds =
            event.playerIds?.length
              ? filterPlayerIdsForTeeSheet(event.playerIds.map(String), eligibleIds)
              : scopedRegs.filter(isTeeSheetEligible).map((r) => r.member_id);
          initializeGroups({ ...event, playerIds }, members, guests ?? []);
        }
      } catch (err) {
        console.error("[TeeSheet] loadEventDetails error:", err);
        setNotice({ type: "error", ...formatError(err) });
      }
    };

    loadEventDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEventId, members, events]);

  // Rebuild UI state from persisted tee_groups and tee_group_players
  const rebuildGroups = (
    groups: TeeGroupRow[],
    players: TeeGroupPlayerRow[],
    membersList: MemberDoc[],
    guests: { id: string; name: string; sex: "male" | "female"; handicap_index: number | null }[],
    evt: EventDoc
  ): PlayerGroup[] => {
    const menTee: TeeBlock | null =
      evt.par != null && evt.courseRating != null && evt.slopeRating != null
        ? { par: evt.par, courseRating: evt.courseRating, slopeRating: evt.slopeRating }
        : null;
    const ladiesTee: TeeBlock | null =
      evt.ladiesPar != null && evt.ladiesCourseRating != null && evt.ladiesSlopeRating != null
        ? { par: evt.ladiesPar, courseRating: evt.ladiesCourseRating, slopeRating: evt.ladiesSlopeRating }
        : null;
    const allowance = evt.handicapAllowance ?? DEFAULT_ALLOWANCE;

    const lookupPlayer = (playerId: string): { id: string; name: string; handicapIndex: number | null; gender: Gender | null } | null => {
      if (playerId.startsWith("guest-")) {
        const guestId = playerId.slice(6);
        const g = guests.find((x) => x.id === guestId);
        return g ? { id: playerId, name: g.name, handicapIndex: g.handicap_index ?? null, gender: g.sex as Gender } : null;
      }
      const m = membersList.find((x) => x.id === playerId);
      return m ? { id: m.id, name: m.name || m.displayName || "Member", handicapIndex: m.handicapIndex ?? m.handicap_index ?? null, gender: m.gender ?? null } : null;
    };

    const groupMap = new Map<number, { teeTime: string; players: { playerId: string; position: number }[] }>();
    for (const grp of groups) {
      groupMap.set(grp.group_number, {
        teeTime: grp.tee_time ? teeTimeToDisplay(grp.tee_time) : "08:00",
        players: [],
      });
    }
    for (const row of players) {
      if (!groupMap.has(row.group_number)) {
        groupMap.set(row.group_number, { teeTime: "08:00", players: [] });
      }
      groupMap.get(row.group_number)!.players.push({ playerId: row.player_id, position: row.position });
    }
    for (const [, data] of groupMap) {
      data.players.sort((a, b) => a.position - b.position);
    }
    const sortedGroupNumbers = [...groupMap.keys()].sort((a, b) => a - b);
    const newGroups: PlayerGroup[] = [];

    for (const groupNumber of sortedGroupNumbers) {
      const data = groupMap.get(groupNumber)!;
      const groupPlayers: EditablePlayer[] = [];
      for (const { playerId } of data.players) {
        const p = lookupPlayer(playerId);
        if (!p) continue;
        const playerTee = selectTeeByGender(p.gender, menTee, ladiesTee);
        const courseHandicap = calcCourseHandicap(p.handicapIndex, playerTee);
        const playingHandicap = calcPlayingHandicap(courseHandicap, allowance);
        groupPlayers.push({
          id: p.id,
          name: p.name,
          handicapIndex: p.handicapIndex,
          playingHandicap,
          gender: p.gender ?? null,
          groupIndex: groupNumber - 1,
        });
      }
      newGroups.push({ groupNumber, players: groupPlayers });
    }

    return newGroups;
  };

  // Initialize groups from event players (playerIds from event or registrations) + guests
  const initializeGroups = (
    event: EventDoc & { playerIds?: string[] },
    membersList: MemberDoc[],
    guests: { id: string; name: string; sex: "male" | "female"; handicap_index: number | null }[] = []
  ) => {
    const playerIds = event.playerIds || [];
    // Preserve saved order when playerIds has content (tee sheet was saved)
    const eventMembers = playerIds.length > 0
      ? playerIds.map((id) => membersList.find((m) => m.id === id)).filter(Boolean) as typeof membersList
      : membersList.filter((m) => playerIds.includes(m.id));

    // Convert guests to same shape as members for grouping
    const guestPlayers = guests.map((g) => ({
      id: `guest-${g.id}`,
      name: g.name,
      handicapIndex: g.handicap_index ?? null,
      handicap_index: g.handicap_index ?? null,
      gender: g.sex as Gender,
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

    // When playerIds has content, preserve saved tee sheet order; else sort by handicap
    const sorted =
      playerIds.length > 0
        ? allPlayers
        : [...allPlayers].sort((a, b) => {
            const hiA = a.handicapIndex ?? a.handicap_index ?? null;
            const hiB = b.handicapIndex ?? b.handicap_index ?? null;
            if (hiA == null && hiB == null) return 0;
            if (hiA == null) return 1;
            if (hiB == null) return -1;
            return hiB - hiA;
          });

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

  // Flatten groups to playerIds (member IDs only)
  const groupsToPlayerIds = (): string[] =>
    groups.flatMap((g) => g.players).map((p) => p.id).filter((id) => !id.startsWith("guest-"));

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
        const loaded = await loadJointTeeSheetForManCo(selectedEventId);
        if (loaded) {
          const { teeSheet } = loaded;
          setJointTeeSheetData(teeSheet);
          setSelectedEvent(mapJointEventToEventDoc(teeSheet.event) as EventDoc);
          const newGroups: PlayerGroup[] = (teeSheet.groups ?? []).map((g, groupIdx) => ({
            groupNumber: g.group_number,
            players: (g.entries ?? []).map((e) => jointTeeSheetEntryToEditable(e, groupIdx)),
          }));
          setGroups(newGroups.length > 0 ? newGroups : []);
        } else {
          setGroups([]);
        }
      } else {
        const [evt, regs, guestList] = await Promise.all([
          getEvent(selectedEventId),
          getEventRegistrations(selectedEventId),
          getEventGuests(selectedEventId),
        ]);
        if (evt) {
          setSelectedEvent(evt);
          const hostClear = evt.society_id ?? societyId ?? null;
          const scopedRegs = scopeEventRegistrations(regs ?? [], { kind: "standard", hostSocietyId: hostClear });
          const eligibleIds = eligibleMemberIdSetFromRegistrations(scopedRegs);
          const playerIds =
            evt.playerIds?.length
              ? filterPlayerIdsForTeeSheet(evt.playerIds.map(String), eligibleIds)
              : scopedRegs.filter(isTeeSheetEligible).map((r) => r.member_id);
          initializeGroups({ ...evt, playerIds }, members, guestList ?? []);
        }
      }
      setToast({ visible: true, message: "Tee sheet cleared", type: "success" });
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
        const loaded = await loadJointTeeSheetForManCo(selectedEventId);
        if (loaded) {
          setJointTeeSheetData(loaded.teeSheet);
          setSelectedEvent(mapJointEventToEventDoc(loaded.teeSheet.event) as EventDoc);
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
    const rawNonEmpty = groups.filter((g) => g.players.length > 0);
    if (rawNonEmpty.length === 0) {
      setNotice({ type: "error", message: "No players added", detail: "Add players to groups before saving." });
      return;
    }
    setNotice(null);
    setSaving(true);
    try {
      const participantSocietyIds =
        jointTeeSheetData?.participating_societies?.map((s) => s.society_id).filter(Boolean) ?? [];
      const eligibleIds = await fetchEligibleMemberIdsForTeeSheetSave({
        eventId: selectedEventId,
        isJoint: isJointEventTeeSheet,
        participantSocietyIds,
        hostSocietyId: selectedEvent.society_id ?? societyId ?? null,
      });
      const nonEmptyGroups = sanitizePlayerGroupsForTeeSheetSave(rawNonEmpty, eligibleIds);
      if (nonEmptyGroups.length === 0) {
        setNotice({
          type: "error",
          message: "No tee-sheet-eligible players",
          detail: "Only members who are confirmed and paid are included on the tee sheet. Update Attendance & payment on the event first.",
        });
        return;
      }

      const interval = parseInt(teeInterval, 10) || 10;

      if (isJointEventTeeSheet) {
        const assignments = nonEmptyGroups.flatMap((g) =>
          jointPairingAssignmentsForGroup(g.players, g.groupNumber),
        );
        await updateEventEntriesPairings(selectedEventId, assignments);
        await updateEvent(selectedEventId, {
          teeTimeStart: startTime || "08:00",
          teeTimeInterval: interval,
        });
        setToast({ visible: true, message: "Tee sheet saved", type: "success" });
        const loaded = await loadJointTeeSheetForManCo(selectedEventId);
        if (loaded) {
          const { teeSheet } = loaded;
          setJointTeeSheetData(teeSheet);
          const newGroups: PlayerGroup[] = (teeSheet.groups ?? []).map((g, groupIdx) => ({
            groupNumber: g.group_number,
            players: (g.entries ?? []).map((e) => jointTeeSheetEntryToEditable(e, groupIdx)),
          }));
          setGroups(newGroups.length > 0 ? newGroups : []);
        }
        loadData();
        return;
      }

      const playerIds = groupsToPlayerIdsFrom(nonEmptyGroups);
      const ntpHoles = parseHoleNumbers(ntpHolesInput === "-" ? "" : ntpHolesInput);
      const ldHoles = parseHoleNumbers(ldHolesInput === "-" ? "" : ldHolesInput);

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
      await upsertTeeSheet(selectedEventId, teeGroupInputs, teePlayerInputs);

      await updateEvent(selectedEventId, {
        playerIds,
        teeTimeStart: startTime || "08:00",
        teeTimeInterval: interval,
        teeTimePublishedAt: new Date().toISOString(),
        nearestPinHoles: ntpHoles.length > 0 ? ntpHoles : undefined,
        longestDriveHoles: ldHoles.length > 0 ? ldHoles : undefined,
      });
      setToast({ visible: true, message: "Tee sheet saved", type: "success" });

      // Refetch and reconstruct from DB so UI matches persisted state
      const [refreshedEvent, regs, guestList, teeGroups, teeGroupPlayers] = await Promise.all([
        getEvent(selectedEventId),
        getEventRegistrations(selectedEventId),
        getEventGuests(selectedEventId),
        getTeeGroups(selectedEventId),
        getTeeGroupPlayers(selectedEventId),
      ]);
      if (refreshedEvent && teeGroups && teeGroupPlayers) {
        setSelectedEvent(refreshedEvent);
        const hostRefresh = refreshedEvent.society_id ?? societyId ?? null;
        const scopedRegs = scopeEventRegistrations(regs ?? [], { kind: "standard", hostSocietyId: hostRefresh });
        const eligibleRefresh = eligibleMemberIdSetFromRegistrations(scopedRegs);
        const groupsExist = teeGroups.length > 0 && teeGroupPlayers.length > 0;
        if (groupsExist) {
          setGroups(
            rebuildGroups(
              teeGroups,
              filterTeeGroupPlayersForEligibility(teeGroupPlayers, eligibleRefresh),
              members,
              guestList,
              refreshedEvent,
            ),
          );
        } else {
          const ids = refreshedEvent.playerIds?.length
            ? filterPlayerIdsForTeeSheet(refreshedEvent.playerIds.map(String), eligibleRefresh)
            : scopedRegs.filter(isTeeSheetEligible).map((r) => r.member_id);
          initializeGroups({ ...refreshedEvent, playerIds: ids }, members, guestList);
        }
      }
      loadData();
    } catch (err: any) {
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
      await updateEvent(selectedEventId, {
        nearestPinHoles: ntpHoles,
        longestDriveHoles: ldHoles,
      });
      setToast({ visible: true, message: "Settings saved", type: "success" });
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

  // Share/export tee sheet
  const MAX_TEE_TIMES = 12;

  const handleGenerateTeeSheet = async () => {
    if (!guardPaidAction()) return;
    if (!selectedEvent || !societyId) return;

    const rawNonEmpty = groups.filter((g) => g.players.length > 0);
    if (rawNonEmpty.length === 0) {
      setNotice({ type: "error", message: "No players added", detail: "Add players to the event before generating the tee sheet." });
      return;
    }

    const participantSocietyIds =
      jointTeeSheetData?.participating_societies?.map((s) => s.society_id).filter(Boolean) ?? [];
    const eligibleIds = await fetchEligibleMemberIdsForTeeSheetSave({
      eventId: selectedEventId!,
      isJoint: isJointEventTeeSheet,
      participantSocietyIds,
      hostSocietyId: selectedEvent.society_id ?? societyId ?? null,
    });
    const nonEmptyGroups = sanitizePlayerGroupsForTeeSheetSave(rawNonEmpty, eligibleIds);
    if (nonEmptyGroups.length === 0) {
      setNotice({
        type: "error",
        message: "No tee-sheet-eligible players",
        detail: "Only members who are confirmed and paid are published on the tee sheet. Update Attendance & payment on the event first.",
      });
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

      const players: TeeSheetData["players"] = groupsForExport.flatMap((group) =>
        group.players.map((player) => ({
          id: player.id,
          name: player.name,
          handicapIndex: player.handicapIndex ?? null,
          gender: player.gender ?? null,
          group: group.groupNumber,
        }))
      );

      let ev: EventDoc = selectedEvent;

      if (isJointEventTeeSheet && selectedEventId) {
        const assignments = groupsForExport.flatMap((g) =>
          jointPairingAssignmentsForGroup(g.players, g.groupNumber),
        );
        await updateEventEntriesPairings(selectedEventId, assignments);
        const refreshed = await publishTeeTime(selectedEventId, startTime || "08:00", interval);
        if (refreshed) {
          setSelectedEvent(refreshed);
          ev = refreshed;
        }
      } else {
        const refreshed = await publishTeeTime(selectedEvent.id, startTime || "08:00", interval);
        if (refreshed) setSelectedEvent(refreshed);
        ev = refreshed ?? selectedEvent;

        const teeGroupInputs = groupsForExport.map((g) => ({
          group_number: g.groupNumber,
          tee_time: computeTeeTimeForGroup(g.groupNumber),
        }));
        const teePlayerInputs = groupsForExport.flatMap((g) =>
          g.players.map((p, idx) => ({ player_id: p.id, group_number: g.groupNumber, position: idx }))
        );
        await upsertTeeSheet(selectedEvent.id, teeGroupInputs, teePlayerInputs);

        const playerIds = groupsToPlayerIdsFrom(groupsForExport);
        await updateEvent(selectedEvent.id, { playerIds });
      }

      const exportData: TeeSheetData = {
        societyId,
        societyName: isJointEventTeeSheet && jointTeeSheetData?.participating_societies?.length
          ? `Joint: ${jointTeeSheetData.participating_societies.map((s: { society_name: string }) => s.society_name).filter(Boolean).join(" & ")}`
          : (society?.name || "Golf Society"),
        logoUrl,
        manCo,
        eventName: ev.name || "Event",
        eventDate: ev.date || null,
        courseName: ev.courseName || null,
        startTime: startTime || null,
        teeTimeInterval: interval,
        nearestPinHoles: ntpHoles.length > 0 ? ntpHoles : null,
        longestDriveHoles: ldHoles.length > 0 ? ldHoles : null,
        teeName: ev.teeName || null,
        ladiesTeeName: ev.ladiesTeeName || null,
        teeSettings: ev.par != null && ev.courseRating != null && ev.slopeRating != null
          ? { par: ev.par, courseRating: ev.courseRating, slopeRating: ev.slopeRating }
          : null,
        ladiesTeeSettings: ev.ladiesPar != null && ev.ladiesCourseRating != null && ev.ladiesSlopeRating != null
          ? { par: ev.ladiesPar, courseRating: ev.ladiesCourseRating, slopeRating: ev.ladiesSlopeRating }
          : null,
        handicapAllowance: ev.handicapAllowance ?? null,
        format: ev.format ?? null,
        players,
        preGrouped: true,
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
      setGenerating(false);
    }
  };

  if (bootstrapLoading || loading) {
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
      <AppText variant="small" color="tertiary" style={{ marginBottom: spacing.lg }}>
        Tee sheet groups only include members who are confirmed and paid. Use the event&apos;s Attendance &amp; payment
        screen to manage RSVPs and fees; unpaid players stay off the tee sheet until paid.
      </AppText>

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
          <AppText variant="h2" style={styles.sectionTitle}>Select Event</AppText>
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
                        <AppText variant="small" color="tertiary">
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
              <AppText variant="h2" style={styles.sectionTitle}>Tee Times</AppText>
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
                <AppText variant="small" color="tertiary" style={{ marginTop: spacing.xs }}>
                  {selectedPlayerCount} players → {groupCount} group{groupCount !== 1 ? "s" : ""}
                </AppText>
              </AppCard>

              {/* Group Editor Toggle */}
              <View style={styles.sectionHeader}>
                <AppText variant="h2">Player Groups</AppText>
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
                  {groups.map((group, groupIdx) => (
                    <AppCard key={groupIdx} style={styles.groupCard}>
                      <View style={styles.groupHeader}>
                        <AppText variant="bodyBold" color="primary">
                          {group.groupNumber === 0 ? "Unassigned" : `Group ${group.groupNumber}`}
                        </AppText>
                        <AppText variant="small" color="tertiary">
                          {group.players.length} player{group.players.length !== 1 ? "s" : ""}
                        </AppText>
                      </View>

                      {group.players.length === 0 ? (
                        <AppText variant="small" color="tertiary" style={{ fontStyle: "italic", paddingVertical: spacing.sm }}>
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
                          const loaded = await loadJointTeeSheetForManCo(selectedEventId);
                          if (!loaded) return;
                          const { teeSheet } = loaded;
                          setJointTeeSheetData(teeSheet);
                          const newGroups: PlayerGroup[] = (teeSheet.groups ?? []).map((g, groupIdx) => ({
                            groupNumber: g.group_number,
                            players: (g.entries ?? []).map((e) => jointTeeSheetEntryToEditable(e, groupIdx)),
                          }));
                          setGroups(newGroups.length > 0 ? newGroups : []);
                          return;
                        }
                        const [evt, regs, guestList] = await Promise.all([
                          getEvent(selectedEventId),
                          getEventRegistrations(selectedEventId),
                          getEventGuests(selectedEventId),
                        ]);
                        if (!evt) return;
                        const hostReset = evt.society_id ?? societyId ?? null;
                        const scopedRegs = scopeEventRegistrations(regs ?? [], { kind: "standard", hostSocietyId: hostReset });
                        const eligibleIds = eligibleMemberIdSetFromRegistrations(scopedRegs);
                        const playerIds =
                          evt.playerIds?.length
                            ? filterPlayerIdsForTeeSheet(evt.playerIds.map(String), eligibleIds)
                            : scopedRegs.filter(isTeeSheetEligible).map((r) => r.member_id);
                        initializeGroups({ ...evt, playerIds }, members, guestList ?? []);
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
              <AppText variant="h2" style={styles.sectionTitle}>Competition Holes</AppText>
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
                  <AppText variant="small" color="tertiary">Comma-separated hole numbers</AppText>
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
                  <AppText variant="h2" style={styles.sectionTitle}>Course Setup</AppText>
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
                      <AppText variant="small" color="tertiary" style={{ marginTop: spacing.sm }}>
                        Handicap Allowance: {Math.round(selectedEvent.handicapAllowance * 100)}%
                      </AppText>
                    )}
                    <AppText variant="small" color="tertiary" style={{ marginTop: spacing.xs }}>
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
