// components/LicenceRequiredModal.tsx
// Reusable modal shown when an unlicensed member attempts a paid action.

import { useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";

import { AppText } from "@/components/ui/AppText";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { Toast } from "@/components/ui/Toast";
import { supabase } from "@/lib/supabase";
import { getColors, spacing, radius } from "@/lib/ui/theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  societyId: string | null;
};

export function LicenceRequiredModal({ visible, onClose, societyId }: Props) {
  const router = useRouter();
  const colors = getColors();
  const [requesting, setRequesting] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: "", type: "success" as "success" | "error" | "info" });

  const handleRequestAccess = async () => {
    if (!societyId || requesting) return;
    setRequesting(true);
    try {
      const { error } = await supabase.rpc("create_licence_request", {
        p_society_id: societyId,
      });
      if (error) {
        if (error.message?.includes("already have a licence")) {
          setToast({ visible: true, message: "You already have a licence!", type: "info" });
        } else if (error.message?.includes("pending")) {
          setToast({ visible: true, message: "Request already sent. Waiting for your Captain.", type: "info" });
        } else {
          setToast({ visible: true, message: error.message || "Failed to send request.", type: "error" });
        }
        return;
      }
      setToast({ visible: true, message: "Request sent to your Captain.", type: "success" });
      // Close modal after short delay to show the toast
      setTimeout(onClose, 1200);
    } catch (e: any) {
      setToast({ visible: true, message: e?.message || "Something went wrong.", type: "error" });
    } finally {
      setRequesting(false);
    }
  };

  const handleUnlockWithSinbook = () => {
    onClose();
    router.push("/(app)/(tabs)/sinbook");
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.background }]} onPress={() => {}}>
          {/* Icon */}
          <View style={[styles.iconCircle, { backgroundColor: colors.warning + "18" }]}>
            <Feather name="lock" size={28} color={colors.warning} />
          </View>

          {/* Title */}
          <AppText variant="h2" style={styles.title}>
            Licence required
          </AppText>

          {/* Body */}
          <AppText variant="body" color="secondary" style={styles.body}>
            This action needs a society licence or Sinbook access.
          </AppText>

          {/* Buttons */}
          <View style={styles.buttons}>
            <PrimaryButton
              onPress={handleRequestAccess}
              loading={requesting}
              disabled={requesting}
              style={styles.btn}
            >
              Request access
            </PrimaryButton>

            <SecondaryButton onPress={handleUnlockWithSinbook} style={styles.btn}>
              Unlock with Sinbook
            </SecondaryButton>

            <Pressable onPress={onClose} style={styles.notNow}>
              <AppText variant="caption" color="tertiary">
                Not now
              </AppText>
            </Pressable>
          </View>

          {/* Toast inside modal */}
          <Toast
            visible={toast.visible}
            message={toast.message}
            type={toast.type}
            onHide={() => setToast((t) => ({ ...t, visible: false }))}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  sheet: {
    width: "100%",
    maxWidth: 360,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  title: {
    textAlign: "center",
    marginBottom: spacing.xs,
  },
  body: {
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  buttons: {
    width: "100%",
    gap: spacing.sm,
  },
  btn: {
    width: "100%",
  },
  notNow: {
    alignSelf: "center",
    paddingVertical: spacing.sm,
  },
});
