import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, View, Pressable } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";

import { Screen } from "@/components/ui/Screen";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { AppText } from "@/components/ui/AppText";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { LoadingState } from "@/components/ui/LoadingState";
import { SecondaryButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  applyMatchAcceptance,
  createManualTeeRow,
  getCourseLibrarySummary,
  getLatestEnrichmentRun,
  listCourseTees,
  listCoursesForAdmin,
  markCourseEnrichmentComplete,
  rejectCourseMatch,
  type CourseLibraryDoc,
  type CourseTeeDoc,
  updateCourseMatchedName,
} from "@/lib/db_supabase/courseRepo";
import { useBootstrap } from "@/lib/useBootstrap";
import { getPermissionsForMember } from "@/lib/rbac";
import { getColors, radius, spacing } from "@/lib/ui/theme";
import { showAlert } from "@/lib/ui/alert";
import { formatError, type FormattedError } from "@/lib/ui/formatError";
import type { CandidateTee } from "@/lib/course-enrichment";

type EnrichmentStatusFilter =
  | "pending"
  | "needs_review"
  | "matched"
  | "failed"
  | "complete";

export default function CoursesAdminScreen() {
  const tabBarHeight = useBottomTabBarHeight();
  const colors = getColors();
  const { member, user, activeSocietyId, loading: bootstrapLoading } = useBootstrap();
  const permissions = getPermissionsForMember(member as any);
  const canReviewCourses = permissions.canCreateEvents;
  const tabContentStyle = { paddingTop: 16, paddingBottom: tabBarHeight + 24 };

  const [summary, setSummary] = useState<{
    coursesCount: number;
    seedRowsCount: number;
    lastImportAt: string | null;
  } | null>(null);
  const [courses, setCourses] = useState<CourseLibraryDoc[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FormattedError | null>(null);
  const [statusFilter, setStatusFilter] = useState<EnrichmentStatusFilter>("needs_review");
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<CourseLibraryDoc | null>(null);
  const [selectedCourseTees, setSelectedCourseTees] = useState<CourseTeeDoc[]>([]);
  const [selectedRun, setSelectedRun] = useState<any | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [matchedNameDraft, setMatchedNameDraft] = useState("");
  const [manualTeeName, setManualTeeName] = useState("");
  const [manualTeeColor, setManualTeeColor] = useState("");
  const [manualTeeGender, setManualTeeGender] = useState("mixed");
  const [manualPar, setManualPar] = useState("");
  const [manualCourseRating, setManualCourseRating] = useState("");
  const [manualSlopeRating, setManualSlopeRating] = useState("");

  const load = useCallback(
    async (searchQuery: string) => {
      setLoading(true);
      setError(null);
      try {
        const [summaryData, courseData] = await Promise.all([
          getCourseLibrarySummary("gb"),
          listCoursesForAdmin({
            countryCode: "gb",
            query: searchQuery,
            enrichmentStatus: statusFilter,
            limit: 200,
          }),
        ]);
        setSummary(summaryData);
        setCourses(courseData);
        if (!selectedCourseId && courseData.length > 0) {
          setSelectedCourseId(courseData[0].id);
        }
      } catch (err: any) {
        setError(formatError(err));
        setSummary(null);
        setCourses([]);
      } finally {
        setLoading(false);
      }
    },
    [selectedCourseId, statusFilter]
  );

  useEffect(() => {
    if (!canReviewCourses) return;
    load(query);
  }, [canReviewCourses, load, query]);

  useFocusEffect(
    useCallback(() => {
      if (!canReviewCourses) return;
      load(query);
    }, [canReviewCourses, load, query])
  );

  useEffect(() => {
    if (!selectedCourseId) {
      setSelectedCourse(null);
      setSelectedRun(null);
      setSelectedCourseTees([]);
      setMatchedNameDraft("");
      return;
    }

    const target = courses.find((course) => course.id === selectedCourseId) ?? null;
    setSelectedCourse(target);
    setMatchedNameDraft(target?.matched_name || target?.name || "");
  }, [selectedCourseId, courses]);

  const loadSelectedDetails = useCallback(async () => {
    if (!selectedCourseId) {
      setSelectedRun(null);
      setSelectedCourseTees([]);
      return;
    }
    const [runData, teeData] = await Promise.all([
      getLatestEnrichmentRun(selectedCourseId),
      listCourseTees(selectedCourseId),
    ]);
    setSelectedRun(runData);
    setSelectedCourseTees(teeData);
  }, [selectedCourseId]);

  useEffect(() => {
    if (!selectedCourseId) return;
    loadSelectedDetails().catch((err: any) => {
      console.warn("[courses-admin] Failed to load selected details:", err?.message || err);
    });
  }, [selectedCourseId, loadSelectedDetails]);

  const proposedTees = useMemo(() => {
    const payload = selectedRun?.payload as Record<string, any> | null | undefined;
    const maybeTees = payload?.bestCandidate?.proposed_tees;
    if (!Array.isArray(maybeTees)) return [] as CandidateTee[];
    return maybeTees
      .filter((row) => row && typeof row === "object")
      .map((row) => ({
        tee_name: String(row.tee_name ?? "").trim(),
        tee_color: row.tee_color ? String(row.tee_color) : null,
        gender: row.gender ? String(row.gender) : null,
        par:
          typeof row.par === "number"
            ? row.par
            : typeof row.par === "string"
              ? Number.parseInt(row.par, 10)
              : null,
        course_rating:
          typeof row.course_rating === "number"
            ? row.course_rating
            : typeof row.course_rating === "string"
              ? Number.parseFloat(row.course_rating)
              : null,
        slope_rating:
          typeof row.slope_rating === "number"
            ? row.slope_rating
            : typeof row.slope_rating === "string"
              ? Number.parseInt(row.slope_rating, 10)
              : null,
        source: row.source ? String(row.source) : null,
        source_ref: row.source_ref ? String(row.source_ref) : null,
      }))
      .filter((tee) => tee.tee_name.length > 0);
  }, [selectedRun?.payload]);

  const selectedRunBestCandidate = useMemo(() => {
    const payload = selectedRun?.payload as Record<string, any> | null | undefined;
    return payload?.bestCandidate ?? null;
  }, [selectedRun?.payload]);

  const withAction = async (fn: () => Promise<void>) => {
    if (!selectedCourse || !user?.uid) return;
    setActionLoading(true);
    try {
      await fn();
      await Promise.all([load(query), loadSelectedDetails()]);
    } catch (err: any) {
      showAlert("Error", err?.message || "Action failed.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!selectedCourse || !user?.uid) return;
    await withAction(async () => {
      await applyMatchAcceptance(selectedCourse.id, {
        reviewedBy: user.uid,
        matchedName: matchedNameDraft.trim() || selectedCourse.name,
        matchedSource:
          selectedCourse.matched_source ??
          selectedRunBestCandidate?.source ??
          "manual_review",
        matchConfidence:
          selectedCourse.match_confidence ??
          (typeof selectedRunBestCandidate?.confidence === "number"
            ? selectedRunBestCandidate.confidence
            : null),
        tees: proposedTees,
      });
    });
  };

  const handleReject = async () => {
    if (!selectedCourse || !user?.uid) return;
    await withAction(async () => {
      await rejectCourseMatch(selectedCourse.id, user.uid);
    });
  };

  const handleUpdateMatchedName = async () => {
    if (!selectedCourse || !user?.uid) return;
    const value = matchedNameDraft.trim();
    if (!value) {
      showAlert("Missing name", "Enter a matched name first.");
      return;
    }
    await withAction(async () => {
      await updateCourseMatchedName(selectedCourse.id, value, user.uid);
    });
  };

  const handleAddManualTee = async () => {
    if (!selectedCourse || !user?.uid) return;
    if (!manualTeeName.trim()) {
      showAlert("Missing tee name", "Enter a tee name.");
      return;
    }
    await withAction(async () => {
      await createManualTeeRow(selectedCourse.id, {
        tee_name: manualTeeName.trim(),
        tee_color: manualTeeColor.trim() || null,
        gender: manualTeeGender.trim() || "mixed",
        par: manualPar.trim() ? Number.parseInt(manualPar.trim(), 10) : null,
        course_rating: manualCourseRating.trim()
          ? Number.parseFloat(manualCourseRating.trim())
          : null,
        slope_rating: manualSlopeRating.trim()
          ? Number.parseInt(manualSlopeRating.trim(), 10)
          : null,
      });
      setManualTeeName("");
      setManualTeeColor("");
      setManualPar("");
      setManualCourseRating("");
      setManualSlopeRating("");
    });
  };

  const handleMarkComplete = async () => {
    if (!selectedCourse || !user?.uid) return;
    await withAction(async () => {
      await markCourseEnrichmentComplete(selectedCourse.id, user.uid);
    });
  };

  const statusOptions: EnrichmentStatusFilter[] = [
    "needs_review",
    "pending",
    "matched",
    "failed",
    "complete",
  ];

  if (bootstrapLoading) {
    return (
      <Screen scrollable={false} contentStyle={tabContentStyle}>
        <View style={styles.centered}>
          <LoadingState message="Loading..." />
        </View>
      </Screen>
    );
  }

  if (!activeSocietyId) {
    return (
      <Screen contentStyle={tabContentStyle}>
        <View style={styles.header}>
          <AppText variant="title">Course Enrichment</AppText>
        </View>
        <EmptyState
          icon={<Feather name="map-pin" size={24} color={colors.textTertiary} />}
          title="No Society Selected"
          message="Join or create a society to access admin tools."
        />
      </Screen>
    );
  }

  if (!canReviewCourses) {
    return (
      <Screen contentStyle={tabContentStyle}>
        <View style={styles.header}>
          <AppText variant="title">Course Enrichment</AppText>
        </View>
        <EmptyState
          icon={<Feather name="shield-off" size={24} color={colors.textTertiary} />}
          title="Access restricted"
          message="Captain, Secretary, or Handicapper access required."
        />
      </Screen>
    );
  }

  return (
    <Screen contentStyle={tabContentStyle}>
      <View style={styles.header}>
        <View>
          <AppText variant="title">Course Enrichment Review</AppText>
          <AppText variant="caption" color="secondary">
            Match imported courses to tee/rating metadata
          </AppText>
        </View>
        <SecondaryButton size="sm" onPress={() => load(query)} disabled={loading}>
          Refresh
        </SecondaryButton>
      </View>

      {error ? (
        <InlineNotice
          variant="error"
          message={error.message}
          detail={error.detail}
          style={{ marginBottom: spacing.sm }}
        />
      ) : null}

      <AppCard style={{ marginBottom: spacing.sm }}>
        <View style={styles.summaryGrid}>
          <View style={[styles.summaryItem, { backgroundColor: colors.backgroundSecondary }]}>
            <AppText variant="small" color="secondary">Normalized courses</AppText>
            <AppText variant="h2">{summary?.coursesCount ?? 0}</AppText>
          </View>
          <View style={[styles.summaryItem, { backgroundColor: colors.backgroundSecondary }]}>
            <AppText variant="small" color="secondary">Seed rows</AppText>
            <AppText variant="h2">{summary?.seedRowsCount ?? 0}</AppText>
          </View>
        </View>
        <AppText variant="small" color="tertiary" style={{ marginTop: spacing.xs }}>
          Last import: {summary?.lastImportAt ? new Date(summary.lastImportAt).toLocaleString("en-GB") : "—"}
        </AppText>
      </AppCard>

      <AppCard style={{ marginBottom: spacing.sm }}>
        <AppText variant="captionBold" style={{ marginBottom: spacing.xs }}>
          Status
        </AppText>
        <View style={styles.statusChips}>
          {statusOptions.map((option) => {
            const selected = option === statusFilter;
            return (
              <Pressable
                key={option}
                onPress={() => setStatusFilter(option)}
                style={[
                  styles.statusChip,
                  {
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: selected
                      ? colors.primary
                      : colors.backgroundSecondary,
                  },
                ]}
              >
                <AppText
                  variant="small"
                  style={{ color: selected ? "#fff" : colors.text }}
                >
                  {option.replace("_", " ")}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </AppCard>

      <AppCard style={{ marginBottom: spacing.sm }}>
        <AppText variant="captionBold" style={{ marginBottom: spacing.xs }}>Search courses</AppText>
        <AppInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name or area..."
          autoCapitalize="none"
          autoCorrect={false}
        />
      </AppCard>

      {loading ? (
        <View style={styles.centered}>
          <LoadingState message="Loading courses..." />
        </View>
      ) : courses.length === 0 ? (
        <EmptyState
          icon={<Feather name="search" size={22} color={colors.textTertiary} />}
          title="No courses found"
          message="Try a different search term."
        />
      ) : (
        <View style={{ gap: spacing.xs }}>
          {courses.map((course) => {
            const selected = selectedCourseId === course.id;
            return (
              <Pressable key={course.id} onPress={() => setSelectedCourseId(course.id)}>
                <AppCard
                  padding="sm"
                  style={{
                    borderWidth: selected ? 1 : 0,
                    borderColor: selected ? colors.primary : "transparent",
                  }}
                >
                  <View style={styles.courseRow}>
                    <View style={{ flex: 1 }}>
                      <AppText variant="bodyBold">{course.name}</AppText>
                      <AppText variant="small" color="secondary">
                        {course.area || "Area unknown"}
                      </AppText>
                      <AppText variant="small" color="tertiary">
                        Status: {course.enrichment_status || "pending"}
                        {typeof course.match_confidence === "number"
                          ? ` · confidence ${course.match_confidence.toFixed(2)}`
                          : ""}
                      </AppText>
                    </View>
                    <View style={[styles.coordsPill, { backgroundColor: colors.backgroundSecondary }]}>
                      <AppText variant="small" color="secondary">
                        {course.lat.toFixed(5)}, {course.lng.toFixed(5)}
                      </AppText>
                    </View>
                  </View>
                </AppCard>
              </Pressable>
            );
          })}
        </View>
      )}

      {selectedCourse ? (
        <AppCard style={{ marginTop: spacing.sm }}>
          <AppText variant="h2" style={{ marginBottom: spacing.xs }}>
            Review selected course
          </AppText>
          <AppText variant="bodyBold">{selectedCourse.name}</AppText>
          <AppText variant="small" color="secondary">
            {selectedCourse.area || "Area unknown"} · {selectedCourse.lat.toFixed(5)}, {selectedCourse.lng.toFixed(5)}
          </AppText>
          <AppText variant="small" color="secondary" style={{ marginTop: 4 }}>
            Current status: {selectedCourse.enrichment_status || "pending"}
          </AppText>

          {selectedRunBestCandidate ? (
            <View style={[styles.reviewSection, { borderColor: colors.border }]}>
              <AppText variant="captionBold">Proposed match</AppText>
              <AppText variant="small">
                {selectedRunBestCandidate.name || "—"}
                {selectedRunBestCandidate.area ? ` (${selectedRunBestCandidate.area})` : ""}
              </AppText>
              <AppText variant="small" color="secondary">
                Source: {selectedRunBestCandidate.source || "—"}
                {typeof selectedRunBestCandidate.confidence === "number"
                  ? ` · confidence ${selectedRunBestCandidate.confidence.toFixed(2)}`
                  : ""}
              </AppText>
            </View>
          ) : (
            <AppText variant="small" color="tertiary" style={{ marginTop: spacing.xs }}>
              No proposed candidate payload in latest run.
            </AppText>
          )}

          <View style={{ marginTop: spacing.sm }}>
            <AppText variant="captionBold" style={{ marginBottom: 6 }}>Matched name</AppText>
            <AppInput
              value={matchedNameDraft}
              onChangeText={setMatchedNameDraft}
              placeholder="Edit matched name"
            />
            <View style={styles.actionsRow}>
              <SecondaryButton
                size="sm"
                onPress={handleUpdateMatchedName}
                disabled={actionLoading || !user?.uid}
              >
                Save name
              </SecondaryButton>
              <SecondaryButton
                size="sm"
                onPress={handleReject}
                disabled={actionLoading || !user?.uid}
              >
                Reject
              </SecondaryButton>
              <SecondaryButton
                size="sm"
                onPress={handleAccept}
                disabled={actionLoading || !user?.uid}
              >
                Accept
              </SecondaryButton>
              <SecondaryButton
                size="sm"
                onPress={handleMarkComplete}
                disabled={actionLoading || !user?.uid}
              >
                Mark complete
              </SecondaryButton>
            </View>
          </View>

          <View style={[styles.reviewSection, { borderColor: colors.border }]}>
            <AppText variant="captionBold">Manual tee entry</AppText>
            <View style={styles.manualRow}>
              <View style={{ flex: 1 }}>
                <AppText variant="small" color="secondary">Tee name</AppText>
                <AppInput value={manualTeeName} onChangeText={setManualTeeName} placeholder="Yellow" />
              </View>
              <View style={{ width: 110 }}>
                <AppText variant="small" color="secondary">Colour</AppText>
                <AppInput value={manualTeeColor} onChangeText={setManualTeeColor} placeholder="yellow" />
              </View>
            </View>
            <View style={styles.manualRow}>
              <View style={{ width: 110 }}>
                <AppText variant="small" color="secondary">Gender</AppText>
                <AppInput value={manualTeeGender} onChangeText={setManualTeeGender} placeholder="male/female/mixed" />
              </View>
              <View style={{ width: 72 }}>
                <AppText variant="small" color="secondary">Par</AppText>
                <AppInput value={manualPar} onChangeText={setManualPar} keyboardType="number-pad" />
              </View>
              <View style={{ width: 90 }}>
                <AppText variant="small" color="secondary">CR</AppText>
                <AppInput value={manualCourseRating} onChangeText={setManualCourseRating} keyboardType="decimal-pad" />
              </View>
              <View style={{ width: 90 }}>
                <AppText variant="small" color="secondary">Slope</AppText>
                <AppInput value={manualSlopeRating} onChangeText={setManualSlopeRating} keyboardType="number-pad" />
              </View>
            </View>
            <SecondaryButton
              size="sm"
              onPress={handleAddManualTee}
              disabled={actionLoading || !user?.uid}
              style={{ marginTop: spacing.xs }}
            >
              Add tee row
            </SecondaryButton>
          </View>

          <View style={[styles.reviewSection, { borderColor: colors.border }]}>
            <AppText variant="captionBold">Current tee rows ({selectedCourseTees.length})</AppText>
            {selectedCourseTees.length === 0 ? (
              <AppText variant="small" color="tertiary">No tee rows yet.</AppText>
            ) : (
              selectedCourseTees.map((tee) => (
                <AppText key={tee.id} variant="small" color="secondary" style={{ marginTop: 2 }}>
                  {tee.tee_name}
                  {tee.gender ? ` · ${tee.gender}` : ""}
                  {tee.par != null ? ` · Par ${tee.par}` : ""}
                  {tee.course_rating != null ? ` · CR ${tee.course_rating}` : ""}
                  {tee.slope_rating != null ? ` · S${tee.slope_rating}` : ""}
                </AppText>
              ))
            )}
          </View>
        </AppCard>
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
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  summaryGrid: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  summaryItem: {
    flex: 1,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  statusChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  statusChip: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  courseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  coordsPill: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
  },
  reviewSection: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  actionsRow: {
    marginTop: spacing.xs,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  manualRow: {
    flexDirection: "row",
    gap: spacing.xs,
    marginTop: spacing.xs,
    flexWrap: "wrap",
  },
});
