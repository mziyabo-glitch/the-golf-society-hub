/**
 * Section Header Component
 * Consistent section titles with optional right action
 */

import { StyleSheet, View, Pressable, ViewStyle } from "react-native";
import { AppText } from "./AppText";
import { spacing } from "@/lib/ui/theme";

type SectionHeaderProps = {
  title: string;
  rightAction?: {
    label: string;
    onPress: () => void;
  };
  style?: ViewStyle;
};

export function SectionHeader({ title, rightAction, style }: SectionHeaderProps) {
  return (
    <View style={[styles.container, style]}>
      <AppText variant="h2" style={styles.title}>
        {title}
      </AppText>
      {rightAction && (
        <Pressable onPress={rightAction.onPress} style={styles.action}>
          <AppText variant="body" color="primary">
            {rightAction.label}
          </AppText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
    marginTop: spacing.lg,
  },
  title: {
    flex: 1,
  },
  action: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
});














