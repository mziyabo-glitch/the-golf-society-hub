import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { AppInput } from "@/components/ui/AppInput";
import { AppText } from "@/components/ui/AppText";
import { searchCourses, type CourseDoc } from "@/lib/db_supabase/courseRepo";
import { getColors, radius, spacing } from "@/lib/ui/theme";

type CoursePickerProps = {
  label?: string;
  initialQuery?: string;
  onCourseChange: (course: CourseDoc | null, query: string) => void;
};

export function CoursePicker({
  label = "Course",
  initialQuery = "",
  onCourseChange,
}: CoursePickerProps) {
  const colors = getColors();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<CourseDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    const timeout = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: rows, error } = await searchCourses(query, query.trim() ? 25 : 15);
        setResults(error ? [] : rows ?? []);
      } catch (err: any) {
        setResults([]);
        setError(err?.message || "Failed to load courses");
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timeout);
  }, [query]);

  const hasResults = results.length > 0;
  const helperText = useMemo(() => {
    if (loading) return "Loading courses...";
    if (error) return error;
    if (!hasResults) return query.trim() ? "No matching courses found." : "Start typing to search all courses.";
    return `${results.length} course${results.length === 1 ? "" : "s"} found`;
  }, [error, hasResults, loading, query, results.length]);

  return (
    <View style={styles.container}>
      <AppText variant="captionBold" style={styles.label}>
        {label}
      </AppText>
      <AppInput
        placeholder="Search for a course"
        value={query}
        onChangeText={(value) => {
          setQuery(value);
          onCourseChange(null, value);
        }}
        autoCapitalize="words"
        autoCorrect={false}
      />
      <AppText
        variant="small"
        color="secondary"
        style={[styles.helper, error ? { color: colors.error } : undefined]}
      >
        {helperText}
      </AppText>

      {hasResults ? (
        <View
          style={[
            styles.results,
            {
              borderColor: colors.border,
              backgroundColor: colors.surface,
            },
          ]}
        >
          {results.map((course) => (
            <Pressable
              key={course.id}
              onPress={() => {
                setQuery(course.name);
                onCourseChange(course, course.name);
              }}
              style={({ pressed }) => [
                styles.resultRow,
                {
                  backgroundColor: pressed ? colors.backgroundSecondary : colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              <AppText variant="bodyBold">{course.name}</AppText>
              {(course.location || course.city || course.country) ? (
                <AppText variant="small" color="secondary">
                  {course.location ?? [course.city, course.country].filter(Boolean).join(", ")}
                </AppText>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.base,
  },
  label: {
    marginBottom: spacing.xs,
  },
  helper: {
    marginTop: 4,
  },
  results: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  resultRow: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
