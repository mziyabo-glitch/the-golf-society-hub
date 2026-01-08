/**
 * Row Component
 * Flex row helper with consistent spacing
 */

import { ReactNode } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { spacing } from "@/lib/ui/theme";

type RowProps = {
  children: ReactNode;
  gap?: keyof typeof spacing;
  alignItems?: "flex-start" | "center" | "flex-end" | "stretch";
  justifyContent?: "flex-start" | "center" | "flex-end" | "space-between" | "space-around";
  style?: ViewStyle;
};

export function Row({ children, gap = "sm", alignItems = "center", justifyContent = "flex-start", style }: RowProps) {
  return (
    <View
      style={[
        styles.row,
        {
          gap: spacing[gap],
          alignItems,
          justifyContent,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
  },
});














