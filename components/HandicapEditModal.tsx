/**
 * Quick-edit modal for WHS Handicap Index.
 * Tap handicap row → opens this modal. Mobile-first, numeric keyboard.
 */
import { useState, useEffect } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { AppText } from "@/components/ui/AppText";
import { AppInput } from "@/components/ui/AppInput";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { getColors, spacing, radius } from "@/lib/ui/theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  currentValue: number | null;
  onSave: (value: number | null) => Promise<void>;
  canEdit: boolean;
};

export function HandicapEditModal({ visible, onClose, currentValue, onSave, canEdit }: Props) {
  const colors = getColors();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setValue(
        currentValue != null && Number.isFinite(currentValue)
          ? String(currentValue)
          : ""
      );
      setError(null);
    }
  }, [visible, currentValue]);

  const handleSave = async () => {
    if (!canEdit) return;

    const trimmed = value.trim();
    if (!trimmed) {
      const parsed = null;
      setSaving(true);
      try {
        await onSave(parsed);
        onClose();
      } catch (e: any) {
        setError(e?.message || "Failed to save");
      } finally {
        setSaving(false);
      }
      return;
    }

    const parsed = parseFloat(trimmed);
    if (isNaN(parsed)) {
      setError("Please enter a valid number (e.g. 14.3)");
      return;
    }
    if (parsed < -10 || parsed > 54) {
      setError("Handicap index must be between -10 and 54");
      return;
    }

    setError(null);
    setSaving(true);
    try {
      await onSave(parsed);
      onClose();
    } catch (e: any) {
      setError((e as Error)?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
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
          <View style={styles.header}>
            <AppText variant="bodyBold">Edit handicap</AppText>
            <Pressable onPress={onClose} hitSlop={12}>
              <Feather name="x" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.field}>
            <AppText variant="captionBold" style={styles.label}>
              WHS Handicap Index
            </AppText>
            <AppInput
              placeholder="e.g. 14.3"
              value={value}
              onChangeText={(t) => {
                setValue(t);
                setError(null);
              }}
              keyboardType="decimal-pad"
              editable={canEdit}
            />
            <AppText variant="small" color="tertiary" style={{ marginTop: 4 }}>
              Valid range: -10 to 54. Leave empty to clear.
            </AppText>
            {error && (
              <AppText variant="small" style={{ color: colors.error, marginTop: 4 }}>
                {error}
              </AppText>
            )}
          </View>

          <View style={styles.actions}>
            <SecondaryButton onPress={onClose} style={{ flex: 1 }}>
              Cancel
            </SecondaryButton>
            <PrimaryButton
              onPress={handleSave}
              loading={saving}
              disabled={!canEdit || saving}
              style={{ flex: 1 }}
            >
              Save handicap
            </PrimaryButton>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  sheet: {
    width: "100%",
    maxWidth: 360,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.base,
  },
  field: {
    marginBottom: spacing.base,
  },
  label: {
    marginBottom: spacing.xs,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
});
