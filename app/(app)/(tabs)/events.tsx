import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View, Pressable, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { Toast } from "@/components/ui/Toast";
import { useBootstrap } from "@/lib/useBootstrap";
import { useAsyncAction } from "@/lib/hooks/useAsyncAction";
import {
  getEventsBySocietyId,
  createEvent,
  type EventDoc,
  type EventFormat,
  type EventClassification,
  EVENT_FORMATS,
  EVENT_CLASSIFICATIONS,
} from "@/lib/db_supabase/eventRepo";
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

// Tee block component for reuse (Men's and Women's)
function TeeBlockForm({
  title,
  color,
  teeName,
  par,
  courseRating,
  slopeRating,
  onTeeNameChange,
  onParChange,
  onCourseRatingChange,
  onSlopeRatingChange,
  errorMessage,
}: {
  title: string;
  color: string;
  teeName: string;
  par: string;
  courseRating: string;
  slopeRating: string;
  onTeeNameChange: (v: string) => void;
  onParChange: (v: string) => void;
  onCourseRatingChange: (v: string) => void;
  onSlopeRatingChange: (v: string) => void;
  errorMessage?: string;
}) {
  const colors = getColors();

  return (
    <View style={[styles.teeBlock, { borderLeftColor: color }]}>
      <View style={styles.teeBlockHeader}>
        <View style={[styles.teeColorDot, { backgroundColor: color }]} />
        <AppText variant="captionBold">{title}</AppText>
      </View>

      <View style={styles.formField}>
        <AppText variant="caption" style={styles.label}>Tee Name</AppText>
        <AppInput
          placeholder={title === "Men's Tees" ? "e.g. Yellow" : "e.g. Red"}
          value={teeName}
          onChangeText={onTeeNameChange}
          autoCapitalize="words"
        />
      </View>

      <View style={styles.teeSettingsRow}>
        <View style={[styles.formField, { flex: 1 }]}>
          <AppText variant="caption" style={styles.label}>Par</AppText>
          <AppInput
            placeholder="72"
            value={par}
            onChangeText={onParChange}
            keyboardType="number-pad"
          />
        </View>

        <View style={[styles.formField, { flex: 1.5 }]}>
          <AppText variant="caption" style={styles.label}>Course Rating</AppText>
          <AppInput
            placeholder="72.5"
            value={courseRating}
            onChangeText={onCourseRatingChange}
            keyboardType="decimal-pad"
          />
        </View>

        <View style={[styles.formField, { flex: 1 }]}>
          <AppText variant="caption" style={styles.label}>Slope</AppText>
          <AppInput
            placeholder="127"
            value={slopeRating}
            onChangeText={onSlopeRatingChange}
            keyboardType="number-pad"
          />
        </View>
      </View>
      {errorMessage ? (
        <AppText variant="small" style={[styles.fieldError, { color: colors.error }]}>
          {errorMessage}
        </AppText>
      ) : null}
    </View>
  );
}

type FormErrors = {
  name?: string;
  date?: string;
  format?: string;
  classification?: string;
  menTees?: string;
  womenTees?: string;
  handicapAllowance?: string;
};

export default function EventsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ create?: string; classification?: string }>();
  const { societyId, member, user, loading: bootstrapLoading } = useBootstrap();
  const colors = getColors();
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

  // Tee Settings form state
  const [showTeeSettings, setShowTeeSettings] = useState(false);
  const [formCourseName, setFormCourseName] = useState("");

  // Men's tee settings
  const [formMenTeeName, setFormMenTeeName] = useState("");
  const [formMenPar, setFormMenPar] = useState("");
  const [formMenCourseRating, setFormMenCourseRating] = useState("");
  const [formMenSlopeRating, setFormMenSlopeRating] = useState("");

  // Women's tee settings
  const [formWomenTeeName, setFormWomenTeeName] = useState("");
  const [formWomenPar, setFormWomenPar] = useState("");
  const [formWomenCourseRating, setFormWomenCourseRating] = useState("");
  const [formWomenSlopeRating, setFormWomenSlopeRating] = useState("");

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

  const loadEvents = async () => {
    if (!societyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getEventsBySocietyId(societyId);
      setEvents(data);
    } catch (err) {
      console.error("Failed to load events:", err);
      const formatted = formatError(err);
      setLoadError(formatted);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, [societyId]);

  // Refetch on focus to pick up changes from other screens
  useFocusEffect(
    useCallback(() => {
      if (societyId) {
        loadEvents();
      }
    }, [societyId])
  );

  // Validate numeric tee input
  const validateTeeInput = (
    par: string,
    courseRating: string,
    slopeRating: string,
    label: string
  ): string | null => {
    if (par.trim()) {
      const parNum = parseInt(par.trim(), 10);
      if (isNaN(parNum) || parNum < 27 || parNum > 90) {
        return `${label} Par must be between 27 and 90.`;
      }
    }
    if (courseRating.trim()) {
      const crNum = parseFloat(courseRating.trim());
      if (isNaN(crNum) || crNum < 50 || crNum > 90) {
        return `${label} Course Rating must be between 50 and 90.`;
      }
    }
    if (slopeRating.trim()) {
      const srNum = parseInt(slopeRating.trim(), 10);
      if (isNaN(srNum) || srNum < 55 || srNum > 155) {
        return `${label} Slope Rating must be between 55 and 155.`;
      }
    }
    return null;
  };

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

    const menError = validateTeeInput(formMenPar, formMenCourseRating, formMenSlopeRating, "Men's");
    if (menError) errors.menTees = menError;

    const womenError = validateTeeInput(formWomenPar, formWomenCourseRating, formWomenSlopeRating, "Women's");
    if (womenError) errors.womenTees = womenError;

    if (formHandicapAllowance.trim()) {
      const allowanceValue = Number(formHandicapAllowance.trim());
      if (Number.isNaN(allowanceValue) || allowanceValue <= 0 || allowanceValue > 100) {
        errors.handicapAllowance = "Handicap allowance must be between 1 and 100.";
      }
    }

    return errors;
  };

  const handleCreateEvent = async () => {
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
      if (errors.menTees || errors.womenTees || errors.handicapAllowance) {
        setShowTeeSettings(true);
      }
      return;
    }

    if (!societyId || !user?.uid) {
      console.error("[createEvent] Missing societyId or userId:", { societyId, userId: user?.uid });
      setValidationNotice("Not signed in or no society selected.");
      return;
    }

    // Parse tee settings
    const menPar = formMenPar.trim() ? parseInt(formMenPar.trim(), 10) : undefined;
    const menCourseRating = formMenCourseRating.trim() ? parseFloat(formMenCourseRating.trim()) : undefined;
    const menSlopeRating = formMenSlopeRating.trim() ? parseInt(formMenSlopeRating.trim(), 10) : undefined;

    const womenPar = formWomenPar.trim() ? parseInt(formWomenPar.trim(), 10) : undefined;
    const womenCourseRating = formWomenCourseRating.trim() ? parseFloat(formWomenCourseRating.trim()) : undefined;
    const womenSlopeRating = formWomenSlopeRating.trim() ? parseInt(formWomenSlopeRating.trim(), 10) : undefined;

    const handicapAllowance = formHandicapAllowance.trim()
      ? parseFloat(formHandicapAllowance.trim()) / 100
      : 0.95; // Default to 95%

    // Warn if generating tee sheet without tee settings
    const hasMenTees = menPar != null && menCourseRating != null && menSlopeRating != null;
    const hasWomenTees = womenPar != null && womenCourseRating != null && womenSlopeRating != null;

    if (!hasMenTees && !hasWomenTees) {
      // Just a warning, not blocking
      console.log("[createEvent] Warning: No tee settings configured");
    }

    console.log("[createEvent] Calling createEvent...");
    const created = await createAction.run(async () =>
      createEvent(societyId, {
        name: formName.trim(),
        date: formDate.trim(),
        format: formFormat,
        classification: formClassification,
        createdBy: user.uid,
        // Course name
        courseName: formCourseName.trim() || undefined,
        // Men's tee settings
        teeName: formMenTeeName.trim() || undefined,
        par: menPar,
        courseRating: menCourseRating,
        slopeRating: menSlopeRating,
        // Women's tee settings
        ladiesTeeName: formWomenTeeName.trim() || undefined,
        ladiesPar: womenPar,
        ladiesCourseRating: womenCourseRating,
        ladiesSlopeRating: womenSlopeRating,
        // Shared allowance
        handicapAllowance,
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
    setFormCourseName("");
    setFormMenTeeName("");
    setFormMenPar("");
    setFormMenCourseRating("");
    setFormMenSlopeRating("");
    setFormWomenTeeName("");
    setFormWomenPar("");
    setFormWomenCourseRating("");
    setFormWomenSlopeRating("");
    setFormHandicapAllowance("95");
    setShowTeeSettings(false);
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
      <Screen scrollable={false}>
        <View style={styles.centered}>
          <LoadingState message="Loading events..." />
        </View>
      </Screen>
    );
  }

  // Create form view
  if (showCreateForm) {
    return (
      <Screen>
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

        <ScrollView showsVerticalScrollIndicator={false}>
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

            {/* Course / Tee Setup Toggle */}
            <Pressable
              onPress={() => setShowTeeSettings(!showTeeSettings)}
              style={styles.teeSettingsToggle}
            >
              <View style={{ flex: 1 }}>
                <AppText variant="captionBold">Course / Tee Setup</AppText>
                <AppText variant="small" color="secondary">
                  Optional - for WHS handicap calculations
                </AppText>
              </View>
              <Feather
                name={showTeeSettings ? "chevron-up" : "chevron-down"}
                size={20}
                color={colors.textTertiary}
              />
            </Pressable>

            {/* Tee Settings Fields (Collapsible) */}
            {showTeeSettings && (
              <View style={styles.teeSettingsContainer}>
                <View style={styles.formField}>
                  <AppText variant="caption" style={styles.label}>Course Name</AppText>
                  <AppInput
                    placeholder="e.g. Royal Liverpool"
                    value={formCourseName}
                    onChangeText={(value) => {
                      setFormCourseName(value);
                      setValidationNotice(null);
                    }}
                    autoCapitalize="words"
                  />
                </View>

                {/* Men's Tee Block */}
                <TeeBlockForm
                  title="Men's Tees"
                  color="#FFD700"
                  teeName={formMenTeeName}
                  par={formMenPar}
                  courseRating={formMenCourseRating}
                  slopeRating={formMenSlopeRating}
                  onTeeNameChange={(value) => {
                    setFormMenTeeName(value);
                    setValidationNotice(null);
                  }}
                  onParChange={(value) => {
                    setFormMenPar(value);
                    setValidationNotice(null);
                    setFormErrors((prev) => ({ ...prev, menTees: undefined }));
                  }}
                  onCourseRatingChange={(value) => {
                    setFormMenCourseRating(value);
                    setValidationNotice(null);
                    setFormErrors((prev) => ({ ...prev, menTees: undefined }));
                  }}
                  onSlopeRatingChange={(value) => {
                    setFormMenSlopeRating(value);
                    setValidationNotice(null);
                    setFormErrors((prev) => ({ ...prev, menTees: undefined }));
                  }}
                  errorMessage={formErrors.menTees}
                />

                {/* Women's Tee Block */}
                <TeeBlockForm
                  title="Women's Tees"
                  color="#E53935"
                  teeName={formWomenTeeName}
                  par={formWomenPar}
                  courseRating={formWomenCourseRating}
                  slopeRating={formWomenSlopeRating}
                  onTeeNameChange={(value) => {
                    setFormWomenTeeName(value);
                    setValidationNotice(null);
                  }}
                  onParChange={(value) => {
                    setFormWomenPar(value);
                    setValidationNotice(null);
                    setFormErrors((prev) => ({ ...prev, womenTees: undefined }));
                  }}
                  onCourseRatingChange={(value) => {
                    setFormWomenCourseRating(value);
                    setValidationNotice(null);
                    setFormErrors((prev) => ({ ...prev, womenTees: undefined }));
                  }}
                  onSlopeRatingChange={(value) => {
                    setFormWomenSlopeRating(value);
                    setValidationNotice(null);
                    setFormErrors((prev) => ({ ...prev, womenTees: undefined }));
                  }}
                  errorMessage={formErrors.womenTees}
                />

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
              </View>
            )}

            <PrimaryButton
              onPress={handleCreateEvent}
              loading={createAction.loading}
              style={{ marginTop: spacing.sm }}
            >
              Create Event
            </PrimaryButton>
          </AppCard>
        </ScrollView>
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
    <Screen>
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

      {events.length === 0 ? (
        <EmptyState
          icon={<Feather name="calendar" size={24} color={colors.textTertiary} />}
          title="No events yet"
          message="Create your first event to start tracking results and scores."
          action={permissions.canCreateEvents ? {
            label: "Create event",
            onPress: () => setShowCreateForm(true),
          } : undefined}
        />
      ) : (
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
      )}
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
  teeSettingsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  teeBlock: {
    marginBottom: spacing.base,
    paddingLeft: spacing.sm,
    borderLeftWidth: 4,
    borderLeftColor: "#FFD700",
  },
  teeBlockHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  teeColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
});
