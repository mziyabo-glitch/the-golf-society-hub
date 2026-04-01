/**
 * Mobile-first bottom tab bar: icons + labels, calm active state, 45+ friendly legibility.
 * Skips routes hidden by Expo (`tabBarItemStyle: { display: "none" }` when unlicensed / personal mode).
 */

import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { getColors } from "@/lib/ui/theme";

function isTabHidden(descriptor: BottomTabBarProps["descriptors"][string]): boolean {
  const raw = descriptor.options.tabBarItemStyle;
  if (raw == null) return false;
  const flat = StyleSheet.flatten(raw);
  return flat.display === "none";
}

export function PremiumTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const colors = getColors();
  const bottomPad = Math.max(insets.bottom, 14);
  const tabBarPadTop = 12;

  return (
    <View
      style={[
        styles.shell,
        {
          backgroundColor: colors.surfaceElevated,
          borderTopColor: colors.borderLight,
          paddingBottom: bottomPad,
          paddingTop: tabBarPadTop,
        },
        Platform.select({
          ios: {
            shadowColor: "#15251A",
            shadowOffset: { width: 0, height: -3 },
            shadowOpacity: 0.07,
            shadowRadius: 10,
          },
          android: { elevation: 10 },
          default: {},
        }),
      ]}
    >
      <View style={styles.row}>
        {state.routes.map((route) => {
          const descriptor = descriptors[route.key];
          if (isTabHidden(descriptor)) return null;

          const focused = state.routes[state.index]?.key === route.key;
          const { options } = descriptor;
          const title = typeof options.title === "string" ? options.title : route.name;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: "tabLongPress",
              target: route.key,
            });
          };

          const iconColor = focused ? colors.primary : colors.textSecondary;
          const labelColor = focused ? colors.primary : colors.textSecondary;

          const icon = options.tabBarIcon?.({
            focused,
            color: iconColor,
            size: 24,
          });

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={typeof options.tabBarAccessibilityLabel === "string" ? options.tabBarAccessibilityLabel : title}
              onPress={onPress}
              onLongPress={onLongPress}
              style={({ pressed }) => [styles.tab, { opacity: pressed ? 0.88 : 1 }]}
            >
              <View style={styles.iconStack}>
                {focused ? (
                  <View style={[styles.activeGlow, { backgroundColor: `${colors.primary}14` }]} />
                ) : null}
                <View style={styles.iconSlot}>{icon}</View>
              </View>
              <Text
                numberOfLines={1}
                allowFontScaling
                style={[
                  styles.label,
                  {
                    color: labelColor,
                    fontWeight: focused ? "600" : "500",
                  },
                ]}
              >
                {title}
              </Text>
              {focused ? <View style={[styles.activeBar, { backgroundColor: colors.primary }]} /> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    minHeight: 54,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    minHeight: 52,
    paddingBottom: 2,
    paddingTop: 4,
  },
  iconStack: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  activeGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 23,
  },
  iconSlot: {
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 12,
    lineHeight: 15,
    letterSpacing: 0.15,
    textAlign: "center",
    paddingHorizontal: 2,
    maxWidth: "100%",
  },
  /** Restrained 18px accent — visible but not loud */
  activeBar: {
    position: "absolute",
    top: 0,
    width: 18,
    height: 3,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
    opacity: 0.85,
  },
});
