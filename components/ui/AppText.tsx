/**
 * Typography primitive — semantic variants and theme color roles; scales with Settings → Text size.
 */

import { Text, TextProps, TextStyle, StyleProp } from "react-native";
import { getColors } from "@/lib/ui/theme";
import type { TypographyVariant } from "@/lib/ui/theme";
import { useFontScale } from "@/lib/ui/fontScaleContext";

/** Semantic + legacy variants (legacy map to the same tokens for backward compatibility). */
export type TextVariant =
  | "display"
  | "title"
  | "heading"
  | "subheading"
  | "body"
  | "bodySmall"
  | "caption"
  | "label"
  | "h1"
  | "h2"
  | "bodyBold"
  | "captionBold"
  | "small"
  | "button"
  | "buttonLarge";

const VARIANT_TO_TOKEN: Record<TextVariant, TypographyVariant> = {
  display: "display",
  title: "title",
  heading: "heading",
  subheading: "subheading",
  body: "body",
  bodySmall: "bodySmall",
  caption: "caption",
  label: "label",
  h1: "h1",
  h2: "h2",
  bodyBold: "bodyBold",
  captionBold: "captionBold",
  small: "small",
  button: "button",
  buttonLarge: "buttonLarge",
};

export type TextColorRole =
  | "primary"
  | "secondary"
  | "muted"
  | "inverse"
  | "success"
  | "danger"
  | "warning"
  | "info"
  | "default"
  /** @deprecated use `muted` */
  | "tertiary";

type AppTextProps = TextProps & {
  variant?: TextVariant;
  color?: TextColorRole;
  style?: StyleProp<TextStyle>;
};

export function AppText({
  children,
  variant = "body",
  color = "default",
  style,
  ...textProps
}: AppTextProps) {
  const colors = getColors();
  const { typography } = useFontScale();
  const token = VARIANT_TO_TOKEN[variant];

  const colorMap: Record<TextColorRole, string> = {
    primary: colors.primary,
    secondary: colors.textSecondary,
    muted: colors.textTertiary,
    inverse: colors.textInverse,
    success: colors.success,
    danger: colors.error,
    warning: colors.warning,
    info: colors.info,
    default: colors.text,
    tertiary: colors.textTertiary,
  };

  return (
    <Text
      style={[typography[token] as TextStyle, { color: colorMap[color] }, style]}
      {...textProps}
    >
      {children}
    </Text>
  );
}
