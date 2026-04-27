import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/AppText";
import { getColors, radius, spacing } from "@/lib/ui/theme";

export type FreePlayScoreViewTab = "simple" | "stats" | "card";

type FreePlayScoreModeTabsProps = {
  value: FreePlayScoreViewTab;
  onChange: (v: FreePlayScoreViewTab) => void;
};

export function FreePlayScoreModeTabs({ value, onChange }: FreePlayScoreModeTabsProps) {
  const colors = getColors();
  const tabs: { id: FreePlayScoreViewTab; label: string }[] = [
    { id: "simple", label: "Simple" },
    { id: "stats", label: "Stats" },
    { id: "card", label: "Card" },
  ];

  return (
    <View style={[styles.row, { backgroundColor: colors.backgroundSecondary }]}>
      {tabs.map((t) => {
        const on = value === t.id;
        return (
          <Pressable
            key={t.id}
            onPress={() => onChange(t.id)}
            style={[
              styles.seg,
              {
                backgroundColor: on ? colors.surface : "transparent",
                borderColor: on ? colors.primary : colors.borderLight,
              },
            ]}
          >
            <AppText variant="captionBold" color={on ? "primary" : "secondary"}>
              {t.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    borderRadius: radius.lg,
    padding: 4,
    gap: 4,
  },
  seg: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
});
