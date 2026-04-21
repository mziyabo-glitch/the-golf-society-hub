/**
 * Mobile-first bottom tab bar: icons + labels, calm active state, 45+ friendly legibility.
 * Skips routes hidden by Expo (`tabBarItemStyle: { display: "none" }` when unlicensed / personal mode).
 */

import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { getColors } from "@/lib/ui/theme";
import { interaction } from "@/lib/ui/interaction";

function isTabHidden(descriptor: BottomTabBarProps["descriptors"][string]): boolean {
  const raw = descriptor.options.tabBarItemStyle;
  if (raw == null) return false;
  const flat = StyleSheet.flatten(raw);
  return flat.display === "none";
}

/** Expo Router extends options with `href`; null = routable but hidden from tab bar */
function isHiddenFromTabBar(descriptor: BottomTabBarProps["descriptors"][string]): boolean {
  const href = (descriptor.options as { href?: string | null }).href;
  return href === null;
}

export function PremiumTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const colors = getColors();
  const bottomPad = Math.max(insets.bottom, 14);
  const tabBarPadTop = 10;

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
          if (isTabHidden(descriptor) || isHiddenFromTabBar(descriptor)) return null;

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
          const isScorecard = route.name === "scorecard";

          const icon = options.tabBarIcon?.({
            focused,
            color: iconColor,
            size: isScorecard ? (focused ? 26 : 24) : 24,
          });

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={typeof options.tabBarAccessibilityLabel === "string" ? options.tabBarAccessibilityLabel : title}
              onPress={onPress}
              onLongPress={onLongPress}
              style={({ pressed }) => [styles.tab, { opacity: pressed ? interaction.pressOpacitySoft : 1 }]}
            >
              <View style={styles.iconStack}>
                {focused ? (
                  <View style={[styles.activeGlow, { backgroundColor: `${colors.primary}14` }]} />
                ) : null}
                <View style={styles.iconSlot}>{icon}</View>
              </View>
              <Text
                numberOfLines={2}
                allowFontScaling
                style={[
                  styles.label,
                  isScorecard ? styles.labelPrimary : null,
                  {
                    color: labelColor,
                    fontWeight: focused ? "600" : isScorecard ? "600" : "500",
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
    justifyContent: "space-evenly",
    paddingHorizontal: 10,
    gap: 6,
    minHeight: 58,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    minHeight: 54,
    paddingBottom: 4,
    paddingTop: 4,
    paddingHorizontal: 3,
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
  labelPrimary: {
    fontSize: 12,
    lineHeight: 14,
  },
  label: {
    fontSize: 11,
    lineHeight: 13,
    letterSpacing: 0.12,
    textAlign: "center",
    paddingHorizontal: 0,
    maxWidth: "100%",
    minHeight: 26,
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
