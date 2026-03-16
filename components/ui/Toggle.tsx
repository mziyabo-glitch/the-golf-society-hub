/**
 * Cross-platform toggle (Switch alternative).
 * React Native Switch can render with zero size on web; this always renders.
 */
import { View, Pressable, StyleSheet } from "react-native";
import { getColors, spacing, radius } from "@/lib/ui/theme";

type ToggleProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
};

export function Toggle({ value, onValueChange, disabled }: ToggleProps) {
  const colors = getColors();
  return (
    <Pressable
      onPress={() => !disabled && onValueChange(!value)}
      style={[
        styles.track,
        {
          backgroundColor: value ? colors.primary : colors.border,
        },
      ]}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !!disabled }}
      accessibilityLabel="Toggle"
    >
      <View
        style={[
          styles.thumb,
          {
            backgroundColor: "#fff",
            alignSelf: value ? "flex-end" : "flex-start",
          },
        ]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 51,
    height: 31,
    borderRadius: 16,
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  thumb: {
    width: 27,
    height: 27,
    borderRadius: 14,
  },
});
