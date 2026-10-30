/**
 * Course contact shortcuts: call, website, directions, share playability update.
 */

import { Linking, Pressable, Share, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppText } from "@/components/ui/AppText";
import type { CourseContactBundle } from "@/lib/playability/courseContactLayer";
import {
  buildMapsUrl,
  buildPlayabilityShareLines,
  buildTelUrl,
} from "@/lib/playability/courseContactLayer";
import type { PlayabilityInsight } from "@/lib/playability/types";
import { getColors, spacing, radius } from "@/lib/ui/theme";

type ActionProps = {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  colors: ReturnType<typeof getColors>;
};

function ActionChip({ icon, label, onPress, disabled, colors }: ActionProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: colors.backgroundSecondary,
          borderColor: colors.border,
          opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
        },
      ]}
    >
      <Feather name={icon} size={16} color={colors.primary} />
      <AppText variant="captionBold" color="primary" numberOfLines={1} style={styles.chipLabel}>
        {label}
      </AppText>
    </Pressable>
  );
}

type Props = {
  contact: CourseContactBundle;
  insight: PlayabilityInsight | null;
  eventDate?: string | null;
  /** After user starts a call — prompt to log course status */
  onAfterCall?: () => void;
};

export function CourseActionRow({ contact, insight, eventDate, onAfterCall }: Props) {
  const colors = getColors();

  const tel = contact.phone ? buildTelUrl(contact.phone) : "";
  const canMaps = contact.lat != null && contact.lng != null;

  const openTel = async () => {
    if (!tel) return;
    try {
      await Linking.openURL(tel);
      onAfterCall?.();
    } catch {
      /* ignore */
    }
  };

  const openWeb = () => {
    const u = contact.websiteUrl?.trim();
    if (!u) return;
    Linking.openURL(u.startsWith("http") ? u : `https://${u}`).catch(() => {});
  };

  const openMaps = () => {
    if (!canMaps) return;
    Linking.openURL(buildMapsUrl(contact.lat!, contact.lng!)).catch(() => {});
  };

  const shareUpdate = async () => {
    const body = insight
      ? buildPlayabilityShareLines(
          contact.courseName,
          eventDate ?? undefined,
          insight.summary,
          insight.rating,
          insight.bestWindow,
          insight.bestWindowFallback,
        )
      : [
          `⛳ ${contact.courseName}`,
          eventDate ? `Round: ${eventDate}` : null,
          "Check conditions before you travel.",
          "",
          "Shared from The Golf Society Hub",
        ]
          .filter(Boolean)
          .join("\n");
    await Share.share({ message: body });
  };

  return (
    <View style={styles.wrap}>
      <AppText variant="captionBold" color="secondary" style={styles.sectionTitle}>
        Course
      </AppText>
      <View style={styles.row}>
        <ActionChip
          icon="phone"
          label="Call"
          onPress={openTel}
          disabled={!tel}
          colors={colors}
        />
        <ActionChip
          icon="globe"
          label="Website"
          onPress={openWeb}
          disabled={!contact.websiteUrl}
          colors={colors}
        />
        <ActionChip
          icon="navigation"
          label="Directions"
          onPress={openMaps}
          disabled={!canMaps}
          colors={colors}
        />
        <ActionChip icon="share-2" label="Share" onPress={shareUpdate} colors={colors} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    marginBottom: spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontSize: 11,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    minWidth: "22%",
    flexGrow: 1,
    justifyContent: "center",
  },
  chipLabel: {
    fontSize: 12,
  },
});
