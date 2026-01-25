/**
 * Loading State Component
 * Standardized loading indicator with optional message.
 */

import { ActivityIndicator, StyleSheet, View, ViewStyle } from "react-native";
import { AppText } from "./AppText";
import { getColors, spacing } from "@/lib/ui/theme";

type LoadingStateProps = {
  message?: string;
  style?: ViewStyle;
};

export function LoadingState({ message = "Loading...", style }: LoadingStateProps) {
  const colors = getColors();

  return (
    <View style={[styles.container, style]}>
      <ActivityIndicator size="large" color={colors.primary} />
      {message ? (
        <AppText variant="caption" color="secondary" style={styles.message}>
          {message}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  message: {
    textAlign: "center",
  },
});
