import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Feather } from "@expo/vector-icons";

import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { PrimaryButton } from "@/components/ui/Button";
import { getColors, radius, spacing } from "@/lib/ui/theme";

export type RetryErrorBlockProps = {
  title?: string;
  message: string;
  onRetry: () => void;
  retrying?: boolean;
  /** Shown when stale/cached data is visible behind this block */
  staleHint?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Standard error + retry affordance for poor-signal and failed refresh paths.
 */
export function RetryErrorBlock({
  title = "Something went wrong",
  message,
  onRetry,
  retrying = false,
  staleHint,
  style,
}: RetryErrorBlockProps) {
  const colors = getColors();

  return (
    <AppCard style={[styles.card, { borderColor: colors.error + "55", backgroundColor: colors.surface }, style]}>
      <View style={styles.row}>
        <Feather name="alert-circle" size={22} color={colors.error} style={{ marginRight: spacing.sm }} />
        <View style={{ flex: 1 }}>
          <AppText variant="bodyBold" color="primary" style={{ marginBottom: spacing.xs }}>
            {title}
          </AppText>
          <AppText variant="body" color="secondary" style={{ marginBottom: spacing.sm }}>
            {message}
          </AppText>
          {staleHint ? (
            <AppText variant="small" color="muted" style={{ marginBottom: spacing.sm }}>
              {staleHint}
            </AppText>
          ) : null}
          <PrimaryButton label="Try again" onPress={onRetry} loading={retrying} size="md" />
        </View>
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
});
