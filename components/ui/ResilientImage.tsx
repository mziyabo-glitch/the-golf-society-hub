/**
 * Resilient Image - never blank, shows placeholder on load error
 */

import { useState } from "react";
import { Image, View, StyleSheet, ImageStyle } from "react-native";
import { Feather } from "@expo/vector-icons";
import { getColors } from "@/lib/ui/theme";

type ResilientImageProps = {
  uri: string | null | undefined;
  style?: ImageStyle;
  placeholderSize?: number;
  aspectRatio?: number;
};

export function ResilientImage({
  uri,
  style,
  placeholderSize = 80,
  aspectRatio = 1,
}: ResilientImageProps) {
  const [error, setError] = useState(false);
  const colors = getColors();

  if (!uri || uri.trim() === "" || error) {
    return (
      <View
        style={[
          styles.placeholder,
          {
            width: placeholderSize,
            height: placeholderSize / aspectRatio,
            backgroundColor: colors.backgroundTertiary,
          },
          style,
        ]}
      >
        <Feather name="image" size={placeholderSize * 0.4} color={colors.textTertiary} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={style}
      resizeMode="cover"
      onError={() => setError(true)}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
});
