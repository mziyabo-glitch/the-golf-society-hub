/**
 * SocietyLogoImage — society logo display component.
 *
 * The society logo is the identity of the society. It must be clearly visible,
 * legible at all sizes, and properly presented throughout the app.
 *
 * Size presets:
 *   - small: 40px — compact badges, inline headers
 *   - medium: 64px — cards, list headers, event headers
 *   - hero: 80px — home dashboard, prominent surfaces
 *
 * Or pass a numeric size for custom use.
 *
 * - Fixed-size container with refined neutral background
 * - Image scales to fit (contain) with generous padding for legibility
 * - Placeholder initials centred when no logo
 * - Premium treatment: subtle padding, clean background, optional soft border
 */

import { Image, StyleSheet, View } from "react-native";
import { AppText } from "./AppText";
import { getColors } from "@/lib/ui/theme";

export type LogoSizePreset = "small" | "medium" | "hero";

export const LOGO_SIZES: Record<LogoSizePreset, number> = {
  small: 40,
  medium: 64,
  hero: 80,
};

type SocietyLogoImageProps = {
  logoUrl: string | null;
  size?: LogoSizePreset | number;
  placeholderText?: string;
  style?: object;
  /** Premium treatment: subtle border and surface contrast for hero/header contexts */
  variant?: "default" | "hero";
};

// Image uses 92% of container for strong legibility; minimum 28px for tiny badges
const IMAGE_SCALE = 0.92;

function resolveSize(size: LogoSizePreset | number): number {
  if (typeof size === "number") return size;
  return LOGO_SIZES[size];
}

export function SocietyLogoImage({
  logoUrl,
  size = "medium",
  placeholderText = "GS",
  style,
  variant = "default",
}: SocietyLogoImageProps) {
  const colors = getColors();
  const resolvedSize = resolveSize(size);
  const imageSize = Math.max(28, Math.round(resolvedSize * IMAGE_SCALE));
  const borderRadius = resolvedSize >= 72 ? 18 : resolvedSize >= 56 ? 16 : 14;

  const isHero = variant === "hero" || resolvedSize >= 72;
  const borderColor = isHero ? (colors.border ?? "#E6E8EC") : undefined;
  const borderWidth = isHero ? 1 : 0;

  return (
    <View
      style={[
        styles.container,
        style,
        {
          width: resolvedSize,
          height: resolvedSize,
          borderRadius,
          backgroundColor: colors.backgroundSecondary ?? "#F7F8FA",
          borderColor,
          borderWidth,
        },
      ]}
    >
      {logoUrl ? (
        <Image
          source={{ uri: logoUrl }}
          style={[styles.image, { width: imageSize, height: imageSize }]}
          resizeMode="contain"
        />
      ) : (
        <AppText
          variant={resolvedSize >= 56 ? "h2" : "bodyBold"}
          color="primary"
          style={styles.placeholderText}
          numberOfLines={1}
        >
          {placeholderText}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexShrink: 0,
  },
  image: {
    alignSelf: "center",
  },
  placeholderText: {
    textAlign: "center",
  },
});
