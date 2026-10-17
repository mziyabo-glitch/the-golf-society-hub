/**
 * StatCard — number + label + icon (compact)
 */

import { StyleSheet, View, Pressable, type PressableStateCallbackType } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppText, type TextColorRole } from "./AppText";
import { Card } from "./Card";
import { getColors, spacing, iconSize } from "@/lib/ui/theme";

type StatCardProps = {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  /** Emphasise the value (e.g. positive/negative balance). */
  valueColor?: TextColorRole;
  detail?: string;
  onPress?: () => void;
};

export function StatCard({ icon, label, value, valueColor = "default", detail, onPress }: StatCardProps) {
  const colors = getColors();
  const pressStyle = ({ pressed }: PressableStateCallbackType) => [
    styles.pressable,
    onPress && pressed && { opacity: 0.9 },
  ];

  const content = (
    <Card variant="elevated" style={styles.card} padding={spacing.md}>
      <View style={[styles.iconCircle, { backgroundColor: colors.primary + "14" }]}>
        <Feather name={icon} size={iconSize.sm} color={colors.primary} />
      </View>
      <AppText variant="small" color="secondary" numberOfLines={1}>
        {label}
      </AppText>
      <AppText variant="heading" color={valueColor} style={styles.value}>
        {value}
      </AppText>
      {detail && (
        <AppText variant="small" color="muted" numberOfLines={1}>
          {detail}
        </AppText>
      )}
    </Card>
  );

  if (onPress) {
    return <Pressable onPress={onPress} style={pressStyle}>{content}</Pressable>;
  }
  return content;
}

const styles = StyleSheet.create({
  pressable: {
    flex: 1,
  },
  card: {
    marginBottom: 0,
    minHeight: 88,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  value: {
    marginTop: 2,
  },
});
