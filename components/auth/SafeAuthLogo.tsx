import { useState } from "react";
import {
  Image,
  type ImageSourcePropType,
  type ImageStyle,
  StyleSheet,
  View,
  type StyleProp,
} from "react-native";

import { AppText } from "@/components/ui/AppText";
import { getColors, radius } from "@/lib/ui/theme";

type SafeAuthLogoProps = {
  source: ImageSourcePropType;
  width: number;
  height: number;
  fallbackText?: string;
  style?: StyleProp<ImageStyle>;
};

export function SafeAuthLogo({
  source,
  width,
  height,
  fallbackText = "Golf Society Hub",
  style,
}: SafeAuthLogoProps) {
  const colors = getColors();
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <View
        style={[
          styles.fallback,
          {
            width,
            height,
            backgroundColor: colors.backgroundTertiary,
            borderColor: colors.border,
          },
        ]}
      >
        <AppText variant="captionBold" color="secondary" style={styles.fallbackText}>
          {fallbackText}
        </AppText>
      </View>
    );
  }

  return (
    <Image
      source={source}
      style={[{ width, height }, style]}
      resizeMode="contain"
      onError={(event) => {
        console.error("[SafeAuthLogo] failed to render logo:", event.nativeEvent?.error);
        setFailed(true);
      }}
    />
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: 12,
  },
  fallbackText: {
    textAlign: "center",
  },
});

