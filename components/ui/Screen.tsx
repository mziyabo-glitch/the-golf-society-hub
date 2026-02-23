/**
 * Screen wrapper component
 * Provides safe area handling and consistent padding
 */

import { ReactNode, useContext } from "react";
import { ScrollView, StyleSheet, View, ViewStyle, StyleProp } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { getColors, spacing } from "@/lib/ui/theme";

type ScreenProps = {
  children: ReactNode;
  scrollable?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
};

export function Screen({ children, scrollable = true, style, contentStyle }: ScreenProps) {
  const colors = getColors();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const bottomContentPadding = tabBarHeight > 0 ? tabBarHeight + spacing.base : spacing.lg;
  const flattenedContentStyle = StyleSheet.flatten(contentStyle) || {};
  const explicitPaddingBottom =
    typeof flattenedContentStyle.paddingBottom === "number" ? flattenedContentStyle.paddingBottom : 0;
  const resolvedPaddingBottom = Math.max(bottomContentPadding, explicitPaddingBottom);

  const content = (
    <View
      style={[
        styles.content,
        { padding: spacing.lg },
        contentStyle,
        { paddingBottom: resolvedPaddingBottom },
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
