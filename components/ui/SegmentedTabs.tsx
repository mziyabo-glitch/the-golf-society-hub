/**
 * SegmentedTabs - Prevents text wrapping in navigation tabs
 * Uses equal-width tabs with numberOfLines={1} and ellipsizeMode
 */

import { StyleSheet, View, Pressable } from "react-native";
import { getColors, radius, spacing } from "@/lib/ui/theme";
import { AppText } from "./AppText";

export type SegmentedTabItem<T extends string> = {
  id: T;
  label: string;
};

type SegmentedTabsProps<T extends string> = {
  items: SegmentedTabItem<T>[];
  selectedId: T;
  onSelect: (id: T) => void;
};

export function SegmentedTabs<T extends string>({
  items,
  selectedId,
  onSelect,
}: SegmentedTabsProps<T>) {
  const colors = getColors();
  
  return (
    <View style={styles.container}>
      {items.map((item) => {
        const isSelected = item.id === selectedId;
        return (
          <Pressable
            key={item.id}
            onPress={() => onSelect(item.id)}
            style={({ pressed }) => [
              styles.tab,
              {
                backgroundColor: isSelected ? colors.primary : colors.surface,
                borderColor: colors.border,
                opacity: pressed ? 0.8 : 1,
                flex: 1, // Equal width tabs
              },
            ]}
          >
            <AppText
              variant="captionBold"
              color={isSelected ? "inverse" : "default"}
              numberOfLines={1}
              ellipsizeMode="tail"
              style={styles.tabLabel}
            >
              {item.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    gap: spacing.xs,
    marginBottom: spacing.base,
  },
  tab: {
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
  },
  tabLabel: {
    textAlign: "center",
    width: "100%",
  },
});

