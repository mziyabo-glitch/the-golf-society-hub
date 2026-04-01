import { StyleSheet, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { getColors, spacing, radius } from "@/lib/ui/theme";

type Props = {
  name: string;
  subtitle?: string | null;
  /** e.g. "Saved course" / "Directory" */
  sourceHint?: string | null;
};

export function SelectedCourseHeader({ name, subtitle, sourceHint }: Props) {
  const colors = getColors();

  return (
    <View style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
      <AppText variant="captionBold" color="tertiary" style={styles.eyebrow}>
        Selected course
      </AppText>
      <AppText variant="h2" numberOfLines={2} style={styles.title}>
        {name}
      </AppText>
      {subtitle ? (
        <AppText variant="small" color="secondary" style={{ marginTop: 4 }} numberOfLines={2}>
          {subtitle}
        </AppText>
      ) : null}
      {sourceHint ? (
        <AppText variant="small" color="tertiary" style={{ marginTop: spacing.xs }}>
          {sourceHint}
        </AppText>
      ) : null}
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
  eyebrow: {
    textTransform: "uppercase",
    letterSpacing: 0.4,
    fontSize: 11,
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
  },
});
