/**
 * Premium Text Component
 * Uses typography tokens from theme for consistent text styling
 */

import { Text, TextProps, TextStyle } from "react-native";
import { getColors, typography } from "@/lib/ui/theme";

export type TextVariant = 
  | "title" 
  | "h1" 
  | "h2" 
  | "body" 
  | "bodyBold" 
  | "caption" 
  | "captionBold" 
  | "small"
  | "button"
  | "buttonLarge";

type AppTextProps = TextProps & {
  variant?: TextVariant;
  color?: "primary" | "secondary" | "tertiary" | "inverse" | "default";
  style?: TextStyle;
};

export function AppText({
  children,
  variant = "body",
  color = "default",
  style,
  ...textProps
}: AppTextProps) {
  const colors = getColors();
  
  const colorMap: Record<typeof color, string> = {
    primary: colors.primary,
    secondary: colors.textSecondary,
    tertiary: colors.textTertiary,
    inverse: colors.textInverse,
    default: colors.text,
  };
  
  return (
    <Text
      style={[
        typography[variant],
        { color: colorMap[color] },
        style,
      ]}
      {...textProps}
    >
      {children}
    </Text>
  );
}

