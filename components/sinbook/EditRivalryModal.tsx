import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";

import { AppText } from "@/components/ui/AppText";
import { AppInput } from "@/components/ui/AppInput";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { updateSinbook, type SinbookWithParticipants } from "@/lib/db_supabase/sinbookRepo";
import { getColors, radius, spacing } from "@/lib/ui/theme";
import { showAlert } from "@/lib/ui/alert";

const FORMAT_PRESETS = ["Match play", "Gross", "Net", "Stableford", "Other"] as const;

type Props = {
  visible: boolean;
  sinbook: SinbookWithParticipants | null;
  onClose: () => void;
  onSaved: () => void;
};

function normalizeEndsOn(raw: string): string | null | "__invalid__" {
  const t = raw.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  return "__invalid__";
}

export function EditRivalryModal({ visible, sinbook, onClose, onSaved }: Props) {
  const colors = getColors();
  const [title, setTitle] = useState("");
  const [stake, setStake] = useState("");
  const [format, setFormat] = useState("");
  const [notes, setNotes] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible || !sinbook) return;
    setTitle(sinbook.title?.trim() ?? "");
    setStake(sinbook.stake?.trim() ?? "");
    setFormat((sinbook.scoring_format ?? "").trim());
    setNotes(sinbook.description?.trim() ?? "");
    const end = sinbook.ends_on;
    setEndsOn(typeof end === "string" && end.length >= 10 ? end.slice(0, 10) : (end ?? "").toString().slice(0, 10));
  }, [visible, sinbook]);

  const handleSave = async () => {
    if (!sinbook) return;
    const trimmed = title.trim();
    if (!trimmed) {
      showAlert("Missing title", "Enter a name for this rivalry.");
      return;
    }
    const ends = normalizeEndsOn(endsOn);
    if (ends === "__invalid__") {
      showAlert("Invalid date", "Use end date as YYYY-MM-DD (e.g. 2026-12-31), or leave blank.");
      return;
    }

    setSaving(true);
    try {
      await updateSinbook(sinbook.id, {
        title: trimmed,
        stake: stake.trim() || null,
        scoring_format: format.trim() || null,
        description: notes.trim() || null,
        ends_on: ends,
      });
      onSaved();
      onClose();
    } catch (e: unknown) {
      showAlert("Could not save", e instanceof Error ? e.message : "Try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!sinbook) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <Pressable style={[styles.backdrop, { backgroundColor: "rgba(0,0,0,0.45)" }]} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          <View style={styles.sheetHeader}>
            <AppText variant="heading">Edit rivalry</AppText>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
              <Feather name="x" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <AppText variant="captionBold" color="secondary" style={styles.label}>
              Rivalry name
            </AppText>
            <AppInput value={title} onChangeText={setTitle} placeholder="e.g. Brian vs Dave" autoCapitalize="words" />

            <AppText variant="captionBold" color="secondary" style={[styles.label, styles.labelSpaced]}>
              Stake / treat (£ or text)
            </AppText>
            <AppInput
              value={stake}
              onChangeText={setStake}
              placeholder="e.g. £10 or loser buys coffee"
              autoCapitalize="sentences"
            />

            <AppText variant="captionBold" color="secondary" style={[styles.label, styles.labelSpaced]}>
              Format
            </AppText>
            <View style={styles.chipWrap}>
              {FORMAT_PRESETS.map((label) => {
                const f = format.trim();
                const core = ["Match play", "Gross", "Net", "Stableford"] as const;
                const active =
                  label === "Other"
                    ? f.length > 0 && !core.some((c) => c.toLowerCase() === f.toLowerCase())
                    : f.toLowerCase() === label.toLowerCase();
                return (
                  <Pressable
                    key={label}
                    onPress={() => setFormat(label === "Other" ? "" : label)}
                    style={[
                      styles.chip,
                      {
                        borderColor: active ? colors.primary : colors.borderLight,
                        backgroundColor: active ? `${colors.primary}14` : colors.backgroundSecondary,
                      },
                    ]}
                  >
                    <AppText variant="captionBold" color={active ? "primary" : "secondary"}>
                      {label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
            <View style={{ marginTop: spacing.xs }}>
              <AppInput
                value={format}
                onChangeText={setFormat}
                placeholder="Custom format (optional)"
                autoCapitalize="words"
              />
            </View>

            <AppText variant="captionBold" color="secondary" style={[styles.label, styles.labelSpaced]}>
              Notes / house rules
            </AppText>
            <AppInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Optional — e.g. gross only on par 3s"
              autoCapitalize="sentences"
              multiline
            />

            <AppText variant="captionBold" color="secondary" style={[styles.label, styles.labelSpaced]}>
              End date (optional)
            </AppText>
            <AppInput
              value={endsOn}
              onChangeText={setEndsOn}
              placeholder="YYYY-MM-DD"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <AppText variant="small" color="muted" style={{ marginTop: 4 }}>
              Opponents and past results are not changed from here.
            </AppText>

            <View style={styles.actions}>
              <SecondaryButton onPress={onClose} style={{ flex: 1 }} disabled={saving}>
                Cancel
              </SecondaryButton>
              <PrimaryButton onPress={() => void handleSave()} loading={saving} style={{ flex: 1 }}>
                Save
              </PrimaryButton>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    maxHeight: "88%",
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  label: { marginBottom: 4 },
  labelSpaced: { marginTop: spacing.sm },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
});
