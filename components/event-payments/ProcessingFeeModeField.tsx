import { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { AppText } from "@/components/ui/AppText";
import { getSociety, updateSociety } from "@/lib/db_supabase/societyRepo";
import {
  DEFAULT_PROCESSING_FEE_MODE,
  normalizeProcessingFeeMode,
  processingFeeModeLabel,
  type ProcessingFeeMode,
} from "@/lib/payments/processingFee";
import { getColors, spacing } from "@/lib/ui/theme";

const CHOICES: ProcessingFeeMode[] = ["society_absorbs", "player_pays"];

/** Society-level processing-fee choice. Payments already taken keep their own snapshot. */
export function ProcessingFeeModeField({ societyId }: { societyId: string | null | undefined }) {
  const colors = getColors();
  const [mode, setMode] = useState<ProcessingFeeMode>(DEFAULT_PROCESSING_FEE_MODE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!societyId) return;
    const society = await getSociety(societyId);
    setMode(normalizeProcessingFeeMode(society?.processing_fee_mode));
  }, [societyId]);

  useEffect(() => {
    void load().catch((err: Error) => setError(err.message));
  }, [load]);

  const choose = async (next: ProcessingFeeMode) => {
    if (!societyId || next === mode || saving) return;
    const previous = mode;
    setMode(next);
    setSaving(true);
    setError(null);
    try {
      await updateSociety(societyId, { processing_fee_mode: next });
    } catch (err) {
      setMode(previous);
      setError((err as Error).message || "Could not save processing fees");
    } finally {
      setSaving(false);
    }
  };

  if (!societyId) return null;

  return (
    <View style={{ marginTop: spacing.sm }}>
      <AppText variant="captionBold">Processing fees</AppText>
      <AppText variant="small" color="tertiary" style={{ marginTop: 4 }}>
        Society absorbs processing fees is the default. Changing this does not rewrite payments already taken.
      </AppText>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: spacing.xs }}>
        {CHOICES.map((choice) => {
          const selected = mode === choice;
          return (
            <Pressable
              key={choice}
              accessibilityRole="button"
              accessibilityLabel={processingFeeModeLabel(choice)}
              accessibilityState={{ selected, disabled: saving }}
              disabled={saving}
              onPress={() => void choose(choice)}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: selected ? colors.primary : colors.border,
                backgroundColor: selected ? colors.primary : colors.backgroundSecondary,
              }}
            >
              <AppText variant="caption" color={selected ? "inverse" : "default"}>
                {processingFeeModeLabel(choice)}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <AppText variant="small" style={{ color: colors.error, marginTop: 4 }}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}
