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
  getEventsBySocietyId,
  createEvent,
  type EventDoc,
  type EventFormat,
  type EventClassification,
  EVENT_FORMATS,
  EVENT_CLASSIFICATIONS,
} from "@/lib/db_supabase/eventRepo";
import { type CourseTee, getCourseByApiId, getTeesByCourseId, upsertTeesFromApi } from "@/lib/db_supabase/courseRepo";
import { searchCourses as searchCoursesApi, getCourseById, type ApiCourseSearchResult } from "@/lib/golfApi";
import { importCourse, type ImportedCourse } from "@/lib/importCourse";
import { CourseTeeSetupCard, type TeeSyncStatus } from "@/components/CourseTeeSetupCard";
import { getPermissionsForMember } from "@/lib/rbac";
import { getColors, spacing, radius } from "@/lib/ui/theme";
import { formatError, type FormattedError } from "@/lib/ui/formatError";

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
  handicapAllowance?: string;
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

  const [events, setEvents] = useState<EventDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<FormattedError | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formFormat, setFormFormat] = useState<EventFormat>("stableford");
  const [formClassification, setFormClassification] = useState<EventClassification>("general");
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [validationNotice, setValidationNotice] = useState<string | null>(null);
  const [toast, setToast] = useState({ visible: false, message: "", type: "success" as const });

  // Course / Tee: GolfCourseAPI search → import → select tee
  const [courseSearchQuery, setCourseSearchQuery] = useState("");
  const [courseSearchResults, setCourseSearchResults] = useState<ApiCourseSearchResult[]>([]);
  const [courseSearchError, setCourseSearchError] = useState<string | null>(null);
  const [courseSearching, setCourseSearching] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<{ id: string; name: string } | null>(null);
  const [selectedCourseApiId, setSelectedCourseApiId] = useState<number | null>(null);
  const [manualCourseName, setManualCourseName] = useState("");
  const [tees, setTees] = useState<CourseTee[]>([]);
  const [teesLoading, setTeesLoading] = useState(false);
  const [teesError, setTeesError] = useState<string | null>(null);
  const [selectedTee, setSelectedTee] = useState<CourseTee | null>(null);
  const [teeSyncStatus, setTeeSyncStatus] = useState<TeeSyncStatus>("idle");

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

  // Handicap allowance (shared)
  const [formHandicapAllowance, setFormHandicapAllowance] = useState("95");

  const permissions = getPermissionsForMember(member as any);

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
    setTees([]);
    setTeesError(null);
    setTeesLoading(true);
    setShowManualTee(false);
    setTeeSyncStatus("pending_sync");
    setFormErrors((prev) => ({ ...prev, course: undefined, courseTee: undefined }));
    try {
      // 1. Cache-first: load from DB if previously imported
      const cached = await getCourseByApiId(hit.id);
      if (cached && cached.tees.length > 0) {
        console.log("[events] Loaded from cache:", cached.courseId, cached.tees.length, "tees");
        setSelectedCourse({ id: cached.courseId, name: cached.courseName });
        setSelectedCourseApiId(hit.id);
        setTees(cached.tees);
        setTeeSyncStatus("synced");
      } else if (cached && cached.tees.length === 0) {
        // Course exists but 0 tees: show immediately, try background sync
        setSelectedCourse({ id: cached.courseId, name: cached.courseName });
        setSelectedCourseApiId(hit.id);
        setTees([]);
        setShowManualTee(true);
        setTeeSyncStatus("pending_sync");
        // Background sync (non-blocking)
        (async () => {
          try {
            const full = await getCourseById(hit.id);
            const result = await importCourse(full);
            setTees(result.tees.map((t) => ({
              id: t.id,
              course_id: result.courseId,
              tee_name: t.teeName,
              tee_color: null,
              course_rating: t.courseRating ?? 0,
              slope_rating: t.slopeRating ?? 0,
              par_total: t.parTotal ?? 0,
            })));
            setTeeSyncStatus(result.tees.length > 0 ? "synced" : "import_failed");
            if (result.tees.length > 0) setShowManualTee(false);
          } catch {
            setTeeSyncStatus("import_failed");
          } finally {
            setTeesLoading(false);
          }
        })();
        return; // Don't set teesLoading false below - background will
      } else {
        // No cache: fetch from API and import
        const full = await getCourseById(hit.id);
        console.log("[events] getCourseById done, importing...");
        const result: ImportedCourse = await importCourse(full);
        console.log("[events] importCourse done:", result.courseId, result.tees.length, "tees");
        setSelectedCourse({ id: result.courseId, name: result.courseName });
        setSelectedCourseApiId(hit.id);

        let teesList: CourseTee[];
        if (result.tees.length > 0) {
          teesList = result.tees.map((t) => ({
            id: t.id,
            course_id: result.courseId,
            tee_name: t.teeName,
            tee_color: null,
            course_rating: t.courseRating ?? 0,
            slope_rating: t.slopeRating ?? 0,
            par_total: t.parTotal ?? 0,
          }));
          setTeeSyncStatus("synced");
        } else {
          const apiTees = full.tees;
          if (apiTees) {
            await upsertTeesFromApi(result.courseId, apiTees as any);
            teesList = await getTeesByCourseId(result.courseId);
          } else {
            teesList = [];
          }
          setTeeSyncStatus(teesList.length > 0 ? "synced" : "import_failed");
          if (teesList.length === 0) setShowManualTee(true);
        }
        setTees(teesList);
      }
    } catch (e: any) {
      console.error("[events] course import failed:", e?.message || e);
      setTeesError(e?.message || "Import failed. You can enter tee details manually below.");
      setSelectedCourse({ id: "", name: hit.name });
      setSelectedCourseApiId(hit.id);
      setTees([]);
      setShowManualTee(true);
      setTeeSyncStatus("import_failed");
    } finally {
      setTeesLoading(false);
    }
  }, []);

  const loadEvents = useCallback(async () => {
    const sid = societyId || activeSocietyId;
    if (!sid) {
      console.log("[events] No societyId/activeSocietyId, skipping load");
      setLoading(false);
      return;
    }
    console.log("[events] Loading events for society:", sid);
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getEventsBySocietyId(sid);
      console.log("[events] Loaded", data.length, "events. Upcoming:", data.filter((e) => !e.isCompleted).length, "Completed:", data.filter((e) => e.isCompleted).length);
      setEvents(data);
    } catch (err: any) {
      console.error("[events] Failed to load events:", err?.message || err);
      const formatted = formatError(err);
      setLoadError(formatted);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [societyId, activeSocietyId]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Refetch on focus to pick up changes from other screens
  useFocusEffect(
    useCallback(() => {
      if (societyId) {
        loadEvents();
      }
    }, [societyId, loadEvents])
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

    const hasManualTeeData =
      manualTeeName.trim() &&
      (manualPar.trim() || manualCourseRating.trim() || manualSlopeRating.trim());
    const hasTee = selectedTee || hasManualTeeData;
    if ((selectedCourse || manualCourseName.trim()) && !hasTee) {
      errors.courseTee = tees.length > 0
        ? "Select a tee or enter tee details manually."
        : "Enter tee details manually.";
    }

    if (formHandicapAllowance.trim()) {
      const allowanceValue = Number(formHandicapAllowance.trim());
      if (Number.isNaN(allowanceValue) || allowanceValue <= 0 || allowanceValue > 100) {
        errors.handicapAllowance = "Handicap allowance must be between 1 and 100.";
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

    const hasManualTeeData =
      manualTeeName.trim() &&
      (manualPar.trim() || manualCourseRating.trim() || manualSlopeRating.trim());
    const teeSource = selectedTee ? "imported" : hasManualTeeData ? "manual" : undefined;

    const safeNum = (s: string): number | undefined => {
      const n = parseFloat(s.trim());
      return Number.isFinite(n) ? n : undefined;
    };
    const teeId = selectedTee?.id ?? undefined;
    const teeName = selectedTee ? selectedTee.tee_name : (manualTeeName.trim() || undefined);
    const par = selectedTee ? selectedTee.par_total : safeNum(manualPar);
    const courseRating = selectedTee ? selectedTee.course_rating : safeNum(manualCourseRating);
    const slopeRating = selectedTee ? selectedTee.slope_rating : safeNum(manualSlopeRating);
    const ladiesTeeName = manualLadiesTeeName.trim() || undefined;
    const ladiesPar = safeNum(manualLadiesPar);
    const ladiesCourseRating = safeNum(manualLadiesCourseRating);
    const ladiesSlopeRating = safeNum(manualLadiesSlopeRating);

    console.log("[createEvent] Calling createEvent...");
    const created = await createAction.run(async () =>
      createEvent(societyId, {
        name: formName.trim(),
        date: formDate.trim(),
        format: formFormat,
        classification: formClassification,
        createdBy: user.uid,
        courseId: selectedCourse?.id && selectedCourse.id.trim() ? selectedCourse.id : undefined,
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
        teeSource,
      })
    );

    if (!created) {
      console.error("[createEvent] FAILED");
      return;
    }

    console.log("[createEvent] SUCCESS");
    resetForm();
    setToast({ visible: true, message: "Event created", type: "success" });
    loadEvents();
  };

  const resetForm = () => {
    setFormName("");
    setFormDate("");
    setFormFormat("stableford");
    setFormClassification("general");
    setCourseSearchQuery("");
    setCourseSearchResults([]);
    setCourseSearchError(null);
    setSelectedCourse(null);
    setSelectedCourseApiId(null);
    setManualCourseName("");
    setTees([]);
    setTeesError(null);
    setSelectedTee(null);
    setShowManualTee(false);
    setManualTeeName("");
    setManualPar("");
    setManualCourseRating("");
    setManualSlopeRating("");
    setFormHandicapAllowance("95");
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

  if (bootstrapLoading || loading) {
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

            {/* Course / Tee Setup */}
            <CourseTeeSetupCard
              courseSearchQuery={courseSearchQuery}
              onCourseSearchChange={(v) => {
                setCourseSearchQuery(v);
                setFormErrors((prev) => ({ ...prev, courseTee: undefined }));
              }}
              selectedCourse={selectedCourse}
              onChangeCourse={() => {
                setSelectedCourse(null);
                setSelectedCourseApiId(null);
                setTees([]);
                setSelectedTee(null);
                setShowManualTee(false);
                setTeeSyncStatus("idle");
                setFormErrors((prev) => ({ ...prev, course: undefined, courseTee: undefined }));
              }}
              courseSearching={courseSearching}
              courseSearchError={courseSearchError ? `Couldn't load courses. ${courseSearchError}` : null}
              courseSearchResults={courseSearchResults}
              onSelectCourseResult={handleSelectCourse}
              manualCourseName={manualCourseName}
              onManualCourseNameChange={(v) => {
                setManualCourseName(v);
                setFormErrors((prev) => ({ ...prev, course: undefined }));
              }}
              showManualCourseInput={true}
              tees={tees}
              selectedTee={selectedTee}
              onSelectTee={(tee) => {
                setSelectedTee(tee);
                setFormErrors((prev) => ({ ...prev, courseTee: undefined }));
              }}
              teesLoading={teesLoading}
              teesError={teesError}
              showManualTee={showManualTee}
              onSetShowManualTee={setShowManualTee}
              manualTeeName={manualTeeName}
              manualPar={manualPar}
              manualCourseRating={manualCourseRating}
              manualSlopeRating={manualSlopeRating}
              manualLadiesTeeName={manualLadiesTeeName}
              manualLadiesPar={manualLadiesPar}
              manualLadiesCourseRating={manualLadiesCourseRating}
              manualLadiesSlopeRating={manualLadiesSlopeRating}
              onManualTeeChange={(field, value) => {
                if (field === "teeName") setManualTeeName(value);
                else if (field === "par") setManualPar(value);
                else if (field === "courseRating") setManualCourseRating(value);
                else if (field === "slopeRating") setManualSlopeRating(value);
                else if (field === "ladiesTeeName") setManualLadiesTeeName(value);
                else if (field === "ladiesPar") setManualLadiesPar(value);
                else if (field === "ladiesCourseRating") setManualLadiesCourseRating(value);
                else if (field === "ladiesSlopeRating") setManualLadiesSlopeRating(value);
                setSelectedTee(null);
                setFormErrors((prev) => ({ ...prev, courseTee: undefined }));
              }}
              syncStatus={teeSyncStatus}
              onRetrySync={selectedCourseApiId != null ? () => {
                const hit = courseSearchResults.find((c) => c.id === selectedCourseApiId)
                  ?? { id: selectedCourseApiId, name: selectedCourse?.name ?? "" };
                handleSelectCourse(hit);
              } : undefined}
              statusMessage={teesLoading ? "Tee data is still syncing." : teesError ?? undefined}
              handicapAllowance={formHandicapAllowance}
              onHandicapAllowanceChange={(v) => {
                setFormHandicapAllowance(v);
                setFormErrors((prev) => ({ ...prev, handicapAllowance: undefined }));
              }}
              courseError={formErrors.course}
              teeError={formErrors.courseTee}
              handicapError={formErrors.handicapAllowance}
            />

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

  const upcomingEvents = events.filter((e) => !e.isCompleted);
  const completedEvents = events.filter((e) => e.isCompleted);

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
            <AppText variant="bodyBold" numberOfLines={1}>{event.name}</AppText>
            {event.courseName && (
              <AppText variant="caption" color="secondary" numberOfLines={1}>
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
            </View>
          </View>

          <Feather name="chevron-right" size={20} color={colors.textTertiary} />
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
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    marginBottom: spacing.sm,
  },
  eventCard: {
    marginBottom: spacing.xs,
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  dateBadge: {
    width: 50,
    height: 50,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  eventInfo: {
    flex: 1,
  },
  eventMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  oomBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
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
    padding: spacing.sm,
    borderRadius: radius.sm,
  },
  manualTeeContainer: {
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: "rgba(0,0,0,0.02)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    marginBottom: spacing.base,
  },
});
