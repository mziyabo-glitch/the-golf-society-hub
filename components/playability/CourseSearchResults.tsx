import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppText } from "@/components/ui/AppText";
import { getColors, spacing, radius } from "@/lib/ui/theme";

export type CourseSearchListItem = {
  key: string;
  title: string;
  subtitle?: string | null;
  sourceLabel: string;
};

type Props = {
  items: CourseSearchListItem[];
  loading?: boolean;
  emptyMessage?: string;
  onSelect: (item: CourseSearchListItem) => void;
};

export function CourseSearchResults({
  items,
  loading,
  emptyMessage = "Type at least two characters to search your society courses, then the wider directory if needed.",
  onSelect,
}: Props) {
  const colors = getColors();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
        <AppText variant="small" color="secondary" style={{ marginTop: spacing.sm }}>
          Searching…
        </AppText>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.empty}>
        <Feather name="search" size={22} color={colors.textTertiary} />
        <AppText variant="small" color="tertiary" style={{ marginTop: spacing.sm, textAlign: "center" }}>
          {emptyMessage}
        </AppText>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {items.map((item) => (
        <Pressable
          key={item.key}
          onPress={() => onSelect(item)}
          style={({ pressed }) => [
            styles.row,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppText variant="body" numberOfLines={2}>
              {item.title}
            </AppText>
            {item.subtitle ? (
              <AppText variant="small" color="secondary" numberOfLines={2} style={{ marginTop: 2 }}>
                {item.subtitle}
              </AppText>
            ) : null}
            <AppText variant="small" color="tertiary" style={{ marginTop: 4 }}>
              {item.sourceLabel}
            </AppText>
          </View>
          <Feather name="chevron-right" size={20} color={colors.textTertiary} style={{ marginLeft: spacing.sm }} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  center: {
    alignItems: "center",
    paddingVertical: spacing.lg,
  },
  empty: {
    alignItems: "center",
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
});
