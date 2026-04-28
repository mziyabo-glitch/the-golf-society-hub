import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, Easing, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Linking from "expo-linking";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { LicenceRequiredModal } from "@/components/LicenceRequiredModal";
import { usePaidAccess } from "@/lib/access/usePaidAccess";
import { useBootstrap } from "@/lib/useBootstrap";
import { getColors, radius, spacing } from "@/lib/ui/theme";
import {
  findBestPlayableCourseByName,
  getCourseApprovalState,
  getCourseMetaById,
  getCourseTeeById,
  getHolesByTeeId,
  getTeesByCourseId,
  type CourseHoleRow,
  type CourseTee,
} from "@/lib/db_supabase/courseRepo";
import type { CourseApprovalState } from "@/types/courseTrust";
import { deriveFreePlayTrustLabel, getFreePlayTrustCopy } from "@/lib/course/freePlayTrustPresentation";
import { importCourseFromApiId } from "@/lib/importCourse";
import {
  addFreePlayRoundPlayer,
  completeFreePlayRound,
  getFreePlayRoundBundle,
  reopenFreePlayRound,
  replaceHoleScores,
  relinkFreePlayRoundCourse,
  saveQuickTotals,
  setFreePlayRoundMode,
  setFreePlayScoringFormat,
  startFreePlayRound,
  deleteFreePlayRound,
  updateFreePlayRoundTee,
  updateFreePlayPlayerHandicap,
  updateFreePlayPlayerCourseAndPlayingHandicap,
  upsertHoleScore,
  removeFreePlayRoundPlayer,
} from "@/lib/db_supabase/freePlayScorecardRepo";
import {
  buildFreePlayLeaderboard,
  deriveCourseAndPlayingHandicapFromHi,
  freePlayHolesToSnapshots,
  intPlayingHandicap,
  normalizeHandicapIndexInput,
} from "@/lib/scoring/freePlayScoring";
import { buildStrokesReceivedByHole } from "@/lib/scoring/handicapStrokeAllocation";
import { stablefordPointsForHole } from "@/lib/scoring/stablefordPoints";
import { FreePlayRoundHeader } from "@/components/free-play/scorecard/FreePlayRoundHeader";
import { FreePlayHoleHero } from "@/components/free-play/scorecard/FreePlayHoleHero";
import { FreePlayPlayerScoreCard } from "@/components/free-play/scorecard/FreePlayPlayerScoreCard";
import {
  FreePlayScoreModeTabs,
  type FreePlayScoreViewTab,
} from "@/components/free-play/scorecard/FreePlayScoreModeTabs";
import { FreePlayLeaderboardPreview } from "@/components/free-play/scorecard/FreePlayLeaderboardPreview";
import { FreePlayLeaderboardSheet } from "@/components/free-play/scorecard/FreePlayLeaderboardSheet";
import { FreePlayStatsComingSoonCard } from "@/components/free-play/scorecard/FreePlayStatsComingSoonCard";
import { FreePlayTraditionalCardGrid } from "@/components/free-play/scorecard/FreePlayTraditionalCardGrid";
import { FreePlayRoundProgress } from "@/components/free-play/scorecard/FreePlayRoundProgress";
import { FreePlayScorecardEmptyState } from "@/components/free-play/scorecard/FreePlayScorecardEmptyState";
import { FreePlayFinalLeaderboardCard } from "@/components/free-play/summary/FreePlayFinalLeaderboardCard";
import { FreePlayIncompleteRoundNotice } from "@/components/free-play/summary/FreePlayIncompleteRoundNotice";
import { FreePlayPlayerSummaryCard } from "@/components/free-play/summary/FreePlayPlayerSummaryCard";
import { FreePlayRoundHighlightsCard } from "@/components/free-play/summary/FreePlayRoundHighlightsCard";
import { FreePlayRoundSummaryHero } from "@/components/free-play/summary/FreePlayRoundSummaryHero";
import { FreePlayShareResultCard } from "@/components/free-play/summary/FreePlayShareResultCard";
import { getMembersBySocietyId, type MemberDoc } from "@/lib/db_supabase/memberRepo";
import type { FreePlayRoundBundle, FreePlayScoringFormat, FreePlayScoringMode } from "@/types/freePlayScorecard";

function netStrokeLabel(net: number, par: number): string {
  const d = net - par;
  if (d === 0) return "Net par";
  if (d === 1) return "Net bogey";
  if (d === 2) return "Net double bogey";
  if (d >= 3) return `Net ${d} over`;
  if (d === -1) return "Net birdie";
  if (d === -2) return "Net eagle";
  if (d === -3) return "Net albatross";
  if (d <= -4) return `Net ${Math.abs(d)} under par`;
  return "Net";
}

export default function FreePlayRoundDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string | string[]; created?: string | string[]; openAdd?: string | string[] }>();
  const roundId = Array.isArray(params.id) ? params.id[0] : params.id;
  const createdFlag = Array.isArray(params.created) ? params.created[0] : params.created;
  const openAddFlag = Array.isArray(params.openAdd) ? params.openAdd[0] : params.openAdd;
  const colors = getColors();
  const { societyId, userId, member } = useBootstrap();
  const { guardPaidAction, modalVisible, setModalVisible, societyId: guardSocietyId } = usePaidAccess();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [bundle, setBundle] = useState<FreePlayRoundBundle | null>(null);
  const [quickTotals, setQuickTotals] = useState<Record<string, string>>({});
  const [handicapDraft, setHandicapDraft] = useState<Record<string, string>>({});
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [holeInputs, setHoleInputs] = useState<Record<number, string>>({});
  const [members, setMembers] = useState<MemberDoc[]>([]);
  const [newGuestName, setNewGuestName] = useState("");
  const [newGuestHandicap, setNewGuestHandicap] = useState("0");
  const [newInviteEmail, setNewInviteEmail] = useState("");
  const [showMemberPicker, setShowMemberPicker] = useState(openAddFlag === "1");
  const [metaHydrating, setMetaHydrating] = useState(false);
  const [teeMeta, setTeeMeta] = useState<CourseTee | null>(null);
  const [holeMeta, setHoleMeta] = useState<CourseHoleRow[]>([]);
  const [currentHole, setCurrentHole] = useState(1);
  const [showFullHoleGrid, setShowFullHoleGrid] = useState(false);
  const [roundTrust, setRoundTrust] = useState<CourseApprovalState | null>(null);
  const [scoreViewTab, setScoreViewTab] = useState<FreePlayScoreViewTab>("simple");
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [completedView, setCompletedView] = useState<"summary" | "card">("summary");
  const [editingHandicapPlayerId, setEditingHandicapPlayerId] = useState<string | null>(null);
  const [editingHandicapInput, setEditingHandicapInput] = useState("");
  const holeTransition = useRef(new Animated.Value(1)).current;

  const load = useCallback(async () => {
    if (!roundId) {
      setError("Missing round ID.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = await getFreePlayRoundBundle(roundId);
      setBundle(payload);
      const totalsMap: Record<string, string> = {};
      for (const p of payload.players) {
        const row = payload.scores.find((s) => s.round_player_id === p.id);
        totalsMap[p.id] = row?.quick_total != null ? String(row.quick_total) : "";
      }
      setQuickTotals(totalsMap);
      const hcMap: Record<string, string> = {};
      for (const p of payload.players) hcMap[p.id] = String(p.handicap_index ?? 0);
      setHandicapDraft(hcMap);
      const creatorFirst = payload.players[0]?.id ?? null;
      const ownFirst = payload.players.find(
        (p) => (userId && p.user_id === userId) || (member?.id && p.member_id === member.id),
      )?.id;
      const isCreator = userId && payload.round.created_by_user_id === userId;
      const prefer = isCreator ? creatorFirst : ownFirst ?? creatorFirst;
      setSelectedPlayerId(prefer ?? null);
      if (prefer) {
        const holes = payload.holeScores.filter((h) => h.round_player_id === prefer);
        const map: Record<number, string> = {};
        for (const h of holes) {
          map[h.hole_number] = h.gross_strokes == null ? "" : String(h.gross_strokes);
        }
        setHoleInputs(map);
      }
      setCurrentHole(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load round.");
    } finally {
      setLoading(false);
    }
  }, [roundId, userId, member?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!societyId) return;
    let cancelled = false;
    void getMembersBySocietyId(societyId)
      .then((rows) => {
        if (!cancelled) setMembers(rows);
      })
      .catch(() => {
        if (!cancelled) setMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [societyId]);

  useEffect(() => {
    const courseId = bundle?.round?.course_id;
    if (!courseId) {
      setRoundTrust(null);
      return;
    }
    let cancelled = false;
    void getCourseApprovalState(courseId, societyId ?? null).then((s) => {
      if (!cancelled) setRoundTrust(s);
    });
    return () => {
      cancelled = true;
    };
  }, [bundle?.round?.course_id, societyId]);

  useEffect(() => {
    const round = bundle?.round;
    if (!round?.id || !round?.course_id) {
      setTeeMeta(null);
      setHoleMeta([]);
      return;
    }
    const courseId = round.course_id;
    let cancelled = false;
    void (async () => {
      setMetaHydrating(true);
      try {
        // 1) Try existing tee reference first.
        if (round.tee_id) {
          const [tee, holes] = await Promise.all([getCourseTeeById(round.tee_id), getHolesByTeeId(round.tee_id)]);
          if (!cancelled && tee && holes.length > 0) {
            setTeeMeta(tee);
            setHoleMeta((holes ?? []).slice().sort((a, b) => a.hole_number - b.hole_number));
            setMetaHydrating(false);
            return;
          }
        }

        // 2) Fallback: ensure course metadata is imported if api_id exists.
        const meta = await getCourseMetaById(courseId);
        if (meta?.api_id != null && Number.isFinite(Number(meta.api_id))) {
          try {
            await importCourseFromApiId(Number(meta.api_id));
          } catch {
            // Best effort import; continue with whatever DB currently has.
          }
        }

        // 3) Resolve best tee for this round and auto-attach when possible.
        let resolvedCourseId = courseId;
        let resolvedCourseName = String(round.course_name ?? "").trim();
        let tees = await getTeesByCourseId(resolvedCourseId);

        // Legacy rounds can point at duplicate course rows without tee/hole metadata.
        // Auto-heal by finding a playable sibling course row by name.
        if (!tees.length && resolvedCourseName) {
          const alt = await findBestPlayableCourseByName(resolvedCourseName);
          if (alt && alt.id !== resolvedCourseId) {
            resolvedCourseId = alt.id;
            resolvedCourseName = alt.course_name || resolvedCourseName;
            tees = await getTeesByCourseId(resolvedCourseId);
          }
        }

        if (!tees.length) {
          if (!cancelled) {
            setTeeMeta(null);
            setHoleMeta([]);
          }
          setMetaHydrating(false);
          return;
        }

        const roundTeeName = String(round.tee_name ?? "").trim().toLowerCase();
        const picked =
          tees.find((t) => roundTeeName && String(t.tee_name ?? "").trim().toLowerCase() === roundTeeName) ??
          tees.find((t) => t.is_default === true) ??
          tees[0] ??
          null;
        if (!picked) {
          setMetaHydrating(false);
          return;
        }

        const holes = await getHolesByTeeId(picked.id);
        if (!cancelled) {
          setTeeMeta(picked);
          setHoleMeta((holes ?? []).slice().sort((a, b) => a.hole_number - b.hole_number));
        }

        // Persist selected tee / healed course on round so future loads hydrate immediately.
        if (picked.id && (round.tee_id !== picked.id || round.course_id !== resolvedCourseId)) {
          try {
            if (round.course_id !== resolvedCourseId) {
              await relinkFreePlayRoundCourse(round.id, {
                courseId: resolvedCourseId,
                courseName: resolvedCourseName || round.course_name,
                teeId: picked.id,
                teeName: picked.tee_name,
              });
              if (!cancelled) setNotice("Round course metadata repaired and tee loaded.");
            } else {
              await updateFreePlayRoundTee(round.id, picked.id, picked.tee_name);
              if (!cancelled) setNotice("Loaded tee metadata for this round.");
            }
          } catch {
            // Non-blocking; keep UI hydrated even if update fails.
          }
        }
      } finally {
        if (!cancelled) setMetaHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bundle?.round]);

  const mode: FreePlayScoringMode = bundle?.round.scoring_mode ?? "quick";
  const isCompletedRound = bundle?.round.status === "completed";
  const playerForHoles = useMemo(
    () => bundle?.players.find((p) => p.id === selectedPlayerId) ?? null,
    [bundle?.players, selectedPlayerId],
  );

  const isRoundCreator = Boolean(userId && bundle?.round.created_by_user_id === userId);
  const editingHandicapPlayer = useMemo(
    () => bundle?.players.find((p) => p.id === editingHandicapPlayerId) ?? null,
    [bundle?.players, editingHandicapPlayerId],
  );

  const editingHandicapPreview = useMemo(() => {
    const hi = normalizeHandicapIndexInput(editingHandicapInput);
    if (hi == null) return null;
    return deriveCourseAndPlayingHandicapFromHi({
      handicapIndex: hi,
      slopeRating: teeMeta?.slope_rating,
      courseRating: teeMeta?.course_rating,
      parTotal: teeMeta?.par_total,
    });
  }, [editingHandicapInput, teeMeta?.slope_rating, teeMeta?.course_rating, teeMeta?.par_total]);

  useEffect(() => {
    if (bundle?.round.status === "completed") {
      setCompletedView("summary");
    }
  }, [bundle?.round.status]);

  const ownRoundPlayerIds = useMemo(() => {
    if (!bundle) return [];
    const mid = member?.id ? String(member.id) : null;
    return bundle.players
      .filter((p) => (userId && p.user_id === userId) || (mid && p.member_id === mid))
      .map((p) => p.id);
  }, [bundle, userId, member?.id]);

  const scoreablePlayers = useMemo(() => {
    if (!bundle) return [];
    if (isRoundCreator) return bundle.players;
    return bundle.players.filter((p) => ownRoundPlayerIds.includes(p.id));
  }, [bundle, isRoundCreator, ownRoundPlayerIds]);

  useEffect(() => {
    if (!bundle || isRoundCreator) return;
    if (selectedPlayerId && !ownRoundPlayerIds.includes(selectedPlayerId)) {
      const fallback = ownRoundPlayerIds[0] ?? null;
      setSelectedPlayerId(fallback);
    }
  }, [bundle, isRoundCreator, ownRoundPlayerIds, selectedPlayerId]);

  const onSwitchMode = useCallback(
    async (next: FreePlayScoringMode) => {
      if (!bundle?.round.id || next === mode) return;
      setSaving(true);
      setError(null);
      try {
        await setFreePlayRoundMode(bundle.round.id, next);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not change mode.");
      } finally {
        setSaving(false);
      }
    },
    [bundle?.round.id, mode, load],
  );

  const onStartRound = useCallback(async () => {
    if (!bundle?.round.id) return;
    if (!guardPaidAction()) return;
    setSaving(true);
    setError(null);
    try {
      await startFreePlayRound(bundle.round.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start round.");
    } finally {
      setSaving(false);
    }
  }, [bundle?.round.id, guardPaidAction, load]);

  const onSaveQuick = useCallback(async () => {
    if (!bundle?.round.id) return;
    setSaving(true);
    setError(null);
    try {
      const targets = isRoundCreator ? bundle.players : scoreablePlayers;
      await saveQuickTotals(
        bundle.round.id,
        targets.map((p) => ({
          roundPlayerId: p.id,
          quickTotal: quickTotals[p.id]?.trim() ? Number(quickTotals[p.id]) : null,
        })),
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save quick scores.");
    } finally {
      setSaving(false);
    }
  }, [bundle?.round.id, bundle?.players, quickTotals, load, isRoundCreator, scoreablePlayers]);

  const onSaveHoles = useCallback(async () => {
    if (!bundle?.round.id || !selectedPlayerId) return;
    if (!isRoundCreator && !ownRoundPlayerIds.includes(selectedPlayerId)) {
      setError("You can only save scores for your own player.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const rows = Object.entries(holeInputs)
        .map(([hole, v]) => {
          const t = v.trim();
          if (t === "" || t === "—") return null;
          const low = t.toLowerCase();
          if (low === "nr" || low === "pickup") {
            return { holeNumber: Number(hole), grossStrokes: null as number | null };
          }
          const n = Number(t);
          return Number.isFinite(n) ? { holeNumber: Number(hole), grossStrokes: n } : null;
        })
        .filter((r): r is { holeNumber: number; grossStrokes: number | null } => r != null && Number.isFinite(r.holeNumber));
      await replaceHoleScores(bundle.round.id, selectedPlayerId, rows);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save hole scores.");
    } finally {
      setSaving(false);
    }
  }, [bundle?.round.id, selectedPlayerId, holeInputs, load, isRoundCreator, ownRoundPlayerIds]);

  const roundStage = useMemo(() => {
    if (!bundle) return "Setup";
    if (bundle.round.status === "completed") return "Completed";
    if (bundle.round.status === "in_progress") return "In progress";
    if (bundle.players.length >= 2) return "Ready";
    return "Setup";
  }, [bundle]);

  const holeNumbers = useMemo(() => {
    if (holeMeta.length > 0) return holeMeta.map((h) => h.hole_number);
    return Array.from({ length: 18 }, (_, i) => i + 1);
  }, [holeMeta]);

  const holeMetaByNo = useMemo(() => {
    const m = new Map<number, CourseHoleRow>();
    for (const h of holeMeta) m.set(h.hole_number, h);
    return m;
  }, [holeMeta]);

  const holesSnapshots = useMemo(() => freePlayHolesToSnapshots(holeMeta), [holeMeta]);

  const leaderboardRows = useMemo(() => {
    if (!bundle || holesSnapshots.length === 0) return [];
    const fmt: FreePlayScoringFormat = bundle.round.scoring_format === "stableford" ? "stableford" : "stroke_net";
    return buildFreePlayLeaderboard(
      fmt,
      holesSnapshots,
      bundle.players.map((p) => {
        const grossByHole = new Map<number, number | null>();
        for (const h of bundle.holeScores.filter((x) => x.round_player_id === p.id)) {
          grossByHole.set(h.hole_number, h.gross_strokes);
        }
        return {
          roundPlayerId: p.id,
          displayName: p.display_name,
          playingHandicap: p.playing_handicap,
          handicapIndex: p.handicap_index,
          grossByHole,
        };
      }),
    );
  }, [bundle, holesSnapshots]);

  const selectedPlayerHeaderLine = useMemo(() => {
    if (!bundle || !playerForHoles || holesSnapshots.length === 0) return null;
    const p = playerForHoles;
    const lb = leaderboardRows.find((r) => r.roundPlayerId === p.id);
    const grossByHole = new Map<number, number | null>();
    for (const h of bundle.holeScores.filter((x) => x.round_player_id === p.id)) {
      grossByHole.set(h.hole_number, h.gross_strokes);
    }
    const ph = intPlayingHandicap(p.playing_handicap, p.handicap_index);
    const strokeMap = buildStrokesReceivedByHole(ph, holesSnapshots);
    let vsPar = 0;
    for (const h of holesSnapshots) {
      const g = grossByHole.get(h.holeNumber);
      if (g == null || !Number.isFinite(g)) continue;
      const sr = strokeMap.get(h.holeNumber) ?? 0;
      const net = Math.round(g - sr);
      vsPar += net - h.par;
    }
    const short = p.display_name.trim().split(/\s+/)[0] || p.display_name;
    const vsStr = vsPar > 0 ? `+${vsPar}` : String(vsPar);
    if (bundle.round.scoring_format === "stableford") {
      const pts = lb?.stablefordPoints;
      return `${short} ${vsStr} · ${pts != null ? `${pts} pts` : "— pts"}`;
    }
    const netTot = lb?.netTotal;
    return `${short} ${vsStr}${netTot != null ? ` · net ${netTot}` : ""}`;
  }, [bundle, playerForHoles, holesSnapshots, leaderboardRows]);

  const leaderSummaryLine = useMemo(() => {
    if (!bundle || leaderboardRows.length === 0) return null;
    const r = leaderboardRows[0]!;
    if (bundle.round.scoring_format === "stableford") {
      return `${r.displayName} leads · ${r.stablefordPoints ?? "—"} pts · thru ${r.thru}`;
    }
    return `${r.displayName} · net ${r.netTotal ?? "—"} · thru ${r.thru}`;
  }, [bundle, leaderboardRows]);

  const maxHoleNumber = useMemo(
    () => (holeNumbers.length > 0 ? Math.max(...holeNumbers) : 18),
    [holeNumbers],
  );

  const showPremiumHoleDashboard = mode === "hole_by_hole" && bundle?.round.status === "in_progress";

  const triggerImpact = useCallback((style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
    if (process.env.EXPO_OS === "ios") {
      void Haptics.impactAsync(style);
    }
  }, []);

  const triggerSelection = useCallback(() => {
    if (process.env.EXPO_OS === "ios") {
      void Haptics.selectionAsync();
    }
  }, []);

  const currentHoleSiUnavailable = useMemo(() => {
    const row = holeMetaByNo.get(currentHole);
    return !(Number.isFinite(Number(row?.stroke_index)) && Number(row?.stroke_index) > 0);
  }, [holeMetaByNo, currentHole]);

  const currentHoleStrokeIndexDisplay = useMemo(() => {
    const row = holeMetaByNo.get(currentHole);
    if (!(Number.isFinite(Number(row?.stroke_index)) && Number(row?.stroke_index) > 0)) return null;
    return Math.round(Number(row?.stroke_index));
  }, [holeMetaByNo, currentHole]);

  const persistHoleGrossForPlayer = useCallback(
    async (roundPlayerId: string, holeNo: number, gross: number | null) => {
      if (!bundle?.round.id) return;
      if (!isRoundCreator && !ownRoundPlayerIds.includes(roundPlayerId)) {
        setError("You can only save scores for your own player.");
        return;
      }
      setSaving(true);
      setError(null);
      try {
        if (__DEV__) {
          console.log("[free-play] upsert hole", { roundPlayerId, holeNo, gross });
        }
        await upsertHoleScore(bundle.round.id, roundPlayerId, holeNo, gross);
        if (roundPlayerId === selectedPlayerId) {
          setHoleInputs((prev) => ({ ...prev, [holeNo]: gross == null ? "" : String(gross) }));
        }
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save score.");
      } finally {
        setSaving(false);
      }
    },
    [bundle?.round.id, selectedPlayerId, load, isRoundCreator, ownRoundPlayerIds],
  );

  const persistHoleGross = useCallback(
    async (holeNo: number, gross: number | null) => {
      if (!selectedPlayerId) return;
      triggerImpact(Haptics.ImpactFeedbackStyle.Light);
      await persistHoleGrossForPlayer(selectedPlayerId, holeNo, gross);
    },
    [selectedPlayerId, persistHoleGrossForPlayer, triggerImpact],
  );

  useEffect(() => {
    setCurrentHole((h) => Math.min(Math.max(1, h), maxHoleNumber));
  }, [maxHoleNumber]);

  useEffect(() => {
    if (!showPremiumHoleDashboard) return;
    holeTransition.setValue(0.96);
    Animated.timing(holeTransition, {
      toValue: 1,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [currentHole, showPremiumHoleDashboard, holeTransition]);

  const goPrevHole = useCallback(() => {
    if (currentHole <= 1) return;
    triggerSelection();
    setCurrentHole(currentHole - 1);
  }, [currentHole, triggerSelection]);

  const goNextHole = useCallback(() => {
    if (currentHole >= maxHoleNumber) return;
    triggerSelection();
    setCurrentHole(currentHole + 1);
  }, [currentHole, maxHoleNumber, triggerSelection]);

  const saveHoleWithFeedback = useCallback(
    (roundPlayerId: string, holeNo: number, gross: number | null, style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
      triggerImpact(style);
      void persistHoleGrossForPlayer(roundPlayerId, holeNo, gross);
    },
    [persistHoleGrossForPlayer, triggerImpact],
  );

  const currentParForHole = useMemo(() => {
    const p = holeMetaByNo.get(currentHole)?.par;
    return Number.isFinite(Number(p)) && Number(p) > 0 ? Math.round(Number(p)) : 4;
  }, [holeMetaByNo, currentHole]);

  const onSetScoringFormat = useCallback(
    async (next: FreePlayScoringFormat) => {
      if (!bundle?.round.id || next === bundle.round.scoring_format) return;
      setSaving(true);
      setError(null);
      try {
        await setFreePlayScoringFormat(bundle.round.id, next);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not change format.");
      } finally {
        setSaving(false);
      }
    },
    [bundle?.round.id, bundle?.round.scoring_format, load],
  );

  const onCompleteRound = useCallback(async () => {
    if (!bundle?.round.id) return;
    setSaving(true);
    setError(null);
    try {
      await completeFreePlayRound(bundle.round.id);
      await load();
      setNotice("Round marked complete.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not complete round.");
    } finally {
      setSaving(false);
    }
  }, [bundle?.round.id, load]);

  const onReturnToScoring = useCallback(async () => {
    if (!bundle?.round.id || !isRoundCreator) return;
    setSaving(true);
    setError(null);
    try {
      await reopenFreePlayRound(bundle.round.id);
      await load();
      setNotice("Round reopened for scoring.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reopen round.");
    } finally {
      setSaving(false);
    }
  }, [bundle?.round.id, isRoundCreator, load]);

  const frontHoles = useMemo(() => holeNumbers.filter((n) => n <= 9), [holeNumbers]);
  const backHoles = useMemo(() => holeNumbers.filter((n) => n >= 10), [holeNumbers]);

  const metaParTotals = useMemo(() => {
    const sumPars = (holes: number[]) =>
      holes.reduce((sum, n) => sum + (Number.isFinite(Number(holeMetaByNo.get(n)?.par)) ? Number(holeMetaByNo.get(n)?.par) : 0), 0);
    const outPar = sumPars(frontHoles);
    const inPar = sumPars(backHoles);
    const totalParFromHoles = sumPars(holeNumbers);
    const knownHolePars = holeMeta.some((h) => Number.isFinite(Number(h.par)));
    const totalPar = knownHolePars ? totalParFromHoles : (Number.isFinite(Number(teeMeta?.par_total)) ? Number(teeMeta?.par_total) : null);
    return { outPar: outPar || null, inPar: inPar || null, totalPar };
  }, [holeMetaByNo, frontHoles, backHoles, holeNumbers, teeMeta?.par_total, holeMeta]);

  const metaDistanceTotals = useMemo(() => {
    const sumYardage = (holes: number[]) =>
      holes.reduce((sum, n) => sum + (Number.isFinite(Number(holeMetaByNo.get(n)?.yardage)) ? Number(holeMetaByNo.get(n)?.yardage) : 0), 0);
    const outYards = sumYardage(frontHoles);
    const inYards = sumYardage(backHoles);
    const totalYardsFromHoles = sumYardage(holeNumbers);
    const known = holeMeta.some((h) => Number.isFinite(Number(h.yardage)));
    const totalYards = known ? totalYardsFromHoles : (Number.isFinite(Number(teeMeta?.yards)) ? Number(teeMeta?.yards) : null);
    return { outYards: outYards || null, inYards: inYards || null, totalYards };
  }, [holeMetaByNo, frontHoles, backHoles, holeNumbers, teeMeta?.yards, holeMeta]);

  const selectedScoreTotals = useMemo(() => {
    const toStroke = (holeNo: number): number | null => {
      const raw = holeInputs[holeNo];
      if (raw == null || raw.trim() === "") return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    };
    const sum = (holes: number[]) =>
      holes.reduce((acc, h) => {
        const v = toStroke(h);
        return v == null ? acc : acc + v;
      }, 0);
    const out = sum(frontHoles);
    const inn = sum(backHoles);
    const total = sum(holeNumbers);
    return { out, inn, total };
  }, [holeInputs, frontHoles, backHoles, holeNumbers]);

  const roundDateLabel = useMemo(() => {
    const raw = bundle?.round.completed_at || bundle?.round.started_at || bundle?.round.created_at;
    if (!raw) return "No date";
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  }, [bundle?.round.completed_at, bundle?.round.created_at, bundle?.round.started_at]);

  const playerSummaryMap = useMemo(() => {
    const map = new Map<
      string,
      {
        grossTotal: number | null;
        netTotal: number | null;
        stablefordTotal: number | null;
        frontGross: number | null;
        backGross: number | null;
        frontStableford: number | null;
        backStableford: number | null;
        pars: number;
        birdies: number;
        blobs: number;
        holesScored: number;
      }
    >();
    if (!bundle || holesSnapshots.length === 0) return map;
    const byPlayerHole = new Map<string, number | null>();
    for (const row of bundle.holeScores) {
      byPlayerHole.set(`${row.round_player_id}:${row.hole_number}`, row.gross_strokes);
    }

    const siMissing = holeNumbers.some((h) => {
      const si = holeMetaByNo.get(h)?.stroke_index;
      return !(Number.isFinite(Number(si)) && Number(si) > 0);
    });

    for (const p of bundle.players) {
      const ph = intPlayingHandicap(p.playing_handicap, p.handicap_index);
      const strokeMap = buildStrokesReceivedByHole(ph, holesSnapshots);
      let grossTotal = 0;
      let netTotal = 0;
      let stablefordTotal = 0;
      let frontGross = 0;
      let backGross = 0;
      let frontStableford = 0;
      let backStableford = 0;
      let pars = 0;
      let birdies = 0;
      let blobs = 0;
      let holesScored = 0;
      for (const h of holesSnapshots) {
        const key = `${p.id}:${h.holeNumber}`;
        if (!byPlayerHole.has(key)) continue;
        const gross = byPlayerHole.get(key);
        if (gross == null || !Number.isFinite(gross)) {
          blobs += 1;
          continue;
        }
        holesScored += 1;
        grossTotal += gross;
        if (h.holeNumber <= 9) frontGross += gross;
        else backGross += gross;
        if (gross === h.par) pars += 1;
        if (gross === h.par - 1) birdies += 1;
        const sr = strokeMap.get(h.holeNumber) ?? 0;
        const net = Math.round(gross - sr);
        netTotal += net;
        if (!siMissing) {
          const sf = stablefordPointsForHole(net, h.par);
          stablefordTotal += sf;
          if (h.holeNumber <= 9) frontStableford += sf;
          else backStableford += sf;
        }
      }
      map.set(p.id, {
        grossTotal: holesScored > 0 ? grossTotal : null,
        netTotal: holesScored > 0 ? netTotal : null,
        stablefordTotal: holesScored > 0 && !siMissing ? stablefordTotal : null,
        frontGross: frontGross > 0 ? frontGross : null,
        backGross: backGross > 0 ? backGross : null,
        frontStableford: holesScored > 0 && !siMissing ? frontStableford : null,
        backStableford: holesScored > 0 && !siMissing ? backStableford : null,
        pars,
        birdies,
        blobs,
        holesScored,
      });
    }
    return map;
  }, [bundle, holesSnapshots, holeMetaByNo, holeNumbers]);

  const hasIncompleteScores = useMemo(() => {
    if (!bundle || holeNumbers.length === 0 || bundle.players.length === 0) return false;
    const present = new Set(bundle.holeScores.map((h) => `${h.round_player_id}:${h.hole_number}`));
    for (const p of bundle.players) {
      for (const hole of holeNumbers) {
        if (!present.has(`${p.id}:${hole}`)) return true;
      }
    }
    return false;
  }, [bundle, holeNumbers]);

  const summarySiMissing = useMemo(() => {
    if (!bundle || bundle.round.scoring_format !== "stableford" || holeNumbers.length === 0) return false;
    return holeNumbers.some((h) => {
      const si = holeMetaByNo.get(h)?.stroke_index;
      return !(Number.isFinite(Number(si)) && Number(si) > 0);
    });
  }, [bundle, holeMetaByNo, holeNumbers]);

  const summaryWinner = useMemo(() => {
    if (!bundle || leaderboardRows.length === 0) return null;
    const top = leaderboardRows[0]!;
    const player = bundle.players.find((p) => p.id === top.roundPlayerId) ?? null;
    const metrics = player ? playerSummaryMap.get(player.id) : null;
    return { top, player, metrics };
  }, [bundle, leaderboardRows, playerSummaryMap]);

  const completedLeaderboardRows = useMemo(() => {
    if (!bundle) return [];
    return leaderboardRows.map((r, idx) => {
      const m = playerSummaryMap.get(r.roundPlayerId);
      const isStableford = bundle.round.scoring_format === "stableford";
      const topValue = isStableford
        ? summarySiMissing
          ? "Pts —"
          : `${m?.stablefordTotal ?? r.stablefordPoints ?? "—"} pts`
        : `Net ${m?.netTotal ?? r.netTotal ?? "—"}`;
      const detail = `Gross ${m?.grossTotal ?? "—"}${m?.netTotal != null ? ` · Net ${m.netTotal}` : ""} · ${r.thru}/${maxHoleNumber} holes`;
      return {
        position: idx + 1,
        playerName: r.displayName,
        summary: `${topValue} · ${detail}`,
        detail: null,
        isWinner: idx === 0,
      };
    });
  }, [bundle, leaderboardRows, maxHoleNumber, playerSummaryMap, summarySiMissing]);

  const roundHighlights = useMemo(() => {
    if (!bundle) return [];
    const rows: Array<{ label: string; playerName: string; valueLabel: string }> = [];
    const candidates = bundle.players.map((p) => ({
      player: p,
      m: playerSummaryMap.get(p.id),
    }));
    const bestFront = candidates
      .filter((x) => x.m && x.m.frontGross != null)
      .sort((a, b) => (a.m!.frontGross ?? 999) - (b.m!.frontGross ?? 999))[0];
    if (bestFront?.m?.frontGross != null) rows.push({ label: "Best front 9", playerName: bestFront.player.display_name, valueLabel: `${bestFront.m.frontGross}` });
    const bestBack = candidates
      .filter((x) => x.m && x.m.backGross != null)
      .sort((a, b) => (a.m!.backGross ?? 999) - (b.m!.backGross ?? 999))[0];
    if (bestBack?.m?.backGross != null) rows.push({ label: "Best back 9", playerName: bestBack.player.display_name, valueLabel: `${bestBack.m.backGross}` });
    const mostPars = [...candidates].sort((a, b) => (b.m?.pars ?? 0) - (a.m?.pars ?? 0))[0];
    if ((mostPars?.m?.pars ?? 0) > 0) rows.push({ label: "Most pars", playerName: mostPars.player.display_name, valueLabel: `${mostPars.m?.pars ?? 0}` });
    const mostBirdies = [...candidates].sort((a, b) => (b.m?.birdies ?? 0) - (a.m?.birdies ?? 0))[0];
    if ((mostBirdies?.m?.birdies ?? 0) > 0) rows.push({ label: "Most birdies", playerName: mostBirdies.player.display_name, valueLabel: `${mostBirdies.m?.birdies ?? 0}` });
    return rows.slice(0, 4);
  }, [bundle, playerSummaryMap]);

  const inviteLink = useMemo(() => {
    if (!bundle?.round.join_code) return "";
    return Linking.createURL("/free-play", { queryParams: { join: "1", joinCode: bundle.round.join_code } });
  }, [bundle?.round.join_code]);

  const copyJoinCode = useCallback(async () => {
    if (!bundle?.round.join_code) return;
    try {
      await Clipboard.setStringAsync(bundle.round.join_code);
      setNotice("Join code copied.");
    } catch {
      setError("Could not copy join code.");
    }
  }, [bundle?.round.join_code]);

  const copyInviteLink = useCallback(async () => {
    if (!inviteLink) return;
    try {
      await Clipboard.setStringAsync(inviteLink);
      setNotice("Invite link copied.");
    } catch {
      setError("Could not copy invite link.");
    }
  }, [inviteLink]);

  const shareRound = useCallback(async () => {
    if (!bundle) return;
    const message = `Join my Free Play round at ${bundle.round.course_name}. Code: ${bundle.round.join_code}\n${inviteLink}`;
    try {
      await Share.share({ message });
    } catch {
      try {
        await Clipboard.setStringAsync(message);
        setNotice("Share not available, copied invite details.");
      } catch {
        setError("Could not share this round.");
      }
    }
  }, [bundle, inviteLink]);

  const shareResultPreview = useCallback(async () => {
    if (!bundle) return;
    const winnerName = summaryWinner?.player?.display_name ?? summaryWinner?.top.displayName ?? "Winner";
    const winnerValue =
      bundle.round.scoring_format === "stableford" && !summarySiMissing
        ? `${summaryWinner?.metrics?.stablefordTotal ?? summaryWinner?.top.stablefordPoints ?? "—"} pts`
        : `Net ${summaryWinner?.metrics?.netTotal ?? summaryWinner?.top.netTotal ?? "—"}`;
    const lines = completedLeaderboardRows.slice(0, 3).map((r) => `${r.position}. ${r.playerName} — ${r.summary}`);
    const text =
      `Free-Play Result\n${bundle.round.course_name} · ${bundle.round.tee_name || "General tee"}\n` +
      `Winner: ${winnerName} (${winnerValue})\n\n${lines.join("\n")}\n\nProduced by The Golf Society Hub`;
    try {
      await Clipboard.setStringAsync(text);
      setNotice("Share result coming soon. Preview copied to clipboard.");
    } catch {
      setError("Could not prepare share preview.");
    }
  }, [bundle, completedLeaderboardRows, summarySiMissing, summaryWinner]);

  const addQuickPlayer = useCallback(
    async (kind: "guest" | "app_user") => {
      if (!bundle?.round.id) return;
      const display = newGuestName.trim();
      if (!display) {
        setError("Enter a player name.");
        return;
      }
      setSaving(true);
      setError(null);
      try {
        const hi = Number.isFinite(Number(newGuestHandicap)) ? Number(newGuestHandicap) : 0;
        const derived = deriveCourseAndPlayingHandicapFromHi({
          handicapIndex: hi,
          slopeRating: teeMeta?.slope_rating,
          courseRating: teeMeta?.course_rating,
          parTotal: metaParTotals.totalPar,
        });
        await addFreePlayRoundPlayer(bundle.round.id, {
          playerType: kind,
          displayName: display,
          inviteEmail: kind === "app_user" ? (newInviteEmail.trim() || null) : null,
          handicapIndex: hi,
          courseHandicap: derived.courseHandicap,
          playingHandicap: derived.playingHandicap,
          handicapSource: "manual",
          inviteStatus: kind === "app_user" && newInviteEmail.trim() ? "invited" : "none",
          teeId: bundle.round.tee_id ?? undefined,
        });
        setNewGuestName("");
        setNewInviteEmail("");
        setNewGuestHandicap("0");
        setNotice(kind === "app_user" ? "App user added with invite details." : "Guest added.");
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not add player.");
      } finally {
        setSaving(false);
      }
    },
    [
      bundle?.round.id,
      newGuestName,
      newInviteEmail,
      newGuestHandicap,
      load,
      teeMeta?.slope_rating,
      teeMeta?.course_rating,
      metaParTotals.totalPar,
    ],
  );

  const addMemberPlayer = useCallback(
    async (m: MemberDoc) => {
      if (!bundle?.round.id) return;
      setSaving(true);
      setError(null);
      try {
        const hi = Number.isFinite(Number(m.handicapIndex ?? m.handicap_index))
          ? Number(m.handicapIndex ?? m.handicap_index)
          : 0;
        const derived = deriveCourseAndPlayingHandicapFromHi({
          handicapIndex: hi,
          slopeRating: teeMeta?.slope_rating,
          courseRating: teeMeta?.course_rating,
          parTotal: metaParTotals.totalPar,
        });
        await addFreePlayRoundPlayer(bundle.round.id, {
          playerType: "member",
          displayName: String(m.displayName || m.name || "Member"),
          memberId: m.id,
          userId: m.user_id ?? null,
          handicapIndex: hi,
          courseHandicap: derived.courseHandicap,
          playingHandicap: derived.playingHandicap,
          handicapSource: "auto",
          inviteStatus: m.user_id ? "joined" : "none",
          teeId: bundle.round.tee_id ?? undefined,
        });
        setNotice("Member added to round.");
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not add member.");
      } finally {
        setSaving(false);
      }
    },
    [bundle?.round.id, load, teeMeta?.slope_rating, teeMeta?.course_rating, metaParTotals.totalPar],
  );

  const saveAllHandicaps = useCallback(async () => {
    if (!bundle) return;
    setSaving(true);
    setError(null);
    try {
      for (const p of bundle.players) {
        const hiRaw = handicapDraft[p.id];
        const hiParsed = normalizeHandicapIndexInput(String(hiRaw ?? ""));
        if (hiParsed == null) continue;
        const hi = hiParsed;
        const derived = deriveCourseAndPlayingHandicapFromHi({
          handicapIndex: hi,
          slopeRating: teeMeta?.slope_rating,
          courseRating: teeMeta?.course_rating,
          parTotal: metaParTotals.totalPar,
        });
        await updateFreePlayPlayerHandicap(p.id, hi);
        await updateFreePlayPlayerCourseAndPlayingHandicap(p.id, {
          courseHandicap: derived.courseHandicap,
          playingHandicap: derived.playingHandicap,
          handicapSource: "manual",
        });
      }
      setNotice("Handicaps updated.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save handicaps.");
    } finally {
      setSaving(false);
    }
  }, [bundle, handicapDraft, load, teeMeta?.slope_rating, teeMeta?.course_rating, metaParTotals.totalPar]);

  const openHandicapEditor = useCallback((playerId: string) => {
    const player = bundle?.players.find((p) => p.id === playerId);
    if (!player) return;
    setEditingHandicapPlayerId(playerId);
    setEditingHandicapInput(String(player.handicap_index ?? 0));
  }, [bundle?.players]);

  const saveEditedHandicap = useCallback(async () => {
    if (!editingHandicapPlayer) return;
    const hi = normalizeHandicapIndexInput(editingHandicapInput);
    if (hi == null) {
      setError("Enter a valid Handicap Index between -10.0 and 54.0.");
      return;
    }
    const apply = async () => {
      setSaving(true);
      setError(null);
      try {
        const derived = deriveCourseAndPlayingHandicapFromHi({
          handicapIndex: hi,
          slopeRating: teeMeta?.slope_rating,
          courseRating: teeMeta?.course_rating,
          parTotal: metaParTotals.totalPar,
        });
        await updateFreePlayPlayerHandicap(editingHandicapPlayer.id, hi);
        await updateFreePlayPlayerCourseAndPlayingHandicap(editingHandicapPlayer.id, {
          courseHandicap: derived.courseHandicap,
          playingHandicap: derived.playingHandicap,
          handicapSource: "manual",
        });
        setEditingHandicapPlayerId(null);
        setEditingHandicapInput("");
        setNotice("Handicap updated. Net and Stableford values recalculated.");
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not update handicap.");
      } finally {
        setSaving(false);
      }
    };
    if (bundle?.round.status === "in_progress") {
      if (Platform.OS === "web") {
        const ok = globalThis.confirm(
          "Changing this handicap will recalculate net scores and Stableford points for this round. Continue?",
        );
        if (ok) await apply();
        return;
      }
      Alert.alert("Recalculate scores?", "Changing this handicap will recalculate net scores and Stableford points for this round.", [
        { text: "Cancel", style: "cancel" },
        { text: "Update", style: "destructive", onPress: () => void apply() },
      ]);
      return;
    }
    await apply();
  }, [
    editingHandicapPlayer,
    editingHandicapInput,
    teeMeta?.slope_rating,
    teeMeta?.course_rating,
    metaParTotals.totalPar,
    load,
    bundle?.round.status,
  ]);

  const removePlayerInRound = useCallback((playerId: string) => {
    if (!bundle || !isRoundCreator) return;
    const p = bundle.players.find((x) => x.id === playerId);
    if (!p || p.is_owner) return;
    const doRemove = async () => {
      setSaving(true);
      setError(null);
      try {
        await removeFreePlayRoundPlayer(bundle.round.id, playerId);
        setNotice(`${p.display_name} removed from round.`);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not remove player.");
      } finally {
        setSaving(false);
      }
    };

    if (Platform.OS === "web") {
      const ok = globalThis.confirm(
        `Remove ${p.display_name} from this round? Existing scores for this player will be removed.`,
      );
      if (ok) void doRemove();
      return;
    }

    Alert.alert("Remove player?", `Remove ${p.display_name} from this round? Existing scores for this player will be removed.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => void doRemove() },
    ]);
  }, [bundle, isRoundCreator, load]);

  const onDeleteRound = useCallback(() => {
    if (!bundle?.round.id || !isRoundCreator) return;
    const doDelete = async () => {
      setSaving(true);
      setError(null);
      try {
        await deleteFreePlayRound(bundle.round.id);
        router.replace("/(app)/free-play" as never);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not delete round.");
      } finally {
        setSaving(false);
      }
    };
    const message = "Delete this round permanently? This cannot be undone.";
    if (Platform.OS === "web") {
      const ok = globalThis.confirm(message);
      if (ok) void doDelete();
      return;
    }
    Alert.alert("Delete round?", message, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void doDelete() },
    ]);
  }, [bundle?.round.id, isRoundCreator, router]);

  const formatDistance = useCallback((yards: number | null | undefined) => {
    if (yards == null || !Number.isFinite(Number(yards)) || Number(yards) <= 0) return null;
    return `${Math.round(Number(yards))}y`;
  }, []);
  const formatScore = useCallback((score: number | null | undefined) => {
    if (score == null || !Number.isFinite(Number(score)) || Number(score) <= 0) return "—";
    return String(score);
  }, []);

  const hiContextLabel = useCallback(
    (hiRaw: string | undefined) => {
      const hi = normalizeHandicapIndexInput(String(hiRaw ?? ""));
      if (hi == null) return "HI —";
      const h = deriveCourseAndPlayingHandicapFromHi({
        handicapIndex: hi,
        slopeRating: teeMeta?.slope_rating,
        courseRating: teeMeta?.course_rating,
        parTotal: metaParTotals.totalPar,
      });
      return `HI ${hi.toFixed(1)} · CH ${h.courseHandicap} · PH ${h.playingHandicap}`;
    },
    [metaParTotals.totalPar, teeMeta?.course_rating, teeMeta?.slope_rating],
  );

  if (loading) {
    return (
      <Screen>
        <LoadingState message="Loading round…" />
      </Screen>
    );
  }

  if (!bundle) {
    return (
      <Screen>
        <EmptyState title="Round not found" message={error || "This free-play round is unavailable."} />
      </Screen>
    );
  }

  return (
    <Screen scrollable={false} contentStyle={{ flex: 1, padding: 0 }} style={{ backgroundColor: colors.backgroundSecondary }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        stickyHeaderIndices={showPremiumHoleDashboard ? [1] : undefined}
        keyboardShouldPersistTaps="handled"
      >
        <View>
        {!showPremiumHoleDashboard ? (
          <>
        <AppCard style={styles.headerCard}>
          <View style={styles.headerTop}>
            <AppText variant="h1" style={{ flex: 1 }} numberOfLines={2}>
              {bundle.round.course_name}
            </AppText>
            <View
              style={[
                styles.stageBadge,
                {
                  backgroundColor:
                    roundStage === "Completed"
                      ? `${colors.success}22`
                      : roundStage === "In progress"
                        ? `${colors.primary}22`
                        : roundStage === "Ready"
                          ? `${colors.info}22`
                          : `${colors.warning}22`,
                },
              ]}
            >
              <AppText variant="captionBold" color="secondary">
                {roundStage}
              </AppText>
            </View>
          </View>
          <AppText variant="small" color="secondary" style={{ marginTop: spacing.xs }}>
            {bundle.round.tee_name || "General tee"} · {bundle.players.length} players
          </AppText>
          {roundTrust ? (
            <View style={{ marginTop: spacing.sm }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs, flexWrap: "wrap" }}>
                {(() => {
                  const label = deriveFreePlayTrustLabel({
                    globalStatus: roundTrust.globalStatus,
                    societyApproved: roundTrust.societyApproved,
                    pendingSubmission: roundTrust.pendingSubmission,
                  });
                  const copy = getFreePlayTrustCopy(label);
                  const border =
                    label === "verified"
                      ? colors.success + "66"
                      : label === "society_approved"
                        ? colors.primary + "66"
                        : label === "pending_review"
                          ? colors.warning + "66"
                          : colors.borderLight;
                  return (
                    <View style={[styles.metaChip, { borderColor: border, backgroundColor: colors.surface }]}>
                      <AppText
                        variant="captionBold"
                        color={
                          label === "verified"
                            ? "success"
                            : label === "society_approved"
                              ? "primary"
                              : label === "pending_review"
                                ? "warning"
                                : "secondary"
                        }
                      >
                        {copy.badge}
                      </AppText>
                    </View>
                  );
                })()}
                <AppText variant="caption" color="tertiary" style={{ flex: 1, minWidth: 120 }}>
                  {getFreePlayTrustCopy(
                    deriveFreePlayTrustLabel({
                      globalStatus: roundTrust.globalStatus,
                      societyApproved: roundTrust.societyApproved,
                      pendingSubmission: roundTrust.pendingSubmission,
                    }),
                  ).detail}
                </AppText>
              </View>
              {(() => {
                const label = deriveFreePlayTrustLabel({
                  globalStatus: roundTrust.globalStatus,
                  societyApproved: roundTrust.societyApproved,
                  pendingSubmission: roundTrust.pendingSubmission,
                });
                if (label !== "society_approved" && label !== "pending_review") return null;
                return (
                  <InlineNotice
                    variant="info"
                    message={
                      label === "society_approved"
                        ? "Your society approved this course for play; global verification may still be pending."
                        : "Course data updates are awaiting Golf Society Hub review — scoring may still work with available tees."
                    }
                    style={{ marginTop: spacing.xs }}
                  />
                );
              })()}
            </View>
          ) : null}
          <View style={styles.metaChips}>
            {teeMeta?.tee_color ? (
              <View style={[styles.metaChip, { borderColor: colors.borderLight }]}>
                <AppText variant="caption" color="secondary">Tee {teeMeta.tee_color}</AppText>
              </View>
            ) : null}
            {Number.isFinite(Number(teeMeta?.course_rating)) ? (
              <View style={[styles.metaChip, { borderColor: colors.borderLight }]}>
                <AppText variant="caption" color="secondary">CR {Number(teeMeta?.course_rating).toFixed(1)}</AppText>
              </View>
            ) : null}
            {Number.isFinite(Number(teeMeta?.slope_rating)) ? (
              <View style={[styles.metaChip, { borderColor: colors.borderLight }]}>
                <AppText variant="caption" color="secondary">Slope {Math.round(Number(teeMeta?.slope_rating))}</AppText>
              </View>
            ) : null}
            {metaParTotals.totalPar != null ? (
              <View style={[styles.metaChip, { borderColor: colors.borderLight }]}>
                <AppText variant="caption" color="secondary">Par {metaParTotals.totalPar}</AppText>
              </View>
            ) : null}
            {formatDistance(metaDistanceTotals.totalYards) ? (
              <View style={[styles.metaChip, { borderColor: colors.borderLight }]}>
                <AppText variant="caption" color="secondary">{formatDistance(metaDistanceTotals.totalYards)}</AppText>
              </View>
            ) : null}
            <View style={[styles.metaChip, { borderColor: colors.success + "55", backgroundColor: `${colors.success}12` }]}>
              <AppText variant="captionBold" color="secondary">
                {bundle.round.scoring_format === "stableford" ? "Stableford" : "Stroke net"}
              </AppText>
            </View>
          </View>
          <View style={styles.codeRow}>
            <AppText variant="captionBold" color="muted">
              Join code: {bundle.round.join_code}
            </AppText>
            <Pressable onPress={() => void copyJoinCode()} hitSlop={8}>
              <Feather name="copy" size={16} color={colors.primary} />
            </Pressable>
          </View>
          <View style={styles.headerActions}>
            <SecondaryButton label="Copy code" size="sm" onPress={() => void copyJoinCode()} />
            <SecondaryButton label="Copy link" size="sm" onPress={() => void copyInviteLink()} />
            <SecondaryButton label="Share" size="sm" onPress={() => void shareRound()} />
          </View>
          {createdFlag === "1" ? (
            <InlineNotice
              variant="success"
              message="Round created. Share now or add players to start quickly."
              style={{ marginTop: spacing.sm }}
            />
          ) : null}
        </AppCard>
        {error ? <InlineNotice variant="error" message={error} style={{ marginTop: spacing.sm }} /> : null}
        {notice ? <InlineNotice variant="success" message={notice} style={{ marginTop: spacing.sm }} /> : null}
        {metaHydrating ? (
          <InlineNotice
            variant="info"
            message="Loading tee and hole metadata for this course..."
            style={{ marginTop: spacing.sm }}
          />
        ) : null}

        {bundle.round.status === "draft" ? (
          <AppCard style={styles.card}>
            <InlineNotice variant="info" message="Round is in setup. Start when all players and handicaps are ready." />
            <AppText variant="captionBold" color="muted" style={{ marginTop: spacing.sm }}>
              Competition format
            </AppText>
            <View style={styles.modeRow}>
              {(["stroke_net", "stableford"] as const).map((f) => (
                <Pressable
                  key={f}
                  onPress={() => void onSetScoringFormat(f)}
                  style={[
                    styles.modeChip,
                    {
                      borderColor: bundle.round.scoring_format === f ? colors.primary : colors.borderLight,
                      backgroundColor: bundle.round.scoring_format === f ? `${colors.primary}14` : colors.surface,
                    },
                  ]}
                >
                  <AppText variant="captionBold" color={bundle.round.scoring_format === f ? "primary" : "secondary"}>
                    {f === "stableford" ? "Stableford" : "Stroke (net)"}
                  </AppText>
                </Pressable>
              ))}
            </View>
            <PrimaryButton
              label="Start round"
              onPress={onStartRound}
              loading={saving}
              style={{ marginTop: spacing.sm }}
            />
          </AppCard>
        ) : null}

        {bundle.round.status === "in_progress" && isRoundCreator ? (
          <AppCard style={styles.card}>
            <AppText variant="captionBold" color="muted">
              Finish round
            </AppText>
            <AppText variant="small" color="secondary" style={{ marginTop: spacing.xs }}>
              Mark complete when everyone has signed their card. You can still view scores afterwards.
            </AppText>
            <PrimaryButton
              label="Mark round complete"
              onPress={() => void onCompleteRound()}
              loading={saving}
              style={{ marginTop: spacing.sm }}
            />
          </AppCard>
        ) : null}

        {isCompletedRound ? (
          <>
            <FreePlayRoundSummaryHero
              courseName={bundle.round.course_name}
              teeName={bundle.round.tee_name || "General tee"}
              formatLabel={bundle.round.scoring_format === "stableford" ? "Stableford" : "Stroke (net)"}
              dateLabel={roundDateLabel}
              winnerName={summaryWinner?.player?.display_name ?? summaryWinner?.top.displayName ?? null}
              winnerScoreLabel={
                bundle.round.scoring_format === "stableford" && !summarySiMissing
                  ? `${summaryWinner?.metrics?.stablefordTotal ?? summaryWinner?.top.stablefordPoints ?? "—"} pts`
                  : `Net ${summaryWinner?.metrics?.netTotal ?? summaryWinner?.top.netTotal ?? "—"}`
              }
              playersCount={bundle.players.length}
              holesCompletedLabel={`${leaderboardRows[0]?.thru ?? 0}/${maxHoleNumber} holes completed`}
            />

            {hasIncompleteScores ? (
              <FreePlayIncompleteRoundNotice canReturnToScoring={isRoundCreator} onReturnToScoring={() => void onReturnToScoring()} />
            ) : null}

            {summarySiMissing && bundle.round.scoring_format === "stableford" ? (
              <InlineNotice
                variant="info"
                message="Stableford warning: Some stroke indexes were missing, so points may be incomplete for those holes."
                style={{ marginTop: spacing.sm }}
              />
            ) : null}

            {completedView === "summary" ? (
              <>
                <FreePlayFinalLeaderboardCard rows={completedLeaderboardRows} />
                <FreePlayRoundHighlightsCard highlights={roundHighlights} />
                <AppCard style={styles.card}>
                  <AppText variant="h2">Player summaries</AppText>
                  {bundle.players.map((p) => {
                    const m = playerSummaryMap.get(p.id);
                    const headline =
                      bundle.round.scoring_format === "stableford"
                        ? `${m?.stablefordTotal ?? "—"} pts · Gross ${m?.grossTotal ?? "—"} · Net ${m?.netTotal ?? "—"}`
                        : `Gross ${m?.grossTotal ?? "—"} · Net ${m?.netTotal ?? "—"}`;
                    const splitLine =
                      bundle.round.scoring_format === "stableford" && !summarySiMissing
                        ? `Front ${m?.frontStableford ?? "—"} pts · Back ${m?.backStableford ?? "—"} pts`
                        : `Front ${m?.frontGross ?? "—"} · Back ${m?.backGross ?? "—"}`;
                    const statsLine = `Pars ${m?.pars ?? 0} · Birdies ${m?.birdies ?? 0} · Blobs ${m?.blobs ?? 0}`;
                    return (
                      <FreePlayPlayerSummaryCard
                        key={`summary-${p.id}`}
                        playerName={p.display_name}
                        headline={headline}
                        splitLine={splitLine}
                        statsLine={statsLine}
                        isWinner={summaryWinner?.top.roundPlayerId === p.id}
                      />
                    );
                  })}
                </AppCard>
                <FreePlayShareResultCard
                  courseName={bundle.round.course_name}
                  teeName={bundle.round.tee_name || "General tee"}
                  dateLabel={roundDateLabel}
                  formatLabel={bundle.round.scoring_format === "stableford" ? "Stableford" : "Stroke (net)"}
                  winnerLine={`${summaryWinner?.player?.display_name ?? summaryWinner?.top.displayName ?? "Winner"} · ${
                    bundle.round.scoring_format === "stableford" && !summarySiMissing
                      ? `${summaryWinner?.metrics?.stablefordTotal ?? summaryWinner?.top.stablefordPoints ?? "—"} pts`
                      : `Net ${summaryWinner?.metrics?.netTotal ?? summaryWinner?.top.netTotal ?? "—"}`
                  }`}
                  topRows={completedLeaderboardRows.slice(0, 3).map((r) => ({ position: r.position, playerName: r.playerName, valueLabel: r.summary.split(" · ")[0] || r.summary }))}
                  onPressShare={() => void shareResultPreview()}
                />
              </>
            ) : (
              <AppCard style={styles.card}>
                <AppText variant="h2">Scorecard</AppText>
                <AppText variant="small" color="secondary" style={{ marginTop: spacing.xs }}>
                  Traditional card view in read-only mode.
                </AppText>
                <View style={styles.modeRow}>
                  {bundle.players.map((p) => (
                    <Pressable
                      key={`completed-card-${p.id}`}
                      onPress={() => {
                        triggerSelection();
                        setSelectedPlayerId(p.id);
                        const map: Record<number, string> = {};
                        for (const h of bundle.holeScores.filter((x) => x.round_player_id === p.id)) {
                          map[h.hole_number] = h.gross_strokes == null ? "" : String(h.gross_strokes);
                        }
                        setHoleInputs(map);
                      }}
                      style={[
                        styles.modeChip,
                        {
                          borderColor: selectedPlayerId === p.id ? colors.primary : colors.borderLight,
                          backgroundColor: selectedPlayerId === p.id ? `${colors.primary}14` : colors.surface,
                        },
                      ]}
                    >
                      <AppText variant="captionBold" color={selectedPlayerId === p.id ? "primary" : "secondary"}>
                        {p.display_name}
                      </AppText>
                    </Pressable>
                  ))}
                </View>
                <FreePlayTraditionalCardGrid
                  holeNumbers={holeNumbers}
                  holeMetaByNo={holeMetaByNo}
                  holeInputs={holeInputs}
                  onHoleInputChange={() => undefined}
                  metaParTotals={metaParTotals}
                  metaDistanceTotals={metaDistanceTotals}
                  selectedScoreTotals={selectedScoreTotals}
                  formatDistance={formatDistance}
                  formatScore={formatScore}
                  currentHole={currentHole}
                  footerValueLabel={bundle.round.scoring_format === "stableford" ? "Gross" : "Gross"}
                  onSaveAll={() => undefined}
                  saving={false}
                  readOnly
                />
              </AppCard>
            )}

            <AppCard style={styles.card}>
              <View style={styles.inlineRow}>
                <SecondaryButton label="Back to Free Play" onPress={() => router.push("/(app)/free-play" as never)} />
                <SecondaryButton label="Start another round" onPress={() => router.push("/(app)/free-play" as never)} />
                {isRoundCreator ? <SecondaryButton label="Delete round" onPress={onDeleteRound} /> : null}
              </View>
              <View style={[styles.inlineRow, { marginTop: spacing.sm }]}>
                <SecondaryButton
                  label={completedView === "card" ? "View summary" : "View scorecard"}
                  onPress={() => setCompletedView((v) => (v === "summary" ? "card" : "summary"))}
                />
                <PrimaryButton label="Share result" onPress={() => void shareResultPreview()} />
              </View>
            </AppCard>
          </>
        ) : (
          <>
        <AppCard style={styles.card}>
          <AppText variant="captionBold" color="muted">
            Players and handicaps
          </AppText>
          {bundle.players.map((p) => (
            <View key={p.id} style={[styles.playerRow, { borderColor: colors.borderLight }]}>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyBold">{p.display_name}</AppText>
                <AppText variant="caption" color="secondary">
                  {p.player_type.replace("_", " ")}{p.is_owner ? " · owner" : ""}
                </AppText>
                <AppText variant="caption" color="tertiary" style={{ marginTop: 2 }}>
                  {hiContextLabel(handicapDraft[p.id])}
                  {p.playing_handicap != null && Number.isFinite(Number(p.playing_handicap))
                    ? ` · PH ${Number(p.playing_handicap)}`
                    : ""}
                </AppText>
              </View>
              <AppInput
                value={handicapDraft[p.id] ?? String(p.handicap_index ?? 0)}
                onChangeText={(v) => setHandicapDraft((prev) => ({ ...prev, [p.id]: v }))}
                keyboardType="numeric"
                style={{ width: 86 }}
              />
            </View>
          ))}
          <PrimaryButton
            label="Save handicaps"
            size="sm"
            onPress={() => void saveAllHandicaps()}
            loading={saving}
            style={{ marginTop: spacing.sm }}
          />
        </AppCard>

          <AppCard style={styles.card}>
            <View style={styles.sectionTitleRow}>
              <AppText variant="captionBold" color="muted">
                Add players fast
              </AppText>
              <Pressable onPress={() => setShowMemberPicker((v) => !v)} hitSlop={8}>
                <AppText variant="captionBold" color="primary">
                  {showMemberPicker ? "Hide members" : "Add member"}
                </AppText>
              </Pressable>
            </View>
            {showMemberPicker ? (
              <View style={{ marginTop: spacing.xs }}>
                {members
                  .filter((m) => !bundle.players.some((p) => p.member_id && p.member_id === m.id))
                  .slice(0, 12)
                  .map((m) => (
                    <Pressable
                      key={m.id}
                      onPress={() => void addMemberPlayer(m)}
                      style={[styles.memberRow, { borderColor: colors.borderLight }]}
                    >
                      <AppText variant="bodyBold">{String(m.displayName || m.name || "Member")}</AppText>
                      <Feather name="plus" size={14} color={colors.primary} />
                    </Pressable>
                  ))}
              </View>
            ) : null}
            <View style={{ marginTop: spacing.sm }}>
              <AppInput
                value={newGuestName}
                onChangeText={setNewGuestName}
                placeholder="Player name"
              />
              <View style={[styles.inlineRow, { marginTop: spacing.xs }]}>
                <AppInput
                  value={newGuestHandicap}
                  onChangeText={setNewGuestHandicap}
                  keyboardType="numeric"
                  placeholder="Handicap"
                  style={{ flex: 1 }}
                />
                <AppInput
                  value={newInviteEmail}
                  onChangeText={setNewInviteEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholder="Invite email (optional)"
                  style={{ flex: 2 }}
                />
              </View>
              <View style={[styles.inlineRow, { marginTop: spacing.sm }]}>
                <SecondaryButton label="Add guest" size="sm" onPress={() => void addQuickPlayer("guest")} />
                <PrimaryButton label="Add app user" size="sm" onPress={() => void addQuickPlayer("app_user")} />
              </View>
            </View>
          </AppCard>

        <AppCard style={styles.card}>
          <AppText variant="captionBold" color="muted">
            Scoring
          </AppText>
          {bundle.round.status !== "completed" ? (
            <>
              <AppText variant="captionBold" color="muted" style={{ marginTop: spacing.sm }}>
                Leaderboard format
              </AppText>
              <View style={styles.modeRow}>
                {(["stroke_net", "stableford"] as const).map((f) => (
                  <Pressable
                    key={f}
                    onPress={() => void onSetScoringFormat(f)}
                    style={[
                      styles.modeChip,
                      {
                        borderColor: bundle.round.scoring_format === f ? colors.primary : colors.borderLight,
                        backgroundColor: bundle.round.scoring_format === f ? `${colors.primary}14` : colors.surface,
                      },
                    ]}
                  >
                    <AppText variant="captionBold" color={bundle.round.scoring_format === f ? "primary" : "secondary"}>
                      {f === "stableford" ? "Stableford" : "Stroke (net)"}
                    </AppText>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
          <View style={styles.quickContextRow}>
            <AppText variant="caption" color="secondary">
              {bundle.round.tee_name || "General tee"}
            </AppText>
            {Number.isFinite(Number(teeMeta?.course_rating)) || Number.isFinite(Number(teeMeta?.slope_rating)) || metaParTotals.totalPar != null ? (
              <AppText variant="caption" color="tertiary">
                {Number.isFinite(Number(teeMeta?.course_rating)) ? `CR ${Number(teeMeta?.course_rating).toFixed(1)} ` : ""}
                {Number.isFinite(Number(teeMeta?.slope_rating)) ? `· S ${Math.round(Number(teeMeta?.slope_rating))} ` : ""}
                {metaParTotals.totalPar != null ? `· Par ${metaParTotals.totalPar}` : ""}
              </AppText>
            ) : null}
          </View>
          <AppText variant="small" color="secondary" style={{ marginTop: spacing.xs }}>
            Quick entry saves one total per player. Hole-by-hole saves each hole and auto-builds totals.
          </AppText>
          <View style={styles.modeRow}>
            {(["quick", "hole_by_hole"] as const).map((m) => (
              <Pressable
                key={m}
                onPress={() => void onSwitchMode(m)}
                style={[
                  styles.modeChip,
                  {
                    borderColor: mode === m ? colors.primary : colors.borderLight,
                    backgroundColor: mode === m ? `${colors.primary}14` : colors.surface,
                  },
                ]}
              >
                <AppText variant="captionBold" color={mode === m ? "primary" : "secondary"}>
                  {m === "quick" ? "Quick entry" : "Hole-by-hole"}
                </AppText>
              </Pressable>
            ))}
          </View>

          {leaderboardRows.length > 0 &&
          (bundle.round.status === "in_progress" || bundle.round.status === "completed") &&
          !(showPremiumHoleDashboard && mode === "hole_by_hole") ? (
            <View style={[styles.leaderboardCard, { borderColor: colors.borderLight, marginTop: spacing.sm }]}>
              <AppText variant="captionBold" color="muted">
                Live leaderboard
              </AppText>
              <View style={styles.leaderboardHeaderRow}>
                <AppText variant="caption" color="tertiary" style={{ width: 22 }}>#</AppText>
                <AppText variant="caption" color="tertiary" style={{ flex: 1 }}>
                  Player
                </AppText>
                <AppText variant="caption" color="tertiary" style={{ width: 40 }}>
                  Thru
                </AppText>
                <AppText variant="caption" color="tertiary" style={{ width: 52, textAlign: "right" }}>
                  {bundle.round.scoring_format === "stableford" ? "Pts" : "Net"}
                </AppText>
              </View>
              {leaderboardRows.map((row, idx) => (
                <View key={row.roundPlayerId} style={styles.leaderboardRow}>
                  <AppText variant="captionBold" color="secondary" style={{ width: 22 }}>
                    {idx + 1}
                  </AppText>
                  <AppText variant="bodyBold" style={{ flex: 1 }} numberOfLines={1}>
                    {row.displayName}
                  </AppText>
                  <AppText variant="caption" color="secondary" style={{ width: 40 }}>
                    {row.thru}
                  </AppText>
                  <AppText variant="bodyBold" color="primary" style={{ width: 52, textAlign: "right" }}>
                    {bundle.round.scoring_format === "stableford"
                      ? (row.stablefordPoints ?? "—")
                      : (row.netTotal ?? "—")}
                  </AppText>
                </View>
              ))}
            </View>
          ) : null}

          {mode === "quick" ? (
            <>
              {bundle.players.map((p) => (
                <View key={p.id} style={[styles.playerRow, { borderColor: colors.borderLight }]}>
                  <AppText variant="bodyBold" style={{ flex: 1 }}>
                    {p.display_name}
                  </AppText>
                  <AppInput
                    value={quickTotals[p.id] ?? ""}
                    onChangeText={(v) => setQuickTotals((prev) => ({ ...prev, [p.id]: v }))}
                    keyboardType="number-pad"
                    placeholder="Total"
                    style={{ width: 90 }}
                  />
                </View>
              ))}
              <PrimaryButton label="Save quick scores" onPress={onSaveQuick} loading={saving} />
            </>
          ) : (
            <>
              {!isRoundCreator ? (
                <InlineNotice
                  variant="info"
                  message="You can enter scores for your own player row. The round owner can enter for everyone."
                  style={{ marginBottom: spacing.sm }}
                />
              ) : null}

              {!showPremiumHoleDashboard ? (
                <>
                  <View style={styles.modeRow}>
                    {scoreablePlayers.map((p) => (
                      <Pressable
                        key={p.id}
                        onPress={() => {
                          triggerSelection();
                          setSelectedPlayerId(p.id);
                          const map: Record<number, string> = {};
                          for (const h of bundle.holeScores.filter((x) => x.round_player_id === p.id)) {
                            map[h.hole_number] = h.gross_strokes == null ? "" : String(h.gross_strokes);
                          }
                          setHoleInputs(map);
                        }}
                        style={[
                          styles.modeChip,
                          {
                            borderColor: selectedPlayerId === p.id ? colors.primary : colors.borderLight,
                            backgroundColor: selectedPlayerId === p.id ? `${colors.primary}14` : colors.surface,
                          },
                        ]}
                      >
                        <AppText variant="captionBold" color={selectedPlayerId === p.id ? "primary" : "secondary"}>
                          {p.display_name}
                        </AppText>
                      </Pressable>
                    ))}
                  </View>
                  <AppText variant="small" color="secondary" style={{ marginBottom: spacing.xs }}>
                    Score for {playerForHoles?.display_name || "selected player"} — hole {currentHole} of {maxHoleNumber}.
                  </AppText>
                  <View style={[styles.holeHeaderCard, { borderColor: colors.primary + "44", backgroundColor: `${colors.primary}0c` }]}>
                    <View style={{ flex: 1 }}>
                      <AppText variant="h2" style={{ letterSpacing: 0.5 }}>
                        Hole {currentHole}
                      </AppText>
                      <AppText variant="small" color="secondary" style={{ marginTop: spacing.xs }}>
                        Par {currentParForHole}
                        {holeMetaByNo.get(currentHole)?.stroke_index != null
                          ? ` · SI ${holeMetaByNo.get(currentHole)?.stroke_index}`
                          : ""}
                        {formatDistance(holeMetaByNo.get(currentHole)?.yardage)
                          ? ` · ${formatDistance(holeMetaByNo.get(currentHole)?.yardage)}`
                          : ""}
                      </AppText>
                    </View>
                    <View style={styles.holeNavCluster}>
                      <SecondaryButton
                        label="Prev"
                        size="sm"
                        onPress={goPrevHole}
                      />
                      <SecondaryButton
                        label="Next"
                        size="sm"
                        onPress={goNextHole}
                      />
                    </View>
                  </View>
                  <AppInput
                    value={holeInputs[currentHole] ?? ""}
                    onChangeText={(v) => setHoleInputs((prev) => ({ ...prev, [currentHole]: v }))}
                    keyboardType="number-pad"
                    placeholder="Gross (empty = pickup)"
                    style={{ marginTop: spacing.sm }}
                  />
                  <View style={[styles.quickScoreRow, { marginTop: spacing.sm }]}>
                    {currentParForHole > 2 ? (
                      <SecondaryButton
                        label={`Birdie ${currentParForHole - 1}`}
                        size="sm"
                        onPress={() => void persistHoleGross(currentHole, currentParForHole - 1)}
                      />
                    ) : null}
                    <SecondaryButton label={`Par ${currentParForHole}`} size="sm" onPress={() => void persistHoleGross(currentHole, currentParForHole)} />
                    <SecondaryButton
                      label={`Bogey ${currentParForHole + 1}`}
                      size="sm"
                      onPress={() => void persistHoleGross(currentHole, currentParForHole + 1)}
                    />
                    <SecondaryButton
                      label={`Double ${currentParForHole + 2}`}
                      size="sm"
                      onPress={() => void persistHoleGross(currentHole, currentParForHole + 2)}
                    />
                    <SecondaryButton label="Pickup" size="sm" onPress={() => void persistHoleGross(currentHole, null)} />
                  </View>
                  <PrimaryButton
                    label="Save this hole"
                    size="sm"
                    onPress={() => {
                      const raw = holeInputs[currentHole]?.trim() ?? "";
                      if (raw === "" || raw.toLowerCase() === "nr" || raw.toLowerCase() === "pickup") {
                        void persistHoleGross(currentHole, null);
                        return;
                      }
                      const n = Number(raw);
                      if (Number.isFinite(n)) void persistHoleGross(currentHole, n);
                    }}
                    loading={saving}
                    style={{ marginTop: spacing.sm }}
                  />
                  <Pressable onPress={() => setShowFullHoleGrid((v) => !v)} style={{ marginTop: spacing.sm }}>
                    <AppText variant="captionBold" color="primary">
                      {showFullHoleGrid ? "Hide full grid" : "Show full hole grid"}
                    </AppText>
                  </Pressable>
                  {showFullHoleGrid ? (
                    <View style={{ marginTop: spacing.sm }}>
                      <FreePlayTraditionalCardGrid
                        holeNumbers={holeNumbers}
                        holeMetaByNo={holeMetaByNo}
                        holeInputs={holeInputs}
                        onHoleInputChange={(hole, value) => setHoleInputs((prev) => ({ ...prev, [hole]: value }))}
                        metaParTotals={metaParTotals}
                        metaDistanceTotals={metaDistanceTotals}
                        selectedScoreTotals={selectedScoreTotals}
                        formatDistance={formatDistance}
                        formatScore={formatScore}
                        currentHole={currentHole}
                        footerValueLabel={bundle.round.scoring_format === "stableford" ? "Gross" : "Gross"}
                        onSaveAll={() => void onSaveHoles()}
                        saving={saving}
                      />
                    </View>
                  ) : null}
                </>
              ) : null}
            </>
          )}
        </AppCard>
          </>
        )}
          </>
        ) : null}
        </View>

        {showPremiumHoleDashboard ? (
          <>
            <View style={[styles.stickyLiveBar, { backgroundColor: colors.surface, borderBottomColor: colors.borderLight }]}>
              <FreePlayRoundHeader
                courseName={bundle.round.course_name}
                currentHole={currentHole}
                maxHole={maxHoleNumber}
                par={currentParForHole}
                strokeIndex={currentHoleStrokeIndexDisplay}
                strokeIndexUnavailable={currentHoleSiUnavailable}
                teeName={String(bundle.round.tee_name || teeMeta?.tee_name || "Tee")}
                scoringFormatLabel={bundle.round.scoring_format === "stableford" ? "Stableford" : "Stroke (net)"}
                leaderLine={leaderSummaryLine}
                currentPlayerLine={selectedPlayerHeaderLine}
              />
              <View style={{ paddingHorizontal: spacing.base, paddingBottom: spacing.sm }}>
                <FreePlayRoundProgress currentHole={currentHole} maxHole={maxHoleNumber} />
                <View style={{ marginTop: spacing.sm }}>
                  <FreePlayScoreModeTabs value={scoreViewTab} onChange={setScoreViewTab} />
                </View>
              </View>
            </View>
            <View style={{ paddingHorizontal: spacing.base, paddingTop: spacing.md }}>
              {error ? <InlineNotice variant="error" message={error} style={{ marginBottom: spacing.sm }} /> : null}
              {notice ? <InlineNotice variant="success" message={notice} style={{ marginBottom: spacing.sm }} /> : null}
              {!isRoundCreator ? (
                <InlineNotice
                  variant="info"
                  message="You can enter scores for your own player row. The round owner can enter for everyone."
                  style={{ marginBottom: spacing.sm }}
                />
              ) : null}
              <AppText variant="captionBold" color="muted" style={{ marginBottom: spacing.xs }}>
                Scoring players
              </AppText>
              <View style={styles.modeRow}>
                {scoreablePlayers.map((p) => (
                  <Pressable
                    key={`live-${p.id}`}
                    onPress={() => {
                      triggerSelection();
                      setSelectedPlayerId(p.id);
                      const map: Record<number, string> = {};
                      for (const h of bundle.holeScores.filter((x) => x.round_player_id === p.id)) {
                        map[h.hole_number] = h.gross_strokes == null ? "" : String(h.gross_strokes);
                      }
                      setHoleInputs(map);
                    }}
                    style={[
                      styles.modeChip,
                      {
                        borderColor: selectedPlayerId === p.id ? colors.primary : colors.borderLight,
                        backgroundColor: selectedPlayerId === p.id ? `${colors.primary}14` : colors.surface,
                      },
                    ]}
                  >
                    <AppText variant="captionBold" color={selectedPlayerId === p.id ? "primary" : "secondary"}>
                      {p.display_name}
                    </AppText>
                  </Pressable>
                ))}
              </View>

              {scoreViewTab === "simple" ? (
                <Animated.View
                  style={{
                    opacity: holeTransition,
                    transform: [
                      {
                        translateY: holeTransition.interpolate({
                          inputRange: [0.96, 1],
                          outputRange: [8, 0],
                        }),
                      },
                    ],
                  }}
                >
                  <FreePlayHoleHero
                    holeNumber={currentHole}
                    par={currentParForHole}
                    strokeIndex={currentHoleStrokeIndexDisplay}
                    strokeIndexUnavailable={currentHoleSiUnavailable}
                    yardageLabel={formatDistance(holeMetaByNo.get(currentHole)?.yardage)}
                    stablefordActive={bundle.round.scoring_format === "stableford"}
                  />
                  <FreePlayLeaderboardPreview
                    format={bundle.round.scoring_format === "stableford" ? "stableford" : "stroke_net"}
                    rows={leaderboardRows}
                    onPressOpenFull={() => setLeaderboardOpen(true)}
                  />
                  {scoreablePlayers.map((p) => {
                    const holeScoreRow = bundle.holeScores.find(
                      (h) => h.round_player_id === p.id && h.hole_number === currentHole,
                    );
                    const gross = holeScoreRow?.gross_strokes ?? null;
                    const par = currentParForHole;
                    const ph = intPlayingHandicap(p.playing_handicap, p.handicap_index);
                    const strokeMap =
                      holesSnapshots.length > 0 ? buildStrokesReceivedByHole(ph, holesSnapshots) : new Map<number, number>();
                    const sfUnreliable =
                      bundle.round.scoring_format === "stableford" && currentHoleSiUnavailable;
                    const isBlob = holeScoreRow != null && holeScoreRow.gross_strokes === null;
                    let netLabel: string | null = null;
                    let sfHole: string | null = null;
                    if (isBlob) {
                      netLabel = "Blob";
                    } else if (gross != null && Number.isFinite(gross)) {
                      const sr = strokeMap.get(currentHole) ?? 0;
                      const net = Math.round(gross - sr);
                      netLabel = netStrokeLabel(net, par);
                      if (bundle.round.scoring_format === "stableford") {
                        sfHole = sfUnreliable ? null : `${stablefordPointsForHole(net, par)} pts`;
                      }
                    }
                    const grossDisplay = gross == null || !Number.isFinite(gross) ? "—" : String(gross);
                    const lbRow = leaderboardRows.find((r) => r.roundPlayerId === p.id);
                    const runningTotalLabel =
                      bundle.round.scoring_format === "stableford"
                        ? lbRow?.stablefordPoints != null
                          ? `Total ${lbRow.stablefordPoints} pts`
                          : null
                        : lbRow?.netTotal != null
                          ? `Total net ${lbRow.netTotal}`
                          : null;
                    const canEdit = isRoundCreator || ownRoundPlayerIds.includes(p.id);
                    const scoresLocked = bundle.round.status === "completed";
                    const disabled = scoresLocked || !canEdit;
                    const hi = Number.isFinite(Number(p.handicap_index)) ? Number(p.handicap_index) : 0;
                    const ch = p.course_handicap != null && Number.isFinite(Number(p.course_handicap)) ? Number(p.course_handicap) : null;
                    const phValue =
                      p.playing_handicap != null && Number.isFinite(Number(p.playing_handicap)) ? Number(p.playing_handicap) : null;
                    return (
                      <FreePlayPlayerScoreCard
                        key={p.id}
                        playerName={p.display_name}
                        handicapLine={`HI ${hi.toFixed(1)}${ch != null ? ` · CH ${ch}` : ""}${phValue != null ? ` · PH ${phValue}` : ""}`}
                        grossDisplay={grossDisplay}
                        netLabel={netLabel}
                        stablefordPointsDisplay={sfHole}
                        stablefordUnavailable={sfUnreliable}
                        runningTotalLabel={runningTotalLabel}
                        showStableford={bundle.round.scoring_format === "stableford"}
                        disabled={disabled}
                        saving={saving}
                        onDecrement={() => {
                          if (gross == null || !Number.isFinite(gross)) return;
                          if (gross <= 1) saveHoleWithFeedback(p.id, currentHole, null, Haptics.ImpactFeedbackStyle.Medium);
                          else saveHoleWithFeedback(p.id, currentHole, gross - 1);
                        }}
                        onIncrement={() => {
                          if (gross == null || !Number.isFinite(gross)) {
                            saveHoleWithFeedback(p.id, currentHole, currentParForHole);
                          } else {
                            saveHoleWithFeedback(p.id, currentHole, gross + 1);
                          }
                        }}
                        onPickup={() => saveHoleWithFeedback(p.id, currentHole, null, Haptics.ImpactFeedbackStyle.Medium)}
                        onParShortcut={() => saveHoleWithFeedback(p.id, currentHole, currentParForHole)}
                        onBogeyShortcut={() => saveHoleWithFeedback(p.id, currentHole, currentParForHole + 1)}
                        onEditHandicap={isRoundCreator || ownRoundPlayerIds.includes(p.id) ? () => openHandicapEditor(p.id) : undefined}
                        onRemovePlayer={isRoundCreator && !p.is_owner ? () => removePlayerInRound(p.id) : undefined}
                      />
                    );
                  })}
                  {currentHoleSiUnavailable && bundle.round.scoring_format === "stableford" ? (
                    <InlineNotice
                      variant="info"
                      message="Stroke index unavailable — Stableford points may be limited for this hole. Points show as — until SI data is complete."
                      style={{ marginTop: spacing.sm }}
                    />
                  ) : null}
                  <View style={[styles.holeNavFooter, { borderColor: colors.borderLight }]}>
                    <SecondaryButton
                      label="Previous hole"
                      size="sm"
                      onPress={goPrevHole}
                      disabled={currentHole <= 1}
                    />
                    <SecondaryButton
                      label="Next hole"
                      size="sm"
                      onPress={goNextHole}
                      disabled={currentHole >= maxHoleNumber}
                    />
                  </View>
                  {currentHole >= maxHoleNumber &&
                  bundle.round.status === "in_progress" &&
                  isRoundCreator ? (
                    <PrimaryButton
                      label="Finish round"
                      onPress={() => void onCompleteRound()}
                      loading={saving}
                      style={{ marginTop: spacing.md }}
                    />
                  ) : currentHole >= maxHoleNumber && bundle.round.status === "in_progress" && !isRoundCreator ? (
                    <AppText variant="caption" color="tertiary" style={{ marginTop: spacing.sm }}>
                      Ask the round owner to mark the round complete when you are finished.
                    </AppText>
                  ) : null}
                </Animated.View>
              ) : scoreViewTab === "stats" ? (
                <FreePlayStatsComingSoonCard />
              ) : holeNumbers.length > 0 ? (
                <View style={{ marginTop: spacing.md }}>
                  <View style={styles.modeRow}>
                    {scoreablePlayers.map((p) => (
                      <Pressable
                        key={`card-${p.id}`}
                        onPress={() => {
                          triggerSelection();
                          setSelectedPlayerId(p.id);
                          const map: Record<number, string> = {};
                          for (const h of bundle.holeScores.filter((x) => x.round_player_id === p.id)) {
                            map[h.hole_number] = h.gross_strokes == null ? "" : String(h.gross_strokes);
                          }
                          setHoleInputs(map);
                        }}
                        style={[
                          styles.modeChip,
                          {
                            borderColor: selectedPlayerId === p.id ? colors.primary : colors.borderLight,
                            backgroundColor: selectedPlayerId === p.id ? `${colors.primary}14` : colors.surface,
                          },
                        ]}
                      >
                        <AppText variant="captionBold" color={selectedPlayerId === p.id ? "primary" : "secondary"}>
                          {p.display_name}
                        </AppText>
                      </Pressable>
                    ))}
                  </View>
                  <FreePlayTraditionalCardGrid
                    holeNumbers={holeNumbers}
                    holeMetaByNo={holeMetaByNo}
                    holeInputs={holeInputs}
                    onHoleInputChange={(hole, value) => setHoleInputs((prev) => ({ ...prev, [hole]: value }))}
                    metaParTotals={metaParTotals}
                    metaDistanceTotals={metaDistanceTotals}
                    selectedScoreTotals={selectedScoreTotals}
                    formatDistance={formatDistance}
                    formatScore={formatScore}
                    currentHole={currentHole}
                    footerValueLabel={bundle.round.scoring_format === "stableford" ? "Gross" : "Gross"}
                    onSaveAll={() => void onSaveHoles()}
                    saving={saving}
                  />
                </View>
              ) : (
                <FreePlayScorecardEmptyState />
              )}

              <View style={[styles.inlineRow, { marginTop: spacing.lg }]}>
                <SecondaryButton label="Refresh" onPress={() => void load()} />
                {isRoundCreator ? <SecondaryButton label="Delete round" onPress={onDeleteRound} /> : null}
              </View>
              <SecondaryButton
                label="Back to free-play rounds"
                onPress={() => router.push("/(app)/free-play" as never)}
                style={{ marginTop: spacing.sm }}
              />
            </View>
          </>
        ) : null}

        {!showPremiumHoleDashboard && !isCompletedRound ? (
          <>
            <View style={styles.inlineRow}>
              <SecondaryButton label="Add players" onPress={() => setShowMemberPicker(true)} />
              <SecondaryButton label="Refresh" onPress={() => void load()} />
              {isRoundCreator ? <SecondaryButton label="Delete round" onPress={onDeleteRound} /> : null}
            </View>
            <SecondaryButton
              label="Back to free-play rounds"
              onPress={() => router.push("/(app)/free-play" as never)}
              style={{ marginTop: spacing.sm }}
            />
          </>
        ) : null}
      </ScrollView>
      <Modal
        visible={editingHandicapPlayer != null}
        animationType="slide"
        transparent
        onRequestClose={() => setEditingHandicapPlayerId(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setEditingHandicapPlayerId(null)}>
          <View
            style={[styles.modalSheet, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.modalHead}>
              <AppText variant="h2">Edit Handicap Index</AppText>
              <Pressable onPress={() => setEditingHandicapPlayerId(null)} hitSlop={10}>
                <Feather name="x" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
            <AppText variant="bodyBold">{editingHandicapPlayer?.display_name ?? "Player"}</AppText>
            <AppInput
              value={editingHandicapInput}
              onChangeText={setEditingHandicapInput}
              keyboardType="numeric"
              placeholder="Handicap Index"
              style={{ marginTop: spacing.sm }}
            />
            <View style={{ marginTop: spacing.sm }}>
              <AppText variant="small" color="secondary">
                {editingHandicapPreview
                  ? `Calculated for ${bundle.round.tee_name || teeMeta?.tee_name || "selected tee"}: CH ${editingHandicapPreview.courseHandicap} · PH ${editingHandicapPreview.playingHandicap}`
                  : "Enter a valid HI to preview Course Handicap and Playing Handicap."}
              </AppText>
            </View>
            <PrimaryButton
              label="Save"
              onPress={() => void saveEditedHandicap()}
              loading={saving}
              style={{ marginTop: spacing.md }}
            />
          </View>
        </Pressable>
      </Modal>
      <FreePlayLeaderboardSheet
        visible={leaderboardOpen}
        onClose={() => setLeaderboardOpen(false)}
        format={bundle.round.scoring_format === "stableford" ? "stableford" : "stroke_net"}
        rows={leaderboardRows}
      />
      <LicenceRequiredModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        societyId={guardSocietyId}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: spacing.base,
    paddingBottom: spacing.xl,
  },
  card: {
    marginTop: spacing.base,
    padding: spacing.base,
  },
  headerCard: {
    padding: spacing.base,
    borderRadius: radius.lg,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  stageBadge: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  codeRow: {
    marginTop: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerActions: {
    marginTop: spacing.sm,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  metaChips: {
    marginTop: spacing.xs,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  metaChip: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xs,
    paddingVertical: 3,
  },
  sectionTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  memberRow: {
    marginTop: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  inlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  playerRow: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  modeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  quickContextRow: {
    marginTop: spacing.sm,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    alignItems: "center",
  },
  holeSummaryCard: {
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: 4,
  },
  holeSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modeChip: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  holeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  holeCell: {
    width: "22%",
    minWidth: 64,
  },
  holeHeaderCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.base,
    marginBottom: spacing.xs,
  },
  holeNavCluster: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    alignItems: "center",
    maxWidth: 160,
    justifyContent: "flex-end",
  },
  quickScoreRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    alignItems: "center",
  },
  leaderboardCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  leaderboardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  leaderboardRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    gap: spacing.xs,
  },
  stickyLiveBar: {
    zIndex: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  holeNavFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderRadius: 12,
    gap: spacing.sm,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.base,
    paddingBottom: spacing.xl,
  },
  modalHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
});
