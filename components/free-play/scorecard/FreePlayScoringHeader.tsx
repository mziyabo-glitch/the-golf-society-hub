import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/AppText";
import { getColors, radius, spacing } from "@/lib/ui/theme";

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
    <View style={[styles.card, { borderColor: colors.borderLight, backgroundColor: colors.surface }]}>
      {resumedHole != null ? (
        <View style={[styles.banner, { borderColor: colors.primary + "44", backgroundColor: colors.primary + "10" }]}>
          <AppText variant="captionBold" color="primary">
            Resumed at Hole {resumedHole}
          </AppText>
        </View>
      ) : null}
      <View style={styles.topRow}>
        <View style={styles.center}>
          <AppText variant="h2">Hole {holeNumber}</AppText>
          <AppText variant="caption" color="tertiary" style={{ marginTop: 2 }}>
            {holeNumber}/{maxHoleNumber}
          </AppText>
        </View>
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
        <AppText variant="bodyBold" color="secondary">
          Par {par} · SI {strokeIndex ?? "-"}
          {yardageLabel ? ` · ${yardageLabel}` : ""}
        </AppText>
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
    borderRadius: radius.lg,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
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
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
  center: {
    marginRight: "auto",
    flex: 1,
  },
  navBtn: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    minWidth: 64,
    alignItems: "center",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
});
