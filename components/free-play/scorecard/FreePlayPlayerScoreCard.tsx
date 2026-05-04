import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, TextInput, View } from "react-native";

import { AppText } from "@/components/ui/AppText";
import { getColors, radius, spacing } from "@/lib/ui/theme";

export type FreePlayPlayerScoreCardProps = {
  playerName: string;
  playingHandicapLabel?: string | null;
  grossValue: number | null;
  grossDisplay: string;
  par: number;
  onCycleScore: () => void;
  onDecrement: () => void;
  onIncrement: () => void;
  onCommitTypedGross: (gross: number | null) => void;
  showFineAdjust?: boolean;
  disabled?: boolean;
};

export function FreePlayPlayerScoreCard({
  playerName,
  playingHandicapLabel,
  grossValue,
  grossDisplay,
  par,
  onCycleScore,
  onDecrement,
  onIncrement,
  onCommitTypedGross,
  showFineAdjust,
  disabled,
}: FreePlayPlayerScoreCardProps) {
  const colors = getColors();
  const dim = disabled;
  const [typing, setTyping] = useState(false);
  const [typedValue, setTypedValue] = useState("");
  const scoreScale = useRef(new Animated.Value(1)).current;
  const previousGrossDisplayRef = useRef(grossDisplay);
  const typedError = useMemo(() => {
    const raw = typedValue.trim();
    if (raw === "") return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1 || n > 30) return "Use 1-30 or leave blank for pickup.";
    return null;
  }, [typedValue]);

  useEffect(() => {
    if (previousGrossDisplayRef.current === grossDisplay) return;
    previousGrossDisplayRef.current = grossDisplay;
    Animated.sequence([
      Animated.timing(scoreScale, {
        toValue: 1.1,
        duration: 60,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(scoreScale, {
        toValue: 1,
        duration: 60,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [grossDisplay, scoreScale]);

  const commitTyped = () => {
    const raw = typedValue.trim();
    if (raw === "") {
      onCommitTypedGross(null);
      setTyping(false);
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1 || n > 30) return;
    onCommitTypedGross(Math.round(n));
    setTyping(false);
  };

  return (
    <View
      style={[
        styles.card,
        {
          borderColor: colors.borderLight,
          backgroundColor: colors.surface,
          opacity: dim ? 0.55 : 1,
        },
      ]}
    >
      <View style={styles.row}>
        <View style={styles.nameWrap}>
          <AppText variant="bodyBold" numberOfLines={1}>
            {playerName}
          </AppText>
          {playingHandicapLabel ? (
            <AppText variant="caption" color="tertiary" numberOfLines={1} style={{ marginTop: 2 }}>
              {playingHandicapLabel}
            </AppText>
          ) : null}
        </View>
        <Pressable
          onPress={() => {
            if (typing || dim) return;
            onCycleScore();
          }}
          onLongPress={() => {
            if (dim) return;
            setTypedValue(grossValue == null || !Number.isFinite(grossValue) ? "" : String(Math.round(grossValue)));
            setTyping(true);
          }}
          delayLongPress={300}
          disabled={dim}
          accessibilityRole="button"
          accessibilityLabel="Score cell. Tap to cycle, long press to type."
          style={({ pressed }) => [
            styles.scoreCell,
            {
              borderColor: colors.borderLight,
              backgroundColor: colors.background,
              opacity: dim ? 0.55 : pressed ? 0.9 : 1,
            },
          ]}
        >
          {typing ? (
            <View style={styles.typeWrap}>
              <TextInput
                value={typedValue}
                onChangeText={setTypedValue}
                keyboardType="number-pad"
                autoFocus
                maxLength={2}
                onSubmitEditing={commitTyped}
                onBlur={commitTyped}
                style={[styles.typeInput, { borderColor: typedError ? colors.warning : colors.borderLight, color: colors.text }]}
                placeholder="-"
                placeholderTextColor={colors.textTertiary}
              />
            </View>
          ) : (
            <Animated.View style={{ transform: [{ scale: scoreScale }] }}>
              <AppText variant="h1" style={styles.scoreText}>
                {grossDisplay}
              </AppText>
            </Animated.View>
          )}
        </Pressable>
      </View>
      {showFineAdjust && grossValue != null && Number.isFinite(grossValue) ? (
        <View style={styles.adjustRow}>
          <Pressable
            onPress={onDecrement}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel="Decrease gross strokes"
            hitSlop={8}
            style={({ pressed }) => [
              styles.tinyBtn,
              { borderColor: colors.borderLight, opacity: disabled ? 0.45 : pressed ? 0.84 : 1 },
            ]}
          >
            <AppText variant="captionBold" color="secondary">
              −
            </AppText>
          </Pressable>
          <AppText variant="caption" color="tertiary">
            Par {par}
          </AppText>
          <Pressable
            onPress={onIncrement}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel="Increase gross strokes"
            hitSlop={8}
            style={({ pressed }) => [
              styles.tinyBtn,
              { borderColor: colors.borderLight, opacity: disabled ? 0.45 : pressed ? 0.84 : 1 },
            ]}
          >
            <AppText variant="captionBold" color="secondary">
              +
            </AppText>
          </Pressable>
        </View>
      ) : null}
      {typedError ? (
        <AppText variant="caption" color="warning" style={styles.errorText}>
          {typedError}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  nameWrap: {
    flex: 1,
    minWidth: 0,
  },
  scoreCell: {
    minWidth: 72,
    height: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreText: {
    fontSize: 34,
    lineHeight: 36,
  },
  adjustRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  tinyBtn: {
    borderWidth: 1,
    borderRadius: radius.md,
    minWidth: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  typeWrap: {
    width: 60,
    alignItems: "center",
  },
  typeInput: {
    width: 60,
    height: 40,
    borderWidth: 1,
    borderRadius: radius.md,
    textAlign: "center",
    fontSize: 22,
    fontWeight: "700",
  },
  errorText: {
    marginTop: spacing.xs,
  },
});
