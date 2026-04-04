/**
 * LinkRowCard — icon, title, subtitle, chevron (compact row)
 */

import { Platform, StyleSheet, View, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppText } from "./AppText";
import { Card } from "./Card";
import { getColors, spacing } from "@/lib/ui/theme";
import { pressableSurfaceStyle, webFocusRingStyle, webHoverSurfaceStyle, webPointerStyle } from "@/lib/ui/interaction";
import { useReducedMotion } from "@/hooks/useReducedMotion";

type LinkRowCardProps = {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle?: string;
  onPress: () => void;
};

export function LinkRowCard({ icon, title, subtitle, onPress }: LinkRowCardProps) {
  const colors = getColors();
  const reduceMotion = useReducedMotion();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={(state) => {
        const st = state as { pressed: boolean; hovered?: boolean };
        const { pressed, hovered } = st;
        return [
          styles.pressable,
          pressableSurfaceStyle({ pressed }, { reduceMotion, scale: "card" }),
          Platform.OS === "web" && hovered && !pressed
            ? webHoverSurfaceStyle(hovered, pressed, colors.backgroundSecondary)
            : null,
          webPointerStyle(),
          webFocusRingStyle(colors.primary),
        ];
      }}
    >
      <Card variant="elevated" style={[styles.card, styles.row]} padding={spacing.md}>
        <View style={[styles.iconCircle, { backgroundColor: colors.primary + "12" }]}>
          <Feather name={icon} size={18} color={colors.primary} />
        </View>
        <View style={styles.textWrap}>
          <AppText variant="bodyBold">{title}</AppText>
          {subtitle && (
            <AppText variant="small" color="secondary">
              {subtitle}
            </AppText>
          )}
        </View>
        <Feather name="chevron-right" size={18} color={colors.textSecondary} />
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    marginBottom: 0,
  },
  card: {
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  textWrap: {
    flex: 1,
    marginLeft: spacing.sm,
  },
});
