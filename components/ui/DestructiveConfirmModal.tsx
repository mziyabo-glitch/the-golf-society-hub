/**
 * In-app destructive confirmation (Safari-friendly — avoids window.confirm on web).
 */

import { useCallback, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { AppText } from "./AppText";
import { SecondaryButton, DestructiveButton } from "./Button";
import { getColors, spacing, radius } from "@/lib/ui/theme";

type Pending = {
  title: string;
  message: string;
  confirmLabel: string;
  resolve: (ok: boolean) => void;
};

export function useDestructiveConfirm() {
  const [pending, setPending] = useState<Pending | null>(null);

  const askConfirm = useCallback((title: string, message: string, confirmLabel: string) => {
    return new Promise<boolean>((resolve) => {
      setPending({ title, message, confirmLabel, resolve });
    });
  }, []);

  const finish = useCallback((ok: boolean) => {
    setPending((cur) => {
      if (cur) cur.resolve(ok);
      return null;
    });
  }, []);

  const colors = getColors();
  const modal =
    pending != null ? (
      <Modal visible transparent animationType="fade" onRequestClose={() => finish(false)}>
        <Pressable style={styles.backdrop} onPress={() => finish(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={(e: { stopPropagation?: () => void }) => e.stopPropagation?.()}
          >
            <AppText variant="h2" style={{ marginBottom: spacing.sm }}>
              {pending.title}
            </AppText>
            <AppText variant="body" color="secondary" style={{ marginBottom: spacing.lg }}>
              {pending.message}
            </AppText>
            <View style={styles.actions}>
              <SecondaryButton onPress={() => finish(false)} style={{ flex: 1 }}>
                Cancel
              </SecondaryButton>
              <DestructiveButton onPress={() => finish(true)} style={{ flex: 1 }}>
                {pending.confirmLabel}
              </DestructiveButton>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    ) : null;

  return { destructiveConfirmModal: modal, askConfirm };
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: spacing.lg,
  },
  sheet: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    maxWidth: 400,
    width: "100%",
    alignSelf: "center",
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
});
