import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { AppText } from "@/components/ui/AppText";
import { PrimaryButton } from "@/components/ui/Button";
import { getColors, radius, spacing } from "@/lib/ui/theme";
import type { FreePlayLeaderboardRow } from "@/lib/scoring/freePlayScoring";
import type { FreePlayScoringFormat } from "@/types/freePlayScorecard";

type FreePlayLeaderboardSheetProps = {
  visible: boolean;
  onClose: () => void;
  format: FreePlayScoringFormat;
  rows: FreePlayLeaderboardRow[];
};

export function FreePlayLeaderboardSheet({ visible, onClose, format, rows }: FreePlayLeaderboardSheetProps) {
  const colors = getColors();
  const valueLabel = format === "stableford" ? "Pts" : "Net";

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.borderLight }]} onStartShouldSetResponder={() => true}>
          <View style={styles.sheetHead}>
            <AppText variant="h2">Leaderboard</AppText>
            <Pressable onPress={onClose} hitSlop={12}>
              <Feather name="x" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingBottom: spacing.md }}>
            <View style={styles.headerRow}>
              <AppText variant="caption" color="tertiary" style={{ width: 28 }}>
                #
              </AppText>
              <AppText variant="caption" color="tertiary" style={{ flex: 1 }}>
                Player
              </AppText>
              <AppText variant="caption" color="tertiary" style={{ width: 44 }}>
                Thru
              </AppText>
              <AppText variant="caption" color="tertiary" style={{ width: 56, textAlign: "right" }}>
                {valueLabel}
              </AppText>
            </View>
            {rows.map((row, idx) => (
              <View key={row.roundPlayerId} style={[styles.row, { borderColor: colors.borderLight }]}>
                <AppText variant="captionBold" color="secondary" style={{ width: 28 }}>
                  {idx + 1}
                </AppText>
                <AppText variant="bodyBold" style={{ flex: 1 }} numberOfLines={1}>
                  {row.displayName}
                </AppText>
                <AppText variant="caption" color="secondary" style={{ width: 44 }}>
                  {row.thru}
                </AppText>
                <AppText variant="bodyBold" color="primary" style={{ width: 56, textAlign: "right" }}>
                  {format === "stableford" ? (row.stablefordPoints ?? "—") : (row.netTotal ?? "—")}
                </AppText>
              </View>
            ))}
          </ScrollView>
          <PrimaryButton label="Close" onPress={onClose} />
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.base,
    paddingBottom: spacing.lg,
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
  },
});
