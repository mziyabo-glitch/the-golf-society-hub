/**
 * App Input
 * Consistent input styling for forms.
 */

import { useMemo } from "react";
import { StyleSheet, TextInput, type TextInputProps } from "react-native";
import { getColors, radius, spacing } from "@/lib/ui/theme";
import { useScaledTypography } from "@/lib/ui/fontScaleContext";

type AppInputProps = TextInputProps & {
  size?: "sm" | "md";
};

export function AppInput({ style, size = "md", ...props }: AppInputProps) {
  const colors = getColors();
  const typo = useScaledTypography();

  const dynamic = useMemo(
    () =>
      StyleSheet.create({
        input: {
          borderWidth: 1,
          borderRadius: radius.md,
          paddingHorizontal: spacing.base,
          paddingVertical: spacing.sm,
          minHeight: Math.max(44, typo.body.lineHeight + 20),
          ...typo.body,
        },
        inputSm: {
          minHeight: Math.max(38, typo.body.lineHeight + 12),
          paddingHorizontal: spacing.sm,
          paddingVertical: spacing.xs,
        },
      }),
    [typo],
  );

  return (
    <TextInput
      placeholderTextColor={colors.textTertiary}
      style={[
        dynamic.input,
        {
          borderColor: colors.border,
          color: colors.text,
          backgroundColor: colors.surface,
        },
        size === "sm" && dynamic.inputSm,
        style,
      ]}
      {...props}
    />
  );
}
