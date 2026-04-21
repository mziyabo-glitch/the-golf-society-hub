import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { DataSourceChip } from "@/components/course-data/DataSourceChip";
import { LicenceRequiredModal } from "@/components/LicenceRequiredModal";
import { useBootstrap } from "@/lib/useBootstrap";
import { usePaidAccess } from "@/lib/access/usePaidAccess";
import {
  canManageCourseDataUI,
  clearCourseManualOverrideByScope,
  getTeeEditorBundle,
  saveCourseManualOverride,
  triggerCourseReimportPreservingManual,
  type TeeEditorBundle,
} from "@/lib/db_supabase/courseAdminRepo";
import { getColors, radius, spacing } from "@/lib/ui/theme";

type EditedRow = { par: string; yardage: string; stroke_index: string };

export default function CourseTeeEditorScreen() {
  const colors = getColors();
  const router = useRouter();
  const { courseId, teeId } = useLocalSearchParams<{ courseId: string; teeId: string }>();
  const { member } = useBootstrap();
  const { guardPaidAction, modalVisible, setModalVisible, societyId } = usePaidAccess();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reimporting, setReimporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<TeeEditorBundle | null>(null);
  const [editRows, setEditRows] = useState<Record<number, EditedRow>>({});

  const adminAllowed = canManageCourseDataUI(member);

  const load = useCallback(async () => {
    if (!courseId || !teeId) return;
    try {
      setError(null);
      const data = await getTeeEditorBundle(courseId, teeId);
      setBundle(data);
      const next: Record<number, EditedRow> = {};
      for (const hole of data.holes) {
        next[hole.hole_number] = {
          par: hole.par != null ? String(hole.par) : "",
          yardage: hole.yardage != null ? String(hole.yardage) : "",
          stroke_index: hole.stroke_index != null ? String(hole.stroke_index) : "",
        };
      }
      setEditRows(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load tee editor.");
    } finally {
      setLoading(false);
    }
  }, [courseId, teeId]);

  useEffect(() => {
    if (!guardPaidAction()) {
      setLoading(false);
      return;
    }
    void load();
  }, [guardPaidAction, load]);

  const overrideLookup = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const item of bundle?.activeOverrides ?? []) {
      const key = `${item.hole_number ?? "tee"}:${item.field_name}`;
      map.set(key, true);
    }
    return map;
  }, [bundle?.activeOverrides]);

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
        <LoadingState message="Loading hole editor..." />
      </Screen>
    );
  }

  if (!bundle) {
    return (
      <Screen>
        <EmptyState title="Not found" message={error ?? "Could not load this tee."} />
      </Screen>
    );
  }

  const saveHoleField = async (
    holeNumber: number,
    fieldName: "par" | "yardage" | "stroke_index",
    rawValue: string,
  ) => {
    setSaving(true);
    try {
      await saveCourseManualOverride({
        courseId: bundle.course.id,
        teeId: bundle.tee.id,
        holeNumber,
        fieldName,
        rawValue,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save override.");
    } finally {
      setSaving(false);
    }
  };

  const clearHoleField = async (holeNumber: number, fieldName: "par" | "yardage" | "stroke_index") => {
    setSaving(true);
    try {
      await clearCourseManualOverrideByScope({
        courseId: bundle.course.id,
        teeId: bundle.tee.id,
        holeNumber,
        fieldName,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not clear override.");
    } finally {
      setSaving(false);
    }
  };

  const onReimport = async () => {
    setReimporting(true);
    try {
      await triggerCourseReimportPreservingManual(bundle.course.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not re-import.");
    } finally {
      setReimporting(false);
    }
  };

  return (
    <Screen style={{ backgroundColor: colors.backgroundSecondary }}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <AppCard style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <AppText variant="title">{bundle.course.course_name}</AppText>
              <AppText variant="small" color="secondary">
                {bundle.tee.tee_name} · sync {bundle.tee.sync_status ?? "unknown"}
              </AppText>
            </View>
            <DataSourceChip sourceType={bundle.tee.source_type ?? bundle.course.source_type} />
          </View>
          <AppText variant="small" color="secondary" style={{ marginTop: spacing.sm }}>
            Manual overrides on this tee: {bundle.activeOverrides.length}
          </AppText>
          <View style={styles.actionRow}>
            <PrimaryButton label="Re-import and preserve overrides" loading={reimporting} onPress={onReimport} />
            <SecondaryButton label="Back" onPress={() => router.back()} />
          </View>
        </AppCard>

        {error ? <InlineNotice variant="error" message={error} style={{ marginBottom: spacing.base }} /> : null}

        {bundle.holes.map((hole) => {
          const edited = editRows[hole.hole_number] ?? { par: "", yardage: "", stroke_index: "" };
          return (
            <AppCard key={hole.id} style={styles.card}>
              <View style={styles.rowBetween}>
                <AppText variant="bodyBold">Hole {hole.hole_number}</AppText>
                <View style={{ flexDirection: "row", gap: spacing.xs }}>
                  <DataSourceChip sourceType={hole.source_type} />
                </View>
              </View>
              <View style={styles.grid}>
                {(["par", "yardage", "stroke_index"] as const).map((field) => {
                  const key = `${hole.hole_number}:${field}`;
                  const hasOverride = overrideLookup.get(key) === true;
                  return (
                    <View key={field} style={styles.fieldBlock}>
                      <AppText variant="captionBold" color="muted">{field}</AppText>
                      <AppInput
                        value={edited[field]}
                        onChangeText={(text) => {
                          setEditRows((prev) => ({
                            ...prev,
                            [hole.hole_number]: { ...edited, [field]: text },
                          }));
                        }}
                        keyboardType="number-pad"
                        style={{ marginTop: spacing.xs }}
                      />
                      <View style={styles.inlineActions}>
                        <Pressable onPress={() => saveHoleField(hole.hole_number, field, edited[field])}>
                          <AppText variant="small" color="primary">Save override</AppText>
                        </Pressable>
                        <Pressable onPress={() => clearHoleField(hole.hole_number, field)}>
                          <AppText variant="small" color="tertiary">Clear override</AppText>
                        </Pressable>
                      </View>
                      {hasOverride ? (
                        <View style={[styles.badge, { borderColor: colors.warning, backgroundColor: `${colors.warning}18` }]}>
                          <Feather name="edit-2" size={12} color={colors.warning} />
                          <AppText variant="caption" color="secondary">Manual</AppText>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </AppCard>
          );
        })}
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
    borderRadius: radius.md,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  actionRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.base,
  },
  grid: {
    marginTop: spacing.base,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  fieldBlock: {
    width: "31%",
    minWidth: 96,
  },
  inlineActions: {
    marginTop: spacing.xs,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  badge: {
    marginTop: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 3,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
  },
});
