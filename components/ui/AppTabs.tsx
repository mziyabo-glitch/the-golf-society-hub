/**
 * Premium Tab/Segmented Control Component
 * Prevents text wrapping and provides consistent tab navigation
 */

import { StyleSheet, View, Pressable } from "react-native";
import { ReactNode } from "react";
import { getColors, radius, spacing } from "@/lib/ui/theme";
import { AppText } from "./AppText";

export type TabItem<T extends string> = {
  id: T;
  label: string;
  icon?: ReactNode;
};

type AppTabsProps<T extends string> = {
  items: TabItem<T>[];
  selectedId: T;
  onSelect: (id: T) => void;
  fullWidth?: boolean;
};

export function AppTabs<T extends string>({
  items,
  selectedId,
  onSelect,
  fullWidth = false,
}: AppTabsProps<T>) {
  const colors = getColors();
  
  return (
    <View style={[styles.container, fullWidth && styles.fullWidth]}>
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
                flex: fullWidth ? 1 : undefined,
                paddingHorizontal: fullWidth ? spacing.sm : spacing.base,
              },
            ]}
          >
            <AppText
              variant="captionBold"
              color={isSelected ? "inverse" : "default"}
              numberOfLines={1}
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
  fullWidth: {
    width: "100%",
  },
  tab: {
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 36,
  },
  tabLabel: {
    textAlign: "center",
  },
});

