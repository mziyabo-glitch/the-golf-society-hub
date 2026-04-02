/**
 * Settings: app theme preference (persisted). Uses ThemeProvider + theme tokens.
 */

import { Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { getColors, spacing } from "@/lib/ui/theme";
import { useTheme, type ThemePreference } from "@/lib/ui/themeContext";

const OPTIONS: ThemePreference[] = ["light", "dark", "system"];

const LABELS: Record<ThemePreference, { title: string; description: string }> = {
  light: { title: "Light", description: "Always use light appearance" },
  dark: { title: "Dark", description: "Always use dark appearance" },
  system: { title: "System", description: "Match this device’s light or dark mode" },
};

export function ThemeSettingsSection() {
  const colors = getColors();
  const { preference, setPreference } = useTheme();

  return (
    <>
      <AppText variant="h2" style={styles.sectionTitle}>
        Theme
      </AppText>
      <AppCard padding="sm">
        <AppText variant="caption" color="secondary" style={styles.hint}>
          Your choice is saved on this device and applies after you reopen the app.
        </AppText>
        {OPTIONS.map((opt) => {
          const selected = preference === opt;
          const { title, description } = LABELS[opt];
          return (
            <Pressable
              key={opt}
              onPress={() => void setPreference(opt)}
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
