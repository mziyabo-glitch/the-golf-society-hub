/**
 * Settings: app-wide text size (persisted). Uses theme + font scale context.
 */

import { Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { getColors, spacing } from "@/lib/ui/theme";
import { useFontScale, type TextSizeLevel } from "@/lib/ui/fontScaleContext";
import { TEXT_SIZE_LABELS } from "@/lib/ui/textSizePreference";

const OPTIONS: TextSizeLevel[] = ["default", "large", "larger"];

export function TextSizeSettingsSection() {
  const colors = getColors();
  const { level, setLevel } = useFontScale();

  return (
    <>
      <AppText variant="h2" style={styles.sectionTitle}>
        Display
      </AppText>
      <AppCard padding="sm">
        <AppText variant="caption" color="secondary" style={styles.hint}>
          Text size applies across the app on this device. Choose what is easiest to read.
        </AppText>
        {OPTIONS.map((opt) => {
          const selected = level === opt;
          const { title, description } = TEXT_SIZE_LABELS[opt];
          return (
            <Pressable
              key={opt}
              onPress={() => void setLevel(opt)}
              style={({ pressed }) => [
                styles.optionRow,
                {
                  backgroundColor: selected ? colors.primary + "10" : "transparent",
                  borderColor: selected ? colors.primary : colors.border,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <View style={styles.optionText}>
                <AppText variant="bodyBold">{title}</AppText>
                <AppText variant="small" color="secondary">
                  {description}
                </AppText>
              </View>
              {selected ? (
                <Feather name="check-circle" size={22} color={colors.primary} />
              ) : (
                <View style={{ width: 22 }} />
              )}
            </Pressable>
          );
        })}
      </AppCard>
    </>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    marginBottom: spacing.sm,
    marginTop: spacing.base,
  },
  hint: {
    marginBottom: spacing.md,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.xs,
    borderRadius: 10,
    borderWidth: 1,
  },
  optionText: {
    flex: 1,
    minWidth: 0,
  },
});
