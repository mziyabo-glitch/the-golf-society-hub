/**
 * Premium Button Component
 * Supports primary, secondary, and ghost variants with consistent styling
 */

import { Pressable, StyleSheet, Text, TextStyle, ViewStyle } from "react-native";
import { getColors, getThemeMode, spacing, radius, typography, buttonHeights } from "@/lib/ui/theme";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

type AppButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  fullWidth?: boolean;
};

export function AppButton({
  label,
  onPress,
  variant = "primary",
  size = "md",
  disabled = false,
  style,
  textStyle,
  fullWidth = false,
}: AppButtonProps) {
  const colors = getColors();
  const theme = getThemeMode();
  
  const height = buttonHeights[size];
  const paddingHorizontal = size === "sm" ? spacing.base : size === "md" ? spacing.base : spacing.lg;
  
  const variantStyles = {
    primary: {
      backgroundColor: disabled ? colors.surfaceDisabled : colors.primary,
      borderWidth: 0,
      borderColor: "transparent",
    },
    secondary: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    ghost: {
      backgroundColor: "transparent",
      borderWidth: 0,
      borderColor: "transparent",
    },
  };
  
  const textColors = {
    primary: colors.textInverse,
    secondary: colors.text,
    ghost: colors.primary,
  };
  
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        variantStyles[variant],
        {
          height,
          paddingHorizontal,
          opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
          width: fullWidth ? "100%" : undefined,
        },
        style,
      ]}
    >
      <Text
        style={[
          size === "lg" ? typography.buttonLarge : typography.button,
          { color: textColors[variant] },
          textStyle,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: buttonHeights.md,
  },
});

