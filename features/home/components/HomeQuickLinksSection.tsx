import { Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { getColors, radius, spacing } from "@/lib/ui/theme";

type LinkItem = {
  key: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
};

type Props = {
  links: LinkItem[];
};

export function HomeQuickLinksSection({ links }: Props) {
  const colors = getColors();
  if (links.length === 0) return null;

  return (
    <View>
      <AppText variant="captionBold" color="secondary" style={{ marginBottom: spacing.xs }}>
        Quick Links
      </AppText>
      <View style={styles.grid}>
        {links.map((link) => (
          <Pressable
            key={link.key}
            onPress={link.onPress}
            style={({ pressed }) => [{ opacity: pressed ? 0.72 : 1 }, styles.cell]}
          >
            <AppCard style={[styles.card, { borderColor: colors.borderLight, backgroundColor: colors.surface }]}>
              <Feather name={link.icon} size={16} color={colors.primary} />
              <AppText variant="small" numberOfLines={1} style={{ marginTop: 6 }}>
                {link.label}
              </AppText>
            </AppCard>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  cell: {
    width: "48%",
  },
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.sm + 2,
    minHeight: 60,
  },
});

