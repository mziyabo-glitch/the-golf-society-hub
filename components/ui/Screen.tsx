/**
 * Screen wrapper component
 * Provides safe area handling and consistent padding
 */

import { ReactNode, useContext } from "react";
import { ScrollView, StyleSheet, View, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { getColors, spacing } from "@/lib/ui/theme";

type ScreenProps = {
  children: ReactNode;
  scrollable?: boolean;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
};

export function Screen({ children, scrollable = true, style, contentStyle }: ScreenProps) {
  const colors = getColors();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const bottomContentPadding = tabBarHeight > 0 ? tabBarHeight + spacing.base : spacing.lg;

  const content = (
    <View
      style={[
        styles.content,
        { padding: spacing.lg },
        contentStyle,
        { paddingBottom: bottomContentPadding },
      ]}
    >
      {children}
    </View>
  );

  if (scrollable) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }, style]}
        edges={["top", "bottom"]}
      >
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
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }, style]}
      edges={["top", "bottom"]}
    >
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
