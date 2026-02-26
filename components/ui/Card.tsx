/**
 * Premium Card — consistent padding 16, radius 14, border/shadow
 */

import { ReactNode } from "react";
import { StyleSheet, View, ViewStyle, StyleProp } from "react-native";
import { getColors, radius, spacing, premiumTokens } from "@/lib/ui/theme";

type CardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padding?: number;
};

export function Card({ children, style, padding = spacing.md }: CardProps) {
  const colors = getColors();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: premiumTokens.cardBorder,
          padding,
        },
        premiumTokens.cardShadow,
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
    marginBottom: spacing.md,
  },
});
