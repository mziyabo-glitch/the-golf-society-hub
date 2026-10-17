import { StyleSheet, View } from "react-native";

import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { AppText } from "@/components/ui/AppText";
import { getColors, radius, spacing } from "@/lib/ui/theme";

export type FreePlayIncompleteRoundNoticeProps = {
  canReturnToScoring: boolean;
  onReturnToScoring: () => void;
};

export function FreePlayIncompleteRoundNotice({
  canReturnToScoring,
  onReturnToScoring,
}: FreePlayIncompleteRoundNoticeProps) {
  const colors = getColors();

  return (
    <View style={[styles.card, { borderColor: colors.warning + "66", backgroundColor: `${colors.warning}11` }]}>
      <AppText variant="captionBold" color="warning">
        Some scores are missing
      </AppText>
      <AppText variant="small" color="secondary" style={{ marginTop: spacing.xs }}>
        You can still view the summary, but totals may be incomplete.
      </AppText>
      {canReturnToScoring ? (
        <PrimaryButton label="Return to scoring" onPress={onReturnToScoring} style={{ marginTop: spacing.sm }} />
      ) : (
        <SecondaryButton label="Scoring locked after completion" onPress={() => undefined} disabled style={{ marginTop: spacing.sm }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.base,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.base,
  },
});
