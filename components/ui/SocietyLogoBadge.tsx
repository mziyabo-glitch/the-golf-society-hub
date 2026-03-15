/**
 * SocietyLogoBadge — Circular badge style for society logo.
 * 72px size, white background, subtle shadow.
 * Use at top of pages for prominent society identity.
 */

import { Image, StyleSheet, View } from "react-native";
import { AppText } from "./AppText";
import { getColors } from "@/lib/ui/theme";

const BADGE_SIZE = 72;

type SocietyLogoBadgeProps = {
  logoUrl: string | null;
  placeholderText?: string;
  size?: number;
  style?: object;
};

export function SocietyLogoBadge({
  logoUrl,
  placeholderText = "GS",
  size = BADGE_SIZE,
  style,
}: SocietyLogoBadgeProps) {
  const colors = getColors();
  const imageSize = Math.round(size * 0.8); // 80% of container for padding

  return (
    <View
      style={[
        styles.badge,
        {
          width: size,
          height: size,
          backgroundColor: "#FFFFFF",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.08,
          shadowRadius: 8,
          elevation: 4,
        },
        style,
      ]}
    >
      {logoUrl ? (
        <Image
          source={{ uri: logoUrl }}
          style={[styles.image, { width: imageSize, height: imageSize }]}
          resizeMode="contain"
        />
      ) : (
        <AppText variant="h2" color="primary">
          {placeholderText}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  image: {},
});
