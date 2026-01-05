/**
 * Premium Screen Wrapper
 * Provides safe area handling and consistent padding
 */

import { StyleSheet, View, ViewStyle } from "react-native";
import { ReactNode } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { getColors, spacing } from "@/lib/ui/theme";

type ScreenProps = {
  children: ReactNode;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  edges?: ("top" | "bottom" | "left" | "right")[];
  padding?: keyof typeof spacing;
};

export function Screen({
  children,
  style,
  contentStyle,
  edges = ["top", "bottom"],
  padding = "xl",
}: ScreenProps) {
  const colors = getColors();
  
  return (
    <SafeAreaView
      edges={edges}
      style={[styles.container, { backgroundColor: colors.background }, style]}
    >
      <View style={[styles.content, { padding: spacing[padding] }, contentStyle]}>
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
});

