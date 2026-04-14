import { Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { SocietyLogoImage } from "@/components/ui/SocietyLogoImage";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getColors, radius, spacing } from "@/lib/ui/theme";

type Props = {
  logoUrl: string | null;
  societyName: string;
  memberName: string;
  roleLabel: string;
  handicapIndexDisplay: string | null;
  oomRankMain: string;
  oomPointsMain: string;
  showUnrankedHint: boolean;
  onEditHandicap: () => void;
};

function ordinalLabel(rawRank: string): string {
  const n = Number(rawRank);
  if (!Number.isFinite(n) || n <= 0) return "—";
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  if (n % 10 === 1) return `${n}st`;
  if (n % 10 === 2) return `${n}nd`;
  if (n % 10 === 3) return `${n}rd`;
  return `${n}th`;
}

function initialsFromSociety(name: string): string {
  const t = name?.trim();
  if (!t) return "GS";
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function HomeIdentityHeroCard({
  logoUrl,
  societyName,
  memberName,
  roleLabel,
  handicapIndexDisplay,
  oomRankMain,
  oomPointsMain,
  showUnrankedHint,
  onEditHandicap,
}: Props) {
  const colors = getColors();

  return (
    <AppCard
      style={[
        styles.card,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: `${colors.primary}28`,
        },
      ]}
    >
      <View style={styles.topRow}>
        <View style={[styles.logoShell, { borderColor: `${colors.primary}2E`, backgroundColor: `${colors.primary}0C` }]}>
          <SocietyLogoImage
            logoUrl={logoUrl}
            size={86}
            variant="hero"
            placeholderText={initialsFromSociety(societyName)}
          />
        </View>
        <View style={styles.identityCol}>
          <AppText variant="title" style={styles.name} numberOfLines={2}>
            {memberName}
          </AppText>
          <AppText variant="small" color="secondary" numberOfLines={2}>
            {societyName}
          </AppText>
          <View style={styles.roleWrap}>
            <StatusBadge label={roleLabel} tone="primary" />
          </View>
        </View>
      </View>

      <View style={[styles.metaRow, { borderTopColor: colors.borderLight }]}>
        <View style={styles.metaItem}>
          <AppText variant="caption" color="secondary">
            Handicap Index
          </AppText>
          <View style={styles.inlineRow}>
            <AppText variant="bodyBold">
              {handicapIndexDisplay != null ? handicapIndexDisplay : "—"}
            </AppText>
            <Pressable onPress={onEditHandicap} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}>
              <Feather name="edit-2" size={13} color={colors.textTertiary} />
            </Pressable>
          </View>
        </View>
        <View style={styles.metaItem}>
          <AppText variant="caption" color="secondary">
            OOM Rank
          </AppText>
          <AppText variant="bodyBold">
            {showUnrankedHint ? "Not ranked yet" : ordinalLabel(oomRankMain)}
          </AppText>
          <AppText variant="small" color="secondary">
            {oomPointsMain} pts
          </AppText>
        </View>
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.base + 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.base,
  },
  logoShell: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.xs,
  },
  identityCol: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontWeight: "800",
  },
  roleWrap: {
    marginTop: spacing.xs,
    alignSelf: "flex-start",
  },
  metaRow: {
    marginTop: spacing.base,
    paddingTop: spacing.base,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.base,
  },
  metaItem: {
    flex: 1,
    minWidth: 0,
  },
  inlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: 2,
  },
});

