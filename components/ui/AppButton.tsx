/**
 * Primary button primitive — sizes, variants, loading; shared by Button.tsx exports.
 */

import { ReactNode, useRef } from "react";
import {
  Pressable,
  StyleSheet,
  View,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
} from "react-native";
import { AppText } from "./AppText";
import { getColors, spacing, radius, buttonHeights, borderWidth } from "@/lib/ui/theme";
import { blurWebActiveElement } from "@/lib/ui/focus";
import { pressableSurfaceStyle, webPointerStyle } from "@/lib/ui/interaction";
import { useReducedMotion } from "@/hooks/useReducedMotion";

export type AppButtonVariant = "primary" | "secondary" | "ghost" | "destructive";

export type AppButtonSize = "sm" | "md" | "lg";

export type AppButtonProps = {
  label?: string;
  children?: ReactNode;
  loadingLabel?: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: AppButtonVariant;
  size?: AppButtonSize;
  style?: ViewStyle;
  textStyle?: TextStyle;
  fullWidth?: boolean;
  icon?: ReactNode;
  iconPosition?: "left" | "right";
};

function resolveContent(label?: string, children?: ReactNode): ReactNode {
  if (typeof label === "string" && label.length > 0) return label;
  return children ?? null;
}

function handlePress(onPress: () => void): void {
  try {
    blurWebActiveElement();
  } catch {
    /* ignore */
  }
  onPress();
}

export function AppButton({
  label,
  children,
  loadingLabel,
  onPress,
  disabled = false,
  loading = false,
  variant = "primary",
  size = "md",
  style,
  textStyle,
  fullWidth = false,
  icon,
  iconPosition = "left",
}: AppButtonProps) {
  const colors = getColors();
  const reduceMotion = useReducedMotion();
  const lastPressAtRef = useRef(0);
  const height = buttonHeights[size];
  const paddingHorizontal = size === "sm" ? spacing.base : size === "md" ? spacing.lg : spacing.lg;
  const content = resolveContent(label, children);

  const isDisabled = disabled || loading;

  const bg: Record<AppButtonVariant, string> = {
    primary: isDisabled ? colors.surfaceDisabled : colors.primary,
    secondary: "transparent",
    ghost: "transparent",
    destructive: isDisabled ? colors.surfaceDisabled : colors.error,
  };

  const border: Record<AppButtonVariant, { width: number; color: string }> = {
    primary: { width: 0, color: "transparent" },
    secondary: {
      width: borderWidth.hairline,
      color: isDisabled ? colors.border : colors.primary,
    },
    ghost: { width: 0, color: "transparent" },
    destructive: { width: 0, color: "transparent" },
  };

  const textColor: Record<AppButtonVariant, TextColorForButton> = {
    primary: "inverse",
    secondary: "primary",
    ghost: "primary",
    destructive: "inverse",
  };

  const spinnerColor =
    variant === "secondary" || variant === "ghost" ? colors.primary : colors.textInverse;

  const handleGuardedPress = () => {
    const now = Date.now();
    // Guard against accidental double-taps that can duplicate writes.
    if (now - lastPressAtRef.current < 700) return;
    lastPressAtRef.current = now;
    handlePress(onPress);
  };

  return (
    <Pressable
      onPress={handleGuardedPress}
      disabled={isDisabled}
      style={(state) => {
        const pressed = state.pressed;
        const pressFeedback = !isDisabled
          ? pressableSurfaceStyle({ pressed }, { reduceMotion, scale: "button" })
          : null;
        return [
          styles.button,
          {
            backgroundColor: bg[variant],
            borderWidth: border[variant].width,
            borderColor: border[variant].color,
            minHeight: height,
            paddingVertical: spacing.sm,
            paddingHorizontal,
            borderRadius: radius.md,
            width: fullWidth ? "100%" : undefined,
          },
          pressFeedback,
          webPointerStyle(),
          style,
        ];
      }}
    >
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={spinnerColor} />
          {loadingLabel ? (
            <AppText variant="button" color={textColor[variant]} style={textStyle}>
              {loadingLabel}
            </AppText>
          ) : null}
        </View>
      ) : (
        <View style={styles.content}>
          {icon && iconPosition === "left" ? <View style={styles.icon}>{icon}</View> : null}
          <AppText variant={size === "lg" ? "buttonLarge" : "button"} color={textColor[variant]} style={textStyle}>
            {content}
          </AppText>
          {icon && iconPosition === "right" ? <View style={styles.icon}>{icon}</View> : null}
        </View>
      )}
    </Pressable>
  );
}

type TextColorForButton = "primary" | "inverse";

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  icon: {
    alignItems: "center",
    justifyContent: "center",
  },
});
