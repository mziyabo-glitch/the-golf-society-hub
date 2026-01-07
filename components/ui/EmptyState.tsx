/**
 * Empty State Component
 * Friendly empty state with optional primary action
 */

import { ReactNode } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { AppText } from "./AppText";
import { AppCard } from "./AppCard";
import { PrimaryButton } from "./Button";
import { spacing } from "@/lib/ui/theme";

type EmptyStateProps = {
  title: string;
  message?: string;
  action?: {
    label: string;
    onPress: () => void;
  };
  style?: ViewStyle;
};

export function EmptyState({ title, message, action, style }: EmptyStateProps) {
  return (
    <AppCard style={[styles.container, style]}>
      <View style={styles.content}>
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

