/**
 * App Input
 * Consistent input styling for forms.
 */

import { StyleSheet, TextInput, type TextInputProps } from "react-native";
import { getColors, radius, spacing, typography } from "@/lib/ui/theme";

type AppInputProps = TextInputProps & {
  size?: "sm" | "md";
};

export function AppInput({ style, size = "md", ...props }: AppInputProps) {
  const colors = getColors();

  return (
    <TextInput
      placeholderTextColor={colors.textTertiary}
      style={[
        styles.input,
        {
          borderColor: colors.border,
          color: colors.text,
          backgroundColor: colors.surface,
        },
        size === "sm" && styles.inputSm,
        style,
      ]}
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    minHeight: 44,
    ...typography.body,
  },
  inputSm: {
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
});
