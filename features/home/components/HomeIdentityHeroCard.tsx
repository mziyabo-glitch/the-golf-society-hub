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
  const hi = handicapIndexDisplay != null ? handicapIndexDisplay : "—";

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
            size={76}
            variant="hero"
            placeholderText={initialsFromSociety(societyName)}
          />
        </View>
        <View style={styles.identityCol}>
          <AppText variant="heading" style={styles.name} numberOfLines={2}>
            {memberName}
          </AppText>
          <AppText variant="small" color="secondary" numberOfLines={2} style={styles.societyLine}>
            {societyName}
          </AppText>
          <View style={styles.roleWrap}>
            <StatusBadge label={roleLabel} tone="primary" />
          </View>
        </View>
      </View>

      <View style={styles.statGrid}>
        <Pressable
          onPress={onEditHandicap}
          accessibilityRole="button"
          accessibilityLabel="Edit handicap index"
          style={({ pressed }) => [
            styles.statTile,
            {
              borderColor: colors.borderLight,
              backgroundColor: colors.backgroundSecondary,
              opacity: pressed ? 0.92 : 1,
            },
          ]}
        >
          <View style={styles.statTileHeader}>
            <Feather name="activity" size={14} color={colors.primary} />
            <AppText variant="captionBold" color="secondary">
              Handicap Index
            </AppText>
          </View>
          <View style={styles.statTileValueRow}>
            <AppText variant="title" style={{ color: colors.text }}>
              {hi}
            </AppText>
            <Feather name="chevron-right" size={16} color={colors.textTertiary} />
          </View>
          <AppText variant="caption" color="muted" style={{ marginTop: 2 }}>
            Tap to update
          </AppText>
        </Pressable>

        <View
          style={[
            styles.statTile,
            { borderColor: colors.borderLight, backgroundColor: colors.backgroundSecondary },
          ]}
        >
          <View style={styles.statTileHeader}>
            <Feather name="award" size={14} color={colors.highlight} />
            <AppText variant="captionBold" color="secondary">
              Order of Merit
            </AppText>
          </View>
          {showUnrankedHint ? (
            <>
              <AppText variant="bodyBold" color="muted" style={{ marginTop: 2 }}>
                Not ranked yet
              </AppText>
              <AppText variant="caption" color="muted" style={{ marginTop: 4 }}>
                Play counting events to appear on the leaderboard.
              </AppText>
            </>
          ) : (
            <>
              <AppText variant="title" style={{ color: colors.text, marginTop: 2 }}>
                {ordinalLabel(oomRankMain)}
              </AppText>
              <AppText variant="captionBold" color="secondary" style={{ marginTop: 4 }}>
                {oomPointsMain} pts
              </AppText>
            </>
          )}
        </View>
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.base + 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.base,
  },
  logoShell: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.xs + 2,
  },
  identityCol: {
    flex: 1,
    minWidth: 0,
    paddingTop: 2,
  },
  name: {
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  societyLine: {
    marginTop: 4,
  },
  roleWrap: {
    marginTop: spacing.sm,
    alignSelf: "flex-start",
  },
  statGrid: {
    marginTop: spacing.base + 2,
    flexDirection: "row",
    gap: spacing.sm,
  },
  statTile: {
    flex: 1,
    minWidth: 0,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.sm + 2,
    minHeight: 112,
  },
  statTileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statTileValueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.xs,
  },
});
