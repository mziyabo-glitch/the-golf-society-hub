import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/AppText";
import { getColors, radius, spacing } from "@/lib/ui/theme";
import { freePlayPremium } from "@/lib/ui/freePlayPremiumTheme";

export type FreePlayScoringHeaderProps = {
  holeNumber: number;
  maxHoleNumber: number;
  par: number;
  strokeIndex: number | null;
  yardageLabel: string | null;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  saveState: "saving" | "saved" | "failed";
  resumedHole: number | null;
};

export function FreePlayScoringHeader({
  holeNumber,
  maxHoleNumber,
  par,
  strokeIndex,
  yardageLabel,
  canPrev,
  canNext,
  onPrev,
  onNext,
  saveState,
  resumedHole,
}: FreePlayScoringHeaderProps) {
  const colors = getColors();
  const saveLabel = saveState === "saving" ? "Saving..." : saveState === "failed" ? "Failed" : "Saved";
  const saveTone = saveState === "failed" ? "warning" : saveState === "saving" ? "secondary" : "primary";

  return (
    <View
      style={[
        styles.card,
        {
          borderColor: freePlayPremium.accentDeepGreen + "44",
          backgroundColor: freePlayPremium.creamSurface,
        },
      ]}
    >
      {resumedHole != null ? (
        <View style={[styles.banner, { borderColor: colors.primary + "44", backgroundColor: colors.primary + "10" }]}>
          <AppText variant="captionBold" color="primary">
            Resumed at Hole {resumedHole}
          </AppText>
        </View>
      ) : null}
      <View style={styles.topRow}>
        <Pressable
          onPress={onPrev}
          disabled={!canPrev}
          style={({ pressed }) => [
            styles.navBtn,
            { borderColor: colors.borderLight, opacity: !canPrev ? 0.45 : pressed ? 0.84 : 1 },
          ]}
        >
          <AppText variant="captionBold" color="secondary">
            Prev
          </AppText>
        </Pressable>
        <View style={styles.center}>
          <AppText variant="captionBold" style={{ color: freePlayPremium.accentDeepGreen, letterSpacing: 1 }}>
            Hole {holeNumber} of {maxHoleNumber}
          </AppText>
          <AppText variant="h1" style={{ marginTop: 2 }}>
            {holeNumber}
          </AppText>
        </View>
        <Pressable
          onPress={onNext}
          disabled={!canNext}
          style={({ pressed }) => [
            styles.navBtn,
            { borderColor: colors.borderLight, opacity: !canNext ? 0.45 : pressed ? 0.84 : 1 },
          ]}
        >
          <AppText variant="captionBold" color="secondary">
            Next
          </AppText>
        </Pressable>
      </View>
      <View style={styles.metaRow}>
        <View style={[styles.pill, { borderColor: colors.borderLight }]}>
          <AppText variant="captionBold" color="secondary">
            Par {par}
          </AppText>
        </View>
        <View style={[styles.pill, { borderColor: colors.borderLight }]}>
          <AppText variant="captionBold" color="secondary">
            SI {strokeIndex ?? "-"}
          </AppText>
        </View>
        {yardageLabel ? (
          <View style={[styles.pill, { borderColor: colors.borderLight }]}>
            <AppText variant="captionBold" color="secondary">
              {yardageLabel}
            </AppText>
          </View>
        ) : null}
      </View>
      <View style={styles.saveRow}>
        <AppText variant="captionBold" color={saveTone}>
          {saveLabel}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: freePlayPremium.heroRadius,
    padding: spacing.base,
    marginBottom: spacing.sm,
  },
  banner: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
    alignSelf: "flex-start",
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  center: {
    alignItems: "center",
    flex: 1,
  },
  navBtn: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    minWidth: 74,
    alignItems: "center",
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  pill: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  saveRow: {
    marginTop: spacing.sm,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
});
