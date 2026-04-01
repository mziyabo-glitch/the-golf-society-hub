import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import debounce from "lodash.debounce";
import { StyleSheet, View, Pressable, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";

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
import {
  getEventsForSociety,
  createEvent,
  type EventDoc,
  type EventFormat,
  type EventClassification,
  EVENT_FORMATS,
  EVENT_CLASSIFICATIONS,
} from "@/lib/db_supabase/eventRepo";
import { createJointEvent, validateJointEventInput } from "@/lib/db_supabase/jointEventRepo";
import { isJointEventFromMeta } from "@/lib/jointEventAccess";
import { getMySocieties } from "@/lib/db_supabase/mySocietiesRepo";
import { ParticipatingSocietiesSection } from "@/components/event/ParticipatingSocietiesSection";
import type { EventSocietyInput } from "@/lib/db_supabase/jointEventTypes";
import { type CourseTee, getCourseByApiId, getCourseMetaById, getTeesByCourseId, upsertTeesFromApi } from "@/lib/db_supabase/courseRepo";
import { searchCourses as searchCoursesApi, getCourseById, type ApiCourseSearchResult } from "@/lib/golfApi";
import { importCourse, type ImportedCourse } from "@/lib/importCourse";
import { CourseTeeSelector } from "@/components/CourseTeeSelector";
import {
  menAndLadiesTeeOptions,
  hasManualLadiesTeeMinimum,
} from "@/lib/courseTeeGender";
import { getPermissionsForMember } from "@/lib/rbac";
import { getColors, spacing, radius } from "@/lib/ui/theme";
import { formatError, type FormattedError } from "@/lib/ui/formatError";
import { JOINT_EVENT_CHIP_LONG } from "@/lib/eventModuleUi";
import { getCache, invalidateCachePrefix, setCache } from "@/lib/cache/clientCache";
import { HeaderSettingsPill } from "@/components/navigation/HeaderSettingsPill";
import { blurWebActiveElement } from "@/lib/ui/focus";

// Simple picker option component
function PickerOption({
  label,
  selected,
  onPress,
  colors,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  colors: ReturnType<typeof getColors>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.pickerOption,
        {
          backgroundColor: selected ? colors.primary : colors.backgroundSecondary,
          borderColor: selected ? colors.primary : colors.border,
        },
      ]}
    >
      <AppText
        variant="caption"
        style={{ color: selected ? "#fff" : colors.text }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

type FormErrors = {
  name?: string;
  date?: string;
  format?: string;
  classification?: string;
  course?: string;
  courseTee?: string;
  courseTeeLadies?: string;
  handicapAllowance?: string;
  participating_societies?: string;
};

export default function EventsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ create?: string; classification?: string }>();
  const { societyId, activeSocietyId, member, user, loading: bootstrapLoading } = useBootstrap();
  const { guardPaidAction, modalVisible, setModalVisible, societyId: guardSocietyId } = usePaidAccess();
  const colors = getColors();
  const tabBarHeight = useBottomTabBarHeight();
  const tabContentStyle = { paddingTop: 16, paddingBottom: tabBarHeight + 24 };
  const createAction = useAsyncAction();
  const paramsHandledRef = useRef(false);
  const lastLoadAtRef = useRef(0);

  const [events, setEvents] = useState<EventDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<FormattedError | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formFormat, setFormFormat] = useState<EventFormat>("stableford");
  const [formClassification, setFormClassification] = useState<EventClassification>("general");
  const [formEntryFeeDisplay, setFormEntryFeeDisplay] = useState("");
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [validationNotice, setValidationNotice] = useState<string | null>(null);
  const [toast, setToast] = useState({ visible: false, message: "", type: "success" as const });

  // Course / Tee: GolfCourseAPI search -> import -> select tee
  const [courseSearchQuery, setCourseSearchQuery] = useState("");
  const [courseSearchResults, setCourseSearchResults] = useState<ApiCourseSearchResult[]>([]);
  const [courseSearchError, setCourseSearchError] = useState<string | null>(null);
  const [courseSearching, setCourseSearching] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<{ id: string; name: string } | null>(null);
  const [manualCourseName, setManualCourseName] = useState("");
  const [tees, setTees] = useState<CourseTee[]>([]);
  const [teesLoading, setTeesLoading] = useState(false);
  const [teesError, setTeesError] = useState<string | null>(null);
  const [selectedTee, setSelectedTee] = useState<CourseTee | null>(null);
  const [selectedLadiesTee, setSelectedLadiesTee] = useState<CourseTee | null>(null);

  // Manual tee entry fallback (when no tees from API)
  const [showManualTee, setShowManualTee] = useState(false);
  const [manualTeeName, setManualTeeName] = useState("");
  const [manualPar, setManualPar] = useState("");
  const [manualCourseRating, setManualCourseRating] = useState("");
  const [manualSlopeRating, setManualSlopeRating] = useState("");
  const [manualLadiesTeeName, setManualLadiesTeeName] = useState("");
  const [manualLadiesPar, setManualLadiesPar] = useState("");
  const [manualLadiesCourseRating, setManualLadiesCourseRating] = useState("");
  const [manualLadiesSlopeRating, setManualLadiesSlopeRating] = useState("");

  const { menOptions, ladiesOptions } = useMemo(() => menAndLadiesTeeOptions(tees), [tees]);

  // Handicap allowance (shared)
  const [formHandicapAllowance, setFormHandicapAllowance] = useState("95");

  // Joint event (Phase 3)
  const [isJointEvent, setIsJointEvent] = useState(false);
  const [hostSocietyId, setHostSocietyId] = useState("");
  const [participatingSocieties, setParticipatingSocieties] = useState<EventSocietyInput[]>([]);
  const [mySocieties, setMySocieties] = useState<Awaited<ReturnType<typeof getMySocieties>>>([]);

  const permissions = getPermissionsForMember(member);

  useEffect(() => {
    if (showCreateForm && permissions.canCreateEvents) {
      getMySocieties().then(setMySocieties);
    }
  }, [showCreateForm, permissions.canCreateEvents]);

  useEffect(() => {
    if (!isJointEvent) {
      setHostSocietyId("");
      setParticipatingSocieties([]);
      return;
    }
    if (societyId && participatingSocieties.length === 0 && mySocieties.length > 0) {
      const current = mySocieties.find((s) => s.societyId === societyId);
      if (current) {
        setHostSocietyId(current.societyId);
        setParticipatingSocieties([
          { society_id: current.societyId, society_name: current.societyName, role: "host", has_society_oom: true },
        ]);
      }
    }
  }, [isJointEvent, societyId, mySocieties]);

  useEffect(() => {
    if (paramsHandledRef.current) return;
    const wantsCreate = params.create === "1";
    const wantsOom = params.classification === "oom";

    if (wantsCreate && permissions.canCreateEvents) {
      setShowCreateForm(true);
    }
    if (wantsOom) {
      setFormClassification("oom");
    }

    if (wantsCreate || wantsOom) {
      paramsHandledRef.current = true;
    }
  }, [params.create, params.classification, permissions.canCreateEvents]);

  // Debounced course search (400ms - only fires after typing stops to avoid API quota burn)
  const debouncedSearch = useMemo(
    () =>
      debounce(async (q: string) => {
        setCourseSearching(true);
        setCourseSearchError(null);
        try {
          const hits = await searchCoursesApi(q);
          setCourseSearchResults(hits);
        } catch (e: any) {
          setCourseSearchError(e?.message || "Course search failed");
          setCourseSearchResults([]);
        } finally {
          setCourseSearching(false);
        }
      }, 400),
    []
  );

  useEffect(() => {
    const q = courseSearchQuery.trim();
    if (!q || q.length < 2) {
      setCourseSearchResults([]);
      setCourseSearchError(null);
      return;
    }
    debouncedSearch(q);
    return () => debouncedSearch.cancel();
  }, [courseSearchQuery, debouncedSearch]);

  const handleSelectCourse = useCallback(async (hit: ApiCourseSearchResult) => {
    console.log("[events] handleSelectCourse:", hit.id, hit.name);
    setCourseSearchResults([]);
    setCourseSearchQuery("");
    setSelectedTee(null);
    setSelectedLadiesTee(null);
    setTees([]);
    setTeesError(null);
    setTeesLoading(true);
    setShowManualTee(false);
    setFormErrors((prev) => ({ ...prev, course: undefined, courseTee: undefined, courseTeeLadies: undefined }));
    try {
      // Step 1: Check DB cache first (avoids API call if already imported with tees)
      const cached = await getCourseByApiId(hit.id);
      if (cached && cached.tees.length > 0) {
        console.log("[events] Loaded from cache:", cached.courseId, cached.tees.length, "tees");
        setSelectedCourse({ id: cached.courseId, name: cached.courseName });
        setTees(cached.tees);
        setTeesLoading(false);
        return;
      }

      // Step 2: Fetch from API and import â€” always sets course even if tees fail
      const full = await getCourseById(hit.id);
      console.log("[events] getCourseById done, importing...");
      const result: ImportedCourse = await importCourse(full);
      console.log("[events] importCourse done:", result.courseId, result.tees.length, "tees");
      setSelectedCourse({ id: result.courseId, name: result.courseName });

      // Step 3: Reload tees from DB if we have a real course ID; else use API tees
      const freshTees = result.courseId.startsWith("api-course-")
        ? []
        : await getTeesByCourseId(result.courseId).catch(() => [] as CourseTee[]);
      const teesList = freshTees.length > 0
        ? freshTees
        : result.tees.map((t) => ({
            id: t.id,
            course_id: result.courseId,
            tee_name: t.teeName,
            tee_color: null,
            course_rating: t.courseRating ?? 0,
            slope_rating: t.slopeRating ?? 0,
            par_total: t.parTotal ?? 0,
            gender: t.gender ?? null,
            yards: t.yards ?? null,
          }));

      setTees(teesList);
      // Show manual entry if no tees found â€” but never dead-end
      if (teesList.length === 0) {
        setShowManualTee(true);
        setTeesError("No tee data imported yet. Enter tee details manually below.");
      }
    } catch (e: any) {
      console.error("[events] course import failed:", e?.message || e);
      // Still set the course so the user can proceed with manual tee entry
      setSelectedCourse({ id: "", name: hit.name });
      setTees([]);
      setShowManualTee(true);
      setTeesError(null); // Don't show red error â€” just open manual entry silently
    } finally {
      setTeesLoading(false);
    }
  }, []);

  const cacheKey = useMemo(() => {
    const sid = societyId || activeSocietyId;
    return sid ? `society:${sid}:events` : null;
  }, [societyId, activeSocietyId]);

  const loadEvents = useCallback(async (opts?: { silent?: boolean }) => {
    const sid = societyId || activeSocietyId;
    if (!sid) {
      console.log("[events] No societyId/activeSocietyId, skipping load");
      setLoading(false);
      return;
    }
    if (Date.now() - lastLoadAtRef.current < 5000) return;
    lastLoadAtRef.current = Date.now();
    console.log("[events] Loading events for society:", sid);
    if (opts?.silent) setRefreshing(true);
    else setLoading(true);
    setLoadError(null);
    try {
      const data = await getEventsForSociety(sid);
      console.log("[events] Loaded", data.length, "events. Upcoming:", data.filter((e) => !e.isCompleted).length, "Completed:", data.filter((e) => e.isCompleted).length);
      if (__DEV__) {
        for (const ev of data) {
          const jointish =
            isJointEventFromMeta(ev.participant_society_ids, ev.linked_society_count) || ev.is_joint_event === true;
          if (!jointish) continue;
          console.log("[joint-access] event list candidate", {
            eventId: ev.id,
            activeSocietyId: sid,
            hostSocietyId: ev.society_id,
            participantSocietyIds: ev.participant_society_ids ?? [],
            includeInList: true,
          });
        }
      }
      setEvents(data);
      if (cacheKey) {
        await setCache(cacheKey, data, { ttlMs: 1000 * 60 * 5 });
      }
    } catch (err: any) {
      console.error("[events] Failed to load events:", err?.message || err);
      const formatted = formatError(err);
      setLoadError(formatted);
      setEvents([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [societyId, activeSocietyId, cacheKey]);

  const openSettings = useCallback(() => {
    try {
      blurWebActiveElement();
    } catch {
      /* noop */
    }
    router.push("/(app)/(tabs)/settings");
  }, [router]);

  useEffect(() => {
    void (async () => {
      if (cacheKey) {
        const cached = await getCache<EventDoc[]>(cacheKey, { maxAgeMs: 1000 * 60 * 60 });
        if (cached?.value?.length) {
          setEvents(cached.value);
          setLoading(false);
        }
        await loadEvents({ silent: !!cached });
        return;
      }
      await loadEvents();
    })();
  }, [loadEvents, cacheKey]);

  // Refetch on focus to pick up changes from other screens
  useFocusEffect(
    useCallback(() => {
      const sid = societyId || activeSocietyId;
      if (sid) {
        loadEvents({ silent: true });
      }
    }, [societyId, activeSocietyId, loadEvents])
  );

  const validateForm = (): FormErrors => {
    const errors: FormErrors = {};

    if (!formName.trim()) {
      errors.name = "Event name is required.";
    }

    if (!formDate.trim()) {
      errors.date = "Date is required.";
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(formDate.trim())) {
      errors.date = "Use format YYYY-MM-DD.";
    }

    if (!formFormat) {
      errors.format = "Select a format.";
    }

    if (!formClassification) {
      errors.classification = "Select a classification.";
    }

    if (!selectedCourse && !manualCourseName.trim()) {
      errors.course = "Select a course or enter a course name.";
    }

    if (selectedCourse && tees.length > 0 && !showManualTee) {
      if (!selectedTee) {
        errors.courseTee = "Select a men's tee for this course.";
      }
      if (ladiesOptions.length > 0) {
        if (!selectedLadiesTee) {
          errors.courseTeeLadies = "Select a ladies' tee for this course.";
        }
      } else if (
        !hasManualLadiesTeeMinimum({
          manualLadiesTeeName,
          manualLadiesPar,
          manualLadiesCourseRating,
          manualLadiesSlopeRating,
        })
      ) {
        errors.courseTeeLadies =
          "No ladies' tees in course data — enter ladies' tee name, par, course rating, and slope below.";
      }
    }
    if (showManualTee) {
      const maleOk =
        selectedTee != null ||
        (manualTeeName.trim() &&
          manualPar.trim() &&
          manualCourseRating.trim() &&
          manualSlopeRating.trim());
      if (!maleOk) {
        errors.courseTee = "Enter men's tee details (name, par, course rating, slope) or select a men's tee above.";
      }
      if (
        !hasManualLadiesTeeMinimum({
          manualLadiesTeeName,
          manualLadiesPar,
          manualLadiesCourseRating,
          manualLadiesSlopeRating,
        })
      ) {
        errors.courseTeeLadies = "Enter ladies' tee name, par, course rating, and slope.";
      }
    }

    if (formHandicapAllowance.trim()) {
      const allowanceValue = Number(formHandicapAllowance.trim());
      if (Number.isNaN(allowanceValue) || allowanceValue <= 0 || allowanceValue > 100) {
        errors.handicapAllowance = "Handicap allowance must be between 1 and 100.";
      }
    }

    if (isJointEvent) {
      const jointErrors = validateJointEventInput({
        is_joint_event: true,
        host_society_id: hostSocietyId,
        participating_societies: participatingSocieties,
      });
      if (jointErrors.length > 0) {
        errors.participating_societies = jointErrors[0].message;
      }
    }

    return errors;
  };

  const handleCreateEvent = async () => {
    if (!guardPaidAction()) return;

    console.log("[createEvent] CLICKED", {
      formName: formName.trim(),
      formDate: formDate.trim(),
      formFormat,
      formClassification,
      societyId,
      userId: user?.uid,
      submitting: createAction.loading,
    });

    if (createAction.loading) return;

    createAction.reset();
    setValidationNotice(null);

    const errors = validateForm();
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      setValidationNotice("Please fix the highlighted fields.");
      return;
    }

    if (!societyId || !user?.uid) {
      console.error("[createEvent] Missing societyId or userId:", { societyId, userId: user?.uid });
      setValidationNotice("Not signed in or no society selected.");
      return;
    }

    const handicapAllowance = formHandicapAllowance.trim()
      ? parseFloat(formHandicapAllowance.trim()) / 100
      : 0.95;

    const courseName =
      selectedCourse?.name ?? (manualCourseName.trim() || undefined);

    let teeId: string | undefined = selectedTee?.id ?? undefined;
    let courseId: string | undefined = selectedCourse?.id;

    // API-only IDs (api-course-*, api-tee-*) are not real DB UUIDs — don't save as FK
    if (courseId?.startsWith("api-course-")) courseId = undefined;
    if (teeId?.startsWith("api-tee-")) teeId = undefined;

    // Validate tee_id: must exist in loaded tees for current course (events.tee_id FK → course_tees.id)
    if (teeId && courseId && tees.length > 0 && !tees.some((t) => t.id === teeId)) {
      console.warn("[createEvent] tee_id not in loaded tees, saving without tee:", {
        teeId,
        courseId,
        loadedTeeIds: tees.map((t) => t.id),
      });
      teeId = undefined;
    }
    const teeName = selectedTee ? selectedTee.tee_name : (manualTeeName.trim() || undefined);
    const par = selectedTee ? selectedTee.par_total : (manualPar.trim() ? parseFloat(manualPar) : undefined);
    const courseRating = selectedTee ? selectedTee.course_rating : (manualCourseRating.trim() ? parseFloat(manualCourseRating) : undefined);
    const slopeRating = selectedTee ? selectedTee.slope_rating : (manualSlopeRating.trim() ? parseFloat(manualSlopeRating) : undefined);
    const ladiesTeeName =
      selectedLadiesTee?.tee_name ?? (manualLadiesTeeName.trim() || undefined);
    const ladiesPar = selectedLadiesTee
      ? selectedLadiesTee.par_total
      : manualLadiesPar.trim()
        ? parseFloat(manualLadiesPar)
        : undefined;
    const ladiesCourseRating = selectedLadiesTee
      ? selectedLadiesTee.course_rating
      : manualLadiesCourseRating.trim()
        ? parseFloat(manualLadiesCourseRating)
        : undefined;
    const ladiesSlopeRating = selectedLadiesTee
      ? selectedLadiesTee.slope_rating
      : manualLadiesSlopeRating.trim()
        ? parseFloat(manualLadiesSlopeRating)
        : undefined;

    const createPayload = {
      name: formName.trim(),
      date: formDate.trim(),
      format: formFormat,
      classification: formClassification,
      courseId: courseId,
      courseName,
      teeId,
      teeName,
      par,
      courseRating,
      slopeRating,
      ladiesTeeName,
      ladiesPar,
      ladiesCourseRating,
      ladiesSlopeRating,
      handicapAllowance,
      teeSource: selectedTee ? ("imported" as const) : undefined,
    };

    if (__DEV__) {
      console.log("[createEvent] Calling create...", {
        isJointEvent,
        course_id: courseId,
        tee_id: teeId,
        participatingSocieties: participatingSocieties?.length ?? 0,
      });
    }

    const created = await createAction.run(async () => {
      if (isJointEvent && participatingSocieties.length >= 2) {
        if (__DEV__) {
          console.log("[events] joint save payload", {
            source: "app/(app)/(tabs)/events.tsx::handleCreateEvent(createJointEvent)",
            eventId: null,
            uiToggleValue: isJointEvent,
            event_is_joint_event: true,
            linkedSocietiesCount: participatingSocieties.length,
            participantSocietiesCount: participatingSocieties.length,
            hostSocietyId: hostSocietyId || societyId || null,
          });
        }
        return createJointEvent({
          ...createPayload,
          is_joint_event: true,
          host_society_id: hostSocietyId || societyId!,
          participating_societies: participatingSocieties,
          createdBy: user!.uid,
        });
      }
      if (__DEV__) {
        console.log("[events] joint save payload", {
          source: "app/(app)/(tabs)/events.tsx::handleCreateEvent(createEvent)",
          eventId: null,
          uiToggleValue: isJointEvent,
          event_is_joint_event: false,
          linkedSocietiesCount: 0,
          participantSocietiesCount: 0,
          hostSocietyId: null,
        });
      }
      return createEvent(societyId!, {
        ...createPayload,
        createdBy: user!.uid,
      });
    });

    if (!created) {
      console.error("[createEvent] FAILED");
      return;
    }

    console.log("[createEvent] SUCCESS");
    resetForm();
    setToast({ visible: true, message: "Event created", type: "success" });
    if (societyId) {
      await invalidateCachePrefix(`society:${societyId}:`);
    }
    loadEvents();
  };

  const resetForm = () => {
    setFormName("");
    setFormDate("");
    setFormFormat("stableford");
    setFormClassification("general");
    setFormEntryFeeDisplay("");
    setCourseSearchQuery("");
    setCourseSearchResults([]);
    setCourseSearchError(null);
    setSelectedCourse(null);
    setManualCourseName("");
    setTees([]);
    setTeesError(null);
    setSelectedTee(null);
    setSelectedLadiesTee(null);
    setShowManualTee(false);
    setManualTeeName("");
    setManualPar("");
    setManualCourseRating("");
    setManualSlopeRating("");
    setManualLadiesTeeName("");
    setManualLadiesPar("");
    setManualLadiesCourseRating("");
    setManualLadiesSlopeRating("");
    setFormHandicapAllowance("95");
    setIsJointEvent(false);
    setHostSocietyId("");
    setParticipatingSocieties([]);
    setShowCreateForm(false);
    setFormErrors({});
    setValidationNotice(null);
    createAction.reset();
  };

  const handleOpenEvent = (event: EventDoc) => {
    if (!event?.id) {
      console.error("[Events] Cannot open event: event.id is undefined");
      return;
    }
    console.log("[Events] opening event:", event.id);
    router.push({ pathname: "/(app)/event/[id]", params: { id: event.id } });
  };

  if (bootstrapLoading && loading) {
    return (
      <Screen scrollable={false} contentStyle={tabContentStyle}>
        <View style={styles.centered}>
          <LoadingState message="Loading events..." />
        </View>
      </Screen>
    );
  }

  // Guard: no active society yet
  if (!societyId && !activeSocietyId) {
    return (
      <Screen contentStyle={tabContentStyle}>
        <View style={styles.header}>
          <AppText variant="title">Events</AppText>
          <HeaderSettingsPill onPress={openSettings} />
        </View>
        <EmptyState
          icon={<Feather name="calendar" size={24} color={colors.textTertiary} />}
          title="No Society Selected"
          message="Join or create a society to see events."
        />
      </Screen>
    );
  }

  // Create form view
  if (showCreateForm) {
    return (
      <Screen contentStyle={tabContentStyle}>
        <Toast
          visible={toast.visible}
          message={toast.message}
          type={toast.type}
          onHide={() => setToast((t) => ({ ...t, visible: false }))}
        />
        <View style={styles.formHeader}>
          <SecondaryButton
            onPress={() => { resetForm(); setShowCreateForm(false); }}
            size="sm"
            disabled={createAction.loading}
          >
            Cancel
          </SecondaryButton>
          <AppText variant="h2">Create Event</AppText>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: tabBarHeight + 24 }}
        >
          <AppCard>
            {validationNotice ? (
              <InlineNotice variant="error" message={validationNotice} style={{ marginBottom: spacing.sm }} />
            ) : null}
            {createAction.error ? (
              <InlineNotice
                variant="error"
                message={createAction.error.message}
                detail={createAction.error.detail}
                style={{ marginBottom: spacing.sm }}
              />
            ) : null}
            <View style={styles.formField}>
              <AppText variant="captionBold" style={styles.label}>Event Name</AppText>
              <AppInput
                placeholder="e.g. Monthly Medal"
                value={formName}
                onChangeText={(value) => {
                  setFormName(value);
                  setValidationNotice(null);
                  setFormErrors((prev) => ({ ...prev, name: undefined }));
                }}
                autoCapitalize="words"
              />
              {formErrors.name ? (
                <AppText variant="small" style={[styles.fieldError, { color: colors.error }]}>
                  {formErrors.name}
                </AppText>
              ) : null}
            </View>

            <View style={styles.formField}>
              <AppText variant="captionBold" style={styles.label}>Date (YYYY-MM-DD)</AppText>
              <AppInput
                placeholder="e.g. 2025-02-15"
                value={formDate}
                onChangeText={(value) => {
                  setFormDate(value);
                  setValidationNotice(null);
                  setFormErrors((prev) => ({ ...prev, date: undefined }));
                }}
                keyboardType="numbers-and-punctuation"
                autoCapitalize="none"
              />
              {formErrors.date ? (
                <AppText variant="small" style={[styles.fieldError, { color: colors.error }]}>
                  {formErrors.date}
                </AppText>
              ) : null}
            </View>

            <View style={styles.formField}>
              <AppText variant="captionBold" style={styles.label}>Format</AppText>
              <View style={styles.pickerRow}>
                {EVENT_FORMATS.map((f) => (
                  <PickerOption
                    key={f.value}
                    label={f.label}
                    selected={formFormat === f.value}
                    onPress={() => {
                      setFormFormat(f.value);
                      setValidationNotice(null);
                      setFormErrors((prev) => ({ ...prev, format: undefined }));
                    }}
                    colors={colors}
                  />
                ))}
              </View>
              {formErrors.format ? (
                <AppText variant="small" style={[styles.fieldError, { color: colors.error }]}>
                  {formErrors.format}
                </AppText>
              ) : null}
            </View>

            <View style={styles.formField}>
              <AppText variant="captionBold" style={styles.label}>Classification</AppText>
              <View style={styles.pickerRow}>
                {EVENT_CLASSIFICATIONS.map((c) => (
                  <PickerOption
                    key={c.value}
                    label={c.label}
                    selected={formClassification === c.value}
                    onPress={() => {
                      setFormClassification(c.value);
                      setValidationNotice(null);
                      setFormErrors((prev) => ({ ...prev, classification: undefined }));
                    }}
                    colors={colors}
                  />
                ))}
              </View>
              {formErrors.classification ? (
                <AppText variant="small" style={[styles.fieldError, { color: colors.error }]}>
                  {formErrors.classification}
                </AppText>
              ) : null}
            </View>

            <View style={styles.formField}>
              <AppText variant="captionBold" style={styles.label}>Entry fee (optional)</AppText>
              <AppInput
                placeholder="e.g. £45 or £55 incl. food"
                value={formEntryFeeDisplay}
                onChangeText={setFormEntryFeeDisplay}
                autoCapitalize="none"
              />
              <AppText variant="small" color="tertiary" style={{ marginTop: 4 }}>
                Shown to members on the home screen and event page.
              </AppText>
            </View>

            {/* Joint Event: directly after Classification, before Course / Tee Setup */}
            <Pressable
              onPress={() => {
                const next = !isJointEvent;
                if (__DEV__) {
                  console.log("[events] joint toggle ui state", {
                    source: "app/(app)/(tabs)/events.tsx::createToggleOnPress",
                    eventId: null,
                    uiToggleValue: next,
                    event_is_joint_event: null,
                    linkedSocietiesCount: participatingSocieties.length,
                    participantSocietiesCount: participatingSocieties.length,
                  });
                }
                setIsJointEvent(next);
                setFormErrors((prev) => ({ ...prev, participating_societies: undefined }));
              }}
              style={[
                styles.jointEventToggle,
                { borderColor: colors.border },
              ]}
            >
              <View style={{ flex: 1 }}>
                <AppText variant="captionBold">Joint Event</AppText>
                <AppText variant="small" color="secondary">
                  {isJointEvent
                    ? mySocieties.length < 2
                      ? "Join another society to create joint events."
                      : "2+ societies participating"
                    : "Single society only"}
                </AppText>
              </View>
              <View style={[styles.pickerOption, { backgroundColor: isJointEvent ? colors.primary : colors.backgroundSecondary,
                borderColor: isJointEvent ? colors.primary : colors.border }]}>
                <AppText variant="caption" style={{ color: isJointEvent ? "#fff" : colors.text }}>
                  {isJointEvent ? "On" : "Off"}
                </AppText>
              </View>
            </Pressable>

            {isJointEvent && (
              <View style={styles.formField}>
                <ParticipatingSocietiesSection
                  hostSocietyId={hostSocietyId}
                  participatingSocieties={participatingSocieties}
                  availableSocieties={mySocieties}
                  errors={formErrors}
                  onHostChange={setHostSocietyId}
                  onSocietiesChange={setParticipatingSocieties}
                />
              </View>
            )}

            {/* Course: Search â†’ Select Tee */}
            <View style={styles.formField}>
              <AppText variant="captionBold" style={styles.label}>Course</AppText>
              {selectedCourse ? (
                <View style={[styles.selectedCourseRow, { borderColor: colors.border }]}>
                  <AppText variant="body" numberOfLines={1} style={{ flex: 1 }}>
                    {selectedCourse.name}
                  </AppText>
                  <Pressable
                    onPress={() => {
                      setSelectedCourse(null);
                      setTees([]);
                      setSelectedTee(null);
                      setSelectedLadiesTee(null);
                      setShowManualTee(false);
                      setFormErrors((prev) => ({
                        ...prev,
                        course: undefined,
                        courseTee: undefined,
                        courseTeeLadies: undefined,
                      }));
                    }}
                    hitSlop={8}
                  >
                    <AppText variant="small" style={{ color: colors.primary }}>Change</AppText>
                  </Pressable>
                </View>
              ) : (
                <>
                  <AppInput
                    placeholder="Search course (e.g. Forest of Arden)"
                    value={courseSearchQuery}
                    onChangeText={(v) => {
                      setCourseSearchQuery(v);
                      setFormErrors((prev) => ({ ...prev, courseTee: undefined }));
                    }}
                    autoCapitalize="words"
                  />
                  {courseSearching && (
                    <AppText variant="small" color="tertiary" style={{ marginTop: 4 }}>Searchingâ€¦</AppText>
                  )}
                  {courseSearchError && !courseSearching && (
                    <AppText variant="small" style={{ marginTop: 4, color: colors.error }}>
                      {"Couldn't load courses. "}{courseSearchError}
                    </AppText>
                  )}
                  {!courseSearchError && courseSearchResults.length > 0 && !selectedCourse && (
                    <View style={styles.searchResults}>
                      {courseSearchResults.slice(0, 8).map((c) => (
                        <Pressable
                          key={c.id}
                          onPress={() => handleSelectCourse(c)}
                          style={({ pressed }) => [
                            styles.searchResultItem,
                            { backgroundColor: colors.backgroundSecondary, opacity: pressed ? 0.88 : 1 },
                          ]}
                        >
                          <AppText variant="body" numberOfLines={1}>{c.name}</AppText>
                          {(c.club_name || (typeof c.location === "string" && c.location)) ? (
                            <AppText variant="small" color="secondary" numberOfLines={1}>
                              {[c.club_name, typeof c.location === "string" ? c.location : ""]
                                .filter(Boolean)
                                .join(" · ")}
                            </AppText>
                          ) : null}
                        </Pressable>
                      ))}
                    </View>
                  )}
                  {!courseSearching && !courseSearchError && courseSearchQuery.trim().length >= 2 && courseSearchResults.length === 0 && (
                    <AppText variant="small" color="secondary" style={{ marginTop: 4 }}>
                      No courses found. Enter a name manually below.
                    </AppText>
                  )}
                  <View style={{ marginTop: spacing.sm }}>
                    <AppText variant="caption" color="secondary" style={styles.label}>
                      Or enter course name (no tee data)
                    </AppText>
                    <AppInput
                      placeholder="e.g. Forest of Arden"
                      value={manualCourseName}
                      onChangeText={(v) => {
                        setManualCourseName(v);
                        setFormErrors((prev) => ({ ...prev, course: undefined }));
                      }}
                      autoCapitalize="words"
                    />
                  </View>
                </>
              )}
              {formErrors.course ? (
                <AppText variant="small" style={[styles.fieldError, { color: colors.error, marginTop: 4 }]}>
                  {formErrors.course}
                </AppText>
              ) : null}
            </View>

            {/* Select Tee (when course has tees) */}
            {selectedCourse && (
              <View style={styles.formField}>
                {teesLoading ? (
                  <AppText variant="small" color="tertiary">Importing course and teesâ€¦</AppText>
                ) : teesError ? (
                  <AppText variant="small" style={{ color: colors.error }}>
                    {"Couldn't load tees: "}{teesError}
                  </AppText>
                ) : tees.length > 0 ? (
                  <>
                    {!showManualTee && (
                      <>
                        <CourseTeeSelector
                          sectionTitle="Men's tee (required)"
                          tees={menOptions}
                          selectedTee={selectedTee}
                          onSelectTee={(tee) => {
                            setSelectedTee(tee);
                            setShowManualTee(false);
                            setFormErrors((prev) => ({ ...prev, courseTee: undefined }));
                          }}
                        />
                        <CourseTeeSelector
                          sectionTitle="Ladies' tee (required)"
                          tees={ladiesOptions}
                          selectedTee={selectedLadiesTee}
                          onSelectTee={(tee) => {
                            setSelectedLadiesTee(tee);
                            setFormErrors((prev) => ({ ...prev, courseTeeLadies: undefined }));
                          }}
                        />
                        {ladiesOptions.length === 0 && (
                          <>
                            <InlineNotice
                              variant="info"
                              message="No ladies' tees found in course data. Enter ladies' tee ratings below (required)."
                              style={{ marginTop: spacing.sm }}
                            />
                            <AppText variant="captionBold" color="secondary" style={{ marginTop: spacing.sm }}>
                              Ladies&apos; tee — manual entry
                            </AppText>
                            <View style={styles.formField}>
                              <AppText variant="caption" style={styles.label}>Tee name</AppText>
                              <AppInput
                                placeholder="e.g. Red"
                                value={manualLadiesTeeName}
                                onChangeText={(v) => {
                                  setManualLadiesTeeName(v);
                                  setFormErrors((prev) => ({ ...prev, courseTeeLadies: undefined }));
                                }}
                                autoCapitalize="words"
                              />
                            </View>
                            <View style={styles.formField}>
                              <AppText variant="caption" style={styles.label}>Par</AppText>
                              <AppInput
                                placeholder="e.g. 72"
                                value={manualLadiesPar}
                                onChangeText={(v) => {
                                  setManualLadiesPar(v);
                                  setFormErrors((prev) => ({ ...prev, courseTeeLadies: undefined }));
                                }}
                                keyboardType="number-pad"
                              />
                            </View>
                            <View style={styles.formField}>
                              <AppText variant="caption" style={styles.label}>Course rating</AppText>
                              <AppInput
                                placeholder="e.g. 68.4"
                                value={manualLadiesCourseRating}
                                onChangeText={(v) => {
                                  setManualLadiesCourseRating(v);
                                  setFormErrors((prev) => ({ ...prev, courseTeeLadies: undefined }));
                                }}
                                keyboardType="decimal-pad"
                              />
                            </View>
                            <View style={styles.formField}>
                              <AppText variant="caption" style={styles.label}>Slope rating</AppText>
                              <AppInput
                                placeholder="e.g. 120"
                                value={manualLadiesSlopeRating}
                                onChangeText={(v) => {
                                  setManualLadiesSlopeRating(v);
                                  setFormErrors((prev) => ({ ...prev, courseTeeLadies: undefined }));
                                }}
                                keyboardType="number-pad"
                              />
                            </View>
                          </>
                        )}
                      </>
                    )}
                    {formErrors.courseTee ? (
                      <AppText variant="small" style={[styles.fieldError, { color: colors.error, marginTop: 4 }]}>
                        {formErrors.courseTee}
                      </AppText>
                    ) : null}
                    {formErrors.courseTeeLadies ? (
                      <AppText variant="small" style={[styles.fieldError, { color: colors.error, marginTop: 4 }]}>
                        {formErrors.courseTeeLadies}
                      </AppText>
                    ) : null}
                  </>
                ) : (
                  <AppText variant="small" color="tertiary">No tees found for this course.</AppText>
                )}
                {tees.length === 0 && !teesLoading && !showManualTee && (
                  <Pressable onPress={() => setShowManualTee(true)}>
                    <AppText variant="caption" color="primary" style={{ marginTop: spacing.xs }}>
                      + Enter tee details manually
                    </AppText>
                  </Pressable>
                )}
              </View>
            )}

            {/* Manual tee link when no course selected */}
            {!selectedCourse && !showManualTee && (
              <Pressable onPress={() => setShowManualTee(true)} style={{ marginBottom: spacing.base }}>
                <AppText variant="caption" color="primary">
                  + Enter tee details manually
                </AppText>
              </Pressable>
            )}

            {/* Manual tee entry fallback */}
            {showManualTee && (
              <View style={styles.manualTeeContainer}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
                  <AppText variant="captionBold">Manual Tee Entry</AppText>
                  {selectedTee && (
                    <Pressable onPress={() => setShowManualTee(false)}>
                      <AppText variant="small" color="primary">Use selected tee instead</AppText>
                    </Pressable>
                  )}
                </View>

                <AppText variant="captionBold" color="secondary" style={{ marginBottom: spacing.xs }}>Male Tee</AppText>
                <View style={styles.formField}>
                  <AppText variant="caption" style={styles.label}>Tee Name</AppText>
                  <AppInput
                    placeholder="e.g. Yellow"
                    value={manualTeeName}
                    onChangeText={(v) => { setManualTeeName(v); setSelectedTee(null); }}
                    autoCapitalize="words"
                  />
                </View>
                <View style={styles.formField}>
                  <AppText variant="caption" style={styles.label}>Par</AppText>
                  <AppInput
                    placeholder="e.g. 72"
                    value={manualPar}
                    onChangeText={(v) => { setManualPar(v); setSelectedTee(null); }}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.formField}>
                  <AppText variant="caption" style={styles.label}>Course Rating</AppText>
                  <AppInput
                    placeholder="e.g. 70.1"
                    value={manualCourseRating}
                    onChangeText={(v) => { setManualCourseRating(v); setSelectedTee(null); }}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.formField}>
                  <AppText variant="caption" style={styles.label}>Slope Rating</AppText>
                  <AppInput
                    placeholder="e.g. 128"
                    value={manualSlopeRating}
                    onChangeText={(v) => { setManualSlopeRating(v); setSelectedTee(null); }}
                    keyboardType="number-pad"
                  />
                </View>

                <AppText variant="captionBold" color="secondary" style={{ marginTop: spacing.sm, marginBottom: spacing.xs }}>Female Tee</AppText>
                <View style={styles.formField}>
                  <AppText variant="caption" style={styles.label}>Tee Name</AppText>
                  <AppInput
                    placeholder="e.g. Red"
                    value={manualLadiesTeeName}
                    onChangeText={setManualLadiesTeeName}
                    autoCapitalize="words"
                  />
                </View>
                <View style={styles.formField}>
                  <AppText variant="caption" style={styles.label}>Par</AppText>
                  <AppInput
                    placeholder="e.g. 72"
                    value={manualLadiesPar}
                    onChangeText={setManualLadiesPar}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.formField}>
                  <AppText variant="caption" style={styles.label}>Course Rating</AppText>
                  <AppInput
                    placeholder="e.g. 68.4"
                    value={manualLadiesCourseRating}
                    onChangeText={setManualLadiesCourseRating}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.formField}>
                  <AppText variant="caption" style={styles.label}>Slope Rating</AppText>
                  <AppInput
                    placeholder="e.g. 120"
                    value={manualLadiesSlopeRating}
                    onChangeText={setManualLadiesSlopeRating}
                    keyboardType="number-pad"
                  />
                </View>
              </View>
            )}

            {/* Handicap Allowance */}
            <View style={styles.formField}>
              <AppText variant="caption" style={styles.label}>
                Handicap Allowance (%)
              </AppText>
              <AppInput
                placeholder="95"
                value={formHandicapAllowance}
                onChangeText={(value) => {
                  setFormHandicapAllowance(value);
                  setValidationNotice(null);
                  setFormErrors((prev) => ({ ...prev, handicapAllowance: undefined }));
                }}
                keyboardType="number-pad"
              />
              {formErrors.handicapAllowance ? (
                <AppText variant="small" style={[styles.fieldError, { color: colors.error }]}>
                  {formErrors.handicapAllowance}
                </AppText>
              ) : null}
              <AppText variant="small" color="tertiary" style={{ marginTop: 4 }}>
                Default 95% for individual stroke play
              </AppText>
            </View>

            <PrimaryButton
              onPress={handleCreateEvent}
              loading={createAction.loading}
              style={{ marginTop: spacing.sm }}
            >
              Create Event
            </PrimaryButton>
          </AppCard>
        </ScrollView>
        <LicenceRequiredModal visible={modalVisible} onClose={() => setModalVisible(false)} societyId={guardSocietyId} />
      </Screen>
    );
  }

  const toDateMs = (value?: string) => {
    if (!value) return Number.MAX_SAFE_INTEGER;
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : Number.MAX_SAFE_INTEGER;
  };

  const toPastDateMs = (value?: string) => {
    if (!value) return Number.MIN_SAFE_INTEGER;
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : Number.MIN_SAFE_INTEGER;
  };

  const upcomingEvents = events
    .filter((e) => !e.isCompleted)
    .sort((a, b) => toDateMs(a.date) - toDateMs(b.date));
  const completedEvents = events
    .filter((e) => e.isCompleted)
    .sort((a, b) => toPastDateMs(b.date) - toPastDateMs(a.date));

  const getStatusColor = (event: EventDoc) => {
    if (event.isCompleted) return colors.success;
    if (event.status === "cancelled") return colors.error;
    return colors.primary;
  };

  const getStatusLabel = (event: EventDoc) => {
    if (event.isCompleted) return "Completed";
    if (event.status === "cancelled") return "Cancelled";
    if (event.status === "in_progress") return "In Progress";
    return "Scheduled";
  };

  const renderEventCard = (event: EventDoc) => (
    <Pressable
      key={event.id}
      onPress={() => handleOpenEvent(event)}
    >
      <AppCard style={styles.eventCard}>
        <View style={styles.eventRow}>
          <View style={[styles.dateBadge, { backgroundColor: colors.backgroundTertiary }]}>
            {event.date ? (
              <>
                <AppText variant="captionBold" color="primary">
                  {new Date(event.date).toLocaleDateString("en-GB", { day: "numeric" })}
                </AppText>
                <AppText variant="small" color="secondary">
                  {new Date(event.date).toLocaleDateString("en-GB", { month: "short" })}
                </AppText>
              </>
            ) : (
              <AppText variant="caption" color="tertiary">TBD</AppText>
            )}
          </View>

          <View style={styles.eventInfo}>
            <AppText variant="bodyBold" numberOfLines={2} style={styles.eventTitle}>
              {event.name}
            </AppText>
            {event.courseName && (
              <AppText variant="caption" color="secondary" numberOfLines={2} style={styles.eventCourse}>
                {event.courseName}
              </AppText>
            )}
            <View style={styles.eventMeta}>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(event) + "20" }]}>
                <AppText variant="small" style={{ color: getStatusColor(event) }}>
                  {getStatusLabel(event)}
                </AppText>
              </View>
              {event.format && (
                <AppText variant="small" color="tertiary">
                  {EVENT_FORMATS.find((f) => f.value === event.format)?.label ?? event.format}
                </AppText>
              )}
              {event.classification === "oom" && (
                <View style={[styles.oomBadge, { backgroundColor: colors.warning + "20" }]}>
                  <Feather name="award" size={10} color={colors.warning} />
                  <AppText variant="small" style={{ color: colors.warning }}>OOM</AppText>
                </View>
              )}
              {event.classification === "major" && (
                <View style={[styles.oomBadge, { backgroundColor: colors.info + "20" }]}>
                  <Feather name="star" size={10} color={colors.info} />
                  <AppText variant="small" style={{ color: colors.info }}>Major</AppText>
                </View>
              )}
              {event.is_joint_event === true && (
                <View style={[styles.jointBadge, { backgroundColor: colors.info + "16", borderColor: colors.info + "40" }]}>
                  <Feather name="link" size={10} color={colors.info} />
                  <AppText
                    variant="small"
                    style={{ color: colors.info }}
                    numberOfLines={1}
                  >
                    {JOINT_EVENT_CHIP_LONG}
                  </AppText>
                </View>
              )}
            </View>
          </View>

          <View style={styles.chevronWrap}>
            <Feather name="chevron-right" size={20} color={colors.textTertiary} />
          </View>
        </View>
      </AppCard>
    </Pressable>
  );

  return (
    <Screen contentStyle={tabContentStyle}>
      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast((t) => ({ ...t, visible: false }))}
      />
      <View style={styles.header}>
        <View>
          <AppText variant="title">Events</AppText>
          <AppText variant="caption" color="secondary">
            {events.length} event{events.length !== 1 ? "s" : ""}
          </AppText>
        </View>
        {permissions.canCreateEvents && (
          <PrimaryButton onPress={() => setShowCreateForm(true)} size="sm">
            Create Event
          </PrimaryButton>
        )}
      </View>
      {refreshing ? (
        <AppText variant="small" color="tertiary" style={{ marginBottom: spacing.xs }}>
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

      {events.length === 0 && !loadError ? (
        <EmptyState
          icon={<Feather name="calendar" size={24} color={colors.textTertiary} />}
          title="No events yet"
          message={permissions.canCreateEvents
            ? "Create your first event to start tracking results and scores."
            : "No events yet. Ask the Captain to create one."}
          action={permissions.canCreateEvents ? {
            label: "Create event",
            onPress: () => setShowCreateForm(true),
          } : undefined}
        />
      ) : events.length > 0 ? (
        <>
          {upcomingEvents.length > 0 && (
            <View style={styles.section}>
              <AppText variant="h2" style={styles.sectionTitle}>
                Upcoming ({upcomingEvents.length})
              </AppText>
              {upcomingEvents.map(renderEventCard)}
            </View>
          )}

          {completedEvents.length > 0 && (
            <View style={styles.section}>
              <AppText variant="h2" style={styles.sectionTitle}>
                Completed ({completedEvents.length})
              </AppText>
              {completedEvents.map(renderEventCard)}
            </View>
          )}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexShrink: 0,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    marginBottom: spacing.sm,
    letterSpacing: 0.2,
  },
  eventCard: {
    marginBottom: spacing.xs,
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  dateBadge: {
    width: 52,
    minWidth: 52,
    height: 52,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  eventInfo: {
    flex: 1,
    minWidth: 0,
  },
  eventTitle: {
    lineHeight: 20,
  },
  eventCourse: {
    marginTop: 2,
  },
  eventMeta: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: 4,
    minWidth: 0,
  },
  statusBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
    flexShrink: 0,
  },
  oomBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
    flexShrink: 0,
  },
  jointBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexShrink: 0,
    maxWidth: "100%",
  },
  chevronWrap: {
    width: 20,
    minWidth: 20,
    alignItems: "flex-end",
    justifyContent: "center",
    paddingTop: 2,
    flexShrink: 0,
  },
  formHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  formField: {
    marginBottom: spacing.base,
  },
  label: {
    marginBottom: spacing.xs,
  },
  fieldError: {
    marginTop: 4,
  },
  pickerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  pickerOption: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  selectedCourseRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    gap: spacing.sm,
  },
  searchResults: {
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  searchResultItem: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    gap: 2,
  },
  manualTeeContainer: {
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: "rgba(0,0,0,0.02)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    marginBottom: spacing.base,
  },
  jointEventToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
    borderTopWidth: 1,
  },
});
