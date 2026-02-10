/**
 * Premium Card Component
 * Consistent card styling with subtle shadows and rounded corners
 */

import { StyleSheet, View, ViewStyle, StyleProp } from "react-native";
import { ReactNode } from "react";
import { getColors, radius, shadows, spacing } from "@/lib/ui/theme";

type AppCardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  elevated?: boolean;
  padding?: keyof typeof spacing;
};

export function AppCard({ children, style, elevated = true, padding = "base" }: AppCardProps) {
  const colors = getColors();
  
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          padding: spacing[padding],
        },
        elevated && shadows.sm,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.base,
  },
});

