/**
 * Button Components
 * Primary, Secondary, and Destructive button variants
 *
 * FIX:
 * - Support BOTH usages:
 *    <PrimaryButton>Save</PrimaryButton>
 *    <PrimaryButton label="Save" />
 *
 * This prevents "blank green pill" buttons on web.
 */

import { ReactNode } from "react";
import { Pressable, StyleSheet, View, ViewStyle, ActivityIndicator } from "react-native";
import { AppText } from "./AppText";
import { getColors, radius, spacing, buttonHeights } from "@/lib/ui/theme";
import { blurWebActiveElement } from "@/lib/ui/focus";

type ButtonProps = {
  // ✅ Back-compat support:
  label?: string;

  // ✅ Preferred usage:
  children?: ReactNode;

  /** Shown next to the spinner when `loading` is true (e.g. "Saving…"). */
  loadingLabel?: string;

  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  variant?: "primary" | "secondary" | "destructive";
  size?: "sm" | "md" | "lg";
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
  } catch (error) {
    console.warn("[Button] blurWebActiveElement failed:", error);
  }
  onPress();
}

export function PrimaryButton({
  label,
  children,
  loadingLabel,
  onPress,
  disabled,
  loading,
  style,
  size = "md",
  icon,
  iconPosition = "left",
}: ButtonProps) {
  const colors = getColors();
  const height = buttonHeights[size];
  const content = resolveContent(label, children);

  return (
    <Pressable
      onPress={() => handlePress(onPress)}
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
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.textInverse} />
          {loadingLabel ? (
            <AppText variant="button" color="inverse" style={styles.loadingLabelText}>
              {loadingLabel}
            </AppText>
          ) : null}
        </View>
      ) : (
        <View style={styles.content}>
          {icon && iconPosition === "left" ? <View style={styles.icon}>{icon}</View> : null}
          <AppText variant="button" color="inverse" style={styles.buttonText}>
            {content}
          </AppText>
          {icon && iconPosition === "right" ? <View style={styles.icon}>{icon}</View> : null}
        </View>
      )}
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  children,
  onPress,
  disabled,
  loading,
  style,
  size = "md",
  icon,
  iconPosition = "left",
}: ButtonProps) {
  const colors = getColors();
  const height = buttonHeights[size];
  const content = resolveContent(label, children);

  return (
    <Pressable
      onPress={() => handlePress(onPress)}
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
        <View style={styles.content}>
          {icon && iconPosition === "left" ? <View style={styles.icon}>{icon}</View> : null}
          <AppText variant="button" color="primary" style={styles.buttonText}>
            {content}
          </AppText>
          {icon && iconPosition === "right" ? <View style={styles.icon}>{icon}</View> : null}
        </View>
      )}
    </Pressable>
  );
}

export function DestructiveButton({
  label,
  children,
  onPress,
  disabled,
  loading,
  style,
  size = "md",
  icon,
  iconPosition = "left",
}: ButtonProps) {
  const colors = getColors();
  const height = buttonHeights[size];
  const content = resolveContent(label, children);

  return (
    <Pressable
      onPress={() => handlePress(onPress)}
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
        <View style={styles.content}>
          {icon && iconPosition === "left" ? <View style={styles.icon}>{icon}</View> : null}
          <AppText variant="button" color="inverse" style={styles.buttonText}>
            {content}
          </AppText>
          {icon && iconPosition === "right" ? <View style={styles.icon}>{icon}</View> : null}
        </View>
      )}
    </Pressable>
  );
}

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
  loadingLabelText: {},
  icon: {
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {},
});
