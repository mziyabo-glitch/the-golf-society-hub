/**
 * Chip — height 28, subtle fill, consistent radius
 */

import { StyleSheet, View, ViewStyle, StyleProp } from "react-native";
import { ReactNode } from "react";
import { AppText } from "./AppText";
import { getColors, radius, spacing } from "@/lib/ui/theme";

type ChipProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Chip({ children, style }: ChipProps) {
  const colors = getColors();

  return (
    <View style={[styles.chip, { backgroundColor: colors.backgroundTertiary }, style]}>
      <AppText variant="small" color="secondary">
        {children}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 28,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
});
