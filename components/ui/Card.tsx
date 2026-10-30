/**
 * Surface primitive — theme-aware background, border, radius, padding, elevation presets.
 */

import { ReactNode } from "react";
import { StyleSheet, View, ViewStyle, StyleProp } from "react-native";
import { getColors, radius, spacing, shadows, borderWidth, cardElevation } from "@/lib/ui/theme";

export type CardVariant = "default" | "elevated" | "outlined" | "subtle";

type CardProps = {
  children: ReactNode;
  variant?: CardVariant;
  style?: StyleProp<ViewStyle>;
  /** Spacing scale key or raw pixels */
  padding?: keyof typeof spacing | number;
};

function resolvePadding(p: CardProps["padding"] | undefined): number {
  if (p === undefined) return spacing.md;
  if (typeof p === "number") return p;
  return spacing[p];
}

/**
 * Shared card surface — use for list rows, panels, and modals (layout overrides via `style`).
 */
export function Card({ children, variant = "default", style, padding }: CardProps) {
  const colors = getColors();
  const pad = resolvePadding(padding);

  const variantStyle = (() => {
    switch (variant) {
      case "elevated":
        return [
          styles.shell,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: borderWidth.hairline,
          },
          cardElevation.premium,
        ];
      case "outlined":
        return [
          styles.shell,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: borderWidth.hairline,
          },
        ];
      case "subtle":
        return [
          styles.shell,
          {
            backgroundColor: colors.backgroundSecondary,
            borderColor: colors.borderLight,
            borderWidth: borderWidth.hairline,
          },
        ];
      case "default":
      default:
        return [
          styles.shell,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: borderWidth.hairline,
          },
          shadows.sm,
        ];
    }
  })();

  return <View style={[styles.root, variantStyle, { padding: pad }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  root: {
    marginBottom: spacing.base,
    alignSelf: "stretch",
    width: "100%",
    maxWidth: "100%",
  },
  shell: {
    borderRadius: radius.md,
  },
});
