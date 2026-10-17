import { StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { PrimaryButton } from "@/components/ui/Button";
import { AppText } from "@/components/ui/AppText";
import { freePlayPremium } from "@/lib/ui/freePlayPremiumTheme";
import { getColors, radius, spacing } from "@/lib/ui/theme";

export type FreePlayShareResultTopRow = {
  position: number;
  playerName: string;
  valueLabel: string;
};

export type FreePlayShareResultCardProps = {
  courseName: string;
  teeName: string;
  dateLabel: string;
  formatLabel: string;
  winnerLine: string;
  topRows: FreePlayShareResultTopRow[];
  onPressShare: () => void;
  shareReady?: boolean;
};

export function FreePlayShareResultCard({
  courseName,
  teeName,
  dateLabel,
  formatLabel,
  winnerLine,
  topRows,
  onPressShare,
  shareReady,
}: FreePlayShareResultCardProps) {
  const colors = getColors();
  const title = shareReady ? "Share result" : "Share result coming soon";

  return (
    <View
      style={[
        styles.card,
        { borderColor: freePlayPremium.accentNavy + "44", backgroundColor: freePlayPremium.accentNavy },
        freePlayPremium.heroShadow,
      ]}
    >
      <AppText variant="captionBold" style={styles.brand}>
        THE GOLF SOCIETY HUB
      </AppText>
      <AppText variant="h2" style={styles.light}>
        Free-Play Result
      </AppText>
      <AppText variant="small" style={[styles.lightMuted, { marginTop: spacing.xs }]}>
        {courseName} · {teeName}
      </AppText>
      <AppText variant="caption" style={[styles.lightMuted, { marginTop: 2 }]}>
        {dateLabel} · {formatLabel}
      </AppText>

      <View style={[styles.panel, { borderColor: "#ffffff2e", marginTop: spacing.md }]}>
        <AppText variant="captionBold" style={styles.lightMuted}>
          Winner
        </AppText>
        <AppText variant="bodyBold" style={[styles.light, { marginTop: 4 }]}>
          {winnerLine}
        </AppText>
      </View>

      <View style={[styles.panel, { borderColor: "#ffffff2e", marginTop: spacing.sm }]}>
        <AppText variant="captionBold" style={styles.lightMuted}>
          Top 3
        </AppText>
        {topRows.map((row) => (
          <View key={`${row.position}-${row.playerName}`} style={styles.topRow}>
            <AppText variant="captionBold" style={[styles.lightMuted, styles.rank]}>
              {row.position}
            </AppText>
            <AppText variant="bodyBold" style={[styles.light, styles.name]} numberOfLines={1}>
              {row.playerName}
            </AppText>
            <AppText variant="captionBold" style={styles.light}>
              {row.valueLabel}
            </AppText>
          </View>
        ))}
      </View>

      <AppText variant="caption" style={[styles.lightMuted, { marginTop: spacing.md }]}>
        Produced by The Golf Society Hub
      </AppText>
      <PrimaryButton
        label={title}
        onPress={onPressShare}
        style={{ marginTop: spacing.sm }}
        icon={<Feather name="share-2" size={14} color={colors.surface} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.lg,
    borderWidth: 1,
    borderRadius: freePlayPremium.heroRadius,
    padding: spacing.base,
  },
  brand: {
    color: "#a5f3cf",
    letterSpacing: 1.1,
  },
  light: {
    color: "#f8fafc",
  },
  lightMuted: {
    color: "#dbe7f5",
  },
  panel: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  rank: {
    width: 18,
  },
  name: {
    flex: 1,
    minWidth: 0,
  },
});
