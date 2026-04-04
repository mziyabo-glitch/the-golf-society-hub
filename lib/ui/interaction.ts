/**
 * Shared micro-interaction tokens — pressed / hover / disabled / focus (web).
 * Keep feedback fast, subtle, and consistent across primitives and screens.
 */

import { Platform, ViewStyle } from "react-native";
import type { ColorValue } from "react-native";

export const interaction = {
  /** Default opacity multiplier when pressed (buttons, rows) */
  pressOpacity: 0.9,
  /** Tabs, pills, compact controls */
  pressOpacitySoft: 0.88,
  /** Disabled interactive controls */
  disabledOpacity: 0.5,
  /** Primary / filled buttons — subtle inward press */
  buttonScale: 0.985,
  /** Large cards / list rows */
  cardScale: 0.995,
} as const;

export type PressableInteractionState = {
  pressed: boolean;
  /** React Native Web — pointer over target */
  hovered?: boolean;
};

/** Opacity-only press feedback (no scale). */
export function pressOpacityStyle(
  pressed: boolean,
  disabled: boolean | undefined,
  options?: { strong?: boolean },
): Pick<ViewStyle, "opacity"> {
  if (disabled) {
    return { opacity: interaction.disabledOpacity };
  }
  const mult = options?.strong ? interaction.pressOpacitySoft : interaction.pressOpacity;
  if (pressed) {
    return { opacity: mult };
  }
  return { opacity: 1 };
}

/** Combine opacity + optional scale when motion is allowed. */
export function pressableSurfaceStyle(
  state: PressableInteractionState,
  options: {
    disabled?: boolean;
    reduceMotion?: boolean;
    /** "button" = tighter scale; "card" = very subtle */
    scale?: "button" | "card" | "none";
    /** Use softer opacity (tabs/pills) */
    strongOpacity?: boolean;
  } = {},
): ViewStyle {
  const { pressed } = state;
  const { disabled, reduceMotion, scale = "none", strongOpacity } = options;

  const out: ViewStyle = {
    ...pressOpacityStyle(pressed, disabled, { strong: strongOpacity }),
  };

  if (scale !== "none" && !disabled && !reduceMotion) {
    const s = scale === "button" ? interaction.buttonScale : interaction.cardScale;
    out.transform = [{ scale: pressed ? s : 1 }];
  }

  return out;
}

/** Web hover background hint for row/card pressables (use with theme colors). */
export function webHoverSurfaceStyle(
  hovered: boolean | undefined,
  pressed: boolean,
  surfaceMuted: ColorValue,
): Pick<ViewStyle, "backgroundColor"> | undefined {
  if (Platform.OS !== "web" || !hovered || pressed) return undefined;
  return { backgroundColor: surfaceMuted };
}

/** Cursor on web for clickable surfaces */
export function webPointerStyle(): ViewStyle | undefined {
  if (Platform.OS !== "web") return undefined;
  return { cursor: "pointer" } as ViewStyle;
}

/**
 * Visible focus ring for keyboard users (web). RN Web applies focus to Pressable.
 * Keep offset so text stays legible inside controls.
 */
export function webFocusRingStyle(accent: ColorValue): ViewStyle | undefined {
  if (Platform.OS !== "web") return undefined;
  return {
    outlineStyle: "solid",
    outlineWidth: 2,
    outlineColor: accent,
    outlineOffset: 2,
  } as ViewStyle;
}
