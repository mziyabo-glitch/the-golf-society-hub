/**
 * Premium Text Component
 * Uses typography tokens from theme for consistent text styling
 */

import React, { type ReactNode } from "react";
import { Text, TextProps, TextStyle, StyleProp } from "react-native";
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
  style?: StyleProp<TextStyle>;
};

function normalizeTextChildren(node: ReactNode): ReactNode {
  if (
    node == null ||
    typeof node === "string" ||
    typeof node === "number" ||
    typeof node === "boolean"
  ) {
    return node;
  }

  if (Array.isArray(node)) {
    return node.map((child, idx) => {
      const normalized = normalizeTextChildren(child);
      return React.isValidElement(normalized)
        ? React.cloneElement(normalized as React.ReactElement, { key: normalized.key ?? idx })
        : normalized;
    });
  }

  if (React.isValidElement(node)) {
    return node;
  }

  // Prevent runtime crashes from accidental object/JSON values rendered in text.
  try {
    return JSON.stringify(node);
  } catch {
    return String(node);
  }
}

export function AppText({
  children,
  variant = "body",
  color = "default",
  style,
  ...textProps
}: AppTextProps) {
  const colors = getColors();
  const safeChildren = normalizeTextChildren(children);
  
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
      {safeChildren}
    </Text>
  );
}

