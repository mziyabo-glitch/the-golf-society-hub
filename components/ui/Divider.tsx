/**
 * Divider Component
 * Hairline divider for separating sections
 */

import { StyleSheet, View, ViewStyle } from "react-native";
import { getColors, spacing } from "@/lib/ui/theme";

type DividerProps = {
  style?: ViewStyle;
  vertical?: boolean;
};

export function Divider({ style, vertical = false }: DividerProps) {
  const colors = getColors();

  return (
    <View
      style={[
        vertical ? styles.vertical : styles.horizontal,
        {
          backgroundColor: colors.divider,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  horizontal: {
    height: 1,
    width: "100%",
    marginVertical: spacing.md,
  },
  vertical: {
    width: 1,
    height: "100%",
    marginHorizontal: spacing.md,
  },
});





