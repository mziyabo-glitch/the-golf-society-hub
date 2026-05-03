import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, TextInput, View } from "react-native";

import { AppText } from "@/components/ui/AppText";
import { getColors, radius, spacing } from "@/lib/ui/theme";
import { freePlayPremium } from "@/lib/ui/freePlayPremiumTheme";

export type FreePlayPlayerScoreCardProps = {
  playerName: string;
  playingHandicapLabel?: string | null;
  courseHandicapLabel?: string | null;
  currentTotalLabel?: string | null;
  relativeToParLabel?: string | null;
  grossDisplay: string;
  isConfirmedScore: boolean;
  defaultHint?: string | null;
  onDecrement: () => void;
  onIncrement: () => void;
  onCommitTypedGross: (gross: number | null) => void;
  disabled?: boolean;
  saving?: boolean;
  saveHint?: string | null;
};

export function FreePlayPlayerScoreCard({
  playerName,
  playingHandicapLabel,
  courseHandicapLabel,
  currentTotalLabel,
  relativeToParLabel,
  grossDisplay,
  isConfirmedScore,
  defaultHint,
  onDecrement,
  onIncrement,
  onCommitTypedGross,
  disabled,
  saving,
  saveHint,
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
        freePlayPremium.cardShadow,
      ]}
    >
      <AppText variant="bodyBold" numberOfLines={1}>
        {playerName}
      </AppText>
      {playingHandicapLabel ? (
        <AppText variant="caption" color="tertiary" style={{ marginTop: 4 }}>
          {playingHandicapLabel}
          {courseHandicapLabel ? ` · ${courseHandicapLabel}` : ""}
        </AppText>
      ) : null}
      <View style={styles.metaRow}>
        <AppText variant="captionBold" color="secondary">
          {currentTotalLabel ?? "Total —"}
        </AppText>
        <AppText variant="bodyBold" color="primary">
          {relativeToParLabel ?? "—"}
        </AppText>
        <AppText
          variant="captionBold"
          color={
            saveHint?.toLowerCase().includes("fail")
              ? "warning"
              : saveHint?.toLowerCase().includes("saving")
                ? "secondary"
                : "primary"
          }
        >
          {saveHint ?? (saving ? "Saving..." : "Saved")}
        </AppText>
      </View>

      <View style={styles.scoreRow}>
        <Pressable
          onPress={onDecrement}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Decrease gross strokes"
          hitSlop={8}
          style={({ pressed }) => [
            styles.bigBtn,
            { borderColor: colors.primary, opacity: disabled ? 0.35 : pressed ? 0.85 : 1 },
          ]}
        >
          <AppText variant="h2" color="primary">
            −
          </AppText>
        </Pressable>
        <Pressable
          onPress={() => {
            if (dim) return;
            setTypedValue(grossDisplay === "—" ? "" : grossDisplay);
            setTyping(true);
          }}
          disabled={dim}
          accessibilityRole="button"
          accessibilityLabel="Edit gross score"
          style={styles.grossBox}
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
                placeholder="--"
                placeholderTextColor={colors.textTertiary}
              />
            </View>
          ) : (
            <>
              <Animated.View style={{ transform: [{ scale: scoreScale }] }}>
                <AppText
                  variant="h1"
                  style={[
                    styles.grossNum,
                    { color: isConfirmedScore ? colors.text : colors.textSecondary, opacity: isConfirmedScore ? 1 : 0.72 },
                  ]}
                >
                  {grossDisplay}
                </AppText>
              </Animated.View>
              <AppText variant="caption" color="tertiary">
                {isConfirmedScore ? "Tap to type" : defaultHint ?? "Par default · tap to confirm"}
              </AppText>
            </>
          )}
        </Pressable>
        <Pressable
          onPress={onIncrement}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Increase gross strokes"
          hitSlop={8}
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
    borderRadius: freePlayPremium.cardRadius,
    padding: spacing.base,
    marginTop: spacing.md,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  bigBtn: {
    width: 64,
    height: 64,
    borderRadius: radius.xl,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  grossBox: {
    minWidth: 120,
    minHeight: 86,
    alignItems: "center",
    justifyContent: "center",
  },
  grossNum: {
    fontSize: 44,
    lineHeight: 48,
  },
  typeWrap: {
    width: 92,
    alignItems: "center",
  },
  typeInput: {
    width: 92,
    height: 56,
    borderWidth: 1,
    borderRadius: radius.md,
    textAlign: "center",
    fontSize: 28,
    fontWeight: "700",
  },
  errorText: {
    marginTop: spacing.xs,
  },
});
