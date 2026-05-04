import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, Easing, Modal, PanResponder, Platform, Pressable, ScrollView, Share, StyleSheet, View } from "react-native";
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
import { RetryErrorBlock } from "@/components/ui/RetryErrorBlock";
import { getCache, setCache } from "@/lib/cache/clientCache";
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
  FREE_PLAY_SETUP_REQUIRED_DETAIL,
  FREE_PLAY_SETUP_REQUIRED_FULL_MESSAGE,
  FREE_PLAY_SETUP_REQUIRED_MESSAGE,
  getFreePlayRoundBundle,
  reopenFreePlayRound,
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
import { useFreePlaySchemaStatus } from "@/lib/free-play/useFreePlaySchemaStatus";
import {
  buildFreePlayLeaderboard,
  deriveCourseAndPlayingHandicapFromHi,
  freePlayHolesToSnapshots,
  intPlayingHandicap,
  normalizeHandicapIndexInput,
} from "@/lib/scoring/freePlayScoring";
import { buildStrokesReceivedByHole } from "@/lib/scoring/handicapStrokeAllocation";
import { stablefordPointsForHole } from "@/lib/scoring/stablefordPoints";
import { FreePlayPlayerScoreCard } from "@/components/free-play/scorecard/FreePlayPlayerScoreCard";
import { FreePlayMiniLeaderboard } from "@/components/free-play/scorecard/FreePlayMiniLeaderboard";
import { FreePlayScoringHeader } from "@/components/free-play/scorecard/FreePlayScoringHeader";
import { FreePlayLeaderboardSheet } from "@/components/free-play/scorecard/FreePlayLeaderboardSheet";
import { FreePlayTraditionalCardGrid } from "@/components/free-play/scorecard/FreePlayTraditionalCardGrid";
import { FreePlayScorecardEmptyState } from "@/components/free-play/scorecard/FreePlayScorecardEmptyState";
import { FreePlayFinalLeaderboardCard } from "@/components/free-play/summary/FreePlayFinalLeaderboardCard";
import { FreePlayIncompleteRoundNotice } from "@/components/free-play/summary/FreePlayIncompleteRoundNotice";
import { FreePlayPlayerSummaryCard } from "@/components/free-play/summary/FreePlayPlayerSummaryCard";
import { FreePlayRoundHighlightsCard } from "@/components/free-play/summary/FreePlayRoundHighlightsCard";
import { FreePlayRoundSummaryHero } from "@/components/free-play/summary/FreePlayRoundSummaryHero";
import { FreePlayShareResultCard } from "@/components/free-play/summary/FreePlayShareResultCard";
import { getMembersBySocietyId, type MemberDoc } from "@/lib/db_supabase/memberRepo";
import type { FreePlayRoundBundle, FreePlayScoringFormat, FreePlayScoringMode } from "@/types/freePlayScorecard";
import { logFreePlayScorecardDataPathQa } from "@/lib/free-play/scorecardDataPathQa";
import { mergeHoleGrossIntoBundle } from "@/lib/free-play/mergeFreePlayBundleHoleScore";
import { findFirstIncompleteHoleNumber } from "@/lib/free-play/freePlayHoleResume";
import { getFreePlayStartBlockers } from "@/lib/free-play/freePlayStartReadiness";
import { analyzeHoleScoreRowKeys } from "@/lib/free-play/freePlayHoleScoreDiagnostics";
import { nextGrossOnDecrement, nextGrossOnIncrement } from "@/lib/free-play/freePlayGrossControl";
import { flushThenSetHole } from "@/lib/free-play/freePlayHoleNavigation";

function formatRelativeToPar(delta: number | null): string {
  if (delta == null || !Number.isFinite(delta)) return "—";
  if (delta === 0) return "E";
  return delta > 0 ? `+${delta}` : String(delta);
}

function cycleGrossForSimpleMode(currentGross: number | null, par: number): number | null {
  const sequence = [par, par + 1, par + 2, par + 3];
  if (currentGross == null || !Number.isFinite(currentGross)) return sequence[0] ?? par;
  const rounded = Math.round(currentGross);
  const idx = sequence.indexOf(rounded);
  if (idx === -1 || idx >= sequence.length - 1) return null;
  return sequence[idx + 1] ?? null;
}

export default function FreePlayRoundDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string | string[]; created?: string | string[]; openAdd?: string | string[] }>();
  const roundId = Array.isArray(params.id) ? params.id[0] : params.id;
  const createdFlag = Array.isArray(params.created) ? params.created[0] : params.created;
  const openAddFlag = Array.isArray(params.openAdd) ? params.openAdd[0] : params.openAdd;
  const colors = getColors();
  const { societyId, userId, member, bootstrapped } = useBootstrap();
  const { guardPaidAction, modalVisible, setModalVisible, societyId: guardSocietyId } = usePaidAccess();
  const { status: fpSchemaStatus } = useFreePlaySchemaStatus(userId, bootstrapped);
  const freePlayWritesOk = fpSchemaStatus === "ok";
  const fpSchemaStatusRef = useRef(fpSchemaStatus);
  fpSchemaStatusRef.current = fpSchemaStatus;

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
  const [roundTrust, setRoundTrust] = useState<CourseApprovalState | null>(null);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [miniLeaderboardOpen, setMiniLeaderboardOpen] = useState(false);
  const [completedView, setCompletedView] = useState<"summary" | "card">("summary");
  const [editingHandicapPlayerId, setEditingHandicapPlayerId] = useState<string | null>(null);
  const [editingHandicapInput, setEditingHandicapInput] = useState("");
  const holeTransition = useRef(new Animated.Value(1)).current;
  const scorecardDataPathQaLoggedRef = useRef<string | null>(null);
  const bundleRef = useRef<FreePlayRoundBundle | null>(null);
  bundleRef.current = bundle;
  const [roundRefreshError, setRoundRefreshError] = useState<string | null>(null);
  const [roundRefetching, setRoundRefetching] = useState(false);
  /** Per–hole-card save feedback (hole-by-hole live scoring). */
  const [holeSaveUi, setHoleSaveUi] = useState<{
    playerId: string;
    hole: number;
    phase: "saving" | "saved" | "failed";
  } | null>(null);
  const holeSaveClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Seed `currentHole` once per round + selected player when reopening an in-progress round. */
  const resumeHoleSeedRef = useRef<string | null>(null);
  /** Debounced hole upserts (premium multi-card scoring). */
  const holePersistTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const holePersistLatestRef = useRef<Map<string, number | null>>(new Map());
  const [resumedHoleBanner, setResumedHoleBanner] = useState<number | null>(null);
  const [devFpPersistHud, setDevFpPersistHud] = useState<{
    reloadCount: number;
    lastReloadIso: string;
    serverHoleRows: number;
    duplicateHoleKeys: string[];
    rowCountByRoundPlayerId: Record<string, number>;
  } | null>(null);
  const [devPersistActivity, setDevPersistActivity] = useState(0);
  const bumpDevPersistActivity = useCallback(() => {
    if (__DEV__) setDevPersistActivity((n) => n + 1);
  }, []);

  const applyRoundBundle = useCallback(
    (payload: FreePlayRoundBundle) => {
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
    },
    [userId, member?.id],
  );

  const load = useCallback(
    async (opts?: { silent?: boolean; bustResumeSeed?: boolean }) => {
      if (!roundId) {
        setError("Missing round ID.");
        setLoading(false);
        return;
      }
      if (fpSchemaStatusRef.current === "missing") {
        if (opts?.silent) {
          setRoundRefetching(false);
        } else {
          setLoading(false);
        }
        return;
      }
      const silent = !!opts?.silent;
      if (silent) {
        setRoundRefetching(true);
        setRoundRefreshError(null);
      } else {
        setLoading(true);
        setError(null);
        setRoundRefreshError(null);
      }
      try {
        const payload = await getFreePlayRoundBundle(roundId);
        if (opts?.bustResumeSeed) {
          resumeHoleSeedRef.current = null;
        }
        applyRoundBundle(payload);
        await setCache(`freeplay:round:${roundId}`, payload, { ttlMs: 1000 * 60 * 30 });
        if (__DEV__) {
          const { duplicateKeys, rowCountByRoundPlayerId, totalRows } = analyzeHoleScoreRowKeys(payload.holeScores);
          setDevFpPersistHud((prev) => ({
            reloadCount: (prev?.reloadCount ?? 0) + 1,
            lastReloadIso: new Date().toISOString(),
            serverHoleRows: totalRows,
            duplicateHoleKeys: duplicateKeys,
            rowCountByRoundPlayerId,
          }));
          if (duplicateKeys.length > 0) {
            console.warn("[free-play] bundle hole_scores contain duplicate player+hole keys", duplicateKeys);
          }
          console.log("[free-play] load ok", {
            roundId,
            silent,
            bustResumeSeed: !!opts?.bustResumeSeed,
            players: payload.players.length,
            holeRows: totalRows,
            dupKeys: duplicateKeys.length,
          });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to load round.";
        if (bundleRef.current) {
          setRoundRefreshError(msg);
        } else {
          setError(msg);
        }
      } finally {
        setLoading(false);
        setRoundRefetching(false);
      }
    },
    [roundId, applyRoundBundle],
  );

  const flushPendingDebouncedHoleScores = useCallback(async () => {
    for (const t of holePersistTimersRef.current.values()) {
      clearTimeout(t);
    }
    holePersistTimersRef.current.clear();
    const rid = bundleRef.current?.round.id;
    if (!rid) return;
    const pairs = [...holePersistLatestRef.current.entries()];
    holePersistLatestRef.current.clear();
    for (const [key, gross] of pairs) {
      const idx = key.lastIndexOf(":");
      if (idx <= 0) continue;
      const playerId = key.slice(0, idx);
      const holeStr = key.slice(idx + 1);
      const holeNo = Number(holeStr);
      if (!playerId || !Number.isFinite(holeNo)) continue;
      await upsertHoleScore(rid, playerId, holeNo, gross ?? null);
    }
    if (pairs.length > 0) {
      if (__DEV__) console.log("[free-play] flushPendingDebouncedHoleScores count", pairs.length);
      await load({ silent: true });
    }
    bumpDevPersistActivity();
  }, [load, bumpDevPersistActivity]);

  const scheduleDebouncedHolePersist = useCallback(
    (roundPlayerId: string, holeNo: number, gross: number | null) => {
      const rid = bundleRef.current?.round.id;
      if (!rid) return;
      const key = `${roundPlayerId}:${holeNo}`;
      holePersistLatestRef.current.set(key, gross);
      const prevT = holePersistTimersRef.current.get(key);
      if (prevT) clearTimeout(prevT);
      setHoleSaveUi({ playerId: roundPlayerId, hole: holeNo, phase: "saving" });
      bumpDevPersistActivity();
      holePersistTimersRef.current.set(
        key,
        setTimeout(() => {
          holePersistTimersRef.current.delete(key);
          const g = holePersistLatestRef.current.get(key);
          holePersistLatestRef.current.delete(key);
          void (async () => {
            try {
              if (__DEV__) {
                console.log("[free-play] debounced upsertHoleScore", { roundId: rid, roundPlayerId, holeNo, gross: g });
              }
              await upsertHoleScore(rid, roundPlayerId, holeNo, g ?? null);
              setHoleSaveUi({ playerId: roundPlayerId, hole: holeNo, phase: "saved" });
              if (holeSaveClearRef.current) clearTimeout(holeSaveClearRef.current);
              holeSaveClearRef.current = setTimeout(() => {
                setHoleSaveUi((cur) =>
                  cur?.playerId === roundPlayerId && cur?.hole === holeNo && cur.phase === "saved" ? null : cur,
                );
              }, 1600);
              await load({ silent: true });
            } catch (e) {
              setHoleSaveUi({ playerId: roundPlayerId, hole: holeNo, phase: "failed" });
              setError(e instanceof Error ? e.message : "Could not save score.");
              if (__DEV__) {
                console.warn("[free-play] debounced hole save failed", e);
              }
            } finally {
              bumpDevPersistActivity();
            }
          })();
        }, 420),
      );
    },
    [load, bumpDevPersistActivity],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!roundId) return;
      if (fpSchemaStatus === "pending") return;
      if (fpSchemaStatus === "missing") {
        const cached = await getCache<FreePlayRoundBundle>(`freeplay:round:${roundId}`, { maxAgeMs: 1000 * 60 * 60 * 24 });
        if (cancelled) return;
        if (cached?.value?.round?.id) {
          applyRoundBundle(cached.value);
        } else {
          setError(FREE_PLAY_SETUP_REQUIRED_FULL_MESSAGE);
        }
        setLoading(false);
        return;
      }
      const cached = await getCache<FreePlayRoundBundle>(`freeplay:round:${roundId}`, { maxAgeMs: 1000 * 60 * 60 * 24 });
      if (cancelled) return;
      if (cached?.value?.round?.id) {
        applyRoundBundle(cached.value);
        setLoading(false);
        await load({ silent: true, bustResumeSeed: true });
        return;
      }
      if (cancelled) return;
      await load({ silent: false });
    })();
    return () => {
      cancelled = true;
    };
  }, [roundId, applyRoundBundle, load, fpSchemaStatus]);

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
    if (!round?.id) {
      setTeeMeta(null);
      setHoleMeta([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      setMetaHydrating(true);
      try {
        let resolvedCourseId = round.course_id ? String(round.course_id) : null;
        let resolvedCourseName = String(round.course_name ?? "").trim();

        if (!resolvedCourseId && resolvedCourseName) {
          const byName = await findBestPlayableCourseByName(resolvedCourseName);
          if (!cancelled && byName) {
            resolvedCourseId = byName.id;
            resolvedCourseName = byName.course_name || resolvedCourseName;
          }
        }

        if (!resolvedCourseId) {
          if (!cancelled) {
            setTeeMeta(null);
            setHoleMeta([]);
          }
          return;
        }

        // 1) Use round.tee_id only when that tee belongs to the resolved course and has hole rows.
        if (round.tee_id) {
          const [tee, holes] = await Promise.all([getCourseTeeById(round.tee_id), getHolesByTeeId(round.tee_id)]);
          if (!cancelled && tee && tee.course_id === resolvedCourseId && holes.length > 0) {
            setTeeMeta(tee);
            setHoleMeta(holes.slice().sort((a, b) => a.hole_number - b.hole_number));
            const mustPersist = round.course_id !== resolvedCourseId || round.tee_id !== tee.id;
            if (mustPersist && freePlayWritesOk) {
              try {
                await relinkFreePlayRoundCourse(round.id, {
                  courseId: resolvedCourseId,
                  courseName: resolvedCourseName || round.course_name,
                  teeId: tee.id,
                  teeName: tee.tee_name,
                });
                if (!cancelled) {
                  setNotice("Round linked to course metadata.");
                  await load({ silent: true });
                }
              } catch {
                /* keep hydrated UI */
              }
            }
            return;
          }
        }

        // 2) Fallback: ensure course metadata is imported if api_id exists.
        const meta = await getCourseMetaById(resolvedCourseId);
        if (meta?.api_id != null && Number.isFinite(Number(meta.api_id))) {
          try {
            await importCourseFromApiId(Number(meta.api_id));
          } catch {
            // Best effort import; continue with whatever DB currently has.
          }
        }

        // 3) Pick a tee that has course_holes (name match → default → display order).
        let tees = await getTeesByCourseId(resolvedCourseId);

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
          return;
        }

        const roundTeeName = String(round.tee_name ?? "").trim().toLowerCase();
        const orderedTees = [...tees].sort((a, b) => {
          const aName = String(a.tee_name ?? "").trim().toLowerCase();
          const bName = String(b.tee_name ?? "").trim().toLowerCase();
          const aMatch = roundTeeName && aName === roundTeeName ? 0 : 1;
          const bMatch = roundTeeName && bName === roundTeeName ? 0 : 1;
          if (aMatch !== bMatch) return aMatch - bMatch;
          const aDef = a.is_default === true ? 0 : 1;
          const bDef = b.is_default === true ? 0 : 1;
          if (aDef !== bDef) return aDef - bDef;
          const ao = Number.isFinite(Number(a.display_order)) ? Number(a.display_order) : 0;
          const bo = Number.isFinite(Number(b.display_order)) ? Number(b.display_order) : 0;
          if (ao !== bo) return ao - bo;
          return a.tee_name.localeCompare(b.tee_name);
        });

        let picked: CourseTee | null = null;
        let holes: CourseHoleRow[] = [];
        for (const t of orderedTees) {
          const h = await getHolesByTeeId(t.id);
          if (h.length > 0) {
            picked = t;
            holes = h;
            break;
          }
        }

        if (!picked) {
          if (!cancelled) {
            setTeeMeta(null);
            setHoleMeta([]);
          }
          return;
        }

        if (!cancelled) {
          setTeeMeta(picked);
          setHoleMeta(holes.slice().sort((a, b) => a.hole_number - b.hole_number));
        }

        if (freePlayWritesOk && picked.id && (round.tee_id !== picked.id || round.course_id !== resolvedCourseId)) {
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
            if (!cancelled) await load({ silent: true });
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
  }, [bundle?.round, load, freePlayWritesOk]);

  useEffect(() => {
    scorecardDataPathQaLoggedRef.current = null;
    resumeHoleSeedRef.current = null;
  }, [roundId]);

  useEffect(() => {
    if (!bundle || metaHydrating) return;
    const stableKey = `${bundle.round.id}:${teeMeta?.id ?? "no-tee"}:${holeMeta.length}`;
    if (scorecardDataPathQaLoggedRef.current === stableKey) return;
    scorecardDataPathQaLoggedRef.current = stableKey;
    logFreePlayScorecardDataPathQa({ bundle, teeMeta, holeMeta, metaHydrating: false });
  }, [bundle, teeMeta, holeMeta, metaHydrating]);

  const mode: FreePlayScoringMode = bundle?.round.scoring_mode ?? "quick";
  const isCompletedRound = bundle?.round.status === "completed";

  const isRoundCreator = Boolean(userId && bundle?.round.created_by_user_id === userId);
  const editingHandicapPlayer = useMemo(
    () => bundle?.players.find((p) => p.id === editingHandicapPlayerId) ?? null,
    [bundle?.players, editingHandicapPlayerId],
  );

  const editingHandicapPreview = useMemo(() => {
    const hi = normalizeHandicapIndexInput(editingHandicapInput);
    if (hi == null) return null;
    const parFromHoles = holeMeta.reduce((sum, h) => {
      const p = Number(h.par);
      return Number.isFinite(p) && p > 0 ? sum + p : sum;
    }, 0);
    const resolvedParTotal =
      Number.isFinite(Number(teeMeta?.par_total)) && Number(teeMeta?.par_total) > 0
        ? Number(teeMeta?.par_total)
        : parFromHoles > 0
          ? parFromHoles
          : null;
    return deriveCourseAndPlayingHandicapFromHi({
      handicapIndex: hi,
      slopeRating: teeMeta?.slope_rating,
      courseRating: teeMeta?.course_rating,
      parTotal: resolvedParTotal,
    });
  }, [editingHandicapInput, teeMeta?.slope_rating, teeMeta?.course_rating, teeMeta?.par_total, holeMeta]);

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
      if (!freePlayWritesOk || !bundle?.round.id || next === mode) return;
      setSaving(true);
      setError(null);
      try {
        await setFreePlayRoundMode(bundle.round.id, next);
        await load({ silent: true });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not change mode.");
      } finally {
        setSaving(false);
      }
    },
    [bundle?.round.id, mode, load, freePlayWritesOk],
  );

  const onStartRound = useCallback(async () => {
    if (!freePlayWritesOk || !bundle?.round.id) return;
    const blockers = getFreePlayStartBlockers({ bundle, teeMeta, holeMeta });
    if (blockers.length > 0) {
      setError(blockers.join("\n"));
      return;
    }
    if (!guardPaidAction()) return;
    setSaving(true);
    setError(null);
    try {
      await startFreePlayRound(bundle.round.id);
      await load({ silent: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start round.");
    } finally {
      setSaving(false);
    }
  }, [bundle, teeMeta, holeMeta, guardPaidAction, load, freePlayWritesOk]);

  const onSaveQuick = useCallback(async () => {
    if (!freePlayWritesOk || !bundle?.round.id) return;
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
      await load({ silent: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save quick scores.");
    } finally {
      setSaving(false);
    }
  }, [bundle?.round.id, bundle?.players, quickTotals, load, isRoundCreator, scoreablePlayers, freePlayWritesOk]);

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

  const liveHoleDuplicateKeys = useMemo((): string[] => {
    if (!bundle) return [];
    return analyzeHoleScoreRowKeys(bundle.holeScores).duplicateKeys;
  }, [bundle]);

  const maxHoleNumber = useMemo(
    () => (holeNumbers.length > 0 ? Math.max(...holeNumbers) : 18),
    [holeNumbers],
  );

  const startRoundBlockers = useMemo(() => {
    if (!bundle) return [];
    return getFreePlayStartBlockers({ bundle, teeMeta, holeMeta });
  }, [bundle, teeMeta, holeMeta]);

  useEffect(() => {
    if (bundle?.round.status !== "in_progress") {
      resumeHoleSeedRef.current = null;
    }
  }, [bundle?.round.status]);

  useEffect(() => {
    if (!bundle || bundle.round.status !== "in_progress") return;
    if (holeNumbers.length === 0) return;
    if (resumeHoleSeedRef.current === bundle.round.id) return;
    const playerId = selectedPlayerId ?? bundle.players[0]?.id;
    if (!playerId) return;
    const first = findFirstIncompleteHoleNumber(holeNumbers, bundle.holeScores, playerId);
    setCurrentHole(first ?? holeNumbers[0] ?? 1);
    setResumedHoleBanner(first ?? holeNumbers[0] ?? 1);
    resumeHoleSeedRef.current = bundle.round.id;
  }, [bundle, holeNumbers, selectedPlayerId]);

  useEffect(() => {
    if (resumedHoleBanner == null) return;
    const t = setTimeout(() => setResumedHoleBanner(null), 2600);
    return () => clearTimeout(t);
  }, [resumedHoleBanner]);

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

  const currentHoleStrokeIndexDisplay = useMemo(() => {
    const row = holeMetaByNo.get(currentHole);
    if (!(Number.isFinite(Number(row?.stroke_index)) && Number(row?.stroke_index) > 0)) return null;
    return Math.round(Number(row?.stroke_index));
  }, [holeMetaByNo, currentHole]);

  const relativeToParByPlayerId = useMemo(() => {
    const out: Record<string, string> = {};
    for (const row of leaderboardRows) {
      const thruHoles = holesSnapshots.slice(0, Math.max(0, row.thru));
      const thruPar = thruHoles.reduce((sum, h) => sum + h.par, 0);
      const delta = row.netTotal == null ? null : row.netTotal - thruPar;
      out[row.roundPlayerId] = formatRelativeToPar(delta);
    }
    return out;
  }, [leaderboardRows, holesSnapshots]);

  useEffect(() => {
    return () => {
      if (holeSaveClearRef.current) clearTimeout(holeSaveClearRef.current);
      for (const t of holePersistTimersRef.current.values()) {
        clearTimeout(t);
      }
      holePersistTimersRef.current.clear();
    };
  }, []);

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

  const goPrevHole = useCallback(async () => {
    if (currentHole <= 1) return;
    triggerSelection();
    try {
      await flushThenSetHole(flushPendingDebouncedHoleScores, setCurrentHole, currentHole - 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save pending scores.");
    }
  }, [currentHole, triggerSelection, flushPendingDebouncedHoleScores]);

  const goNextHole = useCallback(async () => {
    if (currentHole >= maxHoleNumber) return;
    triggerSelection();
    try {
      await flushThenSetHole(flushPendingDebouncedHoleScores, setCurrentHole, currentHole + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save pending scores.");
    }
  }, [currentHole, maxHoleNumber, triggerSelection, flushPendingDebouncedHoleScores]);

  const holeSwipeResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderRelease: (_, g) => {
          if (g.dx <= -44) {
            void goNextHole();
          } else if (g.dx >= 44) {
            void goPrevHole();
          }
        },
      }),
    [goNextHole, goPrevHole],
  );

  const saveHoleWithFeedback = useCallback(
    (roundPlayerId: string, holeNo: number, gross: number | null, style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
      triggerImpact(style);
      const prev = bundleRef.current;
      if (prev) {
        const merged = mergeHoleGrossIntoBundle(prev, roundPlayerId, holeNo, gross);
        setBundle(merged);
        void setCache(`freeplay:round:${prev.round.id}`, merged, { ttlMs: 1000 * 60 * 30 });
      }
      scheduleDebouncedHolePersist(roundPlayerId, holeNo, gross);
    },
    [scheduleDebouncedHolePersist, triggerImpact],
  );

  const currentParForHole = useMemo(() => {
    const p = holeMetaByNo.get(currentHole)?.par;
    return Number.isFinite(Number(p)) && Number(p) > 0 ? Math.round(Number(p)) : 4;
  }, [holeMetaByNo, currentHole]);

  const onSetScoringFormat = useCallback(
    async (next: FreePlayScoringFormat) => {
      if (!freePlayWritesOk || !bundle?.round.id || next === bundle.round.scoring_format) return;
      setSaving(true);
      setError(null);
      try {
        await setFreePlayScoringFormat(bundle.round.id, next);
        await load({ silent: true });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not change format.");
      } finally {
        setSaving(false);
      }
    },
    [bundle?.round.id, bundle?.round.scoring_format, load, freePlayWritesOk],
  );

  const onCompleteRound = useCallback(async () => {
    if (!freePlayWritesOk || !bundle?.round.id) return;
    setSaving(true);
    setError(null);
    try {
      await completeFreePlayRound(bundle.round.id);
      await load({ silent: true });
      setNotice("Round marked complete.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not complete round.");
    } finally {
      setSaving(false);
    }
  }, [bundle?.round.id, load, freePlayWritesOk]);

  const onReturnToScoring = useCallback(async () => {
    if (!freePlayWritesOk || !bundle?.round.id || !isRoundCreator) return;
    setSaving(true);
    setError(null);
    try {
      await reopenFreePlayRound(bundle.round.id);
      await load({ silent: true });
      setNotice("Round reopened for scoring.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reopen round.");
    } finally {
      setSaving(false);
    }
  }, [bundle?.round.id, isRoundCreator, load, freePlayWritesOk]);

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
    const rows: { label: string; playerName: string; valueLabel: string }[] = [];
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
      if (!freePlayWritesOk || !bundle?.round.id) return;
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
        await load({ silent: true });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not add player.");
      } finally {
        setSaving(false);
      }
    },
    [
      bundle?.round.id,
      bundle?.round.tee_id,
      newGuestName,
      newInviteEmail,
      newGuestHandicap,
      load,
      teeMeta?.slope_rating,
      teeMeta?.course_rating,
      metaParTotals.totalPar,
      freePlayWritesOk,
    ],
  );

  const addMemberPlayer = useCallback(
    async (m: MemberDoc) => {
      if (!freePlayWritesOk || !bundle?.round.id) return;
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
        await load({ silent: true });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not add member.");
      } finally {
        setSaving(false);
      }
    },
    [
      bundle?.round.id,
      bundle?.round.tee_id,
      load,
      teeMeta?.slope_rating,
      teeMeta?.course_rating,
      metaParTotals.totalPar,
      freePlayWritesOk,
    ],
  );

  const saveAllHandicaps = useCallback(async () => {
    if (!freePlayWritesOk || !bundle) return;
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
      await load({ silent: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save handicaps.");
    } finally {
      setSaving(false);
    }
  }, [bundle, handicapDraft, load, teeMeta?.slope_rating, teeMeta?.course_rating, metaParTotals.totalPar, freePlayWritesOk]);

  const openHandicapEditor = useCallback((playerId: string) => {
    const player = bundle?.players.find((p) => p.id === playerId);
    if (!player) return;
    setEditingHandicapPlayerId(playerId);
    setEditingHandicapInput(String(player.handicap_index ?? 0));
  }, [bundle?.players]);

  const saveEditedHandicap = useCallback(async () => {
    if (!freePlayWritesOk || !editingHandicapPlayer) return;
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
        await load({ silent: true });
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
    freePlayWritesOk,
  ]);

  const removePlayerInRound = useCallback((playerId: string) => {
    if (!freePlayWritesOk || !bundle || !isRoundCreator) return;
    const p = bundle.players.find((x) => x.id === playerId);
    if (!p || p.is_owner) return;
    const doRemove = async () => {
      setSaving(true);
      setError(null);
      try {
        await removeFreePlayRoundPlayer(bundle.round.id, playerId);
        setNotice(`${p.display_name} removed from round.`);
        await load({ silent: true });
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
  }, [bundle, isRoundCreator, load, freePlayWritesOk]);

  const onDeleteRound = useCallback(() => {
    if (!freePlayWritesOk || !bundle?.round.id || !isRoundCreator) return;
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
  }, [bundle?.round.id, isRoundCreator, router, freePlayWritesOk]);

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

  if (loading && !bundle) {
    return (
      <Screen>
        <LoadingState message="Loading round…" />
      </Screen>
    );
  }

  if (!bundle) {
    return (
      <Screen>
        {error ? (
          <RetryErrorBlock
            title="Could not load round"
            message={error}
            onRetry={() => void load({ silent: false })}
            retrying={loading || roundRefetching}
          />
        ) : (
          <EmptyState title="Round not found" message="This free-play round is unavailable." />
        )}
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
        {roundRefreshError ? (
          <RetryErrorBlock
            title="Could not refresh round"
            message={roundRefreshError}
            onRetry={() => void load({ silent: true })}
            retrying={roundRefetching}
            staleHint="Your scores on this screen are unchanged. Try again when the connection improves."
            style={{ marginTop: spacing.sm }}
          />
        ) : null}
        {error ? <InlineNotice variant="error" message={error} style={{ marginTop: spacing.sm }} /> : null}
        {notice ? <InlineNotice variant="success" message={notice} style={{ marginTop: spacing.sm }} /> : null}
        {saving && bundle.round.status === "in_progress" ? (
          <InlineNotice variant="info" message="Saving scores…" style={{ marginTop: spacing.sm }} />
        ) : null}
        {metaHydrating ? (
          <InlineNotice
            variant="info"
            message="Loading tee and hole metadata for this course..."
            style={{ marginTop: spacing.sm }}
          />
        ) : null}
        {fpSchemaStatus === "missing" ? (
          <InlineNotice
            variant="error"
            message={FREE_PLAY_SETUP_REQUIRED_MESSAGE}
            detail={FREE_PLAY_SETUP_REQUIRED_DETAIL}
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
                  onPress={freePlayWritesOk ? () => void onSetScoringFormat(f) : undefined}
                  disabled={!freePlayWritesOk}
                  style={[
                    styles.modeChip,
                    {
                      borderColor: bundle.round.scoring_format === f ? colors.primary : colors.borderLight,
                      backgroundColor: bundle.round.scoring_format === f ? `${colors.primary}14` : colors.surface,
                      opacity: freePlayWritesOk ? 1 : 0.5,
                    },
                  ]}
                >
                  <AppText variant="captionBold" color={bundle.round.scoring_format === f ? "primary" : "secondary"}>
                    {f === "stableford" ? "Stableford" : "Stroke (net)"}
                  </AppText>
                </Pressable>
              ))}
            </View>
            {startRoundBlockers.length > 0 ? (
              <InlineNotice
                variant="warning"
                message={startRoundBlockers.join(" ")}
                style={{ marginTop: spacing.sm }}
              />
            ) : null}
            <PrimaryButton
              label="Start round"
              onPress={() => void onStartRound()}
              loading={saving}
              disabled={!freePlayWritesOk || startRoundBlockers.length > 0 || metaHydrating}
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
              disabled={!freePlayWritesOk}
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
              <FreePlayIncompleteRoundNotice
                canReturnToScoring={isRoundCreator && freePlayWritesOk}
                onReturnToScoring={() => void onReturnToScoring()}
              />
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
                {isRoundCreator ? (
                  <SecondaryButton label="Delete round" onPress={onDeleteRound} disabled={!freePlayWritesOk} />
                ) : null}
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
                editable={freePlayWritesOk}
                style={{ width: 86 }}
              />
            </View>
          ))}
          <PrimaryButton
            label="Save handicaps"
            size="sm"
            onPress={() => void saveAllHandicaps()}
            loading={saving}
            disabled={!freePlayWritesOk}
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
                <SecondaryButton
                  label="Add guest"
                  size="sm"
                  onPress={() => void addQuickPlayer("guest")}
                  disabled={!freePlayWritesOk}
                />
                <PrimaryButton
                  label="Add app user"
                  size="sm"
                  onPress={() => void addQuickPlayer("app_user")}
                  disabled={!freePlayWritesOk}
                />
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
                    onPress={freePlayWritesOk ? () => void onSetScoringFormat(f) : undefined}
                    disabled={!freePlayWritesOk}
                    style={[
                      styles.modeChip,
                      {
                        borderColor: bundle.round.scoring_format === f ? colors.primary : colors.borderLight,
                        backgroundColor: bundle.round.scoring_format === f ? `${colors.primary}14` : colors.surface,
                        opacity: freePlayWritesOk ? 1 : 0.5,
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
                onPress={freePlayWritesOk ? () => void onSwitchMode(m) : undefined}
                disabled={!freePlayWritesOk}
                style={[
                  styles.modeChip,
                  {
                    borderColor: mode === m ? colors.primary : colors.borderLight,
                    backgroundColor: mode === m ? `${colors.primary}14` : colors.surface,
                    opacity: freePlayWritesOk ? 1 : 0.5,
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
                    editable={freePlayWritesOk}
                    style={{ width: 90 }}
                  />
                </View>
              ))}
              <PrimaryButton
                label="Save quick scores"
                onPress={onSaveQuick}
                loading={saving}
                disabled={!freePlayWritesOk}
              />
            </>
          ) : !showPremiumHoleDashboard ? (
            <InlineNotice
              variant="info"
              message="Start the round to use the premium one-hole score entry."
              style={{ marginTop: spacing.sm }}
            />
          ) : null}
        </AppCard>
          </>
        )}
          </>
        ) : null}
        </View>

        {showPremiumHoleDashboard ? (
          <>
            <View style={{ paddingHorizontal: spacing.base, paddingTop: spacing.md }}>
              {roundRefreshError ? (
                <RetryErrorBlock
                  title="Could not refresh round"
                  message={roundRefreshError}
                  onRetry={() => void load({ silent: true })}
                  retrying={roundRefetching}
                  staleHint="Your scores on this screen are unchanged. Try again when the connection improves."
                  style={{ marginBottom: spacing.sm }}
                />
              ) : null}
              {error ? <InlineNotice variant="error" message={error} style={{ marginBottom: spacing.sm }} /> : null}
              {notice ? <InlineNotice variant="success" message={notice} style={{ marginBottom: spacing.sm }} /> : null}
              {holeSaveUi?.phase === "saving" ? (
                <InlineNotice variant="info" message="Saving hole score…" style={{ marginBottom: spacing.sm }} />
              ) : saving && bundle.round.status === "in_progress" ? (
                <InlineNotice variant="info" message="Saving…" style={{ marginBottom: spacing.sm }} />
              ) : null}
              {fpSchemaStatus === "missing" ? (
                <InlineNotice
                  variant="error"
                  message={FREE_PLAY_SETUP_REQUIRED_MESSAGE}
                  detail={FREE_PLAY_SETUP_REQUIRED_DETAIL}
                  style={{ marginBottom: spacing.sm }}
                />
              ) : null}
              {scoreablePlayers.length === 0 ? (
                <FreePlayScorecardEmptyState />
              ) : (
                <Animated.View
                  {...holeSwipeResponder.panHandlers}
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
                  <FreePlayScoringHeader
                    holeNumber={currentHole}
                    maxHoleNumber={maxHoleNumber}
                    par={currentParForHole}
                    strokeIndex={currentHoleStrokeIndexDisplay ?? null}
                    yardageLabel={formatDistance(holeMetaByNo.get(currentHole)?.yardage)}
                    onPrev={() => void goPrevHole()}
                    onNext={() => void goNextHole()}
                    canPrev={currentHole > 1}
                    canNext={currentHole < maxHoleNumber}
                    saveState={
                      holeSaveUi?.phase === "failed"
                        ? "failed"
                        : holeSaveUi?.phase === "saving"
                          ? "saving"
                          : "saved"
                    }
                    resumedHole={resumedHoleBanner}
                  />
                  {scoreablePlayers.map((p) => {
                    const holeScoreRow = bundle.holeScores.find(
                      (h) => h.round_player_id === p.id && h.hole_number === currentHole,
                    );
                    const gross = holeScoreRow?.gross_strokes ?? null;
                    const par = currentParForHole;
                    const grossDisplay = gross == null || !Number.isFinite(gross) ? "-" : String(Math.round(gross));
                    const canEdit = isRoundCreator || ownRoundPlayerIds.includes(p.id);
                    const scoresLocked = bundle.round.status === "completed";
                    const disabled = scoresLocked || !canEdit || !freePlayWritesOk;
                    const phValue =
                      p.playing_handicap != null && Number.isFinite(Number(p.playing_handicap))
                        ? Number(p.playing_handicap)
                        : intPlayingHandicap(p.playing_handicap, p.handicap_index);
                    return (
                      <FreePlayPlayerScoreCard
                        key={p.id}
                        playerName={p.display_name}
                        playingHandicapLabel={phValue != null ? `PH ${Math.round(phValue)}` : null}
                        grossValue={gross}
                        grossDisplay={grossDisplay}
                        par={par}
                        showFineAdjust={gross != null && Number.isFinite(gross)}
                        disabled={disabled}
                        onCycleScore={() => {
                          const next = cycleGrossForSimpleMode(gross, par);
                          saveHoleWithFeedback(p.id, currentHole, next, Haptics.ImpactFeedbackStyle.Light);
                        }}
                        onDecrement={() => {
                          const next = nextGrossOnDecrement(gross, par);
                          saveHoleWithFeedback(p.id, currentHole, next, Haptics.ImpactFeedbackStyle.Medium);
                        }}
                        onIncrement={() => {
                          const next = nextGrossOnIncrement(gross, par);
                          saveHoleWithFeedback(p.id, currentHole, next);
                        }}
                        onCommitTypedGross={(n) =>
                          saveHoleWithFeedback(p.id, currentHole, n, Haptics.ImpactFeedbackStyle.Medium)
                        }
                      />
                    );
                  })}
                  {currentHole < maxHoleNumber ? (
                    <PrimaryButton
                      label="Next Hole"
                      onPress={() => void goNextHole()}
                      disabled={!freePlayWritesOk}
                      style={{ marginTop: spacing.sm }}
                    />
                  ) : null}
                  <View style={[styles.inlineRow, { marginTop: spacing.sm }]}>
                    <SecondaryButton label="View leaderboard" size="sm" onPress={() => setLeaderboardOpen(true)} />
                    <SecondaryButton
                      label={miniLeaderboardOpen ? "Hide mini leaderboard" : "Show mini leaderboard"}
                      size="sm"
                      onPress={() => setMiniLeaderboardOpen((v) => !v)}
                    />
                  </View>
                  {miniLeaderboardOpen ? (
                    <View style={{ marginTop: spacing.sm }}>
                      <FreePlayMiniLeaderboard
                        format={bundle.round.scoring_format === "stableford" ? "stableford" : "stroke_net"}
                        rows={leaderboardRows}
                        expectedHoles={maxHoleNumber}
                        onPressOpen={() => setLeaderboardOpen(true)}
                        relativeToParByPlayerId={relativeToParByPlayerId}
                      />
                    </View>
                  ) : null}
                  {currentHole >= maxHoleNumber &&
                  bundle.round.status === "in_progress" &&
                  isRoundCreator ? (
                    <PrimaryButton
                      label="Finish round"
                      onPress={() => void onCompleteRound()}
                      loading={saving}
                      disabled={!freePlayWritesOk}
                      style={{ marginTop: spacing.md }}
                    />
                  ) : currentHole >= maxHoleNumber && bundle.round.status === "in_progress" && !isRoundCreator ? (
                    <AppText variant="caption" color="tertiary" style={{ marginTop: spacing.sm }}>
                      Ask the round owner to mark the round complete when you are finished.
                    </AppText>
                  ) : null}
                </Animated.View>
              )}

              <View style={[styles.inlineRow, { marginTop: spacing.lg }]}>
                <SecondaryButton label="Refresh" onPress={() => void load({ silent: true })} />
                {isRoundCreator ? (
                  <SecondaryButton label="Delete round" onPress={onDeleteRound} disabled={!freePlayWritesOk} />
                ) : null}
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
              <SecondaryButton label="Refresh" onPress={() => void load({ silent: true })} />
              {isRoundCreator ? (
                <SecondaryButton label="Delete round" onPress={onDeleteRound} disabled={!freePlayWritesOk} />
              ) : null}
            </View>
            <SecondaryButton
              label="Back to free-play rounds"
              onPress={() => router.push("/(app)/free-play" as never)}
              style={{ marginTop: spacing.sm }}
            />
          </>
        ) : null}

        {bundle && liveHoleDuplicateKeys.length > 0 ? (
          <InlineNotice
            variant="error"
            message="Multiple hole score rows share the same player and hole. Totals may be wrong until this is fixed in the database."
            detail={`Duplicate keys: ${liveHoleDuplicateKeys.slice(0, 8).join(", ")}${liveHoleDuplicateKeys.length > 8 ? "…" : ""}`}
            style={{ marginTop: spacing.md, marginHorizontal: spacing.base }}
          />
        ) : null}

        {__DEV__ && bundle ? (
          <AppCard style={{ marginTop: spacing.md, marginHorizontal: spacing.base, marginBottom: spacing.lg }}>
            <AppText variant="captionBold">DEV · persistence</AppText>
            <AppText variant="small" color="secondary" style={{ marginTop: spacing.xs }}>
              {`Round ${bundle.round.id.slice(0, 8)}… · status ${bundle.round.status}`}
            </AppText>
            <AppText variant="small" color="secondary" style={{ marginTop: spacing.xs }}>
              {`Server reloads (getFreePlayRoundBundle): ${devFpPersistHud?.reloadCount ?? 0} · last ${devFpPersistHud?.lastReloadIso ?? "—"}`}
            </AppText>
            <AppText variant="small" color="secondary" style={{ marginTop: spacing.xs }}>
              {`Hole score rows (bundle): ${bundle.holeScores.length} · last server count: ${devFpPersistHud?.serverHoleRows ?? "—"}`}
            </AppText>
            <AppText variant="small" color="secondary" style={{ marginTop: spacing.xs }}>
              {`Rows per round_player_id: ${JSON.stringify(devFpPersistHud?.rowCountByRoundPlayerId ?? {})}`}
            </AppText>
            <AppText variant="small" color="secondary" style={{ marginTop: spacing.xs }}>
              {`Pending debounce timers: ${holePersistTimersRef.current.size} · latest-value keys: ${holePersistLatestRef.current.size} · activityTick: ${devPersistActivity}`}
            </AppText>
            <AppText variant="small" color="secondary" style={{ marginTop: spacing.xs }}>
              {`Last hole save UI: ${holeSaveUi ? `${holeSaveUi.phase} p=${holeSaveUi.playerId.slice(0, 6)}… h=${holeSaveUi.hole}` : "—"}`}
            </AppText>
            <AppText variant="small" color="secondary" style={{ marginTop: spacing.xs }}>
              {`Resume seed (round id or null): ${resumeHoleSeedRef.current ?? "null"}`}
            </AppText>
            <AppText variant="small" color="secondary" style={{ marginTop: spacing.xs }}>
              {roundRefreshError ? `Refresh error: ${roundRefreshError}` : "Refresh error: —"}
            </AppText>
            {devFpPersistHud?.duplicateHoleKeys?.length ? (
              <AppText variant="small" color="secondary" style={{ marginTop: spacing.xs }}>
                {`Dup keys at last load: ${devFpPersistHud.duplicateHoleKeys.join(", ")}`}
              </AppText>
            ) : null}
          </AppCard>
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
              editable={freePlayWritesOk}
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
              disabled={!freePlayWritesOk}
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
