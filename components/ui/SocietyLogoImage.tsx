/**
 * SocietyLogoImage — renders society logo without cropping.
 * Wraps in fixed-size container with light neutral background, borderRadius 14–16.
 * Image at 80–85% of container, resizeMode contain.
 */

import { Image, StyleSheet, View } from "react-native";
import { AppText } from "./AppText";
import { getColors } from "@/lib/ui/theme";

type SocietyLogoImageProps = {
  logoUrl: string | null;
  size?: number;
  placeholderText?: string;
  style?: object;
};

const IMAGE_SCALE = 0.85; // 85% of container

export function SocietyLogoImage({
  logoUrl,
  size = 48,
  placeholderText = "GS",
  style,
}: SocietyLogoImageProps) {
  const colors = getColors();
  const imageSize = Math.round(size * IMAGE_SCALE);

  return (
    <View
      style={[
        styles.container,
        style,
        {
          width: size,
          height: size,
          borderRadius: 14,
          backgroundColor: colors.backgroundSecondary ?? "#F3F4F6",
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
        <AppText variant="h2" color="primary">
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
  },
  image: {},
});
