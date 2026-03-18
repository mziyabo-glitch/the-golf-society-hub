/**
 * CourseTeeSelector – selectable tee cards for event setup.
 * Used after captain selects a course; tees are loaded from course_tees.
 * Displays tee color indicator, rating, slope, par. Optional course handicap.
 */
import { StyleSheet, View, Pressable } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { getColors, spacing, radius } from "@/lib/ui/theme";
import type { CourseTee } from "@/lib/db_supabase/courseRepo";

const teeColors: Record<string, string> = {
  white: "#ffffff",
  yellow: "#ffd700",
  blue: "#2563eb",
  red: "#dc2626",
  black: "#111827",
  green: "#16a34a",
};

function getTeeColor(tee: CourseTee): string {
  if (tee.tee_color) {
    const key = tee.tee_color.toLowerCase().replace(/\s+/g, "");
    if (teeColors[key]) return teeColors[key];
  }
  const name = (tee.tee_name || "").toLowerCase();
  for (const [key, hex] of Object.entries(teeColors)) {
    if (name.includes(key)) return hex;
  }
  return teeColors.blue;
}

export type CourseTeeSelectorProps = {
  tees: CourseTee[];
  selectedTee: CourseTee | null;
  onSelectTee: (tee: CourseTee) => void;
  /** Optional: handicap index for course handicap display */
  handicapIndex?: number | null;
};

/**
 * Course handicap = handicap index × slope / 113 (rounded).
 */
export function courseHandicapFromTee(handicapIndex: number, slopeRating: number): number {
  return Math.round(handicapIndex * (slopeRating / 113));
}

export function CourseTeeSelector({
  tees,
  selectedTee,
  onSelectTee,
  handicapIndex,
}: CourseTeeSelectorProps) {
  const colors = getColors();

  if (tees.length === 0) {
    return (
      <View style={styles.empty}>
        <AppText variant="caption" color="secondary">
          No tees for this course. Add tees when importing the course.
        </AppText>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppText variant="captionBold" style={styles.sectionLabel}>
        Select Tee
      </AppText>
      {tees.map((tee) => {
        const isSelected = selectedTee?.id === tee.id;
        const dotColor = getTeeColor(tee);
        const courseHcap =
          handicapIndex != null && !isNaN(handicapIndex)
            ? courseHandicapFromTee(handicapIndex, tee.slope_rating)
            : null;

        return (
          <Pressable
            key={tee.id}
            onPress={() => onSelectTee(tee)}
            style={({ pressed }) => [
              styles.card,
              {
                backgroundColor: isSelected ? colors.primary + "14" : colors.surface,
                borderColor: isSelected ? colors.primary : colors.border,
                borderWidth: isSelected ? 2 : 1,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <View style={styles.cardRow}>
              <View style={[styles.dot, { backgroundColor: dotColor }]} />
              <AppText variant="bodyBold" numberOfLines={1} style={styles.teeName}>
                {tee.tee_name}
              </AppText>
              {(tee.gender === "F" || (tee.tee_name || "").includes("(Ladies)")) ? (
                <AppText variant="caption" color="secondary" style={styles.genderBadge}>
                  Ladies
                </AppText>
              ) : tee.gender === "M" ? (
                <AppText variant="caption" color="secondary" style={styles.genderBadge}>
                  Men
                </AppText>
              ) : null}
              {isSelected && (
                <View style={[styles.checkBadge, { backgroundColor: colors.primary }]}>
                  <AppText variant="small" style={styles.checkText}>
                    ✓
                  </AppText>
                </View>
              )}
            </View>
            <View style={styles.statsRow}>
              <AppText variant="caption" color="secondary">
                CR {tee.course_rating} / SR {tee.slope_rating}
              </AppText>
              <AppText variant="caption" color="secondary">
                Par {tee.par_total}
              </AppText>
            </View>
            {courseHcap != null && (
              <AppText variant="small" color="tertiary" style={styles.courseHcap}>
                Course handicap: {courseHcap}
              </AppText>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  sectionLabel: {
    marginBottom: spacing.xs,
  },
  empty: {
    paddingVertical: spacing.base,
  },
  card: {
    padding: spacing.sm,
    borderRadius: radius.md,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.15)",
  },
  teeName: {
    flex: 1,
  },
  genderBadge: {
    marginLeft: spacing.xs,
  },
  checkBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  checkText: {
    color: "#fff",
    fontWeight: "700",
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.xs,
    marginLeft: 14 + spacing.sm,
  },
  courseHcap: {
    marginTop: 2,
    marginLeft: 14 + spacing.sm,
  },
});
