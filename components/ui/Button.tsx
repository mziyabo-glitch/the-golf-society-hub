/**
 * Button Components
 * Primary, Secondary, and Destructive button variants
 * All buttons have minHeight 44px for accessibility
 */

import { ReactNode } from "react";
import { Pressable, StyleSheet, ViewStyle, ActivityIndicator } from "react-native";
import { AppText } from "./AppText";
import { getColors, radius, spacing, buttonHeights, typography } from "@/lib/ui/theme";

type ButtonProps = {
  children: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  variant?: "primary" | "secondary" | "destructive";
  size?: "sm" | "md" | "lg";
};

export function PrimaryButton({ children, onPress, disabled, loading, style, size = "md" }: ButtonProps) {
  const colors = getColors();
  const height = buttonHeights[size];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: disabled ? colors.surfaceDisabled : colors.primary,
          minHeight: height,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.lg,
          borderRadius: radius.md,
          opacity: pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.textInverse} />
      ) : (
        <AppText variant="button" color="inverse" style={styles.buttonText}>
          {children}
        </AppText>
      )}
    </Pressable>
  );
}

export function SecondaryButton({ children, onPress, disabled, loading, style, size = "md" }: ButtonProps) {
  const colors = getColors();
  const height = buttonHeights[size];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: "transparent",
          borderWidth: 1,
          borderColor: disabled ? colors.border : colors.primary,
          minHeight: height,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.lg,
          borderRadius: radius.md,
          opacity: pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <AppText variant="button" color="primary" style={styles.buttonText}>
          {children}
        </AppText>
      )}
    </Pressable>
  );
}

export function DestructiveButton({ children, onPress, disabled, loading, style, size = "md" }: ButtonProps) {
  const colors = getColors();
  const height = buttonHeights[size];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: disabled ? colors.surfaceDisabled : colors.error,
          minHeight: height,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.lg,
          borderRadius: radius.md,
          opacity: pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.textInverse} />
      ) : (
        <AppText variant="button" color="inverse" style={styles.buttonText}>
          {children}
        </AppText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    ...typography.button,
  },
});
