/**
 * Empty State Component
 * Friendly empty state with optional primary action
 */

import { ReactNode } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { AppText } from "./AppText";
import { AppCard } from "./AppCard";
import { PrimaryButton } from "./Button";
import { getColors, radius, spacing } from "@/lib/ui/theme";

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  message?: string;
  action?: {
    label: string;
    onPress: () => void;
  };
  style?: ViewStyle;
};

export function EmptyState({ icon, title, message, action, style }: EmptyStateProps) {
  const colors = getColors();

  return (
    <AppCard style={style ? StyleSheet.flatten([styles.container, style]) : styles.container}>
      <View style={styles.content}>
        {icon && <View style={[styles.iconContainer, { backgroundColor: colors.backgroundTertiary }]}>{icon}</View>}
        <AppText variant="h2" style={styles.title}>
          {title}
        </AppText>
        {message && (
          <AppText variant="body" color="secondary" style={styles.message}>
            {message}
          </AppText>
        )}
        {action && (
          <View style={styles.action}>
            <PrimaryButton onPress={action.onPress}>{action.label}</PrimaryButton>
          </View>
        )}
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.xl,
  },
  content: {
    alignItems: "center",
    paddingVertical: spacing.xl,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  title: {
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  message: {
    marginBottom: spacing.lg,
    textAlign: "center",
  },
  action: {
    width: "100%",
    maxWidth: 300,
  },
});


