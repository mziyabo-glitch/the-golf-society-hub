import { useCallback, useState } from "react";
import { StyleSheet, View, Pressable, Alert, ScrollView } from "react-native";
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
import { SocietyBadge } from "@/components/ui/SocietyHeader";
import { useBootstrap } from "@/lib/useBootstrap";
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
import { getPermissionsForMember } from "@/lib/rbac";
import { getColors, spacing, radius } from "@/lib/ui/theme";
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

// Tee block form component
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
}) {
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
    </View>
  );
}

export default function EventDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const { societyId, society, userId, member: currentMember, loading: bootstrapLoading } = useBootstrap();
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

  // Populate form when entering edit mode
  const startEditing = () => {
    if (!event) return;
    setFormName(event.name || "");
    setFormDate(event.date || "");
    setFormFormat(event.format || "stableford");
    setFormClassification(event.classification || "general");
    setFormCourseName(event.courseName || "");

    // Men's tee settings
    setFormMenTeeName(event.teeName || "");
    setFormMenPar(event.par != null ? String(event.par) : "");
    setFormMenCourseRating(event.courseRating != null ? String(event.courseRating) : "");
    setFormMenSlopeRating(event.slopeRating != null ? String(event.slopeRating) : "");

    // Women's tee settings
    setFormWomenTeeName(event.ladiesTeeName || "");
    setFormWomenPar(event.ladiesPar != null ? String(event.ladiesPar) : "");
    setFormWomenCourseRating(event.ladiesCourseRating != null ? String(event.ladiesCourseRating) : "");
    setFormWomenSlopeRating(event.ladiesSlopeRating != null ? String(event.ladiesSlopeRating) : "");

    // Handicap allowance
    setFormHandicapAllowance(
      event.handicapAllowance != null
        ? String(Math.round(event.handicapAllowance * 100))
        : "95"
    );

    // Show tee settings if any are configured
    const hasTeeSettings =
      event.teeName || event.par != null || event.slopeRating != null ||
      event.ladiesTeeName || event.ladiesPar != null || event.ladiesSlopeRating != null;
    setShowTeeSettings(!!hasTeeSettings);

    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
  };

  // Validate numeric tee input
  const validateTeeInput = (
    par: string,
    courseRating: string,
    slopeRating: string,
    label: string
  ): boolean => {
    if (par.trim()) {
      const parNum = parseInt(par.trim(), 10);
      if (isNaN(parNum) || parNum < 27 || parNum > 90) {
        Alert.alert("Invalid Par", `${label} Par must be between 27 and 90.`);
        return false;
      }
    }
    if (courseRating.trim()) {
      const crNum = parseFloat(courseRating.trim());
      if (isNaN(crNum) || crNum < 50 || crNum > 90) {
        Alert.alert("Invalid Course Rating", `${label} Course Rating must be between 50 and 90.`);
        return false;
      }
    }
    if (slopeRating.trim()) {
      const srNum = parseInt(slopeRating.trim(), 10);
      if (isNaN(srNum) || srNum < 55 || srNum > 155) {
        Alert.alert("Invalid Slope Rating", `${label} Slope Rating must be between 55 and 155.`);
        return false;
      }
    }
    return true;
  };

  const handleSaveEvent = async () => {
    if (!eventId) return;

    if (!formName.trim()) {
      Alert.alert("Missing Name", "Please enter an event name.");
      return;
    }

    // Validate date format if provided
    if (formDate.trim()) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(formDate.trim())) {
        Alert.alert("Invalid Date", "Please enter date in YYYY-MM-DD format.");
        return;
      }
    }

    // Validate Men's tee settings
    if (!validateTeeInput(formMenPar, formMenCourseRating, formMenSlopeRating, "Men's")) {
      return;
    }

    // Validate Women's tee settings
    if (!validateTeeInput(formWomenPar, formWomenCourseRating, formWomenSlopeRating, "Women's")) {
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
      : 0.95;

    setSaving(true);
    try {
      await updateEvent(eventId, {
        name: formName.trim(),
        date: formDate.trim() || undefined,
        format: formFormat,
        classification: formClassification,
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
      });

      setIsEditing(false);
      loadEvent(); // Reload to get updated data
      Alert.alert("Saved", "Event updated successfully.");
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to update event.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEvent = () => {
    if (saving) return;
    Alert.alert(
      "Delete Event",
      `Are you sure you want to delete "${event?.name}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (!eventId) return;
            setSaving(true);
            try {
              await deleteEvent(eventId);
              router.replace("/(app)/(tabs)/events");
            } catch (e: any) {
              setSaving(false);
              Alert.alert("Error", e?.message || "Failed to delete event.");
            }
          },
        },
      ]
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
        <SecondaryButton onPress={() => router.back()} size="sm">
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

        <ScrollView showsVerticalScrollIndicator={false}>
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

            {/* Tee Settings Fields */}
            {showTeeSettings && (
              <View style={styles.teeSettingsContainer}>
                <View style={styles.formField}>
                  <AppText variant="caption" style={styles.label}>Course Name</AppText>
                  <AppInput
                    placeholder="e.g. Royal Liverpool"
                    value={formCourseName}
                    onChangeText={setFormCourseName}
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
                  onTeeNameChange={setFormMenTeeName}
                  onParChange={setFormMenPar}
                  onCourseRatingChange={setFormMenCourseRating}
                  onSlopeRatingChange={setFormMenSlopeRating}
                />

                {/* Women's Tee Block */}
                <TeeBlockForm
                  title="Women's Tees"
                  color="#E53935"
                  teeName={formWomenTeeName}
                  par={formWomenPar}
                  courseRating={formWomenCourseRating}
                  slopeRating={formWomenSlopeRating}
                  onTeeNameChange={setFormWomenTeeName}
                  onParChange={setFormWomenPar}
                  onCourseRatingChange={setFormWomenCourseRating}
                  onSlopeRatingChange={setFormWomenSlopeRating}
                />

                {/* Handicap Allowance */}
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

            <SecondaryButton
              onPress={handleDeleteEvent}
              loading={saving}
              style={{ marginTop: spacing.sm }}
            >
              <Feather name="trash-2" size={16} color={colors.error} />
              <AppText style={{ color: colors.error, marginLeft: spacing.xs }}>Delete Event</AppText>
            </SecondaryButton>
          </AppCard>
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      {/* Header with Back, Edit, and Society Badge */}
      <View style={styles.header}>
        <SecondaryButton onPress={() => router.back()} size="sm">
          <Feather name="arrow-left" size={16} color={colors.text} /> Back
        </SecondaryButton>
        <View style={styles.headerRight}>
          {canEditEvent && (
            <SecondaryButton onPress={startEditing} size="sm">
              <Feather name="edit-2" size={14} color={colors.text} /> Edit
            </SecondaryButton>
          )}
          <SocietyBadge
            societyName={society?.name || "Golf Society"}
            logoUrl={logoUrl}
            size="sm"
            showName={false}
          />
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
      {(event.teeName || event.par != null || event.slopeRating != null) && (
        <AppCard style={styles.card}>
          <AppText variant="captionBold" color="secondary" style={{ marginBottom: spacing.sm }}>
            Course / Tee Setup
          </AppText>
          {event.teeName && <Row icon="flag" label="Tee" value={event.teeName} />}
          {event.par != null && <Row icon="hash" label="Par" value={String(event.par)} />}
          {event.courseRating != null && (
            <Row icon="activity" label="Course Rating" value={String(event.courseRating)} />
          )}
          {event.slopeRating != null && (
            <Row icon="trending-up" label="Slope Rating" value={String(event.slopeRating)} />
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

      {/* Players */}
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
            subtitle={`${(event as any).player_ids?.length ?? event.playerIds?.length ?? 0} registered`}
          />
        </AppCard>
      </Pressable>

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

      {/* Created info */}
      {event.created_at && (
        <AppText variant="small" color="tertiary" style={styles.createdText}>
          Created {new Date(event.created_at).toLocaleDateString("en-GB")}
        </AppText>
      )}
    </Screen>
  );
}

/* ---------- Helpers ---------- */

function Row({
  icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: string;
}) {
  const colors = getColors();
  return (
    <View style={styles.row}>
      <Feather name={icon} size={16} color={colors.primary} />
      <View style={{ marginLeft: spacing.sm }}>
        <AppText variant="caption">{label}</AppText>
        <AppText>{value}</AppText>
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
