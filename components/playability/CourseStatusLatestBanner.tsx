import { Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppText } from "@/components/ui/AppText";
import type { EventCourseStatusRow } from "@/lib/db_supabase/eventCourseStatusRepo";
import { getColors, spacing, radius, premiumTokens } from "@/lib/ui/theme";
import { COURSE_STATUS_LABEL, formatCourseStatusTimestampShort } from "./courseStatusShared";

type Props = {
  latest: EventCourseStatusRow | null | undefined;
  onOpenLog: () => void;
};

export function CourseStatusLatestBanner({ latest, onOpenLog }: Props) {
  const colors = getColors();

  return (
    <Pressable
      onPress={onOpenLog}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: premiumTokens.cardBorder,
          opacity: pressed ? 0.92 : 1,
        },
        premiumTokens.cardShadow,
      ]}
    >
      <View style={styles.head}>
        <AppText variant="captionBold" color="secondary" style={styles.eyebrow}>
          Latest club report
        </AppText>
        <Feather name="chevron-right" size={18} color={colors.textTertiary} />
      </View>
      {latest ? (
        <>
          <View style={styles.row}>
            <View style={[styles.badge, { backgroundColor: `${colors.primary}14` }]}>
              <AppText variant="captionBold" color="primary">
                {COURSE_STATUS_LABEL[latest.status] ?? latest.status}
              </AppText>
            </View>
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <AppText variant="small" color="tertiary">
                {formatCourseStatusTimestampShort(latest.created_at)}
                {latest.reporterName ? ` · ${latest.reporterName}` : ""}
              </AppText>
              {latest.note ? (
                <AppText variant="small" color="secondary" style={{ marginTop: 4 }} numberOfLines={3}>
                  {latest.note}
                </AppText>
              ) : null}
            </View>
          </View>
          <AppText variant="captionBold" color="primary" style={styles.tapHint}>
            Tap for full timeline
          </AppText>
        </>
      ) : (
        <AppText variant="small" color="tertiary">
          No member updates yet. After you call the club, log what you heard so the society stays aligned.
        </AppText>
      )}
    </Pressable>
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
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  eyebrow: {
    textTransform: "uppercase",
    letterSpacing: 0.4,
    fontSize: 11,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  tapHint: {
    marginTop: spacing.sm,
  },
});
