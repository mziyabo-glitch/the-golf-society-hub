import { useCallback, useEffect, useMemo, useState } from "react";
import debounce from "lodash.debounce";
import { StyleSheet, View, Pressable, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
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
import { SocietyPageHeader } from "@/components/ui/SocietyPageHeader";
import { LicenceRequiredModal } from "@/components/LicenceRequiredModal";
import { useBootstrap } from "@/lib/useBootstrap";
import { usePaidAccess } from "@/lib/access/usePaidAccess";
import {
  getEvent,
  updateEvent,
  deleteEvent,
  type EventDoc,
  type EventFormat,
  type EventClassification,
  EVENT_FORMATS,
  EVENT_CLASSIFICATIONS,
} from "@/lib/db_supabase/eventRepo";
import { getTeesByCourseId, upsertManualTeesToCourse, type CourseTee } from "@/lib/db_supabase/courseRepo";
import { searchCourses as searchCoursesApi, type ApiCourseSearchResult } from "@/lib/golfApi";
import { resolveCourseByApiId } from "@/lib/courseResolution";
import { seedCourseByApiId, seedTeesToCourseTees } from "@/lib/courseSeedClient";
import { buildTeeSnapshotFromEvent, hasTeeSnapshot } from "@/lib/eventTeeSnapshot";
import { CourseTeeSelector } from "@/components/CourseTeeSelector";
import type { TeeSetupMode } from "@/components/CourseTeeSetupCard";
import { getPermissionsForMember } from "@/lib/rbac";
import {
  getEventRegistrations,
  markMePaid,
  type EventRegistration,
} from "@/lib/db_supabase/eventRegistrationRepo";
import { getMembersBySocietyId, type MemberDoc } from "@/lib/db_supabase/memberRepo";
import { Toast } from "@/components/ui/Toast";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { getColors, spacing, radius, typography } from "@/lib/ui/theme";
import { confirmDestructive, showAlert } from "@/lib/ui/alert";
import { getSocietyLogoUrl } from "@/lib/societyLogo";

// Picker option component
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

export default function EventDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const { societyId, society, member: currentMember, loading: bootstrapLoading } = useBootstrap();
  const { guardPaidAction, modalVisible, setModalVisible, societyId: guardSocietyId } = usePaidAccess();
  const colors = getColors();

  // Get logo URL from society
  const logoUrl = getSocietyLogoUrl(society);

  // Permissions
  const permissions = getPermissionsForMember(currentMember as any);
  const canEnterPoints = permissions.canManageHandicaps;
  const canEditEvent = permissions.canCreateEvents;

  // Safely extract eventId (could be string or array from URL params)
  const eventId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [event, setEvent] = useState<EventDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state for editing
  const [formName, setFormName] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formFormat, setFormFormat] = useState<EventFormat>("stableford");
  const [formClassification, setFormClassification] = useState<EventClassification>("general");
  const [formCourseName, setFormCourseName] = useState("");

  // Course search (GolfCourseAPI) for edit mode
  const [courseSearchQuery, setCourseSearchQuery] = useState("");
  const [courseSearchResults, setCourseSearchResults] = useState<ApiCourseSearchResult[]>([]);
  const [courseSearching, setCourseSearching] = useState(false);
  const [courseSearchError, setCourseSearchError] = useState<string | null>(null);
  const [selectedCourseEdit, setSelectedCourseEdit] = useState<{ id: string; name: string } | null>(null);

  // Tee from course_tees (when event has course_id)
  const [tees, setTees] = useState<CourseTee[]>([]);
  const [teesLoading, setTeesLoading] = useState(false);
  const [selectedTee, setSelectedTee] = useState<CourseTee | null>(null);
  const [selectedMaleTee, setSelectedMaleTee] = useState<CourseTee | null>(null);
  const [selectedFemaleTee, setSelectedFemaleTee] = useState<CourseTee | null>(null);
  const [teeSetupMode, setTeeSetupMode] = useState<TeeSetupMode>("separate");

  // Manual tee entry (fallback when no tees from API)
  const [manualTeeName, setManualTeeName] = useState("");
  const [manualPar, setManualPar] = useState("");
  const [manualCourseRating, setManualCourseRating] = useState("");
  const [manualSlopeRating, setManualSlopeRating] = useState("");
  const [manualLadiesTeeName, setManualLadiesTeeName] = useState("");
  const [manualLadiesPar, setManualLadiesPar] = useState("");
  const [manualLadiesCourseRating, setManualLadiesCourseRating] = useState("");
  const [manualLadiesSlopeRating, setManualLadiesSlopeRating] = useState("");
  const [showManualTee, setShowManualTee] = useState(false);

  // Handicap allowance
  const [formHandicapAllowance, setFormHandicapAllowance] = useState("95");

  // Tee settings toggle
  const [showTeeSettings, setShowTeeSettings] = useState(false);

  const loadEvent = useCallback(async () => {
    if (!eventId || !societyId) {
      setError("Missing event or society");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await getEvent(eventId);
      if (!data) {
        setError("Event not found");
      } else {
        setEvent(data);
      }
    } catch (err: any) {
      setError(err?.message ?? "Failed to load event");
    } finally {
      setLoading(false);
    }
  }, [eventId, societyId]);

  useFocusEffect(
    useCallback(() => {
      loadEvent();
    }, [loadEvent])
  );

  // ---- Paid Players dashboard ----
  const canManagePayments = permissions.canManageEventPayments;
  const [registrations, setRegistrations] = useState<EventRegistration[]>([]);
  const [regMembers, setRegMembers] = useState<MemberDoc[]>([]);
  const [payBusy, setPayBusy] = useState<string | null>(null);
  const [payToast, setPayToast] = useState<{ visible: boolean; message: string; type: "success" | "error" }>({ visible: false, message: "", type: "success" });

  const loadRegistrations = useCallback(async () => {
    if (!eventId || !societyId) return;
    try {
      const [regs, mems] = await Promise.all([
        getEventRegistrations(eventId),
        getMembersBySocietyId(societyId),
      ]);
      setRegistrations(regs);
      setRegMembers(mems);
    } catch { /* non-critical */ }
  }, [eventId, societyId]);

  useEffect(() => {
    if (eventId && societyId) loadRegistrations();
  }, [eventId, societyId, loadRegistrations]);

  const memberNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of regMembers) map[m.id] = m.name || m.display_name || m.displayName || "Member";
    return map;
  }, [regMembers]);

  const paidCount = registrations.filter((r) => r.paid).length;
  const inCount = registrations.filter((r) => r.status === "in").length;

  const handleTogglePaid = async (reg: EventRegistration) => {
    if (payBusy) return;
    setPayBusy(reg.member_id);
    try {
      await markMePaid(reg.event_id, reg.member_id, !reg.paid);
      setPayToast({ visible: true, message: reg.paid ? "Marked unpaid" : "Marked paid", type: "success" });
      await loadRegistrations();
    } catch (e: any) {
      setPayToast({ visible: true, message: e?.message || "Failed", type: "error" });
    } finally {
      setPayBusy(null);
    }
  };

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
          setCourseSearchError(e?.message || "Search failed");
          setCourseSearchResults([]);
        } finally {
          setCourseSearching(false);
        }
      }, 400),
    []
  );

  useEffect(() => {
    if (!isEditing) return;
    const q = courseSearchQuery.trim();
    if (!q || q.length < 2) {
      setCourseSearchResults([]);
      setCourseSearchError(null);
      return;
    }
    debouncedSearch(q);
    return () => debouncedSearch.cancel();
  }, [courseSearchQuery, isEditing, debouncedSearch]);

  /** Resolve course + load tees — only when user explicitly selects course. Single phase, no fallback chain. */
  const handleEditSelectCourse = useCallback(async (hit: ApiCourseSearchResult) => {
    setCourseSearchResults([]);
    setCourseSearchQuery("");
    setSelectedTee(null);
    setSelectedMaleTee(null);
    setSelectedFemaleTee(null);
    setTees([]);
    setTeesLoading(true);
    setShowManualTee(false);
    try {
      const seed = await seedCourseByApiId(hit.id);
      const resolved = seed
        ? { courseId: seed.courseId, courseName: seed.courseName, tees: seedTeesToCourseTees(seed) }
        : await resolveCourseByApiId(hit.id);

      if (resolved) {
        setSelectedCourseEdit({ id: resolved.courseId || "", name: resolved.courseName });
        setFormCourseName(resolved.courseName);
        setTees(resolved.tees);
        if (resolved.tees.length === 0) {
          setShowManualTee(true);
          console.log("[EventDetail] direct API tees=0, manual mode shown");
        } else {
          const snap = buildTeeSnapshotFromEvent(event);
          const maleName = snap?.male?.teeName || event?.teeName;
          const femaleName = snap?.female?.teeName || event?.ladiesTeeName;
          const isSep = !!(maleName && femaleName && maleName !== femaleName);
          if (isSep) {
            setTeeSetupMode("separate");
            setSelectedMaleTee(resolved.tees.find((t) => t.tee_name === maleName) ?? null);
            setSelectedFemaleTee(resolved.tees.find((t) => t.tee_name === femaleName) ?? null);
          } else {
            const singleName = maleName || femaleName;
            const match = singleName ? resolved.tees.find((t) => t.tee_name === singleName) : null;
            setTeeSetupMode("single");
            setSelectedTee(match ?? null);
          }
        }
      } else {
        setSelectedCourseEdit({ id: "", name: hit.name });
        setFormCourseName(hit.name);
        setTees([]);
        setShowManualTee(true);
      }
    } catch (e) {
      setSelectedCourseEdit({ id: "", name: hit.name });
      setFormCourseName(hit.name);
      setTees([]);
      setShowManualTee(true);
    } finally {
      setTeesLoading(false);
    }
  }, [event]);

  /** Enter edit mode — apply event snapshot to form. No tee lookup; manual form always available. */
  const startEditing = () => {
    if (!event) return;
    setFormName(event.name || "");
    setFormDate(event.date || "");
    setFormFormat(event.format || "stableford");
    setFormClassification(event.classification || "general");
    setFormCourseName(event.courseName || "");

    setFormHandicapAllowance(
      event.handicapAllowance != null ? String(Math.round(event.handicapAllowance * 100)) : "95"
    );

    // Tee snapshot: pre-fill manual fields from event (new fields first, fallback to legacy)
    const snap = buildTeeSnapshotFromEvent(event);
    if (snap?.teeSetupMode === "single" && snap.single) {
      setManualTeeName(snap.single.teeName || "");
      setManualPar(snap.single.par != null ? String(snap.single.par) : "");
      setManualCourseRating(snap.single.courseRating != null ? String(snap.single.courseRating) : "");
      setManualSlopeRating(snap.single.slopeRating != null ? String(snap.single.slopeRating) : "");
      setManualLadiesTeeName(snap.single.teeName || "");
      setManualLadiesPar(snap.single.par != null ? String(snap.single.par) : "");
      setManualLadiesCourseRating(snap.single.courseRating != null ? String(snap.single.courseRating) : "");
      setManualLadiesSlopeRating(snap.single.slopeRating != null ? String(snap.single.slopeRating) : "");
    } else if (snap?.male || snap?.female) {
      setManualTeeName(snap.male?.teeName ?? event.teeName ?? "");
      setManualPar(snap.male?.par != null ? String(snap.male.par) : (event.par != null ? String(event.par) : ""));
      setManualCourseRating(snap.male?.courseRating != null ? String(snap.male.courseRating) : (event.courseRating != null ? String(event.courseRating) : ""));
      setManualSlopeRating(snap.male?.slopeRating != null ? String(snap.male.slopeRating) : (event.slopeRating != null ? String(event.slopeRating) : ""));
      setManualLadiesTeeName(snap.female?.teeName ?? event.ladiesTeeName ?? "");
      setManualLadiesPar(snap.female?.par != null ? String(snap.female.par) : (event.ladiesPar != null ? String(event.ladiesPar) : ""));
      setManualLadiesCourseRating(snap.female?.courseRating != null ? String(snap.female.courseRating) : (event.ladiesCourseRating != null ? String(event.ladiesCourseRating) : ""));
      setManualLadiesSlopeRating(snap.female?.slopeRating != null ? String(snap.female.slopeRating) : (event.ladiesSlopeRating != null ? String(event.ladiesSlopeRating) : ""));
    } else {
      setManualTeeName(event.teeName || "");
      setManualPar(event.par != null ? String(event.par) : "");
      setManualCourseRating(event.courseRating != null ? String(event.courseRating) : "");
      setManualSlopeRating(event.slopeRating != null ? String(event.slopeRating) : "");
      setManualLadiesTeeName(event.ladiesTeeName || "");
      setManualLadiesPar(event.ladiesPar != null ? String(event.ladiesPar) : "");
      setManualLadiesCourseRating(event.ladiesCourseRating != null ? String(event.ladiesCourseRating) : "");
      setManualLadiesSlopeRating(event.ladiesSlopeRating != null ? String(event.ladiesSlopeRating) : "");
    }

    const hasTeeSettings =
      event.teeName != null || event.par != null || event.slopeRating != null || event.courseName != null;
    setShowTeeSettings(!!hasTeeSettings);

    setCourseSearchQuery("");
    setCourseSearchResults([]);
    setSelectedCourseEdit(event.course_id ? { id: event.course_id, name: event.courseName || "" } : null);

    const hasSavedTeeData = hasTeeSnapshot(event);
    const hasBothTees = !!(event.teeName && event.ladiesTeeName && event.teeName !== event.ladiesTeeName);
    setTeeSetupMode((event.teeSetupMode as "single" | "separate") ?? (hasBothTees ? "separate" : "single"));

    // Local tees only (no courses fallback). Event snapshot or manual if 0.
    setTees([]);
    setSelectedTee(null);
    setSelectedMaleTee(null);
    setSelectedFemaleTee(null);
    setShowManualTee(hasSavedTeeData || true);
    setIsEditing(true);

    // Optional: load local tees by course_id only — no Supabase courses query
    if (event.course_id) {
      setTeesLoading(true);
      getTeesByCourseId(event.course_id)
        .then((localTees) => {
          const count = localTees.length;
          console.log("[EventDetail] local tee count:", count, "eventSnapshotUsed:", hasSavedTeeData, "manualModeShown:", count === 0);
          setTees(localTees);
          if (count > 0) {
            const snap = buildTeeSnapshotFromEvent(event);
            const maleName = snap?.male?.teeName || event.teeName;
            const femaleName = snap?.female?.teeName || event.ladiesTeeName;
            const isSep = !!(maleName && femaleName && maleName !== femaleName);
            if (isSep) {
              setSelectedMaleTee(localTees.find((t) => t.tee_name === maleName) ?? null);
              setSelectedFemaleTee(localTees.find((t) => t.tee_name === femaleName) ?? null);
            } else {
              const singleName = maleName || femaleName;
              setSelectedTee(singleName ? localTees.find((t) => t.tee_name === singleName) ?? null : null);
            }
            if (hasSavedTeeData) setShowManualTee(false);
          }
        })
        .catch(() => {
          console.log("[EventDetail] local tee load failed, manual mode shown");
        })
        .finally(() => setTeesLoading(false));
    }
  };

  const cancelEditing = () => {
    setIsEditing(false);
  };

  const handleSaveEvent = async () => {
    if (!guardPaidAction()) return;
    if (!eventId) return;

    if (!formName.trim()) {
      showAlert("Missing Name", "Please enter an event name.");
      return;
    }

    // Validate date format if provided
    if (formDate.trim()) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(formDate.trim())) {
        showAlert("Invalid Date", "Please enter date in YYYY-MM-DD format.");
        return;
      }
    }

    const handicapAllowance = formHandicapAllowance.trim()
      ? parseFloat(formHandicapAllowance.trim()) / 100
      : 0.95;

    // tee_id: never saved (eventRepo sets null). Use event-level tee fields only.
    let teeName: string | undefined;
    let par: number | undefined;
    let courseRating: number | undefined;
    let slopeRating: number | undefined;
    let ladiesTeeName: string | undefined;
    let ladiesPar: number | undefined;
    let ladiesCourseRating: number | undefined;
    let ladiesSlopeRating: number | undefined;

    if (showManualTee || manualTeeName.trim() || manualPar.trim() || manualCourseRating.trim() || manualSlopeRating.trim()) {
      teeName = manualTeeName.trim() || undefined;
      par = manualPar.trim() ? parseFloat(manualPar) : undefined;
      courseRating = manualCourseRating.trim() ? parseFloat(manualCourseRating) : undefined;
      slopeRating = manualSlopeRating.trim() ? parseFloat(manualSlopeRating) : undefined;
      ladiesTeeName = manualLadiesTeeName.trim() || undefined;
      ladiesPar = manualLadiesPar.trim() ? parseFloat(manualLadiesPar) : undefined;
      ladiesCourseRating = manualLadiesCourseRating.trim() ? parseFloat(manualLadiesCourseRating) : undefined;
      ladiesSlopeRating = manualLadiesSlopeRating.trim() ? parseFloat(manualLadiesSlopeRating) : undefined;
    } else if (teeSetupMode === "single" && selectedTee) {
      teeName = selectedTee.tee_name;
      par = selectedTee.par_total;
      courseRating = selectedTee.course_rating;
      slopeRating = selectedTee.slope_rating;
      ladiesTeeName = selectedTee.tee_name;
      ladiesPar = selectedTee.par_total;
      ladiesCourseRating = selectedTee.course_rating;
      ladiesSlopeRating = selectedTee.slope_rating;
    } else {
      const male = selectedMaleTee;
      const female = selectedFemaleTee;
      teeName = male?.tee_name;
      par = male?.par_total;
      courseRating = male?.course_rating;
      slopeRating = male?.slope_rating;
      ladiesTeeName = female?.tee_name;
      ladiesPar = female?.par_total;
      ladiesCourseRating = female?.course_rating;
      ladiesSlopeRating = female?.slope_rating;
    }

    const courseId = selectedCourseEdit?.id || event?.course_id || undefined;
    const fromImported = !showManualTee && (teeSetupMode === "single" ? selectedTee : (selectedMaleTee || selectedFemaleTee));
    const teeSource = fromImported ? "imported" : (teeName || par != null || courseRating != null || slopeRating != null) ? "manual" : undefined;

    console.log("[EventDetail] save tee values (tee_id not saved):", { tee_name: teeName, ladies_tee_name: ladiesTeeName, tee_source: teeSource });

    if (teeSource === "manual" && courseId && (teeName || ladiesTeeName)) {
      try {
        await upsertManualTeesToCourse(courseId, formCourseName.trim() || undefined, {
          male: teeName ? { tee_name: teeName, par, course_rating: courseRating, slope_rating: slopeRating } : undefined,
          female: ladiesTeeName ? { tee_name: ladiesTeeName, par: ladiesPar, course_rating: ladiesCourseRating, slope_rating: ladiesSlopeRating } : undefined,
        });
      } catch (e) {
        console.warn("[EventDetail] Failed to persist manual tees to course_tees:", (e as Error)?.message);
      }
    }

    // Explicit tee snapshot (single source of truth) + legacy for backward compatibility
    const snapshot =
      teeSetupMode === "single"
        ? {
            singleTeeName: teeName,
            singleCourseRating: courseRating,
            singleSlopeRating: slopeRating,
            singlePar: par,
          }
        : {
            maleTeeName: teeName,
            maleCourseRating: courseRating,
            maleSlopeRating: slopeRating,
            malePar: par,
            femaleTeeName: ladiesTeeName,
            femaleCourseRating: ladiesCourseRating,
            femaleSlopeRating: ladiesSlopeRating,
            femalePar: ladiesPar,
          };

    setSaving(true);
    try {
      await updateEvent(eventId, {
        name: formName.trim(),
        date: formDate.trim() || undefined,
        format: formFormat,
        classification: formClassification,
        courseName: formCourseName.trim() || undefined,
        courseId: courseId || undefined,
        teeId: undefined,
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
        teeSetupMode,
        ...snapshot,
      });

      setIsEditing(false);
      loadEvent(); // Reload to get updated data
      showAlert("Saved", "Event updated successfully.");
    } catch (e: any) {
      showAlert("Error", e?.message || "Failed to update event.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEvent = () => {
    if (saving) return;
    confirmDestructive(
      "Delete Event",
      `Are you sure you want to delete "${event?.name}"? This cannot be undone.`,
      "Delete",
      async () => {
        if (!eventId) return;
        setSaving(true);
        try {
          await deleteEvent(eventId);
          router.replace("/(app)/(tabs)/events");
        } catch (e: any) {
          setSaving(false);
          showAlert("Error", e?.message || "Failed to delete event.");
        }
      },
    );
  };

  if (bootstrapLoading || loading) {
    return (
      <Screen>
        <LoadingState message="Loading event..." />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <SecondaryButton onPress={() => goBack(router, "/(app)/(tabs)/events")} size="sm">
          <Feather name="arrow-left" size={16} color={colors.text} /> Back
        </SecondaryButton>
        <EmptyState title="Error" message={error} />
      </Screen>
    );
  }

  if (!event) {
    return (
      <Screen>
        <EmptyState title="Not found" message="Event not available." />
      </Screen>
    );
  }

  const formatLabel =
    EVENT_FORMATS.find((f) => f.value === event.format)?.label ??
    event.format;

  const classificationLabel =
    EVENT_CLASSIFICATIONS.find((c) => c.value === event.classification)
      ?.label ?? event.classification;

  const handleOpenPoints = () => {
    if (!eventId) {
      console.error("[EventDetail] Cannot open points: eventId is undefined");
      return;
    }
    console.log("[EventDetail] opening points for event:", eventId);
    router.push({ pathname: "/(app)/event/[id]/points", params: { id: eventId } });
  };

  // Edit mode view
  if (isEditing) {
    return (
      <Screen>
        <View style={styles.formHeader}>
          <SecondaryButton onPress={cancelEditing} size="sm">
            Cancel
          </SecondaryButton>
          <AppText variant="h2">Edit Event</AppText>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <AppCard>
            <View style={styles.formField}>
              <AppText variant="captionBold" style={styles.label}>Event Name</AppText>
              <AppInput
                placeholder="e.g. Monthly Medal"
                value={formName}
                onChangeText={setFormName}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.formField}>
              <AppText variant="captionBold" style={styles.label}>Date (YYYY-MM-DD)</AppText>
              <AppInput
                placeholder="e.g. 2025-02-15"
                value={formDate}
                onChangeText={setFormDate}
                keyboardType="numbers-and-punctuation"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.formField}>
              <AppText variant="captionBold" style={styles.label}>Format</AppText>
              <View style={styles.pickerRow}>
                {EVENT_FORMATS.map((f) => (
                  <PickerOption
                    key={f.value}
                    label={f.label}
                    selected={formFormat === f.value}
                    onPress={() => setFormFormat(f.value)}
                    colors={colors}
                  />
                ))}
              </View>
            </View>

            <View style={styles.formField}>
              <AppText variant="captionBold" style={styles.label}>Classification</AppText>
              <View style={styles.pickerRow}>
                {EVENT_CLASSIFICATIONS.map((c) => (
                  <PickerOption
                    key={c.value}
                    label={c.label}
                    selected={formClassification === c.value}
                    onPress={() => setFormClassification(c.value)}
                    colors={colors}
                  />
                ))}
              </View>
            </View>

            {/* Course / Tee Setup Toggle */}
            <Pressable
              onPress={() => setShowTeeSettings(!showTeeSettings)}
              style={styles.teeSettingsToggle}
            >
              <View style={{ flex: 1 }}>
                <AppText variant="captionBold">Course / Tee Setup</AppText>
                <AppText variant="small" color="secondary">
                  For WHS handicap calculations
                </AppText>
              </View>
              <Feather
                name={showTeeSettings ? "chevron-up" : "chevron-down"}
                size={20}
                color={colors.textTertiary}
              />
            </Pressable>

            {/* Course / Tee Setup body */}
            {showTeeSettings && (
              <View style={styles.teeSettingsContainer}>
                {/* Course search */}
                <View style={styles.formField}>
                  <AppText variant="caption" style={styles.label}>Search Course</AppText>
                  <AppInput
                    placeholder="Search courses…"
                    value={courseSearchQuery}
                    onChangeText={setCourseSearchQuery}
                    autoCapitalize="none"
                  />
                  {courseSearching && (
                    <AppText variant="small" color="tertiary" style={{ marginTop: 4 }}>Searching…</AppText>
                  )}
                  {courseSearchError && (
                    <AppText variant="small" style={{ color: colors.error, marginTop: 4 }}>{courseSearchError}</AppText>
                  )}
                  {courseSearchResults.length > 0 && (
                    <View style={styles.searchResults}>
                      {courseSearchResults.slice(0, 8).map((hit) => (
                        <Pressable
                          key={hit.id}
                          onPress={() => handleEditSelectCourse(hit)}
                          style={({ pressed }) => [styles.searchResultItem, { backgroundColor: pressed ? colors.backgroundSecondary : "transparent" }]}
                        >
                          <AppText variant="body" numberOfLines={1}>{hit.club_name || hit.name}</AppText>
                          {typeof hit.location === "string" && hit.location && (
                            <AppText variant="small" color="tertiary">{hit.location}</AppText>
                          )}
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>

                {/* Selected course name (editable) */}
                <View style={styles.formField}>
                  <AppText variant="caption" style={styles.label}>Course Name</AppText>
                  <AppInput
                    placeholder="e.g. Forest of Arden"
                    value={formCourseName}
                    onChangeText={setFormCourseName}
                    autoCapitalize="words"
                  />
                </View>

                {/* Separate mode with only one tee: show non-blocking warning */}
                {teeSetupMode === "separate" && (
                  (showManualTee && ((manualTeeName.trim() && !manualLadiesTeeName.trim()) || (!manualTeeName.trim() && manualLadiesTeeName.trim()))) ||
                  (!showManualTee && ((selectedMaleTee && !selectedFemaleTee) || (!selectedMaleTee && selectedFemaleTee)))
                ) && (
                  <InlineNotice
                    variant="info"
                    message="Consider selecting both male and female tees for mixed-gender events. You can still save with one tee."
                    style={{ marginBottom: spacing.sm }}
                  />
                )}
                {/* Tee Setup Mode + selectors */}
                {(selectedCourseEdit?.id || event.course_id) && (
                  <View style={styles.formField}>
                    <AppText variant="captionBold" style={styles.label}>Tee Setup Mode</AppText>
                    <View style={[styles.modeRow, { borderColor: colors.border }]}>
                      <Pressable
                        onPress={() => setTeeSetupMode("single")}
                        style={[
                          styles.modeOption,
                          { borderColor: teeSetupMode === "single" ? colors.primary : colors.border },
                          teeSetupMode === "single" && { backgroundColor: colors.primary + "14" },
                        ]}
                      >
                        <AppText variant="caption" style={{ color: teeSetupMode === "single" ? colors.primary : colors.text }}>
                          Single Tee For All
                        </AppText>
                      </Pressable>
                      <Pressable
                        onPress={() => setTeeSetupMode("separate")}
                        style={[
                          styles.modeOption,
                          { borderColor: teeSetupMode === "separate" ? colors.primary : colors.border },
                          teeSetupMode === "separate" && { backgroundColor: colors.primary + "14" },
                        ]}
                      >
                        <AppText variant="caption" style={{ color: teeSetupMode === "separate" ? colors.primary : colors.text }}>
                          Separate Male/Female Tees
                        </AppText>
                      </Pressable>
                    </View>
                    {teesLoading ? (
                      <AppText variant="small" color="tertiary" style={{ marginTop: spacing.sm }}>Importing course and tees…</AppText>
                    ) : tees.length > 0 ? (
                      <View style={{ marginTop: spacing.sm }}>
                        {teeSetupMode === "single" ? (
                          <>
                            <AppText variant="caption" color="secondary" style={styles.label}>Tee (all players)</AppText>
                            <CourseTeeSelector
                              tees={tees}
                              selectedTee={selectedTee}
                              onSelectTee={(tee) => { setSelectedTee(tee); setSelectedMaleTee(null); setSelectedFemaleTee(null); setShowManualTee(false); }}
                            />
                          </>
                        ) : (
                          <>
                            <AppText variant="caption" color="secondary" style={styles.label}>Male Tee</AppText>
                            <CourseTeeSelector
                              tees={tees}
                              selectedTee={selectedMaleTee}
                              onSelectTee={(tee) => { setSelectedMaleTee(tee); setSelectedTee(null); setShowManualTee(false); }}
                            />
                            <AppText variant="caption" color="secondary" style={[styles.label, { marginTop: spacing.base }]}>Female Tee</AppText>
                            <CourseTeeSelector
                              tees={tees}
                              selectedTee={selectedFemaleTee}
                              onSelectTee={(tee) => { setSelectedFemaleTee(tee); setSelectedTee(null); setShowManualTee(false); }}
                            />
                          </>
                        )}
                      </View>
                    ) : (
                      <AppText variant="small" color="tertiary" style={{ marginTop: spacing.sm, marginBottom: spacing.xs }}>
                        No tees found for this course.
                      </AppText>
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

                {/* Manual tee link when no course selected at all */}
                {!selectedCourseEdit?.id && !event.course_id && !showManualTee && (
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
                      {(selectedTee || selectedMaleTee || selectedFemaleTee) && tees.length > 0 && (
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

                <View style={styles.formField}>
                  <AppText variant="caption" style={styles.label}>
                    Handicap Allowance (%)
                  </AppText>
                  <AppInput
                    placeholder="95"
                    value={formHandicapAllowance}
                    onChangeText={setFormHandicapAllowance}
                    keyboardType="number-pad"
                  />
                  <AppText variant="small" color="tertiary" style={{ marginTop: 4 }}>
                    Default 95% for individual stroke play
                  </AppText>
                </View>
              </View>
            )}

            <PrimaryButton
              onPress={handleSaveEvent}
              loading={saving}
              style={{ marginTop: spacing.sm }}
            >
              Save Changes
            </PrimaryButton>

            {permissions.canDeleteEvents && (
              <SecondaryButton
                onPress={handleDeleteEvent}
                loading={saving}
                style={{ marginTop: spacing.sm }}
              >
                <Feather name="trash-2" size={16} color={colors.error} />
                <AppText style={{ color: colors.error, marginLeft: spacing.xs }}>Delete Event</AppText>
              </SecondaryButton>
            )}
          </AppCard>
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      {/* Society logo centered at top */}
      <SocietyPageHeader
        logoUrl={logoUrl}
        societyName={society?.name || "Golf Society"}
        placeholderText={
          society?.name
            ? society.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "GS"
            : "GS"
        }
      />

      {/* Header with Back and Edit */}
      <View style={styles.header}>
        <SecondaryButton onPress={() => goBack(router, "/(app)/(tabs)/events")} size="sm">
          <Feather name="arrow-left" size={16} color={colors.text} /> Back
        </SecondaryButton>
        <View style={styles.headerRight}>
          {canEditEvent && (
            <SecondaryButton onPress={startEditing} size="sm">
              <Feather name="edit-2" size={14} color={colors.text} /> Edit
            </SecondaryButton>
          )}
        </View>
      </View>

      {/* Title */}
      <AppText variant="title" style={{ marginBottom: spacing.sm }}>
        {event.name}
      </AppText>

      {/* Details */}
      <AppCard style={styles.card}>
        <Row icon="calendar" label="Date" value={event.date ?? "TBC"} />
        <Row icon="map-pin" label="Course" value={event.courseName ?? "TBC"} />
        <Row icon="target" label="Format" value={formatLabel} />
        <Row icon="tag" label="Classification" value={classificationLabel} />
      </AppCard>

      {/* Tee Settings - only show if configured */}
      {(event.teeName || event.par != null || event.slopeRating != null ||
        event.ladiesTeeName || event.ladiesPar != null || event.ladiesSlopeRating != null) && (
        <AppCard style={styles.card}>
          <AppText variant="captionBold" color="secondary" style={{ marginBottom: spacing.sm }}>
            Course / Tee Setup
          </AppText>
          {(event.teeName || event.par != null || event.courseRating != null || event.slopeRating != null) && (
            <>
              <AppText variant="caption" color="tertiary" style={{ marginBottom: spacing.xs }}>Male Tee</AppText>
              {event.teeName && <Row icon="flag" label="Tee" value={event.teeName} />}
              {event.par != null && <Row icon="hash" label="Par" value={String(event.par)} />}
              {event.courseRating != null && (
                <Row icon="activity" label="Course Rating" value={String(event.courseRating)} />
              )}
              {event.slopeRating != null && (
                <Row icon="trending-up" label="Slope Rating" value={String(event.slopeRating)} />
              )}
            </>
          )}
          {(event.ladiesTeeName || event.ladiesPar != null || event.ladiesCourseRating != null || event.ladiesSlopeRating != null) && (
            <>
              <AppText variant="caption" color="tertiary" style={{ marginTop: spacing.sm, marginBottom: spacing.xs }}>Female Tee</AppText>
              {event.ladiesTeeName && <Row icon="flag" label="Tee" value={event.ladiesTeeName} />}
              {event.ladiesPar != null && <Row icon="hash" label="Par" value={String(event.ladiesPar)} />}
              {event.ladiesCourseRating != null && (
                <Row icon="activity" label="Course Rating" value={String(event.ladiesCourseRating)} />
              )}
              {event.ladiesSlopeRating != null && (
                <Row icon="trending-up" label="Slope Rating" value={String(event.ladiesSlopeRating)} />
              )}
            </>
          )}
          {event.handicapAllowance != null && (
            <Row
              icon="percent"
              label="Handicap Allowance"
              value={`${Math.round(event.handicapAllowance * 100)}%`}
            />
          )}
        </AppCard>
      )}

      {/* Players link */}
      <Pressable
        onPress={() =>
          router.push({
            pathname: "/(app)/event/[id]/players",
            params: { id: eventId },
          })
        }
      >
        <AppCard style={styles.actionCard}>
          <ActionRow
            icon="users"
            title="Players"
            subtitle={`${paidCount} paid · ${inCount} confirmed`}
          />
        </AppCard>
      </Pressable>

      {/* View Tee Sheet — when tee times published */}
      {event.teeTimePublishedAt && (
        <Pressable
          onPress={() =>
            router.push({
              pathname: "/(app)/event/[id]/tee-sheet",
              params: { id: eventId },
            })
          }
        >
          <AppCard style={styles.actionCard}>
            <View style={styles.actionRow}>
              <View style={[styles.iconContainer, { backgroundColor: colors.success + "20" }]}>
                <Feather name="flag" size={18} color={colors.success} />
              </View>
              <View style={styles.actionContent}>
                <AppText variant="bodyBold">View Tee Sheet</AppText>
                <AppText variant="caption" color="secondary">
                  Your tee time and full tee sheet
                </AppText>
              </View>
              <Feather name="chevron-right" size={20} color={colors.textTertiary} />
            </View>
          </AppCard>
        </Pressable>
      )}

      {/* Paid Players dashboard */}
      {registrations.length > 0 && (
        <AppCard style={styles.card}>
          <View style={styles.paidHeader}>
            <View style={{ flex: 1 }}>
              <AppText variant="h2">Paid Players</AppText>
              <AppText variant="small" color="secondary">
                {paidCount} of {inCount} paid
              </AppText>
            </View>
            <View style={[styles.paidSummaryPill, { backgroundColor: paidCount === inCount && inCount > 0 ? colors.success + "14" : colors.warning + "14" }]}>
              <Feather
                name={paidCount === inCount && inCount > 0 ? "check-circle" : "alert-circle"}
                size={14}
                color={paidCount === inCount && inCount > 0 ? colors.success : colors.warning}
              />
              <AppText variant="small" style={{ color: paidCount === inCount && inCount > 0 ? colors.success : colors.warning, fontWeight: "700" }}>
                {paidCount === inCount && inCount > 0 ? "All paid" : `${inCount - paidCount} unpaid`}
              </AppText>
            </View>
          </View>

          {registrations
            .filter((r) => r.status === "in")
            .map((reg) => (
            <View key={reg.id} style={styles.paidRow}>
              <AppText variant="body" numberOfLines={1} style={{ flex: 1 }}>
                {memberNameMap[reg.member_id] ?? "Member"}
              </AppText>
              <View style={[styles.paidPill, { backgroundColor: reg.paid ? colors.success : colors.error }]}>
                <AppText style={styles.paidPillText}>{reg.paid ? "PAID" : "UNPAID"}</AppText>
              </View>
              {canManagePayments && (
                <Pressable
                  disabled={payBusy === reg.member_id}
                  onPress={() => handleTogglePaid(reg)}
                  hitSlop={8}
                  style={({ pressed }) => [styles.paidToggleBtn, { borderColor: colors.border, opacity: pressed ? 0.6 : payBusy === reg.member_id ? 0.4 : 1 }]}
                >
                  <AppText variant="small" color="primary" style={{ fontWeight: "600" }}>
                    {reg.paid ? "Undo" : "Confirm"}
                  </AppText>
                </Pressable>
              )}
            </View>
          ))}

          {registrations.filter((r) => r.status === "out").length > 0 && (
            <View style={{ marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: "#F3F4F6" }}>
              <AppText variant="captionBold" color="tertiary" style={{ marginBottom: spacing.xs }}>Not playing</AppText>
              {registrations.filter((r) => r.status === "out").map((reg) => (
                <AppText key={reg.id} variant="small" color="tertiary" style={{ paddingVertical: 2 }}>
                  {memberNameMap[reg.member_id] ?? "Member"}
                </AppText>
              ))}
            </View>
          )}
        </AppCard>
      )}

      {/* Enter Points Section - Captain/Handicapper only */}
      {canEnterPoints && (
        <Pressable
          onPress={handleOpenPoints}
          style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
        >
          <AppCard style={styles.actionCard}>
            <View style={styles.actionRow}>
              <View style={[styles.iconContainer, { backgroundColor: colors.warning + "20" }]}>
                <Feather name="edit-3" size={18} color={colors.warning} />
              </View>
              <View style={styles.actionContent}>
                <AppText variant="bodyBold">Enter Points</AppText>
                <AppText variant="caption" color="secondary">
                  Add Order of Merit points for players
                </AppText>
              </View>
              <Feather name="chevron-right" size={20} color={colors.textTertiary} />
            </View>
          </AppCard>
        </Pressable>
      )}

      {/* Delete Event - Captain/Secretary/Treasurer */}
      {permissions.canDeleteEvents && (
        <SecondaryButton
          onPress={handleDeleteEvent}
          loading={saving}
          style={{ marginTop: spacing.sm }}
        >
          <Feather name="trash-2" size={16} color={colors.error} />
          <AppText style={{ color: colors.error, marginLeft: spacing.xs }}>Delete Event</AppText>
        </SecondaryButton>
      )}

      {/* Created info */}
      {event.created_at && (
        <AppText variant="small" color="tertiary" style={styles.createdText}>
          Created {new Date(event.created_at).toLocaleDateString("en-GB")}
        </AppText>
      )}
      <LicenceRequiredModal visible={modalVisible} onClose={() => setModalVisible(false)} societyId={guardSocietyId} />
      <Toast visible={payToast.visible} message={payToast.message} type={payToast.type} onHide={() => setPayToast((t) => ({ ...t, visible: false }))} />
    </Screen>
  );
}

/* ---------- Helpers ---------- */

function safeValue(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (typeof v === "object" && "address" in (v as object)) {
    const o = v as { address?: string; city?: string; country?: string };
    return [o.address, o.city, o.country].filter(Boolean).join(", ") || "";
  }
  return String(v);
}

function Row({
  icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: string | unknown;
}) {
  const colors = getColors();
  return (
    <View style={styles.row}>
      <Feather name={icon} size={16} color={colors.primary} />
      <View style={{ marginLeft: spacing.sm }}>
        <AppText variant="caption">{label}</AppText>
        <AppText>{safeValue(value)}</AppText>
      </View>
    </View>
  );
}

function ActionRow({
  icon,
  title,
  subtitle,
}: {
  icon: any;
  title: string;
  subtitle: string;
}) {
  const colors = getColors();
  return (
    <View style={styles.actionRow}>
      <Feather name={icon} size={18} color={colors.primary} />
      <View style={{ flex: 1, marginLeft: spacing.sm }}>
        <AppText variant="bodyBold">{title}</AppText>
        <AppText variant="caption">{subtitle}</AppText>
      </View>
      <Feather name="chevron-right" size={18} color={colors.textTertiary} />
    </View>
  );
}

/* ---------- Styles ---------- */

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  card: {
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  actionCard: {
    marginBottom: spacing.sm,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  actionContent: {
    flex: 1,
  },
  paidHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  paidSummaryPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  paidRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  paidPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  paidPillText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: typography.small.fontSize,
  },
  paidToggleBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderRadius: radius.sm,
    marginLeft: spacing.xs,
  },
  createdText: {
    marginTop: spacing.lg,
    textAlign: "center",
  },
  // Form styles
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
  modeRow: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  modeOption: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: "center",
  },
  teeSettingsToggle: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.06)",
    marginTop: spacing.sm,
  },
  teeSettingsContainer: {
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.04)",
  },
  readOnlyTee: {
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: "rgba(0,0,0,0.04)",
    gap: 2,
  },
  searchResults: {
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    borderRadius: radius.sm,
    maxHeight: 240,
  },
  searchResultItem: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
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
