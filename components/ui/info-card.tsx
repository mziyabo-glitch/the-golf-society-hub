import { Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";

type InfoCardProps = {
  title: string;
  subtitle?: string;
  detail?: string;
  ctaLabel?: string;
  onPress?: () => void;
  emptyState?: boolean;
  style?: ViewStyle;
};

export function InfoCard({
  title,
  subtitle,
  detail,
  ctaLabel,
  onPress,
  emptyState = false,
  style,
}: InfoCardProps) {
  return (
    <View style={[styles.card, style]}>
      {emptyState ? (
        <View style={styles.emptyContent}>
          <Text style={styles.emptyTitle}>{title}</Text>
          {subtitle && <Text style={styles.emptySubtitle}>{subtitle}</Text>}
        </View>
      ) : (
        <>
          <View style={styles.content}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {subtitle && (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            )}
            {detail && (
              <Text style={styles.detail} numberOfLines={1}>
                {detail}
              </Text>
            )}
          </View>
          {ctaLabel && onPress && (
            <Pressable onPress={onPress} style={styles.cta}>
              <Text style={styles.ctaText}>{ctaLabel}</Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 12,
  },
  content: {
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6b7280",
    marginBottom: 2,
  },
  detail: {
    fontSize: 13,
    color: "#9ca3af",
    marginTop: 4,
  },
  cta: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
  },
  ctaText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0B6E4F",
  },
  emptyContent: {
    alignItems: "center",
    paddingVertical: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#9ca3af",
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    color: "#d1d5db",
  },
});

