/**
 * SocietyPageHeader — Dedicated header with centered society logo at top.
 * Use on dashboard, event pages, leaderboard, etc.
 * Circular badge (72px), white background, subtle shadow.
 * Generous padding so logo does not appear cramped.
 */

import { StyleSheet, View, ViewStyle } from "react-native";
import { AppText } from "./AppText";
import { SocietyLogoBadge } from "./SocietyLogoBadge";
import { spacing } from "@/lib/ui/theme";

type SocietyPageHeaderProps = {
  logoUrl: string | null;
  societyName?: string;
  subtitle?: string;
  placeholderText?: string;
  style?: ViewStyle;
};

export function SocietyPageHeader({
  logoUrl,
  societyName,
  subtitle,
  placeholderText = "GS",
  style,
}: SocietyPageHeaderProps) {
  return (
    <View style={[styles.container, style]}>
      <SocietyLogoBadge
        logoUrl={logoUrl}
        placeholderText={placeholderText}
        size={72}
      />
      {societyName && (
        <AppText
          variant="h2"
          numberOfLines={1}
          ellipsizeMode="tail"
          style={styles.societyName}
        >
          {societyName}
        </AppText>
      )}
      {subtitle && (
        <AppText
          variant="small"
          color="secondary"
          numberOfLines={1}
          ellipsizeMode="tail"
          style={styles.subtitle}
        >
          {subtitle}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  societyName: {
    marginTop: spacing.sm,
    textAlign: "center",
  },
  subtitle: {
    marginTop: spacing.xs,
    textAlign: "center",
  },
});
