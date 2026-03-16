/**
 * CourseTeeSetupCard – resilient Course / Tee Setup for event creation and editing.
 *
 * Section A: Course – search, selected summary, change action
 * Section B: Tee setup – imported tees or manual entry fallback
 * Section C: Status / tools – retry sync, save, status text
 *
 * Local-first: shows saved tee data immediately, never dead-ends.
 */
import { StyleSheet, View, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppText } from "@/components/ui/AppText";
import { AppInput } from "@/components/ui/AppInput";
import { AppCard } from "@/components/ui/AppCard";
import { CourseTeeSelector } from "@/components/CourseTeeSelector";
import { getColors, spacing, radius } from "@/lib/ui/theme";
import type { CourseTee } from "@/lib/db_supabase/courseRepo";

export type TeeSyncStatus = "synced" | "manual" | "import_failed" | "pending_sync" | "idle";

export type CourseTeeSetupCardProps = {
  // Section A: Course
  courseSearchQuery: string;
  onCourseSearchChange: (v: string) => void;
  selectedCourse: { id: string; name: string } | null;
  onChangeCourse: () => void;
  courseSearching?: boolean;
  courseSearchError?: string | null;
  courseSearchResults?: { id: number; name: string; club_name?: string; location?: string }[];
  onSelectCourseResult?: (hit: { id: number; name: string; club_name?: string; location?: string }) => void;
  manualCourseName?: string;
  onManualCourseNameChange?: (v: string) => void;
  showManualCourseInput?: boolean;

  // Section B: Tee setup
  tees: CourseTee[];
  selectedTee: CourseTee | null;
  onSelectTee: (tee: CourseTee) => void;
  teesLoading?: boolean;
  teesError?: string | null;
  showManualTee: boolean;
  onSetShowManualTee: (show: boolean) => void;
  // Manual tee fields
  manualTeeName: string;
  manualPar: string;
  manualCourseRating: string;
  manualSlopeRating: string;
  manualLadiesTeeName?: string;
  manualLadiesPar?: string;
  manualLadiesCourseRating?: string;
  manualLadiesSlopeRating?: string;
  onManualTeeChange?: (field: string, value: string) => void;

  // Section C: Status / tools
  syncStatus: TeeSyncStatus;
  onRetrySync?: () => void;
  statusMessage?: string;

  // Handicap allowance (optional)
  handicapAllowance?: string;
  onHandicapAllowanceChange?: (v: string) => void;

  // Validation
  courseError?: string;
  teeError?: string;
  handicapError?: string;
};

function StatusBadge({ status, colors }: { status: TeeSyncStatus; colors: ReturnType<typeof getColors> }) {
  const config: Record<TeeSyncStatus, { label: string; color: string }> = {
    synced: { label: "Synced", color: colors.success },
    manual: { label: "Manual", color: colors.info },
    import_failed: { label: "Import failed", color: colors.warning },
    pending_sync: { label: "Syncing…", color: colors.primary },
    idle: { label: "", color: colors.textTertiary },
  };
  const c = config[status];
  if (!c.label) return null;
  return (
    <View style={[styles.statusBadge, { backgroundColor: c.color + "20" }]}>
      <AppText variant="small" style={{ color: c.color, fontWeight: "600" }}>
        {c.label}
      </AppText>
    </View>
  );
}

export function CourseTeeSetupCard({
  courseSearchQuery,
  onCourseSearchChange,
  selectedCourse,
  onChangeCourse,
  courseSearching,
  courseSearchError,
  courseSearchResults,
  onSelectCourseResult,
  manualCourseName = "",
  onManualCourseNameChange,
  showManualCourseInput = true,
  tees,
  selectedTee,
  onSelectTee,
  teesLoading,
  teesError,
  showManualTee,
  onSetShowManualTee,
  manualTeeName,
  manualPar,
  manualCourseRating,
  manualSlopeRating,
  manualLadiesTeeName = "",
  manualLadiesPar = "",
  manualLadiesCourseRating = "",
  manualLadiesSlopeRating = "",
  onManualTeeChange,
  syncStatus,
  onRetrySync,
  statusMessage,
  handicapAllowance = "95",
  onHandicapAllowanceChange,
  courseError,
  teeError,
  handicapError,
}: CourseTeeSetupCardProps) {
  const colors = getColors();

  return (
    <AppCard>
      {/* Section A: Course */}
      <AppText variant="captionBold" style={styles.sectionLabel}>
        Course
      </AppText>
      {selectedCourse ? (
        <View style={[styles.selectedCourseRow, { borderColor: colors.border }]}>
          <AppText variant="body" numberOfLines={1} style={{ flex: 1 }}>
            {selectedCourse.name}
          </AppText>
          <Pressable onPress={onChangeCourse} hitSlop={8}>
            <AppText variant="small" style={{ color: colors.primary }}>Change course</AppText>
          </Pressable>
        </View>
      ) : (
        <>
          <AppInput
            placeholder="Search course (e.g. Shrivenham Park)"
            value={courseSearchQuery}
            onChangeText={onCourseSearchChange}
            autoCapitalize="words"
          />
          {courseSearching && (
            <AppText variant="small" color="tertiary" style={{ marginTop: 4 }}>Searching…</AppText>
          )}
          {courseSearchError && !courseSearching && (
            <AppText variant="small" style={{ marginTop: 4, color: colors.error }}>
              {courseSearchError}
            </AppText>
          )}
          {courseSearchResults && courseSearchResults.length > 0 && onSelectCourseResult && (
            <View style={styles.searchResults}>
              {courseSearchResults.slice(0, 8).map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => onSelectCourseResult(c)}
                  style={({ pressed }) => [
                    styles.searchResultItem,
                    { backgroundColor: colors.backgroundSecondary, opacity: pressed ? 0.8 : 1 },
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
          {showManualCourseInput && onManualCourseNameChange && (
            <View style={{ marginTop: spacing.sm }}>
              <AppText variant="caption" color="secondary" style={styles.label}>
                Or enter course name manually
              </AppText>
              <AppInput
                placeholder="e.g. Forest of Arden"
                value={manualCourseName}
                onChangeText={onManualCourseNameChange}
                autoCapitalize="words"
              />
            </View>
          )}
        </>
      )}
      {courseError ? (
        <AppText variant="small" style={[styles.fieldError, { color: colors.error }]}>{courseError}</AppText>
      ) : null}

      {/* Section B: Tee setup */}
      <AppText variant="captionBold" style={[styles.sectionLabel, { marginTop: spacing.base }]}>
        Tee Setup
      </AppText>
      {teesLoading ? (
        <AppText variant="small" color="tertiary">
          Tee data is still syncing. You can select a tee manually below.
        </AppText>
      ) : teesError ? (
        <AppText variant="small" style={{ color: colors.warning, marginBottom: spacing.xs }}>
          {teesError}
        </AppText>
      ) : null}

      {tees.length > 0 ? (
        <>
          <CourseTeeSelector
            tees={tees}
            selectedTee={selectedTee}
            onSelectTee={(tee) => { onSelectTee(tee); onSetShowManualTee(false); }}
          />
          {!showManualTee && (
            <Pressable onPress={() => onSetShowManualTee(true)} style={{ marginTop: spacing.xs }}>
              <AppText variant="caption" color="primary">Enter tee details manually instead</AppText>
            </Pressable>
          )}
        </>
      ) : (
        <>
          <AppText variant="small" color="tertiary" style={{ marginBottom: spacing.xs }}>
            No imported tees found yet
          </AppText>
          <Pressable onPress={() => onSetShowManualTee(true)}>
            <AppText variant="caption" color="primary" style={{ marginBottom: spacing.sm }}>
              [Enter tee details manually]
            </AppText>
          </Pressable>
        </>
      )}

      {showManualTee && onManualTeeChange && (
        <View style={[styles.manualTeeContainer, { borderColor: colors.border }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
            <AppText variant="captionBold">Manual Tee Entry</AppText>
            {selectedTee && (
              <Pressable onPress={() => onSetShowManualTee(false)}>
                <AppText variant="small" color="primary">Use selected tee instead</AppText>
              </Pressable>
            )}
          </View>
          <AppText variant="captionBold" color="secondary" style={{ marginBottom: spacing.xs }}>Male Tee</AppText>
          <View style={styles.formField}>
            <AppText variant="caption" style={styles.label}>Tee Name</AppText>
            <AppInput placeholder="e.g. Yellow" value={manualTeeName} onChangeText={(v) => onManualTeeChange("teeName", v)} autoCapitalize="words" />
          </View>
          <View style={styles.formField}>
            <AppText variant="caption" style={styles.label}>Par</AppText>
            <AppInput placeholder="72" value={manualPar} onChangeText={(v) => onManualTeeChange("par", v)} keyboardType="number-pad" />
          </View>
          <View style={styles.formField}>
            <AppText variant="caption" style={styles.label}>Course Rating</AppText>
            <AppInput placeholder="70.1" value={manualCourseRating} onChangeText={(v) => onManualTeeChange("courseRating", v)} keyboardType="decimal-pad" />
          </View>
          <View style={styles.formField}>
            <AppText variant="caption" style={styles.label}>Slope Rating</AppText>
            <AppInput placeholder="128" value={manualSlopeRating} onChangeText={(v) => onManualTeeChange("slopeRating", v)} keyboardType="number-pad" />
          </View>
          <AppText variant="captionBold" color="secondary" style={{ marginTop: spacing.sm, marginBottom: spacing.xs }}>Female Tee</AppText>
          <View style={styles.formField}>
            <AppText variant="caption" style={styles.label}>Tee Name</AppText>
            <AppInput placeholder="e.g. Red" value={manualLadiesTeeName} onChangeText={(v) => onManualTeeChange("ladiesTeeName", v)} autoCapitalize="words" />
          </View>
          <View style={styles.formField}>
            <AppText variant="caption" style={styles.label}>Par</AppText>
            <AppInput placeholder="72" value={manualLadiesPar} onChangeText={(v) => onManualTeeChange("ladiesPar", v)} keyboardType="number-pad" />
          </View>
          <View style={styles.formField}>
            <AppText variant="caption" style={styles.label}>Course Rating</AppText>
            <AppInput placeholder="68.4" value={manualLadiesCourseRating} onChangeText={(v) => onManualTeeChange("ladiesCourseRating", v)} keyboardType="decimal-pad" />
          </View>
          <View style={styles.formField}>
            <AppText variant="caption" style={styles.label}>Slope Rating</AppText>
            <AppInput placeholder="120" value={manualLadiesSlopeRating} onChangeText={(v) => onManualTeeChange("ladiesSlopeRating", v)} keyboardType="number-pad" />
          </View>
        </View>
      )}
      {teeError ? (
        <AppText variant="small" style={[styles.fieldError, { color: colors.error }]}>{teeError}</AppText>
      ) : null}

      {/* Section C: Status / tools */}
      <View style={[styles.statusRow, { marginTop: spacing.sm }]}>
        <StatusBadge status={syncStatus} colors={colors} />
        {statusMessage ? (
          <AppText variant="small" color="tertiary" style={{ flex: 1, marginLeft: spacing.xs }}>
            {statusMessage}
          </AppText>
        ) : null}
        {onRetrySync && (syncStatus === "import_failed" || syncStatus === "pending_sync") && (
          <Pressable onPress={onRetrySync} style={{ marginLeft: spacing.sm }}>
            <AppText variant="small" color="primary">Retry sync</AppText>
          </Pressable>
        )}
      </View>

      {onHandicapAllowanceChange && (
        <View style={[styles.formField, { marginTop: spacing.base }]}>
          <AppText variant="caption" style={styles.label}>Handicap Allowance (%)</AppText>
          <AppInput placeholder="95" value={handicapAllowance} onChangeText={onHandicapAllowanceChange} keyboardType="number-pad" />
          {handicapError ? (
            <AppText variant="small" style={[styles.fieldError, { color: colors.error }]}>{handicapError}</AppText>
          ) : null}
          <AppText variant="small" color="tertiary" style={{ marginTop: 4 }}>Default 95% for individual stroke play</AppText>
        </View>
      )}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    marginBottom: spacing.xs,
  },
  label: {
    marginBottom: spacing.xs,
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
    borderWidth: 1,
    marginBottom: spacing.base,
  },
  formField: {
    marginBottom: spacing.base,
  },
  fieldError: {
    marginTop: 4,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  statusBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
});
