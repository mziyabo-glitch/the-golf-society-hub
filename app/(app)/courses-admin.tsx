import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
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
  getCourseLibrarySummary,
  listCoursesForAdmin,
  type CourseLibraryDoc,
} from "@/lib/db_supabase/courseRepo";
import { useBootstrap } from "@/lib/useBootstrap";
import { getPermissionsForMember } from "@/lib/rbac";
import { getColors, radius, spacing } from "@/lib/ui/theme";
import { formatError, type FormattedError } from "@/lib/ui/formatError";

export default function CoursesAdminScreen() {
  const tabBarHeight = useBottomTabBarHeight();
  const colors = getColors();
  const { member, activeSocietyId, loading: bootstrapLoading } = useBootstrap();
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

  const load = useCallback(
    async (searchQuery: string) => {
      setLoading(true);
      setError(null);
      try {
        const [summaryData, courseData] = await Promise.all([
          getCourseLibrarySummary("gb"),
          listCoursesForAdmin({ countryCode: "gb", query: searchQuery, limit: 200 }),
        ]);
        setSummary(summaryData);
        setCourses(courseData);
      } catch (err: any) {
        setError(formatError(err));
        setSummary(null);
        setCourses([]);
      } finally {
        setLoading(false);
      }
    },
    []
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
          <AppText variant="title">Course Library</AppText>
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
          <AppText variant="title">Course Library</AppText>
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
          <AppText variant="title">Course Library (Admin)</AppText>
          <AppText variant="caption" color="secondary">
            Fairway Forecast UK import
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
          {courses.map((course) => (
            <AppCard key={course.id} padding="sm">
              <View style={styles.courseRow}>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyBold">{course.name}</AppText>
                  <AppText variant="small" color="secondary">
                    {course.area || "Area unknown"}
                  </AppText>
                </View>
                <View style={[styles.coordsPill, { backgroundColor: colors.backgroundSecondary }]}>
                  <AppText variant="small" color="secondary">
                    {course.lat.toFixed(5)}, {course.lng.toFixed(5)}
                  </AppText>
                </View>
              </View>
            </AppCard>
          ))}
        </View>
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
});
