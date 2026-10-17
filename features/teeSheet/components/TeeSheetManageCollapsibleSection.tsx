import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppText } from "@/components/ui/AppText";
import { getColors, spacing } from "@/lib/ui/theme";

type Props = {
  title: string;
  description?: string;
  defaultExpanded?: boolean;
  children: ReactNode;
};

export function TeeSheetManageCollapsibleSection({
  title,
  description,
  defaultExpanded = true,
  children,
}: Props) {
  const colors = getColors();
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        style={({ pressed }) => [styles.header, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
      >
        <View style={{ flex: 1 }}>
          <AppText variant="heading">{title}</AppText>
          {description ? (
            <AppText variant="small" color="muted" style={{ marginTop: 2 }}>
              {description}
            </AppText>
          ) : null}
        </View>
        <Feather
          name={expanded ? "chevron-up" : "chevron-down"}
          size={20}
          color={colors.textSecondary}
        />
      </Pressable>
      {expanded ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  body: {
    gap: 0,
  },
});
