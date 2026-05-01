import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { isPlatformAdmin } from "@/lib/db_supabase/adminRepo";
import {
  collectUkGolfStagingWarnings,
  computeUkGolfStagingTrustLevel,
  listUkGolfStagingCoursesWithTees,
  reviewUkGolfCourseCandidate,
  reviewUkGolfTeeCandidate,
  type UkGolfStagingCourseWithTees,
} from "@/lib/db_supabase/ukGolfStagingRepo";
import { getColors, radius, spacing } from "@/lib/ui/theme";
import { goBack } from "@/lib/navigation";

export default function UkGolfStagingReviewScreen() {
  const router = useRouter();
  const colors = getColors();
  const [gateLoading, setGateLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<UkGolfStagingCourseWithTees[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ok = await isPlatformAdmin();
        if (!cancelled) {
          setAllowed(ok);
        }
      } finally {
        if (!cancelled) setGateLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await listUkGolfStagingCoursesWithTees();
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load staging data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!allowed) return;
    void load();
  }, [allowed, load]);

  const onReviewCourse = async (id: string, status: "pending" | "approved" | "rejected") => {
    setBusyId(`c:${id}`);
    try {
      await reviewUkGolfCourseCandidate(id, status);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setBusyId(null);
    }
  };

  const onReviewTee = async (id: string, status: "pending" | "approved" | "rejected") => {
    setBusyId(`t:${id}`);
    try {
      await reviewUkGolfTeeCandidate(id, status);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setBusyId(null);
    }
  };

  if (gateLoading) {
    return (
      <Screen>
        <LoadingState message="Checking access…" />
      </Screen>
    );
  }

  if (!allowed) {
    return (
      <Screen>
        <EmptyState title="Platform admin only" message="UK Golf staging review requires a platform administrator account." />
        <SecondaryButton label="Back" onPress={() => goBack(router, "/(app)/course-data")} style={{ marginTop: spacing.lg }} />
      </Screen>
    );
  }

  if (loading) {
    return (
      <Screen>
        <LoadingState message="Loading UK Golf staging…" />
      </Screen>
    );
  }

  return (
    <Screen scrollable={false} style={{ backgroundColor: colors.backgroundSecondary }}>
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
      >
        <Pressable onPress={() => goBack(router, "/(app)/course-data")} style={styles.backRow} hitSlop={12}>
          <Feather name="arrow-left" size={20} color={colors.text} />
          <AppText variant="bodyBold" style={{ marginLeft: spacing.sm }}>
            Back
          </AppText>
        </Pressable>

        <AppText variant="title">UK Golf API staging</AppText>
        <AppText variant="small" color="secondary" style={{ marginTop: spacing.xs, marginBottom: spacing.base }}>
          Approve or reject staged courses and tees. Live promotion is a separate CLI command (
          <AppText variant="small" style={{ fontFamily: "monospace" }}>
            npm run course-import:ukgolfapi:promote-approved
          </AppText>
          ).
        </AppText>

        {error ? <InlineNotice variant="error" message={error} style={{ marginBottom: spacing.base }} /> : null}

        {rows.length === 0 ? (
          <EmptyState title="No staged courses" message="Run the UK Golf dry-run with staging writes enabled, then refresh." />
        ) : null}

        {rows.map((course) => {
          const trust = computeUkGolfStagingTrustLevel(course, course.tees, course.holeCountByTeeId);
          const warnings = collectUkGolfStagingWarnings(course, course.tees);
          const verifiedTeeCount = course.tees.filter(
            (t) => t.validation_status === "verified_candidate" && t.verified_for_play,
          ).length;
          const isOpen = expanded[course.id] === true;
          return (
            <AppCard key={course.id} style={styles.card}>
              <Pressable
                onPress={() => setExpanded((prev) => ({ ...prev, [course.id]: !isOpen }))}
                style={styles.courseHeader}
              >
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyBold">{course.matched_course_name ?? course.provider_course_id}</AppText>
                  {course.matched_club_name ? (
                    <AppText variant="small" color="secondary" style={{ marginTop: 2 }}>
                      {course.matched_club_name}
                    </AppText>
                  ) : null}
                  <View style={styles.chipRow}>
                    <Chip>{`Trust: ${trust}`}</Chip>
                    <Chip>{`Review: ${course.review_status}`}</Chip>
                    <Chip>{`Tees: ${course.tees.length}`}</Chip>
                    <Chip>{`Verified tees: ${verifiedTeeCount}`}</Chip>
                  </View>
                  {warnings.length > 0 ? (
                    <AppText variant="caption" color="secondary" style={{ marginTop: spacing.xs }}>
                      Warnings: {warnings.join("; ")}
                    </AppText>
                  ) : null}
                </View>
                <Feather name={isOpen ? "chevron-up" : "chevron-down"} size={22} color={colors.textTertiary} />
              </Pressable>

              <View style={styles.actions}>
                <PrimaryButton
                  label="Approve"
                  disabled={busyId != null}
                  loading={busyId === `c:${course.id}`}
                  onPress={() => void onReviewCourse(course.id, "approved")}
                />
                <SecondaryButton
                  label="Reject"
                  disabled={busyId != null}
                  onPress={() => void onReviewCourse(course.id, "rejected")}
                />
                <SecondaryButton
                  label="Reset"
                  disabled={busyId != null}
                  onPress={() => void onReviewCourse(course.id, "pending")}
                />
              </View>

              {isOpen ? (
                <View style={styles.teeList}>
                  {course.tees.map((tee) => {
                    const holes = course.holeCountByTeeId[tee.id] ?? 0;
                    return (
                      <View key={tee.id} style={[styles.teeCard, { borderColor: colors.border }]}>
                        <AppText variant="bodyBold">
                          {tee.tee_set ?? "Tee"}
                          {tee.tee_colour
                            ? ` (${tee.tee_colour}${tee.tee_gender ? ` · ${tee.tee_gender}` : ""})`
                            : ""}
                        </AppText>
                        <AppText variant="small" color="secondary" style={{ marginTop: 4 }}>
                          CR {tee.course_rating ?? "—"} · Slope {tee.slope_rating ?? "—"} · Par {tee.par_total ?? "—"} · Yards{" "}
                          {tee.total_yardage ?? "—"}
                        </AppText>
                        <View style={styles.chipRow}>
                          <Chip>{tee.validation_status}</Chip>
                          <Chip>{tee.verified_for_play ? "play OK" : "not playable"}</Chip>
                          <Chip>{`Holes: ${holes}`}</Chip>
                          <Chip>{`Review: ${tee.review_status}`}</Chip>
                        </View>
                        {tee.review_notes ? (
                          <AppText variant="caption" color="secondary" style={{ marginTop: spacing.xs }}>
                            Notes: {tee.review_notes}
                          </AppText>
                        ) : null}
                        <View style={styles.actions}>
                          <PrimaryButton
                            label="Approve tee"
                            disabled={busyId != null}
                            loading={busyId === `t:${tee.id}`}
                            onPress={() => void onReviewTee(tee.id, "approved")}
                          />
                          <SecondaryButton label="Reject" disabled={busyId != null} onPress={() => void onReviewTee(tee.id, "rejected")} />
                          <SecondaryButton label="Reset" disabled={busyId != null} onPress={() => void onReviewTee(tee.id, "pending")} />
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </AppCard>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: spacing.lg,
    paddingBottom: spacing["3xl"],
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.base,
  },
  card: {
    marginBottom: spacing.base,
    borderRadius: radius.lg,
  },
  courseHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.base,
  },
  teeList: {
    marginTop: spacing.base,
    gap: spacing.sm,
  },
  teeCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.base,
  },
});
