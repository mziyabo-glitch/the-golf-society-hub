/**
 * Society Logo Component
 * Displays society logo with fallback
 */

import { Image, StyleSheet, View } from "react-native";
import { spacing } from "@/lib/ui/theme";

type SocietyLogoProps = {
  logoUrl?: string | null;
  size?: number;
  style?: any;
};

export function SocietyLogo({ logoUrl, size = 40, style }: SocietyLogoProps) {
  if (!logoUrl) {
    return null; // No logo, return nothing (or could show placeholder)
  }

  return (
    <View style={[styles.container, { width: size, height: size }, style]}>
      <Image
        source={{ uri: logoUrl }}
        style={[styles.logo, { width: size, height: size }]}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: spacing.xs,
    overflow: "hidden",
  },
  logo: {
    borderRadius: spacing.xs,
  },
});





