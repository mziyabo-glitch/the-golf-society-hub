import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/AppText";
import { getColors, radius, spacing } from "@/lib/ui/theme";

type FreePlayHoleJumpBarProps = {
  holeNumbers: readonly number[];
  currentHole: number;
  onSelectHole: (n: number) => void;
  disabled?: boolean;
};

export function FreePlayHoleJumpBar({ holeNumbers, currentHole, onSelectHole, disabled }: FreePlayHoleJumpBarProps) {
  const colors = getColors();
  if (holeNumbers.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <AppText variant="captionBold" color="tertiary" style={{ marginBottom: spacing.xs }}>
        Jump to hole
      </AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {holeNumbers.map((n) => {
          const active = n === currentHole;
          return (
            <Pressable
              key={n}
              onPress={() => !disabled && onSelectHole(n)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={`Hole ${n}`}
              style={[
                styles.chip,
                {
                  borderColor: active ? colors.primary : colors.borderLight,
                  backgroundColor: active ? `${colors.primary}18` : colors.surface,
                  opacity: disabled ? 0.45 : 1,
                },
              ]}
            >
              <AppText variant="captionBold" color={active ? "primary" : "secondary"}>
                {n}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.md,
  },
  row: {
    flexDirection: "row",
    gap: spacing.xs,
    paddingVertical: 2,
  },
  chip: {
    minWidth: 40,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
  },
});
