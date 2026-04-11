/**
 * Event Points Entry Screen
 *
 * Workflow:
 * 1. User enters Day Points (stableford score or strokeplay score) for each player
 * 2. App auto-sorts based on event format:
 *    - Stableford (high_wins): Higher points = better position
 *    - Strokeplay (low_wins): Lower score = better position
 * 3. App auto-assigns positions (1, 2, 3...) with tie handling
 * 4. App auto-calculates OOM points using F1 top-10: [25,18,15,12,10,8,6,4,2,1]
 * 5. Save stores ONLY the OOM points to event_results
 *
 * Joint events: primary list is **`event_entries`** (merged with `events.player_ids` for legacy).
 * Also merge **RSVP in** rows from `event_registrations` for the active society so ManCos can enter OOM
 * when a player was added via fees/attendance but Players / `event_entries` was not saved yet.
 *
 * Joint: load **all** participating societies’ members and map `event_entries` ids (e.g. M4 linked row) to the
 * active society’s member row (e.g. ZGS placeholder) when they cluster as one person (email, name+claimed twin, etc.).
 */

import { useCallback, useMemo, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View, type ViewStyle } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
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
import { useAsyncAction } from "@/lib/hooks/useAsyncAction";
import { usePaidAccess } from "@/lib/access/usePaidAccess";
import { getEvent, getFormatSortOrder, type EventDoc } from "@/lib/db_supabase/eventRepo";
import { getMembersBySocietyId, getMembersByIds, type MemberDoc } from "@/lib/db_supabase/memberRepo";
import {
  getEventRegistrations,
  scopeEventRegistrations,
  isRegistrationConfirmed,
} from "@/lib/db_supabase/eventRegistrationRepo";
import { getJointEventDetail, getJointMetaForEventIds } from "@/lib/db_supabase/jointEventRepo";
import { isJointEventFromMeta, isActiveSocietyParticipantForEvent } from "@/lib/jointEventAccess";
import { logJointPlayableConsistencyDev } from "@/lib/jointEventPlayableConsistency";
import {
  upsertEventResults,
  getEventResultsForSociety,
  deleteEventResultForMember,
  type EventResultDoc,
} from "@/lib/db_supabase/resultsRepo";
import { invalidateCache, invalidateCachePrefix } from "@/lib/cache/clientCache";
import { getPermissionsForMember } from "@/lib/rbac";
import { getColors, spacing, radius } from "@/lib/ui/theme";
import { buildSocietyIdToNameMap } from "@/lib/jointEventSocietyLabel";
import { dedupeJointMembers, resolveJointCandidatePlayerIdsForActiveSociety } from "@/lib/jointPersonDedupe";

/** Set `EXPO_PUBLIC_POINTS_DEBUG_EVENT_ID` to this event’s UUID to enable `[points-debug]` logs. */
function pointsDebugEnabled(eid: string | undefined): boolean {
  const t = process.env.EXPO_PUBLIC_POINTS_DEBUG_EVENT_ID?.trim();
  return Boolean(eid && t && eid === t);
}

function memberRowForDebug(m: MemberDoc | undefined): {
  memberId: string;
  name: string;
  society_id: string;
} {
  return {
    memberId: m?.id ?? "(missing)",
    name: String(m?.displayName || m?.name || ""),
    society_id: String(m?.society_id ?? ""),
  };
}

// F1-style OOM points: positions 1-10 get points, rest get 0
const F1_OOM_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

function getOOMPointsForPosition(position: number): number {
  if (position >= 1 && position <= 10) {
    return F1_OOM_POINTS[position - 1];
  }
  return 0;
}

/**
 * Calculate averaged OOM points for a tie block
 * Example: Two players tied for 2nd place occupy positions 2 and 3
 * They share: (18 + 15) / 2 = 16.5 points each
 */
function getAveragedOOMPoints(startPosition: number, tieCount: number): number {
  if (tieCount <= 0) return 0;

  let totalPoints = 0;
  for (let i = 0; i < tieCount; i++) {
    totalPoints += getOOMPointsForPosition(startPosition + i);
  }
  return totalPoints / tieCount;
}

/**
 * Format OOM points for display
 * - Shows decimals only when needed (e.g., 16.5, not 25.00)
 * - Hides .00 for whole numbers (e.g., 25, not 25.00)
 */
function formatPoints(pts: number): string {
  if (pts === Math.floor(pts)) {
    return pts.toString();
  }
  // Show up to 2 decimal places, trimming trailing zeros
  return pts.toFixed(2).replace(/\.?0+$/, "");
}

type PlayerEntry = {
  memberId: string;
  memberName: string;
  dayPoints: string; // User input - the competition/stableford score
  position: number | null; // Auto-calculated
  oomPoints: number; // Auto-calculated F1 points
  /** Saved row exists in event_results for this event + active society */
  hasPersistedResult?: boolean;
  /**
   * Joint events: all society `members.id` values merged into this row (same real person).
   * Used to load/remove results saved under any of those ids.
   */
  mergedResultMemberIds?: string[];
  isKnownMember?: boolean;
};

type OrphanResultRow = {
  memberId: string;
  label: string;
};

function pickExistingResultForMergedMemberIds(
  existingResults: EventResultDoc[],
  mergedMemberIds: string[],
): EventResultDoc | undefined {
  const idSet = new Set(mergedMemberIds);
  const hits = existingResults.filter((r) => idSet.has(r.member_id));
  if (hits.length === 0) return undefined;
  if (hits.length === 1) return hits[0];
  hits.sort((a, b) => {
    const ta = a.updated_at ? new Date(a.updated_at).getTime() : 0;
    const tb = b.updated_at ? new Date(b.updated_at).getTime() : 0;
    if (tb !== ta) return tb - ta;
    return String(a.member_id).localeCompare(String(b.member_id));
  });
  return hits[0];
}

function hasValidDayPoints(p: PlayerEntry): boolean {
  const t = p.dayPoints.trim();
  if (t === "") return false;
  return !isNaN(parseInt(t, 10));
}

function comparePlayerName(a: PlayerEntry, b: PlayerEntry): number {
  return a.memberName.localeCompare(b.memberName, undefined, { sensitivity: "base" });
}

/**
 * Display order only (does not affect scoring): no score → unsaved scores → saved scores;
 * alphabetical within each band. Deterministic.
 */
function applyPointsDisplayOrder(list: PlayerEntry[]): PlayerEntry[] {
  const noScore = list.filter((p) => !hasValidDayPoints(p)).sort(comparePlayerName);
  const draft = list.filter((p) => hasValidDayPoints(p) && !p.hasPersistedResult).sort(comparePlayerName);
  const saved = list.filter((p) => hasValidDayPoints(p) && p.hasPersistedResult).sort(comparePlayerName);
  return [...noScore, ...draft, ...saved];
}

type PointsRowVisual = "empty" | "editing" | "saved";

function pointsRowVisual(player: PlayerEntry, editingMemberId: string | null): PointsRowVisual {
  if (editingMemberId === player.memberId) return "editing";
  if (hasValidDayPoints(player) && player.hasPersistedResult) return "saved";
  return "empty";
}

function pointsRowChrome(visual: PointsRowVisual, colors: ReturnType<typeof getColors>): ViewStyle {
  const base: ViewStyle = {
    borderRadius: radius.sm,
    borderWidth: 1,
  };
  if (visual === "editing") {
    return {
      ...base,
      backgroundColor: colors.primary + "12",
      borderColor: colors.primary + "50",
    };
  }
  if (visual === "saved") {
    return {
      ...base,
      backgroundColor: colors.success + "10",
      borderColor: colors.success + "38",
    };
  }
  return {
    ...base,
    backgroundColor: colors.backgroundSecondary,
    borderColor: colors.border,
  };
}

type FormatSortOrder = ReturnType<typeof getFormatSortOrder>;

function calculatePositionsAndOOM(
  playerList: PlayerEntry[],
  sortOrder: FormatSortOrder,
): PlayerEntry[] {
  const withPoints: PlayerEntry[] = [];
  const withoutPoints: PlayerEntry[] = [];

  for (const p of playerList) {
    const dayPts = parseInt(p.dayPoints.trim(), 10);
    if (!isNaN(dayPts) && p.dayPoints.trim() !== "") {
      withPoints.push({ ...p, position: null, oomPoints: 0 });
    } else {
      withoutPoints.push({ ...p, position: null, oomPoints: 0 });
    }
  }

  withPoints.sort((a, b) => {
    const aPts = parseInt(a.dayPoints.trim(), 10);
    const bPts = parseInt(b.dayPoints.trim(), 10);

    if (sortOrder === "low_wins") {
      return aPts - bPts;
    }
    return bPts - aPts;
  });

  const positioned: PlayerEntry[] = [];
  let currentPosition = 1;
  let i = 0;

  while (i < withPoints.length) {
    const currentDayValue = parseInt(withPoints[i].dayPoints.trim(), 10);
    let tieCount = 1;

    while (
      i + tieCount < withPoints.length &&
      parseInt(withPoints[i + tieCount].dayPoints.trim(), 10) === currentDayValue
    ) {
      tieCount++;
    }

    const averagedOOM = getAveragedOOMPoints(currentPosition, tieCount);

    for (let j = 0; j < tieCount; j++) {
      positioned.push({
        ...withPoints[i + j],
        position: currentPosition,
        oomPoints: averagedOOM,
      });
    }

    currentPosition += tieCount;
    i += tieCount;
  }

  return [...positioned, ...withoutPoints];
}

export default function EventPointsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const { societyId, society, member: currentMember, loading: bootstrapLoading } = useBootstrap();
  const { guardPaidAction, modalVisible, setModalVisible, societyId: guardSocietyId } = usePaidAccess();
  const colors = getColors();

  const eventId = useMemo(() => {
    const raw = (params as any)?.id;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [params]);

  const [event, setEvent] = useState<EventDoc | null>(null);
  const [players, setPlayers] = useState<PlayerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<{ type: "error" | "success" | "info"; message: string; detail?: string } | null>(null);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "info";
  }>({ visible: false, message: "", type: "success" });
  const [showJointSocietyScopedCopy, setShowJointSocietyScopedCopy] = useState(false);
  const [jointPeerNamesLine, setJointPeerNamesLine] = useState<string | null>(null);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [orphanResults, setOrphanResults] = useState<OrphanResultRow[]>([]);
  const saveAction = useAsyncAction();

  const permissions = getPermissionsForMember(currentMember);
  const canEnterPoints = permissions.canManageHandicaps;

  // Load event data and existing results
  const loadData = useCallback(async () => {
    if (bootstrapLoading) return;

    if (!societyId) {
      setError("Missing society");
      setLoading(false);
      return;
    }

    if (!eventId) {
      setError("Missing event ID");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setShowJointSocietyScopedCopy(false);
    setJointPeerNamesLine(null);

    try {
      const [evt, societyMembers, existingResults, jointMetaMap, eventRegs] = await Promise.all([
        getEvent(eventId),
        getMembersBySocietyId(societyId),
        getEventResultsForSociety(eventId, societyId),
        getJointMetaForEventIds([eventId]),
        getEventRegistrations(eventId),
      ]);

      if (!evt) {
        setError("Event not found");
        setLoading(false);
        return;
      }

      setEvent(evt);

      const metaRow = jointMetaMap.get(eventId);
      const derivedIsJoint = isJointEventFromMeta(metaRow?.participantSocietyIds, metaRow?.linkedSocietyCount);

      let jointDetail: Awaited<ReturnType<typeof getJointEventDetail>> = null;
      if (derivedIsJoint) {
        jointDetail = await getJointEventDetail(eventId);
        if (jointDetail && __DEV__) {
          const participantIds = (jointDetail.participating_societies ?? [])
            .map((s) => s.society_id)
            .filter(Boolean);
          logJointPlayableConsistencyDev({
            eventId,
            registrations: eventRegs,
            entries: jointDetail.entries ?? [],
            participatingSocietyIds: participantIds,
          });
        }
      }

      const isJointWithDetail = derivedIsJoint && !!jointDetail;
      setShowJointSocietyScopedCopy(isJointWithDetail);

      if (isJointWithDetail && jointDetail) {
        const others = (jointDetail.participating_societies ?? [])
          .filter((s) => s.society_id && s.society_id !== societyId)
          .map((s) => {
            const n = (s.society_name ?? "").trim();
            return n.length > 0 ? n : String(s.society_id);
          })
          .filter(Boolean);
        setJointPeerNamesLine(others.length > 0 ? others.join(" · ") : null);
      }

      /** Playable list + legacy host `player_ids`; registrations fill gaps when `event_entries` lags. */
      const evtPlayerIds = (evt.playerIds ?? []).map(String).filter(Boolean);
      const jointEntryPlayerIds =
        isJointWithDetail && jointDetail
          ? (jointDetail.entries ?? [])
              .map((e) => e.player_id)
              .filter(Boolean)
              .map(String)
          : [];
      const regScoped =
        derivedIsJoint
          ? scopeEventRegistrations(eventRegs, { kind: "joint_home", activeSocietyId: societyId })
          : scopeEventRegistrations(eventRegs, { kind: "standard", hostSocietyId: evt.society_id });
      const regBoostMemberIds = [
        ...new Set(
          regScoped
            .filter(isRegistrationConfirmed)
            .map((r) => String(r.member_id))
            .filter(Boolean),
        ),
      ];
      const baseMerged: string[] =
        isJointWithDetail && jointDetail
          ? [...new Set([...jointEntryPlayerIds, ...evtPlayerIds])]
          : [...new Set(evtPlayerIds)];
      const mergedCandidateIds: string[] = [...new Set([...baseMerged, ...regBoostMemberIds])];

      const playerIds: string[] = mergedCandidateIds;

      const dbg = pointsDebugEnabled(eventId);
      if (dbg && isJointWithDetail) {
        console.log("[points-debug] raw joint sources", {
          eventId,
          activeSocietyId: societyId,
          evtPlayerIds,
          jointEntryPlayerIds,
          regBoostMemberIds,
          mergedCandidateIds,
        });
      }

      let memberDocs: MemberDoc[] = [...societyMembers];
      if (isJointWithDetail && jointDetail) {
        const pSocietyIds = (jointDetail.participating_societies ?? [])
          .map((s) => s.society_id)
          .filter(Boolean);
        const uniqSocieties = [...new Set(pSocietyIds)];
        if (uniqSocieties.length > 0) {
          const lists = await Promise.all(uniqSocieties.map((sid) => getMembersBySocietyId(sid)));
          memberDocs = lists.flat();
        }
      } else if (!isJointWithDetail) {
        const missingIds = playerIds.filter((id: string) => !memberDocs.some((m) => m.id === id));
        if (missingIds.length > 0) {
          const extra = await getMembersByIds(missingIds);
          for (const m of extra) {
            if (m?.id && !memberDocs.some((x) => x.id === m.id)) memberDocs.push(m);
          }
        }
      }

      const knownMemberIds = new Set(memberDocs.map((m) => m.id));
      const missingFromCandidates = mergedCandidateIds.filter((id) => !knownMemberIds.has(id));
      if (missingFromCandidates.length > 0) {
        const extra = await getMembersByIds(missingFromCandidates);
        for (const m of extra) {
          if (m?.id && !memberDocs.some((x) => x.id === m.id)) memberDocs.push(m);
        }
      }

      const memberMap = new Map(memberDocs.map((m) => [m.id, m]));

      if (dbg && isJointWithDetail) {
        const resolvedMembers = mergedCandidateIds.map((id) =>
          memberRowForDebug(memberMap.get(id)),
        );
        console.log("[points-debug] resolved members", JSON.stringify(resolvedMembers));
      }

      let playerList: PlayerEntry[];

      if (isJointWithDetail && jointDetail) {
        const societyIdToName = buildSocietyIdToNameMap(jointDetail.participating_societies ?? []);
        const scopedPlayerIds = resolveJointCandidatePlayerIdsForActiveSociety(
          mergedCandidateIds,
          memberDocs,
          societyIdToName,
          societyId,
        );
        if (dbg) {
          const visiblePlayers = scopedPlayerIds.map((id) =>
            memberRowForDebug(memberMap.get(id)),
          );
          console.log("[points-debug] post-society-resolve", {
            activeSocietyId: societyId,
            visiblePlayerIds: scopedPlayerIds,
            visiblePlayers,
          });
        }

        const missingScoped = scopedPlayerIds.filter((id) => !memberMap.has(id));
        if (missingScoped.length > 0) {
          const extra = await getMembersByIds(missingScoped);
          if (dbg) {
            const fallbackRows = (extra ?? []).map((m) => memberRowForDebug(m));
            console.log("[points-debug] fallback getMembersByIds result", JSON.stringify(fallbackRows));
          }
          for (const m of extra) {
            if (m?.id && m.society_id === societyId && !memberMap.has(m.id)) {
              memberMap.set(m.id, m);
            }
          }
        }
        const scopedDocs = scopedPlayerIds
          .map((id) => memberMap.get(id))
          .filter((m): m is MemberDoc => Boolean(m));
        const dedupedJoint = dedupeJointMembers(scopedDocs, societyIdToName);
        playerList = dedupedJoint.map((d) => {
          const rep = d.representative;
          return {
            memberId: rep.id,
            memberName: rep.displayName || rep.display_name || rep.name || "Unknown",
            dayPoints: "",
            position: null,
            oomPoints: 0,
            hasPersistedResult: false,
            mergedResultMemberIds: d.mergedMemberIds,
            isKnownMember: true,
          };
        });
      } else {
        playerList = playerIds.map((pid: string) => {
          const member = memberMap.get(pid);
          return {
            memberId: pid,
            memberName: member?.displayName || member?.name || "Unknown",
            dayPoints: "",
            position: null,
            oomPoints: 0,
            hasPersistedResult: false,
            isKnownMember: Boolean(member),
          };
        });
      }

      const fromDetail = (jointDetail?.participating_societies ?? []).map((s) => s.society_id).filter(Boolean);
      const fromMeta = metaRow?.participantSocietyIds?.length ? [...metaRow.participantSocietyIds] : [];
      const participantSocietyIdsForGate =
        fromDetail.length > 0 ? fromDetail : fromMeta.length > 0 ? fromMeta : [evt.society_id].filter(Boolean);
      const canView = isActiveSocietyParticipantForEvent(societyId, evt.society_id, participantSocietyIdsForGate);
      if (__DEV__) {
        console.log("[joint-access] final gate", {
          eventId,
          activeSocietyId: societyId,
          hostSocietyId: evt.society_id,
          participantSocietyIds: participantSocietyIdsForGate,
          derivedIsJoint,
          canView,
        });
      }

      const sortOrder = getFormatSortOrder(evt.format);
      if (existingResults.length > 0) {
        playerList = playerList.map((p) => {
          const idCandidates =
            p.mergedResultMemberIds && p.mergedResultMemberIds.length > 0
              ? p.mergedResultMemberIds
              : [p.memberId];
          const hit = pickExistingResultForMergedMemberIds(existingResults, idCandidates);
          if (!hit) return { ...p, hasPersistedResult: false };
          const dv = hit.day_value != null ? String(hit.day_value) : "";
          return {
            ...p,
            dayPoints: dv,
            position: null,
            oomPoints: 0,
            hasPersistedResult: true,
          };
        });
        playerList = calculatePositionsAndOOM(playerList, sortOrder);
      }
      playerList = applyPointsDisplayOrder(playerList);
      const resolvedResultIds = new Set(
        playerList.flatMap((p) =>
          p.mergedResultMemberIds && p.mergedResultMemberIds.length > 0
            ? p.mergedResultMemberIds.map(String)
            : [String(p.memberId)],
        ),
      );
      const orphanRows = existingResults
        .filter((r) => !resolvedResultIds.has(String(r.member_id)))
        .map((r) => ({
          memberId: String(r.member_id),
          label: `Guest/unknown result · ${String(r.member_id).slice(0, 8)}`,
        }));
      setOrphanResults(orphanRows);

      if (dbg && isJointWithDetail && jointDetail) {
        const finalPointsRows = playerList.map((p) => {
          const m = memberMap.get(p.memberId);
          return {
            memberId: p.memberId,
            name: String(p.memberName || m?.displayName || m?.name || ""),
            society_id: String(m?.society_id ?? ""),
          };
        });
        console.log("[points-debug] final points rows", JSON.stringify(finalPointsRows));
      }

      setPlayers(playerList);
    } catch (e: any) {
      console.error("[points] load FAILED", e);
      setError(e?.message ?? "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [bootstrapLoading, societyId, eventId]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  // Update day points for a player and recalculate positions/OOM
  const updateDayPoints = (memberId: string, value: string) => {
    setSaveNotice(null);
    saveAction.reset();
    setPlayers((prev) => {
      // Update the day points value
      const updated = prev.map((p) =>
        p.memberId === memberId ? { ...p, dayPoints: value } : p
      );

      // Recalculate positions and OOM points, then apply stable display order
      return applyPointsDisplayOrder(calculatePositionsAndOOM(updated, sortOrder));
    });
  };

  // Get sort order based on event format
  const sortOrder = getFormatSortOrder(event?.format);

  // Calculate players with valid day points (used for canSave and save)
  const playersWithDayPoints = useMemo(() => {
    return players.filter(
      (p) => p.dayPoints.trim() !== "" && !isNaN(parseInt(p.dayPoints.trim(), 10))
    );
  }, [players]);

  const scoreEntryProgress = useMemo(() => {
    const total = players.length;
    const completed = players.filter(hasValidDayPoints).length;
    return { completed, total };
  }, [players]);

  const savedResultCount = useMemo(
    () => players.filter((p) => p.hasPersistedResult).length,
    [players],
  );

  const handleRemovePersistedResult = useCallback(
    (memberId: string, displayName: string, mergedResultMemberIds?: string[]) => {
      if (!guardPaidAction()) return;
      if (!eventId || !societyId) return;

      const run = async () => {
        try {
          const idsToClear =
            mergedResultMemberIds && mergedResultMemberIds.length > 0
              ? [...new Set(mergedResultMemberIds)]
              : [memberId];
          for (const mid of idsToClear) {
            await deleteEventResultForMember(eventId, societyId, mid);
          }
          if (societyId) await invalidateCachePrefix(`society:${societyId}:`);
          await invalidateCache(`event:${eventId}:detail`);
          await loadData();
          setToast({
            visible: true,
            message: `Result removed for ${displayName}. You can re-enter a score anytime.`,
            type: "success",
          });
        } catch (e: any) {
          setSaveNotice({
            type: "error",
            message: e?.message ?? "Could not remove result",
          });
        }
      };

      const msg = `Remove the saved Order of Merit result for ${displayName} for this society? You can enter scores again later.`;
      if (Platform.OS === "web") {
        const ok =
          typeof globalThis !== "undefined" &&
          typeof (globalThis as unknown as { confirm?: (s: string) => boolean }).confirm === "function" &&
          (globalThis as unknown as { confirm: (s: string) => boolean }).confirm(msg);
        if (ok) void run();
        return;
      }
      Alert.alert("Remove result?", msg, [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => void run() },
      ]);
    },
    [eventId, societyId, guardPaidAction, loadData],
  );

  // Compute canSave with clear reasons
  const saveReadiness = useMemo(() => {
    if (!eventId) return { canSave: false, reason: "Missing event ID" };
    if (!societyId) return { canSave: false, reason: "Missing society ID" };
    if (!event) return { canSave: false, reason: "Event not loaded" };
    if (players.length === 0) return { canSave: false, reason: "No players in event" };
    if (playersWithDayPoints.length === 0) return { canSave: false, reason: "Enter at least one score" };
    if (saveAction.loading) return { canSave: false, reason: "Save in progress..." };
    return { canSave: true, reason: null };
  }, [eventId, societyId, event, players.length, playersWithDayPoints.length, saveAction.loading]);

  // Save OOM points to database - wrapped in useCallback with all dependencies
  const handleSave = useCallback(async () => {
    if (!guardPaidAction()) return;

    // Log what we're working with
    console.log("[points] Save pressed", {
      eventId,
      societyId,
      eventLoaded: !!event,
      playerCount: players.length,
      playersWithDayPoints: playersWithDayPoints.length,
      saving: saveAction.loading,
    });

    // Gate checks with logging
    if (!eventId) {
      console.warn("[points] Save blocked: missing eventId");
      setSaveNotice({ type: "error", message: "Event ID is missing. Please go back and try again." });
      return;
    }

    if (!societyId) {
      console.warn("[points] Save blocked: missing societyId");
      setSaveNotice({ type: "error", message: "Society ID is missing. Please go back and try again." });
      return;
    }

    if (!event) {
      console.warn("[points] Save blocked: event not loaded");
      setSaveNotice({ type: "error", message: "Event data not loaded. Please wait or refresh." });
      return;
    }

    if (playersWithDayPoints.length === 0) {
      console.warn("[points] Save blocked: no day points entered");
      setSaveNotice({ type: "error", message: "Enter at least one score." });
      return;
    }

    if (saveAction.loading) {
      console.warn("[points] Save blocked: already saving");
      return;
    }

    saveAction.reset();
    setSaveNotice(null);

    const playersToSave = Array.from(playersWithDayPoints);

    console.log("[points] playersToSave:", {
      isArray: Array.isArray(playersToSave),
      length: playersToSave.length,
      players: playersToSave,
    });

    const results: { member_id: string; points: number; day_value?: number; position?: number }[] = [];
    for (const p of playersToSave) {
      if (String(p.memberId).startsWith("guest-") || p.isKnownMember === false) continue;
      const dayValue = parseInt(p.dayPoints.trim(), 10);
      results.push({
        member_id: p.memberId,
        points: p.oomPoints,
        day_value: !isNaN(dayValue) ? dayValue : undefined,
        position: p.position ?? undefined,
      });
    }

    console.log("[points] results array:", {
      isArray: Array.isArray(results),
      length: results.length,
      results: JSON.stringify(results),
    });

    if (!Array.isArray(results) || results.length === 0) {
      console.error("[points] Save true failure — empty results payload");
      setSaveNotice({ type: "error", message: "Failed to build results array." });
      return;
    }

    const payloadMemberIds = new Set(results.map((r) => r.member_id));

    // Only DB write + cache busting inside useAsyncAction (must return a value — undefined was treated as failure).
    const dbOutcome = await saveAction.run(async () => {
      await upsertEventResults(event.id, societyId, results);
      if (societyId) await invalidateCachePrefix(`society:${societyId}:`);
      await invalidateCache(`event:${eventId}:detail`);
      return { payloadCount: results.length, memberIds: [...payloadMemberIds] };
    });

    if (!dbOutcome) {
      console.error("[points] Save true failure — upsert or cache invalidation threw");
      return;
    }

    if (__DEV__) {
      console.log("[points] Save DB success", {
        eventId,
        societyId,
        payloadMemberCount: dbOutcome.payloadCount,
      });
    }

    try {
      await loadData();
    } catch (reloadErr) {
      console.warn("[points] post-save loadData failed (DB already saved)", reloadErr);
      setSaveNotice({
        type: "info",
        message: "Scores saved. Pull to refresh if the list looks out of date.",
      });
    }

    if (__DEV__) {
      try {
        const verify = await getEventResultsForSociety(eventId, societyId);
        const notInPayload = verify.filter((r) => !payloadMemberIds.has(r.member_id));
        console.log("[points] post-save fetch vs payload", {
          eventId,
          societyId,
          /** Rows written/updated in this save (upsert batch size). */
          thisSavePayloadMemberCount: dbOutcome.payloadCount,
          /** All persisted rows for event + society (includes players not in this save). */
          totalPersistedRowsForEventSociety: verify.length,
          persistedRowsNotInThisSavePayload: notInPayload.length,
          explanation:
            notInPayload.length > 0
              ? "Fetch count can exceed upsert count because only players with scores in this screen are saved; other members may already have result rows from earlier saves."
              : "All persisted rows match this save payload member set.",
          memberIdsNotInThisSavePayload: notInPayload.map((r) => r.member_id).slice(0, 20),
          snapshot: verify.map((r) => ({
            id: r.id,
            member_id: r.member_id,
            day_value: r.day_value,
            position: r.position,
            points: r.points,
            updated_at: r.updated_at,
          })),
        });
      } catch (verifyErr) {
        console.warn("[points] post-save verify fetch failed (non-fatal)", verifyErr);
      }
    }

    setToast({
      visible: true,
      message: "Results saved. Order of Merit is updated for your society.",
      type: "success",
    });

    setTimeout(() => {
      const r = router as {
        replace: (href: string | { pathname: string; params?: Record<string, string> }) => void;
        canGoBack?: () => boolean;
        back?: () => void;
      };
      try {
        r.replace("/(app)/(tabs)/leaderboard?view=log");
        if (__DEV__) console.log("[points] Post-save navigation success", { route: "leaderboard?view=log" });
        return;
      } catch (navErr) {
        console.warn("[points] Post-save navigation primary failed", navErr);
      }
      try {
        r.replace({ pathname: "/(app)/event/[id]", params: { id: String(eventId) } });
        if (__DEV__) console.log("[points] Post-save navigation fallback", { route: "event/[id]" });
        return;
      } catch (navErr2) {
        console.warn("[points] Post-save event detail replace failed", navErr2);
      }
      if (typeof r.canGoBack === "function" && r.canGoBack() && typeof r.back === "function") {
        try {
          r.back();
          if (__DEV__) console.log("[points] Post-save navigation fallback (back)");
        } catch (backErr) {
          if (__DEV__) console.warn("[points] Post-save navigation skipped/fallback exhausted", backErr);
        }
      } else if (__DEV__) {
        console.log("[points] Post-save navigation skipped (no canGoBack / back)");
      }
    }, 500);
  }, [
    eventId,
    societyId,
    event,
    players.length,
    playersWithDayPoints,
    saveAction,
    router,
    guardPaidAction,
    loadData,
  ]);

  const handleExportPdf = useCallback(async () => {
    if (!guardPaidAction()) return;
    if (!eventId || !societyId) {
      setToast({ visible: true, message: "Missing event or society — try again.", type: "error" });
      return;
    }
    if (savedResultCount === 0) {
      setToast({
        visible: true,
        message: "Save at least one result before exporting an image.",
        type: "info",
      });
      return;
    }
    setExportingPdf(true);
    try {
      router.push({
        pathname: "/(share)/event-results-share",
        params: { eventId, societyId },
      });
    } catch (e: any) {
      setToast({
        visible: true,
        message: e?.message ?? "Could not create image. Try again.",
        type: "error",
      });
    } finally {
      setExportingPdf(false);
    }
  }, [eventId, societyId, guardPaidAction, savedResultCount, router]);

  // Loading state
  if (bootstrapLoading || loading) {
    return (
      <Screen>
        <LoadingState message="Loading players and saved scores…" />
      </Screen>
    );
  }

  // Permission check
  if (!canEnterPoints) {
    return (
      <Screen>
        <View style={styles.header}>
          <SecondaryButton onPress={() => goBack(router, "/(app)/(tabs)/events")} size="sm">
            <Feather name="arrow-left" size={16} color={colors.text} />
            {" Back"}
          </SecondaryButton>
        </View>
        <EmptyState
          icon={<Feather name="lock" size={24} color={colors.error} />}
          title="No Access"
          message="Points can only be entered by a Captain or Handicapper for this society."
          action={{ label: "Go Back", onPress: () => goBack(router, "/(app)/(tabs)/events") }}
        />
      </Screen>
    );
  }

  // Error state
  if (error) {
    return (
      <Screen>
        <View style={styles.header}>
          <SecondaryButton onPress={() => goBack(router, "/(app)/(tabs)/events")} size="sm">
            <Feather name="arrow-left" size={16} color={colors.text} />
            {" Back"}
          </SecondaryButton>
        </View>
        <EmptyState
          icon={<Feather name="alert-circle" size={24} color={colors.error} />}
          title="Error"
          message={error}
          action={{ label: "Go Back", onPress: () => goBack(router, "/(app)/(tabs)/events") }}
        />
      </Screen>
    );
  }

  // Event not found
  if (!event) {
    return (
      <Screen>
        <EmptyState
          title="Not Found"
          message="Event not found."
          action={{ label: "Go Back", onPress: () => goBack(router, "/(app)/(tabs)/events") }}
        />
      </Screen>
    );
  }

  // No players
  if (players.length === 0) {
    return (
      <Screen>
        <View style={styles.header}>
          <SecondaryButton onPress={() => goBack(router, "/(app)/(tabs)/events")} size="sm">
            <Feather name="arrow-left" size={16} color={colors.text} />
            {" Back"}
          </SecondaryButton>
        </View>
        <EmptyState
          icon={<Feather name="user-plus" size={24} color={colors.primary} />}
          title="No players yet"
          message="Confirm who played in this event first — then you can enter scores and OOM points here."
          action={{
            label: "Select Players",
            onPress: () =>
              router.push({
                pathname: "/(app)/event/[id]/players",
                params: { id: eventId },
              }),
          }}
        />
      </Screen>
    );
  }

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
        <SecondaryButton onPress={() => goBack(router, "/(app)/(tabs)/events")} size="sm">
          <Feather name="arrow-left" size={16} color={colors.text} />
          {" Back"}
        </SecondaryButton>
        <View style={{ flex: 1 }} />
        <SecondaryButton
          onPress={() => void handleExportPdf()}
          disabled={savedResultCount === 0 || exportingPdf}
          loading={exportingPdf}
          loadingLabel="PNG…"
          size="sm"
          style={{ marginRight: spacing.sm }}
        >
          <Feather name="share" size={16} color={colors.text} />
          {" PNG"}
        </SecondaryButton>
        <PrimaryButton
          onPress={handleSave}
          disabled={!saveReadiness.canSave}
          loading={saveAction.loading}
          loadingLabel="Saving…"
          size="sm"
        >
          Save
        </PrimaryButton>
      </View>

      {/* Title */}
      <AppText variant="h2" style={{ marginBottom: spacing.xs }}>
        {sortOrder === 'low_wins' ? "Enter Net Scores" : "Enter Stableford Points"}
      </AppText>
      <AppText variant="body" color="secondary" style={{ marginBottom: spacing.xs }}>
        {event.name}
      </AppText>

      <View style={[styles.contextStrip, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <AppText variant="caption" color="secondary" style={styles.contextLine}>
          Entering results for{" "}
          <AppText variant="captionBold" color="primary">
            {society?.name?.trim() || "this society"}
          </AppText>
        </AppText>
        {showJointSocietyScopedCopy ? (
          <>
            <AppText variant="caption" color="tertiary" style={[styles.contextLine, { marginTop: spacing.xs }]}>
              Joint event — each society saves its own results. Scores here apply only to your society’s Order of
              Merit.
            </AppText>
            {jointPeerNamesLine ? (
              <AppText variant="caption" color="secondary" style={[styles.contextLine, { marginTop: 2 }]}>
                With{" "}
                <AppText variant="captionBold" color="secondary">
                  {jointPeerNamesLine}
                </AppText>
              </AppText>
            ) : null}
          </>
        ) : null}
      </View>

      <AppText variant="small" color="tertiary" style={styles.scoreProgressLine}>
        {scoreEntryProgress.completed} of {scoreEntryProgress.total} scores entered
      </AppText>

      {/* Instructions - format-specific */}
      <AppCard style={styles.instructionCard}>
        <View style={styles.instructionContent}>
          <Feather name="info" size={16} color={colors.primary} />
          <AppText variant="caption" color="secondary" style={{ flex: 1 }}>
            {sortOrder === 'low_wins'
              ? "Lower is better. Top 10 earn F1 points (25, 18, 15...). Ties share averaged points."
              : "Higher is better. Top 10 earn F1 points (25, 18, 15...). Ties share averaged points."}
          </AppText>
        </View>
      </AppCard>

      {/* Save status helper */}
      {!saveReadiness.canSave && saveReadiness.reason && (
        <View style={styles.saveHelper}>
          <Feather name="alert-circle" size={14} color={colors.warning} />
          <AppText variant="small" color="secondary">
            {saveReadiness.reason}
          </AppText>
        </View>
      )}
      {saveReadiness.canSave && playersWithDayPoints.length > 0 && (
        <View style={styles.saveHelper}>
          <Feather name="check-circle" size={14} color={colors.success} />
          <AppText variant="small" color="secondary">
            Ready to save {playersWithDayPoints.length} player{playersWithDayPoints.length !== 1 ? "s" : ""}
          </AppText>
        </View>
      )}

      {saveNotice ? (
        <InlineNotice
          variant={saveNotice.type}
          message={saveNotice.message}
          detail={saveNotice.detail}
          style={{ marginBottom: spacing.md }}
        />
      ) : null}
      {saveAction.error ? (
        <InlineNotice
          variant="error"
          message={saveAction.error.message}
          detail={saveAction.error.detail}
          style={{ marginBottom: spacing.md }}
        />
      ) : null}
      {orphanResults.length > 0 ? (
        <AppCard style={{ marginBottom: spacing.md }}>
          <AppText variant="captionBold" color="warning" style={{ marginBottom: spacing.xs }}>
            Guest/unknown result rows (excluded from OOM)
          </AppText>
          {orphanResults.map((r) => (
            <View key={`orphan-${r.memberId}`} style={styles.orphanRow}>
              <AppText variant="small" color="secondary" style={{ flex: 1 }}>
                {r.label}
              </AppText>
              <Pressable
                onPress={() => handleRemovePersistedResult(r.memberId, r.label, [r.memberId])}
                style={[styles.removeResultHit, { borderColor: colors.border }]}
              >
                <Feather name="trash-2" size={12} color={colors.textTertiary} />
                <AppText variant="small" color="tertiary">
                  Remove
                </AppText>
              </Pressable>
            </View>
          ))}
        </AppCard>
      ) : null}

      {/* Column Headers */}
      <View style={styles.columnHeaders}>
        <AppText variant="captionBold" color="tertiary" style={{ flex: 1 }}>
          Player
        </AppText>
        <AppText variant="captionBold" color="tertiary" style={styles.colDayPoints}>
          {sortOrder === 'low_wins' ? "Score" : "Pts"}
        </AppText>
        <AppText variant="captionBold" color="tertiary" style={styles.colPos}>
          Pos
        </AppText>
        <AppText variant="captionBold" color="tertiary" style={styles.colOOM}>
          OOM
        </AppText>
      </View>

      {/* Player List */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: spacing.xl }}>
        <View style={{ gap: spacing.xs }}>
          {players.map((player) => {
            const visual = pointsRowVisual(player, editingMemberId);
            return (
            <View
              key={player.memberId}
              style={[styles.playerRow, pointsRowChrome(visual, colors)]}
            >
              <View style={styles.nameCol}>
                <View style={styles.nameRow}>
                  <AppText variant="body" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                    {player.memberName}
                  </AppText>
                  {visual === "saved" ? (
                    <Feather name="check" size={16} color={colors.success} style={styles.savedTick} />
                  ) : null}
                </View>
                {canEnterPoints && player.hasPersistedResult ? (
                  <Pressable
                    onPress={() =>
                      handleRemovePersistedResult(
                        player.memberId,
                        player.memberName,
                        player.mergedResultMemberIds,
                      )
                    }
                    hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                    style={({ pressed }) => [
                      styles.removeResultHit,
                      { borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
                    ]}
                  >
                    <Feather name="trash-2" size={12} color={colors.textTertiary} />
                    <AppText variant="small" color="tertiary">
                      Remove result
                    </AppText>
                  </Pressable>
                ) : null}
              </View>

              {/* Day Points Input */}
              <View style={styles.colDayPoints}>
                <AppInput
                  placeholder="-"
                  value={player.dayPoints}
                  onChangeText={(v) => updateDayPoints(player.memberId, v)}
                  onFocus={() => setEditingMemberId(player.memberId)}
                  onBlur={() =>
                    setEditingMemberId((cur) => (cur === player.memberId ? null : cur))
                  }
                  keyboardType="number-pad"
                  style={styles.inputBox}
                />
              </View>

              {/* Position (read-only) */}
              <View style={styles.colPos}>
                <AppText
                  variant="bodyBold"
                  color={player.position && player.position <= 3 ? "primary" : "secondary"}
                >
                  {player.position ?? "-"}
                </AppText>
              </View>

              {/* OOM Points (read-only) */}
              <View style={styles.colOOM}>
                <AppText
                  variant="bodyBold"
                  color={player.oomPoints > 0 ? "primary" : "tertiary"}
                >
                  {formatPoints(player.oomPoints)}
                </AppText>
              </View>
            </View>
            );
          })}
        </View>
      </ScrollView>
      <LicenceRequiredModal visible={modalVisible} onClose={() => setModalVisible(false)} societyId={guardSocietyId} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  contextStrip: {
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  contextLine: {
    lineHeight: 18,
  },
  scoreProgressLine: {
    marginBottom: spacing.md,
    letterSpacing: 0.2,
  },
  instructionCard: {
    marginBottom: spacing.sm,
  },
  instructionContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  saveHelper: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  nameCol: {
    flex: 1,
    minWidth: 0,
    paddingRight: spacing.xs,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  savedTick: {
    marginTop: 1,
  },
  removeResultHit: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginTop: spacing.xs,
    paddingVertical: 4,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  orphanRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  columnHeaders: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.xs,
  },
  colDayPoints: {
    width: 70,
    alignItems: "center",
  },
  colPos: {
    width: 40,
    alignItems: "center",
  },
  colOOM: {
    width: 45,
    alignItems: "center",
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  inputBox: {
    textAlign: "center",
    width: 60,
    paddingHorizontal: spacing.xs,
  },
});

