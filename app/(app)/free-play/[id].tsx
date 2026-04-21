import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Share, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Linking from "expo-linking";
import * as Clipboard from "expo-clipboard";
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
  getCourseMetaById,
  getCourseTeeById,
  getHolesByTeeId,
  getTeesByCourseId,
  type CourseHoleRow,
  type CourseTee,
} from "@/lib/db_supabase/courseRepo";
import { calculateCourseHandicap } from "@/lib/scoring/handicap";
import { importCourseFromApiId } from "@/lib/importCourse";
import {
  addFreePlayRoundPlayer,
  getFreePlayRoundBundle,
  replaceHoleScores,
  saveQuickTotals,
  setFreePlayRoundMode,
  startFreePlayRound,
  updateFreePlayRoundTee,
  updateFreePlayPlayerHandicap,
} from "@/lib/db_supabase/freePlayScorecardRepo";
import { getMembersBySocietyId, type MemberDoc } from "@/lib/db_supabase/memberRepo";
import type { FreePlayRoundBundle, FreePlayScoringMode } from "@/types/freePlayScorecard";

export default function FreePlayRoundDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string | string[]; created?: string | string[]; openAdd?: string | string[] }>();
  const roundId = Array.isArray(params.id) ? params.id[0] : params.id;
  const createdFlag = Array.isArray(params.created) ? params.created[0] : params.created;
  const openAddFlag = Array.isArray(params.openAdd) ? params.openAdd[0] : params.openAdd;
  const colors = getColors();
  const { societyId } = useBootstrap();
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
      const firstPlayerId = payload.players[0]?.id ?? null;
      setSelectedPlayerId(firstPlayerId);
      if (firstPlayerId) {
        const holes = payload.holeScores.filter((h) => h.round_player_id === firstPlayerId);
        const map: Record<number, string> = {};
        for (const h of holes) map[h.hole_number] = String(h.gross_strokes);
        setHoleInputs(map);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load round.");
    } finally {
      setLoading(false);
    }
  }, [roundId]);

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
        const tees = await getTeesByCourseId(courseId);
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

        // Persist picked tee on round so future loads hydrate immediately.
        if (picked.id && round.tee_id !== picked.id) {
          try {
            await updateFreePlayRoundTee(round.id, picked.id, picked.tee_name);
            if (!cancelled) setNotice("Loaded tee metadata for this round.");
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
  const playerForHoles = useMemo(
    () => bundle?.players.find((p) => p.id === selectedPlayerId) ?? null,
    [bundle?.players, selectedPlayerId],
  );

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
      await saveQuickTotals(
        bundle.round.id,
        bundle.players.map((p) => ({
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
  }, [bundle?.round.id, bundle?.players, quickTotals, load]);

  const onSaveHoles = useCallback(async () => {
    if (!bundle?.round.id || !selectedPlayerId) return;
    setSaving(true);
    setError(null);
    try {
      const rows = Object.entries(holeInputs)
        .filter(([, v]) => v.trim().length > 0)
        .map(([hole, v]) => ({
          holeNumber: Number(hole),
          grossStrokes: Number(v),
        }));
      await replaceHoleScores(bundle.round.id, selectedPlayerId, rows);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save hole scores.");
    } finally {
      setSaving(false);
    }
  }, [bundle?.round.id, selectedPlayerId, holeInputs, load]);

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
        await addFreePlayRoundPlayer(bundle.round.id, {
          playerType: kind,
          displayName: display,
          inviteEmail: kind === "app_user" ? (newInviteEmail.trim() || null) : null,
          handicapIndex: Number.isFinite(Number(newGuestHandicap)) ? Number(newGuestHandicap) : 0,
          inviteStatus: kind === "app_user" && newInviteEmail.trim() ? "invited" : "none",
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
    [bundle?.round.id, newGuestName, newInviteEmail, newGuestHandicap, load],
  );

  const addMemberPlayer = useCallback(
    async (m: MemberDoc) => {
      if (!bundle?.round.id) return;
      setSaving(true);
      setError(null);
      try {
        await addFreePlayRoundPlayer(bundle.round.id, {
          playerType: "member",
          displayName: String(m.displayName || m.name || "Member"),
          memberId: m.id,
          userId: m.user_id ?? null,
          handicapIndex: Number.isFinite(Number(m.handicapIndex ?? m.handicap_index))
            ? Number(m.handicapIndex ?? m.handicap_index)
            : 0,
          inviteStatus: m.user_id ? "joined" : "none",
        });
        setNotice("Member added to round.");
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not add member.");
      } finally {
        setSaving(false);
      }
    },
    [bundle?.round.id, load],
  );

  const saveAllHandicaps = useCallback(async () => {
    if (!bundle) return;
    setSaving(true);
    setError(null);
    try {
      const ops = bundle.players
        .filter((p) => Number.isFinite(Number(handicapDraft[p.id])))
        .map((p) => updateFreePlayPlayerHandicap(p.id, Number(handicapDraft[p.id])));
      await Promise.all(ops);
      setNotice("Handicaps updated.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save handicaps.");
    } finally {
      setSaving(false);
    }
  }, [bundle, handicapDraft, load]);

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
      const hi = Number(hiRaw);
      if (!Number.isFinite(hi)) return "HI —";
      const slope = teeMeta?.slope_rating;
      const courseRating = teeMeta?.course_rating;
      const par = metaParTotals.totalPar;
      if (
        Number.isFinite(Number(slope)) &&
        Number(slope) > 0 &&
        Number.isFinite(Number(courseRating)) &&
        Number.isFinite(Number(par))
      ) {
        try {
          const ch = calculateCourseHandicap(hi, Number(slope), Number(courseRating), Number(par));
          return `HI ${hi.toFixed(1)} · CH ${ch}`;
        } catch {
          return `HI ${hi.toFixed(1)}`;
        }
      }
      return `HI ${hi.toFixed(1)}`;
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
    <Screen style={{ backgroundColor: colors.backgroundSecondary }}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
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
            <PrimaryButton
              label="Start round"
              onPress={onStartRound}
              loading={saving}
              style={{ marginTop: spacing.sm }}
            />
          </AppCard>
        ) : null}

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

        {bundle.round.status !== "completed" ? (
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
        ) : null}

        <AppCard style={styles.card}>
          <AppText variant="captionBold" color="muted">
            Scoring
          </AppText>
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
              <View style={styles.modeRow}>
                {bundle.players.map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => {
                      setSelectedPlayerId(p.id);
                      const map: Record<number, string> = {};
                      for (const h of bundle.holeScores.filter((x) => x.round_player_id === p.id)) {
                        map[h.hole_number] = String(h.gross_strokes);
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
                Enter gross strokes for {playerForHoles?.display_name || "selected player"}.
              </AppText>
              <View style={[styles.holeSummaryCard, { borderColor: colors.borderLight }]}>
                <View style={styles.holeSummaryRow}>
                  <AppText variant="captionBold" color="muted">Segment</AppText>
                  <AppText variant="captionBold" color="muted">Par</AppText>
                  <AppText variant="captionBold" color="muted">Dist</AppText>
                  <AppText variant="captionBold" color="muted">Score</AppText>
                </View>
                <View style={styles.holeSummaryRow}>
                  <AppText variant="caption" color="secondary">OUT</AppText>
                  <AppText variant="caption" color="secondary">{metaParTotals.outPar ?? "—"}</AppText>
                  <AppText variant="caption" color="secondary">{formatDistance(metaDistanceTotals.outYards) ?? "—"}</AppText>
                  <AppText variant="caption" color="secondary">{formatScore(selectedScoreTotals.out)}</AppText>
                </View>
                <View style={styles.holeSummaryRow}>
                  <AppText variant="caption" color="secondary">IN</AppText>
                  <AppText variant="caption" color="secondary">{metaParTotals.inPar ?? "—"}</AppText>
                  <AppText variant="caption" color="secondary">{formatDistance(metaDistanceTotals.inYards) ?? "—"}</AppText>
                  <AppText variant="caption" color="secondary">{formatScore(selectedScoreTotals.inn)}</AppText>
                </View>
                <View style={styles.holeSummaryRow}>
                  <AppText variant="captionBold" color="primary">TOTAL</AppText>
                  <AppText variant="captionBold" color="primary">{metaParTotals.totalPar ?? "—"}</AppText>
                  <AppText variant="captionBold" color="primary">{formatDistance(metaDistanceTotals.totalYards) ?? "—"}</AppText>
                  <AppText variant="captionBold" color="primary">{formatScore(selectedScoreTotals.total)}</AppText>
                </View>
              </View>
              <View style={styles.holeGrid}>
                {holeNumbers.map((hole) => (
                  <View key={hole} style={styles.holeCell}>
                    <AppText variant="captionBold" color="muted">
                      H{hole}
                    </AppText>
                    <AppText variant="caption" color="secondary">
                      Par {holeMetaByNo.get(hole)?.par ?? "—"}
                    </AppText>
                    <AppText variant="caption" color="secondary">
                      SI {holeMetaByNo.get(hole)?.stroke_index ?? "—"}
                    </AppText>
                    <AppText variant="caption" color="secondary">
                      {formatDistance(holeMetaByNo.get(hole)?.yardage) ?? "—"}
                    </AppText>
                    <AppInput
                      value={holeInputs[hole] ?? ""}
                      onChangeText={(v) => setHoleInputs((prev) => ({ ...prev, [hole]: v }))}
                      keyboardType="number-pad"
                      style={{ marginTop: spacing.xs }}
                    />
                  </View>
                ))}
              </View>
              <PrimaryButton label="Save hole scores" onPress={onSaveHoles} loading={saving} />
            </>
          )}
        </AppCard>

        <View style={styles.inlineRow}>
          <SecondaryButton label="Add players" onPress={() => setShowMemberPicker(true)} />
          <SecondaryButton label="Refresh" onPress={() => void load()} />
        </View>
        <SecondaryButton
          label="Back to free-play rounds"
          onPress={() => router.push("/(app)/free-play" as never)}
          style={{ marginTop: spacing.sm }}
        />
      </ScrollView>
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
});
