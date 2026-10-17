import { Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppText } from "@/components/ui/AppText";
import { getColors, radius, spacing } from "@/lib/ui/theme";

type Props = {
  onOpenTeeSheet: () => void;
  teeTimePreview?: string | null;
  groupNumber?: number | null;
};

export function HomePublishedTeeSheetCard({ onOpenTeeSheet, teeTimePreview, groupNumber }: Props) {
  const colors = getColors();
  const hasPersonalTee = Boolean(teeTimePreview?.trim());

  return (
    <Pressable
      onPress={onOpenTeeSheet}
      style={({ pressed }) => [
        styles.card,
        {
          borderColor: `${colors.success}55`,
          backgroundColor: `${colors.success}10`,
          opacity: pressed ? 0.92 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel="Open published tee sheet"
    >
      <View style={[styles.iconCircle, { backgroundColor: `${colors.success}22` }]}>
        <Feather name="flag" size={18} color={colors.success} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.titleRow}>
          <AppText variant="bodyBold" style={{ color: colors.success }}>
            Published tee sheet
          </AppText>
          <View style={[styles.liveBadge, { backgroundColor: `${colors.success}24` }]}>
            <AppText variant="captionBold" style={{ color: colors.success }}>
              Live
            </AppText>
          </View>
        </View>
        {hasPersonalTee ? (
          <AppText variant="small" color="secondary" style={{ marginTop: 4 }} numberOfLines={2}>
            Your tee time: {teeTimePreview}
            {groupNumber != null ? ` · Group ${groupNumber}` : ""}
          </AppText>
        ) : (
          <AppText variant="small" color="secondary" style={{ marginTop: 4 }}>
            Tap to view tee times for this event.
          </AppText>
        )}
      </View>
      <Feather name="chevron-right" size={22} color={colors.success} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    minHeight: 48,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  liveBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
});
