import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { DataSourceChip } from "@/components/course-data/DataSourceChip";
import { LicenceRequiredModal } from "@/components/LicenceRequiredModal";
import { useBootstrap } from "@/lib/useBootstrap";
import { usePaidAccess } from "@/lib/access/usePaidAccess";
import {
  canManageCourseDataUI,
  clearCourseManualOverrideByScope,
  getLatestCourseImportBatch,
  getTerritoryProgressSummary,
  getEditableCourseOverrideFields,
  listImportCandidatesByStatus,
  listCourseReviewSummaries,
  saveCourseManualOverride,
  triggerCourseReimportPreservingManual,
  type CourseImportBatchSummary,
  type CourseImportCandidateQueueItem,
  type CourseOverrideFieldName,
  type CourseReviewSummary,
  type TerritoryProgressSummary,
} from "@/lib/db_supabase/courseAdminRepo";
import { isPlatformAdmin } from "@/lib/db_supabase/adminRepo";
import { getColors, radius, spacing } from "@/lib/ui/theme";

export default function CourseDataReviewScreen() {
  const router = useRouter();
  const colors = getColors();
  const { member } = useBootstrap();
  const { guardPaidAction, modalVisible, setModalVisible, societyId } = usePaidAccess();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [courses, setCourses] = useState<CourseReviewSummary[]>([]);
  const [latestBatch, setLatestBatch] = useState<CourseImportBatchSummary | null>(null);
  const [failedCandidates, setFailedCandidates] = useState<CourseImportCandidateQueueItem[]>([]);
  const [queuedCandidates, setQueuedCandidates] = useState<CourseImportCandidateQueueItem[]>([]);
  const [territoryProgress, setTerritoryProgress] = useState<TerritoryProgressSummary[]>([]);

  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedTeeId, setSelectedTeeId] = useState<string | null>(null);
  const [holeNumberInput, setHoleNumberInput] = useState("");
  const [fieldName, setFieldName] = useState<CourseOverrideFieldName>("stroke_index");
  const [valueInput, setValueInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [reimporting, setReimporting] = useState(false);
  const [platformAdmin, setPlatformAdmin] = useState(false);

  const editableFields = getEditableCourseOverrideFields();
  const adminAllowed = canManageCourseDataUI(member);

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId) ?? null,
    [courses, selectedCourseId],
  );
  const selectedTee = useMemo(
    () => selectedCourse?.tees.find((tee) => tee.id === selectedTeeId) ?? null,
    [selectedCourse, selectedTeeId],
  );
  const selectedField = useMemo(
    () => editableFields.find((field) => field.field === fieldName) ?? editableFields[0],
    [editableFields, fieldName],
  );

  const load = useCallback(async () => {
    try {
      setError(null);
      const [rows, batch, failed, queued, progress] = await Promise.all([
        listCourseReviewSummaries({ query, limit: 40 }),
        getLatestCourseImportBatch(),
        listImportCandidatesByStatus(["failed"], 8),
        listImportCandidatesByStatus(["queued"], 8),
        getTerritoryProgressSummary(),
      ]);
      setCourses(rows);
      setLatestBatch(batch);
      setFailedCandidates(failed);
      setQueuedCandidates(queued);
      setTerritoryProgress(progress);
      if (!selectedCourseId && rows[0]) {
        setSelectedCourseId(rows[0].id);
        setSelectedTeeId(rows[0].tees[0]?.id ?? null);
      }
      if (selectedCourseId && !rows.some((row) => row.id === selectedCourseId)) {
        setSelectedCourseId(rows[0]?.id ?? null);
        setSelectedTeeId(rows[0]?.tees[0]?.id ?? null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load course data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [query, selectedCourseId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await isPlatformAdmin();
      if (!cancelled) setPlatformAdmin(ok);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedCourse) return;
    if (selectedTeeId && selectedCourse.tees.some((tee) => tee.id === selectedTeeId)) return;
    setSelectedTeeId(selectedCourse.tees[0]?.id ?? null);
  }, [selectedCourse, selectedTeeId]);

  if (!adminAllowed) {
    return (
      <Screen>
        <EmptyState title="Admin access only" message="Captain, Secretary, or Handicapper access is required." />
      </Screen>
    );
  }

  if (loading) {
    return (
      <Screen>
        <LoadingState message="Loading course data..." />
      </Screen>
    );
  }

  const onSaveOverride = async () => {
    if (!selectedCourse || !selectedTee || !selectedField) return;
    const holeNumber = holeNumberInput.trim() ? Math.round(Number(holeNumberInput)) : null;
    setSaving(true);
    try {
      await saveCourseManualOverride({
        courseId: selectedCourse.id,
        teeId: selectedTee.id,
        holeNumber,
        fieldName: selectedField.field,
        rawValue: valueInput.trim(),
      });
      setValueInput("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save override.");
    } finally {
      setSaving(false);
    }
  };

  const onClearOverride = async () => {
    if (!selectedCourse || !selectedTee || !selectedField) return;
    const holeNumber = holeNumberInput.trim() ? Math.round(Number(holeNumberInput)) : null;
    try {
      setSaving(true);
      await clearCourseManualOverrideByScope({
        courseId: selectedCourse.id,
        teeId: selectedTee.id,
        holeNumber,
        fieldName: selectedField.field,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not clear override.");
    } finally {
      setSaving(false);
    }
  };

  const onReimportCourse = async () => {
    if (!selectedCourse) return;
    setReimporting(true);
    try {
      await triggerCourseReimportPreservingManual(selectedCourse.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not re-import course.");
    } finally {
      setReimporting(false);
    }
  };

  return (
    <Screen style={{ backgroundColor: colors.backgroundSecondary }}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
      >
        <AppText variant="title">Course Data Review</AppText>
        <AppText variant="small" color="secondary" style={{ marginTop: spacing.xs, marginBottom: spacing.base }}>
          Review imports, integrity checks, and manual overrides.
        </AppText>

        {platformAdmin ? (
          <Pressable
            onPress={() => router.push("/(app)/course-data/uk-golf-staging" as never)}
            style={[styles.platformLink, { borderColor: colors.border }]}
          >
            <AppText variant="bodyBold">UK Golf API staging (platform)</AppText>
            <AppText variant="small" color="secondary" style={{ marginTop: spacing.xs }}>
              Approve or reject staged UK Golf candidates before CLI promotion.
            </AppText>
          </Pressable>
        ) : null}

        {error ? <InlineNotice variant="error" message={error} style={{ marginBottom: spacing.base }} /> : null}

        {latestBatch ? (
          <AppCard style={styles.card}>
            <AppText variant="captionBold" color="muted">Latest nightly batch</AppText>
            <AppText variant="bodyBold" style={{ marginTop: spacing.xs }}>
              {latestBatch.seed_phase} · {latestBatch.status}
            </AppText>
            <AppText variant="small" color="secondary" style={{ marginTop: spacing.xs }}>
              Start: {latestBatch.started_at} · Finish: {latestBatch.finished_at ?? "running"}
            </AppText>
            <AppText variant="small" color="secondary" style={{ marginTop: spacing.xs }}>
              Discovered {latestBatch.total_candidates} · Attempted {latestBatch.total_attempted} · OK {latestBatch.total_ok} · Partial {latestBatch.total_partial} · Failed {latestBatch.total_failed}
            </AppText>
            <AppText variant="small" color="secondary" style={{ marginTop: spacing.xs }}>
              Inserted {latestBatch.total_inserted} · Updated {latestBatch.total_updated} · Skipped {latestBatch.total_skipped}
            </AppText>
          </AppCard>
        ) : null}

        {territoryProgress.length > 0 ? (
          <AppCard style={styles.card}>
            <AppText variant="captionBold" color="muted">Territory progress</AppText>
            <View style={{ marginTop: spacing.sm, gap: spacing.xs }}>
              {territoryProgress.map((row) => (
                <AppText key={`${row.territory}-${row.seed_phase}`} variant="small" color="secondary">
                  {row.seed_phase}: total {row.total} · seeded {row.seeded} · failed {row.failed} · refresh due {row.refresh_due}
                </AppText>
              ))}
            </View>
          </AppCard>
        ) : null}

        {failedCandidates.length > 0 ? (
          <AppCard style={styles.card}>
            <AppText variant="captionBold" color="muted">Failed candidates (manual review)</AppText>
            <View style={{ marginTop: spacing.sm, gap: spacing.xs }}>
              {failedCandidates.map((row) => (
                <AppText key={row.id} variant="small" color="secondary">
                  {row.candidate_name} · p{row.import_priority} · {row.last_error ?? "failed"}
                </AppText>
              ))}
            </View>
          </AppCard>
        ) : null}

        {queuedCandidates.length > 0 ? (
          <AppCard style={styles.card}>
            <AppText variant="captionBold" color="muted">Candidate queue snapshot</AppText>
            <View style={{ marginTop: spacing.sm, gap: spacing.xs }}>
              {queuedCandidates.map((row) => (
                <AppText key={row.id} variant="small" color="secondary">
                  {row.candidate_name} · {row.seed_phase} · p{row.import_priority} · {row.discovery_source}
                </AppText>
              ))}
            </View>
          </AppCard>
        ) : null}

        <AppCard style={styles.card}>
          <AppText variant="captionBold" color="muted">Search courses</AppText>
          <AppInput
            value={query}
            onChangeText={setQuery}
            placeholder="Find course..."
            autoCapitalize="none"
            style={{ marginTop: spacing.sm }}
            onSubmitEditing={() => {
              setLoading(true);
              void load();
            }}
          />
        </AppCard>

        {selectedCourse ? (
          <AppCard style={styles.card}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyBold">{selectedCourse.course_name}</AppText>
                <AppText variant="small" color="secondary">
                  Sync: {selectedCourse.sync_status ?? "unknown"} · Confidence: {selectedCourse.confidence_score ?? "n/a"}
                </AppText>
              </View>
              <DataSourceChip sourceType={selectedCourse.source_type} />
            </View>
            {selectedCourse.source_url ? (
              <AppText variant="small" color="tertiary" numberOfLines={1} style={{ marginTop: spacing.xs }}>
                {selectedCourse.source_url}
              </AppText>
            ) : null}
            <AppText variant="small" color="secondary" style={{ marginTop: spacing.sm }}>
              Last synced: {selectedCourse.last_synced_at ?? "n/a"} · Imported: {selectedCourse.imported_at ?? "n/a"}
            </AppText>
            <AppText variant="small" color="secondary" style={{ marginTop: spacing.xs }}>
              Manual overrides: {selectedCourse.manualOverrideCount}
            </AppText>
            {selectedCourse.latestJob ? (
              <InlineNotice
                style={{ marginTop: spacing.sm }}
                variant={selectedCourse.latestJob.error_message ? "error" : "info"}
                message={`Latest import: ${selectedCourse.latestJob.sync_status ?? "n/a"}`}
                detail={selectedCourse.latestJob.error_message ?? `Finished: ${selectedCourse.latestJob.finished_at ?? "n/a"}`}
              />
            ) : null}
            <View style={styles.actionRow}>
              <PrimaryButton label="Re-import now" loading={reimporting} onPress={onReimportCourse} />
              <SecondaryButton
                label="Open tee editor"
                onPress={() => {
                  if (!selectedTee) return;
                  if (!guardPaidAction()) return;
                  router.push({
                    pathname: "/(app)/course-data/[courseId]/tee/[teeId]",
                    params: { courseId: selectedCourse.id, teeId: selectedTee.id },
                  } as never);
                }}
              />
            </View>
          </AppCard>
        ) : null}

        <AppCard style={styles.card}>
          <AppText variant="captionBold" color="muted">Manual override utility</AppText>
          {!selectedCourse ? (
            <AppText variant="small" color="secondary" style={{ marginTop: spacing.sm }}>
              Select a course below to manage overrides.
            </AppText>
          ) : (
            <>
              <View style={styles.chipWrap}>
                {selectedCourse.tees.map((tee) => (
                  <Pressable
                    key={tee.id}
                    onPress={() => setSelectedTeeId(tee.id)}
                    style={[
                      styles.selector,
                      {
                        borderColor: selectedTeeId === tee.id ? colors.primary : colors.border,
                        backgroundColor: selectedTeeId === tee.id ? `${colors.primary}12` : colors.surface,
                      },
                    ]}
                  >
                    <AppText variant="small">{tee.tee_name}</AppText>
                    <AppText variant="caption" color="tertiary">
                      Missing SI {tee.integrity.missingSiCount}
                    </AppText>
                  </Pressable>
                ))}
              </View>
              <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />
              <View style={styles.chipWrap}>
                {editableFields.map((field) => (
                  <Pressable
                    key={field.field}
                    onPress={() => setFieldName(field.field)}
                    style={[
                      styles.fieldPill,
                      {
                        borderColor: fieldName === field.field ? colors.primary : colors.border,
                        backgroundColor: fieldName === field.field ? `${colors.primary}12` : colors.surface,
                      },
                    ]}
                  >
                    <AppText variant="small">{field.field}</AppText>
                    <AppText variant="caption" color="tertiary">{field.scope}</AppText>
                  </Pressable>
                ))}
              </View>
              {selectedField?.scope === "hole" ? (
                <AppInput
                  value={holeNumberInput}
                  onChangeText={setHoleNumberInput}
                  placeholder="Hole number (1-18)"
                  keyboardType="number-pad"
                  style={{ marginTop: spacing.sm }}
                />
              ) : null}
              <AppInput
                value={valueInput}
                onChangeText={setValueInput}
                placeholder="Override value"
                keyboardType="numeric"
                style={{ marginTop: spacing.sm }}
              />
              <View style={styles.actionRow}>
                <PrimaryButton label="Save override" loading={saving} onPress={onSaveOverride} />
                <SecondaryButton label="Disable override" loading={saving} onPress={onClearOverride} />
              </View>
            </>
          )}
        </AppCard>

        {courses.length === 0 ? (
          <AppCard style={styles.card}>
            <EmptyState title="No courses found" message="Try a broader search." />
          </AppCard>
        ) : (
          courses.map((course) => (
            <Pressable
              key={course.id}
              onPress={() => {
                setSelectedCourseId(course.id);
                setSelectedTeeId(course.tees[0]?.id ?? null);
              }}
            >
              <AppCard
                style={[
                  styles.card,
                  {
                    borderWidth: 1,
                    borderColor: selectedCourseId === course.id ? colors.primary : colors.borderLight,
                    borderRadius: radius.md,
                  },
                ]}
              >
                <View style={styles.rowBetween}>
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyBold">{course.course_name}</AppText>
                    <AppText variant="caption" color="secondary">
                      {course.sync_status ?? "unknown"} · overrides {course.manualOverrideCount}
                    </AppText>
                  </View>
                  <DataSourceChip sourceType={course.source_type} />
                </View>
                <View style={{ marginTop: spacing.sm, flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
                  {course.tees.slice(0, 4).map((tee) => (
                    <Chip key={tee.id}>
                      {tee.tee_name}: SI miss {tee.integrity.missingSiCount}
                      {tee.integrity.duplicateSiValues.length > 0 ? ` / dup ${tee.integrity.duplicateSiValues.join(",")}` : ""}
                      {tee.integrity.invalidSiCount > 0 ? ` / bad ${tee.integrity.invalidSiCount}` : ""}
                    </Chip>
                  ))}
                </View>
              </AppCard>
            </Pressable>
          ))
        )}
      </ScrollView>
      <LicenceRequiredModal visible={modalVisible} onClose={() => setModalVisible(false)} societyId={societyId} />
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
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.base,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  selector: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  fieldPill: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  actionRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.base,
  },
  platformLink: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.base,
    marginBottom: spacing.base,
  },
});
