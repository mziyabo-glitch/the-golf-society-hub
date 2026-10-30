/**
 * SegmentedTabs — equal width, never overlaps on small screens.
 * Short labels recommended for narrow devices (e.g. Leaders, Matrix, Honour).
 */

import { Platform, StyleSheet, View, Pressable, Text, type StyleProp, type ViewStyle } from "react-native";
import { ReactNode, useMemo } from "react";
import { getColors, spacing } from "@/lib/ui/theme";
import { interaction, webFocusRingStyle, webPointerStyle } from "@/lib/ui/interaction";
import { useScaledTypography } from "@/lib/ui/fontScaleContext";

export type SegmentedTabItem<T extends string> = {
  id: T;
  label: string;
  icon?: ReactNode;
};

type SegmentedTabsProps<T extends string> = {
  items: SegmentedTabItem<T>[];
  selectedId: T;
  onSelect: (id: T) => void;
  /** Merged with the outer container (e.g. to clear bottom margin when laid out in a row). */
  style?: StyleProp<ViewStyle>;
};

const CONTAINER_BG = "#EEF1F4";
const TAB_HEIGHT = 44;
const TAB_PADDING_H = 10;
const TAB_RADIUS = 14;
const CONTAINER_RADIUS = 16;

export function SegmentedTabs<T extends string>({
  items,
  selectedId,
  onSelect,
  style,
}: SegmentedTabsProps<T>) {
  const colors = getColors();
  const typo = useScaledTypography();

  const tabMetrics = useMemo(() => {
    const h = Math.max(40, typo.button.lineHeight + 16);
    return { height: h, minHeight: h, fontSize: typo.button.fontSize, lineHeight: typo.button.lineHeight };
  }, [typo]);

  return (
    <View style={[styles.container, style]}>
      {items.map((item) => {
        const isSelected = item.id === selectedId;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(item.id)}
            style={(state) => {
              const st = state as { pressed: boolean; hovered?: boolean };
              const { pressed, hovered } = st;
              const hoverBg =
                Platform.OS === "web" && hovered && !pressed && !isSelected
                  ? "rgba(255,255,255,0.45)"
                  : undefined;
              return [
                styles.tab,
                {
                  backgroundColor: isSelected ? colors.surface : hoverBg ?? "transparent",
                  opacity: pressed ? interaction.pressOpacity : 1,
                },
                isSelected && styles.tabSelected,
                webPointerStyle(),
                webFocusRingStyle(colors.primary),
              ];
            }}
          >
            {item.icon}
            <Text
              style={[
                styles.label,
                {
                  fontSize: tabMetrics.fontSize,
                  lineHeight: tabMetrics.lineHeight,
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
    borderWidth: 1,
    borderColor: "rgba(15, 23, 42, 0.06)",
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
    textAlign: "center",
  },
});
