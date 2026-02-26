/**
 * LinkRowCard — icon, title, subtitle, chevron (compact row)
 */

import { StyleSheet, View, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppText } from "./AppText";
import { Card } from "./Card";
import { getColors, spacing } from "@/lib/ui/theme";

type LinkRowCardProps = {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle?: string;
  onPress: () => void;
};

export function LinkRowCard({ icon, title, subtitle, onPress }: LinkRowCardProps) {
  const colors = getColors();

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.pressable, pressed && { opacity: 0.9 }]}>
      <Card style={[styles.card, styles.row]} padding={spacing.md}>
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
