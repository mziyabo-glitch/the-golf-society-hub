/**
 * Society Header Component
 * Displays society logo and name consistently across screens
 */

import { Image, StyleSheet, View, ViewStyle } from "react-native";
import { AppText } from "./AppText";
import { AppCard } from "./AppCard";
import { getColors, spacing } from "@/lib/ui/theme";

type SocietyHeaderProps = {
  societyName: string;
  logoUrl?: string | null;
  subtitle?: string;
  style?: ViewStyle;
};

export function SocietyHeader({ societyName, logoUrl, subtitle, style }: SocietyHeaderProps) {
  const colors = getColors();
  
  return (
    <AppCard style={style || styles.container}>
      <View style={styles.content}>
        {logoUrl ? (
          <Image
            source={{ uri: logoUrl }}
            style={styles.logo}
            resizeMode="contain"
          />
        ) : (
          <View style={[styles.placeholderLogo, { backgroundColor: colors.borderLight }]}>
            <AppText variant="caption" color="secondary" style={styles.placeholderText}>
              Logo
            </AppText>
          </View>
        )}
        <View style={styles.textContainer}>
          <AppText variant="h2" numberOfLines={1} ellipsizeMode="tail">
            {societyName}
          </AppText>
          {subtitle && (
            <AppText variant="small" color="secondary" numberOfLines={1} ellipsizeMode="tail">
              {subtitle}
            </AppText>
          )}
        </View>
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.base,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  logo: {
    width: 60,
    height: 60,
    borderRadius: spacing.xs,
  },
  placeholderLogo: {
    width: 60,
    height: 60,
    borderRadius: spacing.xs,
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderText: {
    fontSize: 10,
  },
  textContainer: {
    flex: 1,
    minWidth: 0,
  },
});

