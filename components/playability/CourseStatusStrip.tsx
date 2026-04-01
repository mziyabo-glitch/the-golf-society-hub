import { View, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppText } from "@/components/ui/AppText";
import type { EventCourseStatusRow } from "@/lib/db_supabase/eventCourseStatusRepo";
import { getColors, spacing, radius } from "@/lib/ui/theme";
import { COURSE_STATUS_LABEL, formatCourseStatusTimestampShort } from "./courseStatusShared";

type Props = {
  rows: EventCourseStatusRow[];
  onLogPress: () => void;
  /** When list is empty, override default copy (e.g. "No earlier reports yet.") */
  emptyHint?: string;
  sectionTitle?: string;
};

export function CourseStatusStrip({ rows, onLogPress, emptyHint, sectionTitle }: Props) {
  const colors = getColors();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
      ]}
    >
      <View style={styles.head}>
        <AppText variant="captionBold" color="secondary" style={styles.eyebrow}>
          {sectionTitle ?? "Course status (member updates)"}
        </AppText>
        <Pressable onPress={onLogPress} style={styles.logBtn} hitSlop={8}>
          <Feather name="plus-circle" size={16} color={colors.primary} />
          <AppText variant="captionBold" color="primary" style={{ marginLeft: 6 }}>
            Log update
          </AppText>
        </Pressable>
      </View>

      {rows.length === 0 ? (
        <AppText variant="small" color="tertiary">
          {emptyHint ??
            "No reports yet. After you call the club, tap Log update so others see the latest."}
        </AppText>
      ) : (
        rows.slice(0, 5).map((r) => (
          <View
            key={r.id}
            style={[styles.row, { borderTopColor: colors.borderLight }]}
          >
            <View style={[styles.badge, { backgroundColor: `${colors.primary}12` }]}>
              <AppText variant="captionBold" color="primary">
                {COURSE_STATUS_LABEL[r.status] ?? r.status}
              </AppText>
            </View>
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <AppText variant="small" color="tertiary">
                {formatCourseStatusTimestampShort(r.created_at)}
                {r.reporterName ? ` · ${r.reporterName}` : ""}
              </AppText>
              {r.note ? (
                <AppText variant="small" color="secondary" style={{ marginTop: 2 }}>
                  {r.note}
                </AppText>
              ) : null}
            </View>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  head: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  eyebrow: {
    textTransform: "uppercase",
    letterSpacing: 0.4,
    fontSize: 11,
    flex: 1,
  },
  logBtn: {
    flexDirection: "row",
    alignItems: "center",
  },
  row: {
    flexDirection: "row",
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: "flex-start",
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
});
