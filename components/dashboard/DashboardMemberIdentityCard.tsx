/**
 * Top dashboard identity: society logo, member name, society, role, handicap + edit profile affordance.
 */

import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppText } from "@/components/ui/AppText";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SocietyLogoImage } from "@/components/ui/SocietyLogoImage";
import { getColors, spacing, premiumTokens, radius } from "@/lib/ui/theme";

const NARROW = 380;

function initialsFromSociety(name: string): string {
  const t = name?.trim();
  if (!t) return "GS";
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type Props = {
  logoUrl: string | null;
  societyName: string;
  memberName: string;
  roleLabel: string;
  /** e.g. "12.4" or null if unknown */
  handicapIndexDisplay: string | null;
  onEditHandicap: () => void;
};

export function DashboardMemberIdentityCard({
  logoUrl,
  societyName,
  memberName,
  roleLabel,
  handicapIndexDisplay,
  onEditHandicap,
}: Props) {
  const colors = getColors();
  const { width } = useWindowDimensions();
  const narrow = width < NARROW;
  const name = memberName?.trim() || "Member";
  const society = societyName?.trim() || "Society";
  const hiLabel = handicapIndexDisplay != null ? `HI ${handicapIndexDisplay}` : "HI —";

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: premiumTokens.cardBorder,
        },
        premiumTokens.cardShadow,
      ]}
    >
      <View style={[styles.topRow, narrow && styles.topRowStack]}>
        <View
          style={[
            styles.logoShell,
            {
              backgroundColor: `${colors.primary}0A`,
              borderColor: `${colors.primary}1F`,
            },
          ]}
        >
          <SocietyLogoImage
            logoUrl={logoUrl}
            size={96}
            variant="hero"
            placeholderText={initialsFromSociety(society)}
          />
        </View>
        <View style={[styles.textColumn, narrow && styles.textColumnFull]}>
          <AppText variant="display" style={[styles.memberName, { color: colors.text }]} numberOfLines={2}>
            {name}
          </AppText>
          <AppText variant="small" color="secondary" style={styles.societyLine} numberOfLines={2}>
            {society}
          </AppText>
        </View>
      </View>

      <View style={[styles.metaRow, narrow && styles.metaRowStack]}>
        <StatusBadge label={roleLabel} tone="primary" />

        <View style={[styles.hiChip, { backgroundColor: `${colors.primary}0C`, borderColor: `${colors.primary}22` }]}>
          <AppText variant="captionBold" style={[styles.hiChipText, { color: colors.text }]} numberOfLines={1}>
            {hiLabel}
          </AppText>
        </View>

        <Pressable
          onPress={onEditHandicap}
          accessibilityRole="button"
          accessibilityLabel="Edit handicap in profile"
          hitSlop={10}
          style={({ pressed }) => [
            styles.editLink,
            narrow && styles.editLinkStacked,
            { opacity: pressed ? 0.65 : 1 },
          ]}
        >
          <Feather name="edit-2" size={13} color={colors.textTertiary} />
          <AppText variant="small" style={{ color: colors.textTertiary, fontWeight: "600" }}>
            Edit
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.md,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  topRowStack: {
    flexDirection: "column",
    alignItems: "flex-start",
  },
  logoShell: {
    padding: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  textColumn: {
    flex: 1,
    minWidth: 0,
    paddingTop: 2,
    justifyContent: "center",
  },
  textColumnFull: {
    width: "100%",
  },
  memberName: {
    letterSpacing: -0.4,
    fontWeight: "800",
  },
  societyLine: {
    marginTop: spacing.xs,
    opacity: 0.92,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  metaRowStack: {
    alignItems: "flex-start",
  },
  hiChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  hiChipText: {
    fontVariant: ["tabular-nums"],
  },
  editLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginLeft: "auto",
    paddingVertical: 4,
    paddingHorizontal: spacing.xs,
  },
  editLinkStacked: {
    marginLeft: 0,
    alignSelf: "flex-end",
  },
});
