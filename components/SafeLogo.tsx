import { useMemo, useState } from "react";
import {
  Image,
  StyleSheet,
  Text,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from "react-native";

type SafeLogoVariant = "icon" | "master" | "horizontal";

type SafeLogoProps = {
  variant?: SafeLogoVariant;
  width?: number;
  height?: number;
  style?: StyleProp<ImageStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  fallbackTitle?: string;
};

const APP_ICON_SOURCE = require("@/assets/images/app-icon.png");
const MASTER_LOGO_SOURCE = require("@/assets/images/master-logo.png");
const HORIZONTAL_LOGO_SOURCE = require("@/assets/images/horizontal-logo.png");

function getDefaultSize(variant: SafeLogoVariant): { width: number; height: number } {
  if (variant === "icon") return { width: 72, height: 72 };
  if (variant === "horizontal") return { width: 220, height: 72 };
  return { width: 280, height: 220 };
}

function getLogoSource(variant: SafeLogoVariant): number {
  switch (variant) {
    case "icon":
      return APP_ICON_SOURCE;
    case "horizontal":
      return HORIZONTAL_LOGO_SOURCE;
    case "master":
    default:
      return MASTER_LOGO_SOURCE;
  }
}

export function SafeLogo({
  variant = "master",
  width,
  height,
  style,
  containerStyle,
  fallbackTitle = "Golf Society Hub",
}: SafeLogoProps) {
  const [failed, setFailed] = useState(false);

  const dimensions = useMemo(() => {
    const defaults = getDefaultSize(variant);
    return {
      width: width ?? defaults.width,
      height: height ?? defaults.height,
    };
  }, [height, variant, width]);

  try {
    const source = getLogoSource(variant);

    if (failed) {
      return (
        <View
          style={[
            styles.fallbackContainer,
            dimensions,
            containerStyle,
          ]}
        >
          <Text style={styles.fallbackText}>{fallbackTitle}</Text>
        </View>
      );
    }

    return (
      <Image
        source={source}
        resizeMode="contain"
        style={[dimensions, style]}
        onError={(event) => {
          console.log("[SafeLogo] image onError:", event?.nativeEvent);
          setFailed(true);
        }}
      />
    );
  } catch (error: any) {
    console.error("[SafeLogo] render failed:", error);
    return (
      <View
        style={[
          styles.fallbackContainer,
          dimensions,
          containerStyle,
        ]}
      >
        <Text style={styles.fallbackText}>{fallbackTitle}</Text>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  fallbackContainer: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 8,
  },
  fallbackText: {
    textAlign: "center",
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "600",
  },
});

