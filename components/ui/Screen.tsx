/**
 * Screen wrapper component
 * Provides safe area handling and consistent padding
 */

import { ReactNode } from "react";
import { ScrollView, StyleSheet, View, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getColors, spacing } from "@/lib/ui/theme";

type ScreenProps = {
  children: ReactNode;
  scrollable?: boolean;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
};

export function Screen({ children, scrollable = true, style, contentStyle }: ScreenProps) {
  const colors = getColors();

  const content = (
    <View style={[styles.content, { padding: spacing.lg }, contentStyle]}>
      {children}
    </View>
  );

  if (scrollable) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }, style]} edges={["top"]}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {content}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }, style]} edges={["top"]}>
      {content}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
  },
});
