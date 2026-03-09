/**
 * SegmentedTabs — equal width, never overlaps on small screens.
 * Short labels recommended for narrow devices (e.g. Leaders, Matrix, Honour).
 */

import { StyleSheet, View, Pressable, Text } from "react-native";
import { ReactNode } from "react";
import { getColors, spacing, typography } from "@/lib/ui/theme";

export type SegmentedTabItem<T extends string> = {
  id: T;
  label: string;
  icon?: ReactNode;
};

type SegmentedTabsProps<T extends string> = {
  items: SegmentedTabItem<T>[];
  selectedId: T;
  onSelect: (id: T) => void;
};

const CONTAINER_BG = "#EEF1F4";
const TAB_HEIGHT = 40;
const TAB_PADDING_H = 10;
const TAB_RADIUS = 14;
const CONTAINER_RADIUS = 16;

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
                backgroundColor: isSelected ? colors.surface : "transparent",
                opacity: pressed ? 0.85 : 1,
              },
              isSelected && styles.tabSelected,
            ]}
          >
            {item.icon}
            <Text
              style={[
                styles.label,
                {
                  color: isSelected ? colors.text : colors.textSecondary,
                  fontWeight: isSelected ? "600" : "500",
                },
              ]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: CONTAINER_BG,
    borderRadius: CONTAINER_RADIUS,
    padding: 4,
    marginBottom: spacing.lg,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: TAB_PADDING_H,
    paddingVertical: 0,
    minHeight: TAB_HEIGHT,
    height: TAB_HEIGHT,
    borderRadius: TAB_RADIUS,
  },
  tabSelected: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  label: {
    fontSize: typography.button.fontSize,
    textAlign: "center",
  },
});
