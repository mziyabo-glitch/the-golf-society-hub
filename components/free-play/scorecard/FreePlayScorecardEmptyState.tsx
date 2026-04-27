import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/AppText";
import { getColors, spacing } from "@/lib/ui/theme";

type FreePlayScorecardEmptyStateProps = {
  title?: string;
  message?: string;
};

export function FreePlayScorecardEmptyState({
  title = "Hole data loading",
  message = "Course holes will appear here for full scorecard entry.",
}: FreePlayScorecardEmptyStateProps) {
  const colors = getColors();

  return (
    <View style={[styles.box, { borderColor: colors.borderLight, backgroundColor: colors.surface }]}>
      <AppText variant="bodyBold">{title}</AppText>
      <AppText variant="small" color="secondary" style={{ marginTop: spacing.xs }}>
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderRadius: 12,
    padding: spacing.base,
    marginTop: spacing.sm,
  },
});
