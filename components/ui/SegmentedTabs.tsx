/**
 * SegmentedTabs — equal width, premium selected state (light tint + semibold), height ~36
 */

import { StyleSheet, View, Pressable } from "react-native";
import { ReactNode } from "react";
import { AppText } from "./AppText";
import { getColors, radius, spacing } from "@/lib/ui/theme";

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

export function SegmentedTabs<T extends string>({
  items,
  selectedId,
  onSelect,
}: SegmentedTabsProps<T>) {
  const colors = getColors();

  return (
    <View style={[styles.container, { backgroundColor: colors.backgroundTertiary }]}>
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
            <AppText
              variant="captionBold"
              style={[
                styles.label,
                { color: isSelected ? colors.text : colors.textSecondary },
              ]}
              numberOfLines={1}
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
    borderRadius: radius.md,
    padding: 4,
    marginBottom: spacing.lg,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    minHeight: 36,
  },
  tabSelected: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  label: {
    textAlign: "center",
  },
});
