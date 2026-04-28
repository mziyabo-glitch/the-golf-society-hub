import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/AppText";
import { getColors, radius, spacing } from "@/lib/ui/theme";
import { freePlayPremium } from "@/lib/ui/freePlayPremiumTheme";

export type FreePlayPlayerScoreCardProps = {
  playerName: string;
  handicapLine?: string | null;
  grossDisplay: string;
  netLabel: string | null;
  /** Hole Stableford points, e.g. "2 pts" or "—" when unavailable */
  stablefordPointsDisplay: string | null;
  /** When true, Stableford points are not reliable (missing SI). */
  stablefordUnavailable: boolean;
  runningTotalLabel: string | null;
  showStableford: boolean;
  onDecrement: () => void;
  onIncrement: () => void;
  onPickup: () => void;
  onParShortcut: () => void;
  onBogeyShortcut: () => void;
  disabled?: boolean;
  /** Global save in flight — subtle dimming */
  saving?: boolean;
  onEditHandicap?: () => void;
  onRemovePlayer?: () => void;
};

export function FreePlayPlayerScoreCard({
  playerName,
  handicapLine,
  grossDisplay,
  netLabel,
  stablefordPointsDisplay,
  stablefordUnavailable,
  runningTotalLabel,
  showStableford,
  onDecrement,
  onIncrement,
  onPickup,
  onParShortcut,
  onBogeyShortcut,
  disabled,
  saving,
  onEditHandicap,
  onRemovePlayer,
}: FreePlayPlayerScoreCardProps) {
  const colors = getColors();
  const dim = disabled || saving;

  const sfPill =
    showStableford && (stablefordPointsDisplay != null || stablefordUnavailable)
      ? stablefordUnavailable
        ? "—"
        : stablefordPointsDisplay
      : null;

  return (
    <View
      style={[
        styles.card,
        {
          borderColor: colors.borderLight,
          backgroundColor: colors.surface,
          opacity: dim ? 0.55 : 1,
        },
        freePlayPremium.cardShadow,
      ]}
    >
      <AppText variant="bodyBold" numberOfLines={1}>
        {playerName}
      </AppText>
      {handicapLine ? (
        <AppText variant="caption" color="tertiary" style={{ marginTop: 4 }}>
          {handicapLine}
        </AppText>
      ) : null}
      {netLabel ? (
        <AppText variant="small" color="secondary" style={{ marginTop: 6 }}>
          {netLabel}
        </AppText>
      ) : null}

      <View style={styles.pillRow}>
        {showStableford && sfPill != null ? (
          <View style={[styles.pill, { borderColor: colors.primary + "44", backgroundColor: `${colors.primary}10` }]}>
            <AppText variant="captionBold" color="primary">
              {stablefordUnavailable ? "Pts —" : sfPill}
            </AppText>
          </View>
        ) : null}
        {runningTotalLabel ? (
          <View style={[styles.pill, { borderColor: colors.borderLight, backgroundColor: freePlayPremium.creamSurface }]}>
            <AppText variant="captionBold" color="secondary">
              {runningTotalLabel}
            </AppText>
          </View>
        ) : null}
      </View>

      <View style={styles.scoreRow}>
        <Pressable
          onPress={onDecrement}
          disabled={disabled}
          style={({ pressed }) => [
            styles.bigBtn,
            { borderColor: colors.primary, opacity: disabled ? 0.35 : pressed ? 0.85 : 1 },
          ]}
        >
          <AppText variant="h2" color="primary">
            −
          </AppText>
        </Pressable>
        <View style={styles.grossBox}>
          <AppText variant="h1" style={styles.grossNum}>
            {grossDisplay}
          </AppText>
          <AppText variant="caption" color="tertiary">
            Gross
          </AppText>
        </View>
        <Pressable
          onPress={onIncrement}
          disabled={disabled}
          style={({ pressed }) => [
            styles.bigBtn,
            { borderColor: colors.primary, opacity: disabled ? 0.35 : pressed ? 0.85 : 1 },
          ]}
        >
          <AppText variant="h2" color="primary">
            +
          </AppText>
        </Pressable>
      </View>
      <AppText variant="caption" color="tertiary" style={styles.adjustHint}>
        Tap +/- for quick adjust
      </AppText>

      <View style={styles.shortcuts}>
        <Pressable
          onPress={onParShortcut}
          disabled={disabled}
          style={({ pressed }) => [styles.shortBtn, { borderColor: colors.borderLight, opacity: disabled ? 0.35 : pressed ? 0.9 : 1 }]}
        >
          <AppText variant="captionBold" color="secondary">
            Par
          </AppText>
        </Pressable>
        <Pressable
          onPress={onBogeyShortcut}
          disabled={disabled}
          style={({ pressed }) => [styles.shortBtn, { borderColor: colors.borderLight, opacity: disabled ? 0.35 : pressed ? 0.9 : 1 }]}
        >
          <AppText variant="captionBold" color="secondary">
            Bogey
          </AppText>
        </Pressable>
        <Pressable
          onPress={onPickup}
          disabled={disabled}
          style={({ pressed }) => [styles.pickup, { borderColor: colors.warning + "66", opacity: disabled ? 0.35 : pressed ? 0.9 : 1 }]}
        >
          <AppText variant="captionBold" color="warning">
            Pick up / Blob
          </AppText>
        </Pressable>
      </View>
      {(onEditHandicap || onRemovePlayer) ? (
        <View style={styles.manageRow}>
          {onEditHandicap ? (
            <Pressable onPress={onEditHandicap} disabled={disabled} style={[styles.manageBtn, { borderColor: colors.borderLight }]}>
              <AppText variant="captionBold" color="secondary">
                Edit HI
              </AppText>
            </Pressable>
          ) : null}
          {onRemovePlayer ? (
            <Pressable onPress={onRemovePlayer} disabled={disabled} style={[styles.manageBtn, { borderColor: colors.warning + "66" }]}>
              <AppText variant="captionBold" color="warning">
                Remove player
              </AppText>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: freePlayPremium.cardRadius,
    padding: spacing.base,
    marginTop: spacing.md,
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  pill: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  bigBtn: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  grossBox: {
    minWidth: 72,
    alignItems: "center",
  },
  grossNum: {
    fontSize: 40,
    lineHeight: 44,
  },
  shortcuts: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md,
    justifyContent: "center",
  },
  adjustHint: {
    marginTop: spacing.xs,
    textAlign: "center",
  },
  shortBtn: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    minWidth: 88,
    alignItems: "center",
  },
  pickup: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    minWidth: 120,
    alignItems: "center",
  },
  manageRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  manageBtn: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
});
