import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";

import { Screen } from "@/components/ui/Screen";
import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { AppInput } from "@/components/ui/AppInput";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { LicenceRequiredModal } from "@/components/LicenceRequiredModal";
import { useBootstrap } from "@/lib/useBootstrap";
import { usePaidAccess } from "@/lib/access/usePaidAccess";
import { getColors, radius, spacing } from "@/lib/ui/theme";
import { getMembersBySocietyId, type MemberDoc } from "@/lib/db_supabase/memberRepo";
import {
  approveCourseForSociety,
  getCourseApprovalState,
  getHolesByTeeId,
  getTeesByCourseId,
  searchVerifiedCourses,
  submitCourseDataReview,
  type CourseHoleRow,
  type CourseSearchHit,
  type CourseTee,
} from "@/lib/db_supabase/courseRepo";
import type { CourseApprovalState } from "@/types/courseTrust";
import { isManCo } from "@/lib/rbac";
import { deriveFreePlayTrustLabel, getFreePlayTrustCopy } from "@/lib/course/freePlayTrustPresentation";
import { calculateCourseHandicap } from "@/lib/scoring/handicap";
import { deriveFreePlayDataTrustBadge } from "@/components/free-play/freePlaySetupTrust";
import {
  createFreePlayRound,
  joinFreePlayRoundByCode,
  listMyActiveFreePlayRounds,
  listMyFreePlayRounds,
} from "@/lib/db_supabase/freePlayScorecardRepo";
import type { FreePlayRound, FreePlayScoringFormat, FreePlayScoringMode } from "@/types/freePlayScorecard";
import { FreePlaySetupStepper, type FreePlaySetupStep } from "@/components/free-play/FreePlaySetupStepper";
import { FreePlayStartHero } from "@/components/free-play/FreePlayStartHero";
import { FreePlayCourseSelectCard } from "@/components/free-play/FreePlayCourseSelectCard";
import { FreePlayTeeSelectCard } from "@/components/free-play/FreePlayTeeSelectCard";
import {
  FreePlayPlayerSetupCard,
  type FreePlaySetupPlayerKind,
} from "@/components/free-play/FreePlayPlayerSetupCard";
import { FreePlayHandicapReviewCard, type FreePlayHandicapReviewRow } from "@/components/free-play/FreePlayHandicapReviewCard";
import { FreePlayDataQualityNotice } from "@/components/free-play/FreePlayDataQualityNotice";

type ContribHoleRow = { id: string; holeNumber: string; par: string; strokeIndex: string; yards: string };

type DraftPlayer = {
  id: string;
  kind: "member" | "app_user" | "guest";
  displayName: string;
  inviteEmail: string;
  handicapIndex: string;
  /** Baseline HI when the row was added — used for Calculated vs Manual in review. */
  baselineHandicapIndex: string;
  memberId?: string | null;
  userId?: string | null;
};

export default function FreePlayHomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ join?: string | string[]; joinCode?: string | string[] }>();
  const colors = getColors();
  const { societyId, member, userId } = useBootstrap();
  const { needsLicence, guardPaidAction, modalVisible, setModalVisible, societyId: guardSocietyId } = usePaidAccess();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rounds, setRounds] = useState<FreePlayRound[]>([]);
  const [activeRounds, setActiveRounds] = useState<FreePlayRound[]>([]);
  const [members, setMembers] = useState<MemberDoc[]>([]);

  const [joinCode, setJoinCode] = useState("");
  const [courseQuery, setCourseQuery] = useState("");
  const [courseHits, setCourseHits] = useState<CourseSearchHit[]>([]);
  /** True when results are from broad name search (verified filter failed or no verified rows). */
  const [courseSearchBroadened, setCourseSearchBroadened] = useState(false);
  const courseQueryRef = useRef(courseQuery);
  courseQueryRef.current = courseQuery;
  const [selectedCourse, setSelectedCourse] = useState<CourseSearchHit | null>(null);
  const [tees, setTees] = useState<CourseTee[]>([]);
  const [selectedTeeId, setSelectedTeeId] = useState<string | null>(null);
  const [scoringMode, setScoringMode] = useState<FreePlayScoringMode>("hole_by_hole");
  const [scoringFormat, setScoringFormat] = useState<FreePlayScoringFormat>("stroke_net");
  const [draftPlayers, setDraftPlayers] = useState<DraftPlayer[]>([]);
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [courseTrust, setCourseTrust] = useState<CourseApprovalState | null>(null);
  const [showContributeModal, setShowContributeModal] = useState(false);
  const [contribTeeName, setContribTeeName] = useState("");
  const [contribParTotal, setContribParTotal] = useState("");
  const [contribCourseRating, setContribCourseRating] = useState("");
  const [contribSlope, setContribSlope] = useState("");
  const [contribHolesNotes, setContribHolesNotes] = useState("");
  const [contribHoles, setContribHoles] = useState<ContribHoleRow[]>([]);
  const [trustActionNotice, setTrustActionNotice] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const [newRoundSectionY, setNewRoundSectionY] = useState(280);
  const [setupHoles, setSetupHoles] = useState<CourseHoleRow[]>([]);

  const ownerName = String(member?.displayName || member?.name || "You");
  const ownerHcp = member?.handicapIndex ?? member?.handicap_index ?? 0;

  const joinPrefill = useMemo(() => {
    const raw = params.join;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [params.join]);
  const joinCodePrefill = useMemo(() => {
    const raw = params.joinCode;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [params.joinCode]);

  const selectedTrust = useMemo(() => {
    if (!selectedCourse) return null;
    if (!courseTrust) return { loading: true as const };
    const label = deriveFreePlayTrustLabel({
      globalStatus: courseTrust.globalStatus,
      societyApproved: courseTrust.societyApproved,
      pendingSubmission: courseTrust.pendingSubmission,
    });
    return { loading: false as const, label, copy: getFreePlayTrustCopy(label) };
  }, [selectedCourse, courseTrust]);

  const selectedTrustLabelForCard = useMemo(() => {
    if (!selectedCourse) return null;
    if (selectedTrust && !selectedTrust.loading) return selectedTrust.label;
    return deriveFreePlayTrustLabel({
      globalStatus: selectedCourse.golfer_data_status ?? null,
      societyApproved: Boolean(selectedCourse.societyApprovedForSociety),
      pendingSubmission: Boolean(selectedCourse.pendingCourseDataReview),
    });
  }, [selectedCourse, selectedTrust]);

  const setupStrokeIndexIncomplete = useMemo(() => {
    if (!selectedTeeId || setupHoles.length === 0) return false;
    return setupHoles.some((h) => !(Number.isFinite(Number(h.stroke_index)) && Number(h.stroke_index) > 0));
  }, [selectedTeeId, setupHoles]);

  const selectedTeeForSetup = useMemo(
    () => (selectedTeeId ? tees.find((t) => t.id === selectedTeeId) ?? null : null),
    [tees, selectedTeeId],
  );

  const canCourseHandicapForSetup = useMemo(() => {
    const t = selectedTeeForSetup;
    if (!t) return false;
    const slope = t.slope_rating;
    const cr = t.course_rating;
    const par = t.par_total;
    return (
      Number.isFinite(Number(slope)) &&
      Number(slope) > 0 &&
      Number.isFinite(Number(cr)) &&
      Number.isFinite(Number(par)) &&
      Number(par) > 0
    );
  }, [selectedTeeForSetup]);

  const teeNameForPlayers = useMemo(() => {
    if (tees.length === 0) return "General";
    return selectedTeeForSetup?.tee_name ?? null;
  }, [tees.length, selectedTeeForSetup?.tee_name]);

  const handicapReviewRows = useMemo((): FreePlayHandicapReviewRow[] => {
    const rows: FreePlayHandicapReviewRow[] = [];
    const t = selectedTeeForSetup;
    const pushRow = (id: string, name: string, hiRaw: number, source: "calculated" | "manual") => {
      const hi = Number.isFinite(Number(hiRaw)) ? Number(hiRaw) : 0;
      let ch: number | null = null;
      if (canCourseHandicapForSetup && t) {
        try {
          ch = calculateCourseHandicap(hi, Number(t.slope_rating), Number(t.course_rating), Number(t.par_total));
        } catch {
          ch = null;
        }
      }
      const ph = ch != null ? ch : Math.round(hi);
      rows.push({ id, name, hi, ch, ph, source });
    };
    pushRow("owner", ownerName, Number(ownerHcp) || 0, "calculated");
    for (const p of draftPlayers) {
      if (!(p.displayName.trim().length > 0 || p.memberId)) continue;
      const hiNum = Number.isFinite(Number(p.handicapIndex)) ? Number(p.handicapIndex) : 0;
      const manual = p.handicapIndex.trim() !== p.baselineHandicapIndex.trim();
      pushRow(
        p.id,
        p.displayName.trim() || (p.kind === "guest" ? "Guest" : "Player"),
        hiNum,
        manual ? "manual" : "calculated",
      );
    }
    return rows;
  }, [
    ownerName,
    ownerHcp,
    draftPlayers,
    selectedTeeForSetup,
    canCourseHandicapForSetup,
  ]);

  const setupDataQualityBadge = useMemo(() => {
    if (!selectedCourse || !selectedTrustLabelForCard) return null;
    return deriveFreePlayDataTrustBadge({
      trustLabel: selectedTrustLabelForCard,
      strokeIndexIncomplete: setupStrokeIndexIncomplete,
      holesUnavailable:
        Boolean(selectedTeeId) && setupHoles.length === 0 && tees.length > 0,
    });
  }, [
    selectedCourse,
    selectedTrustLabelForCard,
    setupStrokeIndexIncomplete,
    selectedTeeId,
    setupHoles.length,
    tees.length,
  ]);

  const manCoCanApproveSociety =
    Boolean(societyId && selectedCourse && member && isManCo(member)) &&
    selectedTrust &&
    !selectedTrust.loading &&
    courseTrust &&
    courseTrust.globalStatus !== "verified" &&
    !courseTrust.societyApproved;

  const courseStepComplete = !!selectedCourse;
  const teeStepComplete = !selectedCourse ? false : tees.length === 0 || !!selectedTeeId;
  /** Same gating as create (course + tee if any tees exist). */
  const readyToCreateRound = !!selectedCourse && (tees.length === 0 || !!selectedTeeId);

  const setupSteps = useMemo((): FreePlaySetupStep[] => {
    const activeCourse = !courseStepComplete;
    const activeTeeGroup = courseStepComplete && !teeStepComplete;
    const activeFinish = courseStepComplete && teeStepComplete;
    return [
      { id: "course", label: "Course", complete: courseStepComplete, active: activeCourse },
      { id: "tee", label: "Tee & group", complete: teeStepComplete, active: activeTeeGroup },
      { id: "start", label: "Start", complete: readyToCreateRound, active: activeFinish },
    ];
  }, [courseStepComplete, teeStepComplete, readyToCreateRound]);

  const resumeRoundPrimary = activeRounds[0] ?? null;
  const resumeLabel = resumeRoundPrimary
    ? `Resume · ${resumeRoundPrimary.course_name.length > 28 ? `${resumeRoundPrimary.course_name.slice(0, 28)}…` : resumeRoundPrimary.course_name}`
    : null;

  const onNewRoundLayout = useCallback((e: LayoutChangeEvent) => {
    setNewRoundSectionY(e.nativeEvent.layout.y);
  }, []);

  const scrollToNewRoundSetup = useCallback(() => {
    scrollRef.current?.scrollTo({ y: Math.max(0, newRoundSectionY - 8), animated: true });
  }, [newRoundSectionY]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [myRounds, active, memberRows] = await Promise.all([
        listMyFreePlayRounds(),
        listMyActiveFreePlayRounds(),
        societyId ? getMembersBySocietyId(societyId) : Promise.resolve([]),
      ]);
      setRounds(myRounds);
      setActiveRounds(active);
      setMembers(memberRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load free-play rounds.");
    } finally {
      setLoading(false);
    }
  }, [societyId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedCourse?.id) {
      setTees([]);
      setSelectedTeeId(null);
      return;
    }
    let cancelled = false;
    void getTeesByCourseId(selectedCourse.id)
      .then((list) => {
        if (cancelled) return;
        setTees(list);
        setSelectedTeeId(list[0]?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setTees([]);
          setSelectedTeeId(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCourse?.id]);

  useEffect(() => {
    if (!selectedCourse?.id) {
      setCourseTrust(null);
      return;
    }
    let cancelled = false;
    void getCourseApprovalState(selectedCourse.id, societyId ?? null).then((s) => {
      if (!cancelled) setCourseTrust(s);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedCourse?.id, societyId]);

  useEffect(() => {
    if (!selectedTeeId) {
      setSetupHoles([]);
      return;
    }
    let cancelled = false;
    void getHolesByTeeId(selectedTeeId)
      .then((rows) => {
        if (cancelled) return;
        setSetupHoles(rows.slice().sort((a, b) => a.hole_number - b.hole_number));
      })
      .catch(() => {
        if (!cancelled) setSetupHoles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTeeId]);

  useEffect(() => {
    const q = courseQuery.trim();
    if (q.length < 2) {
      setCourseHits([]);
      setCourseSearchBroadened(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      const requested = courseQueryRef.current.trim();
      if (requested.length < 2) return;
      void searchVerifiedCourses(requested, 20, {
        expandWhenEmpty: true,
        societyIdForTrust: societyId ?? null,
      }).then((res) => {
        if (cancelled) return;
        if (courseQueryRef.current.trim() !== requested) return;
        setCourseHits(res.data ?? []);
        setCourseSearchBroadened(res.includedUnverifiedFallback === true);
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [courseQuery, societyId]);

  useEffect(() => {
    if (joinPrefill === "1") {
      setShowMemberPicker(false);
    }
  }, [joinPrefill]);

  useEffect(() => {
    if (!joinCodePrefill?.trim()) return;
    setJoinCode(joinCodePrefill.trim().toUpperCase());
  }, [joinCodePrefill]);

  const addDraftPlayer = useCallback((kind: DraftPlayer["kind"]) => {
    const id = `${kind}-${Date.now()}-${Math.round(Math.random() * 1e4)}`;
    setDraftPlayers((prev) => [
      ...prev,
      {
        id,
        kind,
        displayName: "",
        inviteEmail: "",
        handicapIndex: "0",
        baselineHandicapIndex: "0",
      },
    ]);
  }, []);

  const addMemberPlayer = useCallback(
    (m: MemberDoc) => {
      const exists = draftPlayers.some((p) => p.memberId && p.memberId === m.id);
      if (exists) return;
      const h = m.handicapIndex ?? m.handicap_index ?? 0;
      const hiStr = String(Number.isFinite(Number(h)) ? Number(h) : 0);
      setDraftPlayers((prev) => [
        ...prev,
        {
          id: `member-${m.id}`,
          kind: "member",
          displayName: String(m.displayName || m.name || "Member"),
          inviteEmail: "",
          handicapIndex: hiStr,
          baselineHandicapIndex: hiStr,
          memberId: m.id,
          userId: m.user_id ?? null,
        },
      ]);
    },
    [draftPlayers],
  );

  const removeDraftPlayer = useCallback((id: string) => {
    setDraftPlayers((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const updateDraftPlayer = useCallback((id: string, patch: Partial<DraftPlayer>) => {
    setDraftPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  const handleCreate = useCallback(async () => {
    if (!guardPaidAction()) return;
    if (!selectedCourse?.id) {
      setError("Pick a course first.");
      return;
    }
    if (tees.length > 0 && !selectedTeeId) {
      setError("Pick a tee first.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const ownerPlayer = {
        playerType: member?.id ? ("member" as const) : ("app_user" as const),
        displayName: ownerName,
        memberId: member?.id ?? null,
        userId: userId ?? null,
        handicapIndex: Number(ownerHcp) || 0,
        playingHandicap: Math.round(Number(ownerHcp)) || 0,
        inviteStatus: "joined" as const,
        isOwner: true,
        sortOrder: 0,
      };
      const extraPlayers = draftPlayers
        .filter((p) => p.displayName.trim().length > 0 || p.memberId)
        .map((p, i) => ({
          playerType: p.kind,
          displayName: p.displayName.trim() || (p.kind === "guest" ? `Guest ${i + 1}` : "Player"),
          memberId: p.memberId ?? null,
          userId: p.userId ?? null,
          inviteEmail: p.inviteEmail.trim() || null,
          handicapIndex: Number.isFinite(Number(p.handicapIndex)) ? Number(p.handicapIndex) : 0,
          playingHandicap: Number.isFinite(Number(p.handicapIndex)) ? Math.round(Number(p.handicapIndex)) : 0,
          inviteStatus: p.kind === "app_user" && p.inviteEmail.trim() ? ("invited" as const) : ("none" as const),
          sortOrder: i + 1,
        }));
      const tee = tees.find((t) => t.id === selectedTeeId) ?? null;
      const round = await createFreePlayRound({
        societyId: societyId ?? null,
        createdByMemberId: member?.id ?? null,
        courseId: selectedCourse.id,
        courseName: selectedCourse.name,
        teeId: tees.length > 0 ? selectedTeeId : null,
        teeName: tees.length > 0 ? tee?.tee_name ?? null : "General",
        scoringMode,
        scoringFormat,
        players: [ownerPlayer, ...extraPlayers],
      });
      router.push({ pathname: "/(app)/free-play/[id]", params: { id: round.id, created: "1", openAdd: "1" } } as never);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create round.");
    } finally {
      setSaving(false);
    }
  }, [
    guardPaidAction,
    selectedCourse,
    selectedTeeId,
    member?.id,
    ownerName,
    ownerHcp,
    userId,
    draftPlayers,
    tees,
    societyId,
    scoringMode,
    scoringFormat,
    router,
  ]);

  const handleJoinByCode = useCallback(async () => {
    if (!joinCode.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const round = await joinFreePlayRoundByCode(joinCode, ownerName);
      router.push({ pathname: "/(app)/free-play/[id]", params: { id: round.id } } as never);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not join round.");
    } finally {
      setSaving(false);
    }
  }, [joinCode, ownerName, router]);

  const handleApproveForSociety = useCallback(async () => {
    if (!selectedCourse?.id || !societyId) {
      setError("Select an active society to approve this course for society use.");
      return;
    }
    if (!isManCo(member)) {
      setError("Only Captain, Secretary, Treasurer, or Handicapper can approve a course for society use.");
      return;
    }
    setSaving(true);
    setError(null);
    setTrustActionNotice(null);
    try {
      await approveCourseForSociety(selectedCourse.id, societyId, null);
      const next = await getCourseApprovalState(selectedCourse.id, societyId);
      setCourseTrust(next);
      setTrustActionNotice("Course approved for society use.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not approve course for society.");
    } finally {
      setSaving(false);
    }
  }, [member, selectedCourse, societyId]);

  const handleSubmitContribute = useCallback(async () => {
    if (!selectedCourse?.id || !userId) {
      setError("Sign in to submit missing course information.");
      return;
    }
    if (!contribTeeName.trim()) {
      setError("Enter a tee name for the information you are submitting.");
      return;
    }
    setSaving(true);
    setError(null);
    setTrustActionNotice(null);
    try {
      const par = contribParTotal.trim() ? Number(contribParTotal) : null;
      const cr = contribCourseRating.trim() ? Number(contribCourseRating) : null;
      const slope = contribSlope.trim() ? Number(contribSlope) : null;
      const holes = contribHoles
        .map((r) => ({
          hole_number: Number(String(r.holeNumber).trim()),
          par: r.par.trim() ? Number(r.par) : null,
          stroke_index: r.strokeIndex.trim() ? Number(r.strokeIndex) : null,
          yards: r.yards.trim() ? Number(r.yards) : null,
        }))
        .filter((h) => Number.isFinite(h.hole_number) && h.hole_number >= 1 && h.hole_number <= 54)
        .map((h) => ({
          hole_number: h.hole_number,
          par: h.par != null && Number.isFinite(h.par) ? h.par : null,
          stroke_index: h.stroke_index != null && Number.isFinite(h.stroke_index) ? h.stroke_index : null,
          yards: h.yards != null && Number.isFinite(h.yards) ? Math.round(h.yards) : null,
        }));
      await submitCourseDataReview({
        courseId: selectedCourse.id,
        societyId: societyId ?? null,
        submissionType: "manual_entry",
        notes: contribHolesNotes.trim() || null,
        payload: {
          source: "free_play_contribute_v1",
          tee: {
            tee_name: contribTeeName.trim(),
            par_total: Number.isFinite(par) ? par : null,
            course_rating: Number.isFinite(cr) ? cr : null,
            slope_rating: Number.isFinite(slope) ? slope : null,
          },
          ...(holes.length > 0 ? { holes } : {}),
        },
      });
      const next = await getCourseApprovalState(selectedCourse.id, societyId ?? null);
      setCourseTrust(next);
      setShowContributeModal(false);
      setContribTeeName("");
      setContribParTotal("");
      setContribCourseRating("");
      setContribSlope("");
      setContribHolesNotes("");
      setContribHoles([]);
      setTrustActionNotice("Thanks — your course details were submitted for review.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit course details.");
    } finally {
      setSaving(false);
    }
  }, [
    contribCourseRating,
    contribHoles,
    contribHolesNotes,
    contribParTotal,
    contribSlope,
    contribTeeName,
    selectedCourse,
    societyId,
    userId,
  ]);

  const handlePlaceholderScorecard = useCallback(async () => {
    if (!selectedCourse?.id || !userId) {
      setError("Sign in to upload a scorecard for review.");
      return;
    }
    setSaving(true);
    setError(null);
    setTrustActionNotice(null);
    try {
      await submitCourseDataReview({
        courseId: selectedCourse.id,
        societyId: societyId ?? null,
        submissionType: "scorecard_photo",
        notes: "Placeholder scorecard submission — full photo upload wiring pending.",
        payload: {
          assets: [{ storage_path: "pending:scorecard-placeholder", asset_type: "scorecard_front" }],
        },
      });
      const next = await getCourseApprovalState(selectedCourse.id, societyId ?? null);
      setCourseTrust(next);
      setTrustActionNotice("Scorecard placeholder logged for review.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit scorecard.");
    } finally {
      setSaving(false);
    }
  }, [selectedCourse, societyId, userId]);

  if (loading) {
    return (
      <Screen>
        <LoadingState message="Loading free-play scorecards…" />
      </Screen>
    );
  }

  return (
    <Screen style={{ backgroundColor: colors.backgroundSecondary }}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <FreePlayStartHero
          onStartFreeRound={scrollToNewRoundSetup}
          onResumeRound={
            resumeRoundPrimary
              ? () => router.push({ pathname: "/(app)/free-play/[id]", params: { id: resumeRoundPrimary.id } } as never)
              : undefined
          }
          resumeLabel={resumeLabel}
        />
        <FreePlaySetupStepper steps={setupSteps} />

        {error ? <InlineNotice variant="error" message={error} style={{ marginBottom: spacing.md }} /> : null}

        <AppCard style={styles.card}>
          <AppText variant="captionBold" color="muted">
            Join a round
          </AppText>
          <View style={styles.row}>
            <AppInput
              value={joinCode}
              onChangeText={setJoinCode}
              placeholder="Enter join code"
              autoCapitalize="characters"
              style={{ flex: 1 }}
            />
            <PrimaryButton label="Join" onPress={handleJoinByCode} loading={saving} />
          </View>
        </AppCard>

        <View onLayout={onNewRoundLayout}>
          <AppText variant="captionBold" color="muted" style={{ marginTop: spacing.sm }}>
            New round setup
          </AppText>

          {needsLicence ? (
            <InlineNotice
              variant="info"
              message="Premium needed to create/start free-play rounds. You can still join and view shared rounds."
              style={{ marginTop: spacing.sm }}
            />
          ) : null}

          <FreePlayCourseSelectCard
            courseQuery={courseQuery}
            onCourseQueryChange={setCourseQuery}
            courseHits={courseHits}
            courseSearchBroadened={courseSearchBroadened}
            selectedCourse={selectedCourse}
            onSelectCourse={(c) => {
              setSelectedCourse(c);
              setCourseQuery(c.name);
              setCourseHits([]);
              setTrustActionNotice(null);
            }}
            holesAvailable={selectedTeeId ? setupHoles.length : null}
            teeCount={tees.length}
            selectedTrustLabel={selectedTrustLabelForCard}
            strokeIndexIncomplete={setupStrokeIndexIncomplete}
            holesUnavailable={Boolean(selectedTeeId) && setupHoles.length === 0 && tees.length > 0}
            trustPanel={
              selectedCourse ? (
                <View style={{ marginTop: spacing.md }}>
                  {selectedTrust?.loading ? (
                    <AppText variant="small" color="secondary">
                      Loading course trust status…
                    </AppText>
                  ) : selectedTrust && !selectedTrust.loading ? (
                    <View
                      style={[
                        styles.trustPanel,
                        {
                          borderColor: colors.borderLight,
                          backgroundColor: colors.surface,
                        },
                      ]}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs, flexWrap: "wrap" }}>
                        <AppText variant="captionBold" color="muted">
                          Course data
                        </AppText>
                        <View
                          style={[
                            styles.verifiedBadge,
                            {
                              borderColor:
                                selectedTrust.label === "verified"
                                  ? colors.success + "66"
                                  : selectedTrust.label === "society_approved"
                                    ? colors.primary + "66"
                                    : selectedTrust.label === "pending_review"
                                      ? colors.warning + "66"
                                      : colors.borderLight,
                            },
                          ]}
                        >
                          <AppText
                            variant="captionBold"
                            color={
                              selectedTrust.label === "verified"
                                ? "success"
                                : selectedTrust.label === "society_approved"
                                  ? "primary"
                                  : selectedTrust.label === "pending_review"
                                    ? "warning"
                                    : "secondary"
                            }
                          >
                            {selectedTrust.copy.badge}
                          </AppText>
                        </View>
                      </View>
                      <AppText variant="small" color="secondary" style={{ marginTop: spacing.xs }}>
                        {selectedTrust.copy.detail}
                      </AppText>
                      {courseTrust?.societyApprovalNotes ? (
                        <AppText variant="caption" color="tertiary" style={{ marginTop: spacing.xs }}>
                          Society notes: {courseTrust.societyApprovalNotes}
                        </AppText>
                      ) : null}
                      <AppText variant="caption" color="tertiary" style={{ marginTop: spacing.sm }}>
                        Members can help complete missing course data by entering scorecard details or uploading a scorecard
                        photo for Golf Society Hub review.
                      </AppText>
                      {trustActionNotice ? (
                        <InlineNotice variant="success" message={trustActionNotice} style={{ marginTop: spacing.sm }} />
                      ) : null}
                      <View style={[styles.row, { marginTop: spacing.sm, flexWrap: "wrap" }]}>
                        {userId ? (
                          <>
                            <SecondaryButton label="Add missing course info" onPress={() => setShowContributeModal(true)} />
                            <SecondaryButton label="Upload scorecard" onPress={() => void handlePlaceholderScorecard()} />
                          </>
                        ) : (
                          <AppText variant="caption" color="tertiary">
                            Sign in to contribute course data or scorecard photos.
                          </AppText>
                        )}
                      </View>
                      {manCoCanApproveSociety ? (
                        <PrimaryButton
                          label="Approve for society use"
                          onPress={() => void handleApproveForSociety()}
                          loading={saving}
                          style={{ marginTop: spacing.sm }}
                        />
                      ) : member && isManCo(member) && societyId && selectedCourse && courseTrust?.globalStatus !== "verified" && courseTrust?.societyApproved ? (
                        <AppText variant="caption" color="tertiary" style={{ marginTop: spacing.xs }}>
                          This course is already approved for your society.
                        </AppText>
                      ) : member && isManCo(member) && !societyId ? (
                        <AppText variant="caption" color="tertiary" style={{ marginTop: spacing.xs }}>
                          Select a society to approve this course for society-only use.
                        </AppText>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              ) : null
            }
          />

          {selectedCourse && setupDataQualityBadge ? (
            <FreePlayDataQualityNotice badge={setupDataQualityBadge} stablefordSelected={scoringFormat === "stableford"} />
          ) : null}

          {selectedCourse ? (
            <FreePlayTeeSelectCard
              tees={tees}
              selectedTeeId={selectedTeeId}
              onSelectTee={setSelectedTeeId}
              selectedTee={selectedTeeForSetup}
              holes={setupHoles}
            />
          ) : null}

          <AppCard style={styles.card}>
            <AppText variant="captionBold" style={{ letterSpacing: 0.6 }} color="muted">
              FORMAT
            </AppText>
            <View style={{ marginTop: spacing.sm }}>
              <AppText variant="small" color="secondary">
                Competition format
              </AppText>
              <View style={styles.wrap}>
                {(["stroke_net", "stableford"] as const).map((f) => (
                  <Pressable
                    key={f}
                    onPress={() => setScoringFormat(f)}
                    style={[
                      styles.chip,
                      {
                        borderColor: scoringFormat === f ? colors.primary : colors.borderLight,
                        backgroundColor: scoringFormat === f ? `${colors.primary}16` : colors.surface,
                      },
                    ]}
                  >
                    <AppText variant="captionBold" color={scoringFormat === f ? "primary" : "secondary"}>
                      {f === "stableford" ? "Stableford" : "Stroke (net)"}
                    </AppText>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={{ marginTop: spacing.md }}>
              <AppText variant="small" color="secondary">
                Scoring mode
              </AppText>
              <View style={styles.wrap}>
                {(["quick", "hole_by_hole"] as const).map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => setScoringMode(m)}
                    style={[
                      styles.chip,
                      {
                        borderColor: scoringMode === m ? colors.primary : colors.borderLight,
                        backgroundColor: scoringMode === m ? `${colors.primary}16` : colors.surface,
                      },
                    ]}
                  >
                    <AppText variant="captionBold" color={scoringMode === m ? "primary" : "secondary"}>
                      {m === "quick" ? "Quick entry" : "Hole-by-hole"}
                    </AppText>
                  </Pressable>
                ))}
              </View>
            </View>
          </AppCard>

          <View style={{ marginTop: spacing.md }}>
            <AppText variant="captionBold" style={{ letterSpacing: 0.6 }} color="muted">
              PLAYERS
            </AppText>
            <AppText variant="caption" color="tertiary" style={{ marginTop: spacing.xs }}>
              You are added automatically as the round owner.
            </AppText>
            <View style={[styles.row, { marginTop: spacing.sm, flexWrap: "wrap" }]}>
              <SecondaryButton label="Add member" onPress={() => setShowMemberPicker((v) => !v)} />
              <SecondaryButton label="Add friend (app)" onPress={() => addDraftPlayer("app_user")} />
              <SecondaryButton label="Add guest" onPress={() => addDraftPlayer("guest")} />
            </View>

            {showMemberPicker ? (
              <View style={{ marginTop: spacing.sm }}>
                {members.slice(0, 20).map((m) => (
                  <Pressable
                    key={m.id}
                    onPress={() => addMemberPlayer(m)}
                    style={({ pressed }) => [styles.selectRow, { opacity: pressed ? 0.85 : 1, borderColor: colors.borderLight }]}
                  >
                    <AppText variant="bodyBold">{String(m.displayName || m.name || "Member")}</AppText>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <FreePlayPlayerSetupCard
              kind="you"
              displayName={ownerName}
              handicapIndex={String(Number.isFinite(Number(ownerHcp)) ? Number(ownerHcp) : 0)}
              onHandicapIndexChange={() => {}}
              teeName={teeNameForPlayers}
              handicapReadOnly
              nameEditable={false}
            />

            {draftPlayers.map((p) => {
              const kind: FreePlaySetupPlayerKind =
                p.kind === "member" ? "member" : p.kind === "app_user" ? "friend" : "guest";
              return (
                <FreePlayPlayerSetupCard
                  key={p.id}
                  kind={kind}
                  displayName={p.displayName}
                  onDisplayNameChange={(v) => updateDraftPlayer(p.id, { displayName: v })}
                  inviteEmail={p.inviteEmail}
                  onInviteEmailChange={p.kind === "app_user" ? (v) => updateDraftPlayer(p.id, { inviteEmail: v }) : undefined}
                  showInviteEmail={p.kind === "app_user"}
                  handicapIndex={p.handicapIndex}
                  onHandicapIndexChange={(v) => updateDraftPlayer(p.id, { handicapIndex: v })}
                  teeName={teeNameForPlayers}
                  onRemove={() => removeDraftPlayer(p.id)}
                  nameEditable={!p.memberId}
                />
              );
            })}
          </View>

          <FreePlayHandicapReviewCard rows={handicapReviewRows} />

          <PrimaryButton
            label="Create free-play round"
            onPress={handleCreate}
            loading={saving}
            style={{ marginTop: spacing.md }}
          />
        </View>

        <AppText variant="captionBold" color="muted" style={{ marginBottom: spacing.sm }}>
          All my rounds
        </AppText>
        {rounds.length === 0 ? (
          <EmptyState title="No free-play rounds yet" message="Create one in two taps, or join with a code." />
        ) : (
          rounds.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => router.push({ pathname: "/(app)/free-play/[id]", params: { id: r.id } } as never)}
              style={({ pressed }) => [
                styles.roundRow,
                {
                  opacity: pressed ? 0.85 : 1,
                  borderColor: colors.borderLight,
                  backgroundColor: colors.surface,
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <AppText variant="bodyBold">{r.course_name}</AppText>
                <AppText variant="small" color="secondary">
                  {r.tee_name || "Tee"} · {r.status.replace("_", " ")} · {r.scoring_format === "stableford" ? "SF" : "Net"} · {r.join_code}
                </AppText>
              </View>
              <Feather name="chevron-right" size={18} color={colors.textSecondary} />
            </Pressable>
          ))
        )}
      </ScrollView>
      <Modal visible={showContributeModal} transparent animationType="fade" onRequestClose={() => setShowContributeModal(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowContributeModal(false)}>
          <View style={styles.modalWrap} onStartShouldSetResponder={() => true}>
            <AppCard style={[styles.modalCard, { borderColor: colors.borderLight, backgroundColor: colors.surface }]}>
              <AppText variant="h2">Add missing course info</AppText>
              <AppText variant="caption" color="tertiary" style={{ marginTop: spacing.xs }}>
                Submitted to Golf Society Hub reviewers. Tee ratings help with handicaps when a course is globally
                verified.
              </AppText>
              <AppInput
                value={contribTeeName}
                onChangeText={setContribTeeName}
                placeholder="Tee name (e.g. White)"
                style={{ marginTop: spacing.sm }}
              />
              <AppInput
                value={contribParTotal}
                onChangeText={setContribParTotal}
                placeholder="Par total (optional)"
                keyboardType="numeric"
                style={{ marginTop: spacing.xs }}
              />
              <AppInput
                value={contribCourseRating}
                onChangeText={setContribCourseRating}
                placeholder="Course rating (optional)"
                keyboardType="decimal-pad"
                style={{ marginTop: spacing.xs }}
              />
              <AppInput
                value={contribSlope}
                onChangeText={setContribSlope}
                placeholder="Slope rating (optional)"
                keyboardType="numeric"
                style={{ marginTop: spacing.xs }}
              />
              <AppText variant="captionBold" color="muted" style={{ marginTop: spacing.sm }}>
                Optional hole-by-hole (same tee)
              </AppText>
              {contribHoles.map((row) => (
                <View
                  key={row.id}
                  style={[
                    styles.holeRowCard,
                    {
                      marginTop: spacing.xs,
                      borderColor: colors.borderLight,
                      backgroundColor: colors.backgroundSecondary,
                    },
                  ]}
                >
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, alignItems: "center" }}>
                    <AppInput
                      value={row.holeNumber}
                      onChangeText={(v) =>
                        setContribHoles((prev) => prev.map((x) => (x.id === row.id ? { ...x, holeNumber: v } : x)))
                      }
                      placeholder="Hole #"
                      keyboardType="numeric"
                      style={{ width: 72 }}
                    />
                    <AppInput
                      value={row.par}
                      onChangeText={(v) =>
                        setContribHoles((prev) => prev.map((x) => (x.id === row.id ? { ...x, par: v } : x)))
                      }
                      placeholder="Par"
                      keyboardType="numeric"
                      style={{ width: 64 }}
                    />
                    <AppInput
                      value={row.strokeIndex}
                      onChangeText={(v) =>
                        setContribHoles((prev) => prev.map((x) => (x.id === row.id ? { ...x, strokeIndex: v } : x)))
                      }
                      placeholder="SI"
                      keyboardType="numeric"
                      style={{ width: 56 }}
                    />
                    <AppInput
                      value={row.yards}
                      onChangeText={(v) =>
                        setContribHoles((prev) => prev.map((x) => (x.id === row.id ? { ...x, yards: v } : x)))
                      }
                      placeholder="Yards"
                      keyboardType="numeric"
                      style={{ width: 72, flexGrow: 1, minWidth: 72 }}
                    />
                    <Pressable
                      onPress={() => setContribHoles((prev) => prev.filter((x) => x.id !== row.id))}
                      hitSlop={8}
                      style={{ padding: spacing.xs }}
                    >
                      <Feather name="trash-2" size={18} color={colors.textSecondary} />
                    </Pressable>
                  </View>
                </View>
              ))}
              <SecondaryButton
                label="Add hole row"
                onPress={() =>
                  setContribHoles((prev) => [
                    ...prev,
                    {
                      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                      holeNumber: "",
                      par: "",
                      strokeIndex: "",
                      yards: "",
                    },
                  ])
                }
                style={{ marginTop: spacing.xs, alignSelf: "flex-start" }}
              />
              <AppInput
                value={contribHolesNotes}
                onChangeText={setContribHolesNotes}
                placeholder="Notes (yardages, hole pars, etc.)"
                multiline
                style={{ marginTop: spacing.xs, minHeight: 72 }}
              />
              <View style={[styles.row, { marginTop: spacing.md }]}>
                <SecondaryButton label="Cancel" onPress={() => setShowContributeModal(false)} />
                <PrimaryButton label="Submit for review" onPress={() => void handleSubmitContribute()} loading={saving} />
              </View>
            </AppCard>
          </View>
        </Pressable>
      </Modal>

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
    marginBottom: spacing.base,
    padding: spacing.base,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  chip: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  selectRow: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
  playerCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  roundRow: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.base,
    marginBottom: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  verifiedBadge: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  trustPanel: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: spacing.base,
  },
  modalWrap: {
    width: "100%",
  },
  modalCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.base,
  },
  holeRowCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.xs,
  },
});
