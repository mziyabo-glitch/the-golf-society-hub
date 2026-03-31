/**
 * Design System Theme Tokens
 * Light and dark theme support with consistent spacing, typography, and colors
 */

import type { TextStyle } from "react-native";

export type ThemeMode = "light" | "dark";

/**
 * Light premium golf palette:
 * - Soft off-white: app chrome / backgrounds (fairway-adjacent, not corporate)
 * - White cards with subtle shadow
 * - Deep green: primary actions & brand accents
 * - Muted gold: highlights only (podium, top ranks)
 */
export const colors = {
  light: {
    primary: "#166534",
    primaryDark: "#14532D",
    primaryLight: "#15803D",

    /** Muted gold — leaderboard top positions, premium emphasis only */
    highlight: "#D4AF37",
    highlightMuted: "rgba(212, 175, 55, 0.16)",

    success: "#10B981",
    error: "#EF4444",
    warning: "#F59E0B",
    info: "#3B82F6",

    background: "#F8FAF8",
    backgroundSecondary: "#EFF3EF",
    backgroundTertiary: "#E6EDE6",

    surface: "#FFFFFF",
    surfaceElevated: "#FFFFFF",
    surfaceDisabled: "#E3EBE3",

    text: "#15251A",
    textSecondary: "#3D5344",
    textTertiary: "#5C6B5F",
    textInverse: "#FFFFFF",

    border: "#D4DED4",
    borderLight: "#E2EBE2",
    divider: "#C9D4C9",

    pressOverlay: "rgba(22, 101, 52, 0.08)",
    overlay: "rgba(0, 0, 0, 0.45)",
  },
  /** Mirrors light — bright golf UI; no navy / dark chrome */
  dark: {
    primary: "#166534",
    primaryDark: "#14532D",
    primaryLight: "#16A34A",

    highlight: "#D4AF37",
    highlightMuted: "rgba(212, 175, 55, 0.18)",

    success: "#10B981",
    error: "#EF4444",
    warning: "#F59E0B",
    info: "#3B82F6",

    background: "#F8FAF8",
    backgroundSecondary: "#EFF3EF",
    backgroundTertiary: "#E6EDE6",

    surface: "#FFFFFF",
    surfaceElevated: "#FFFFFF",
    surfaceDisabled: "#E3EBE3",

    text: "#15251A",
    textSecondary: "#3D5344",
    textTertiary: "#5C6B5F",
    textInverse: "#FFFFFF",

    border: "#D4DED4",
    borderLight: "#E2EBE2",
    divider: "#C9D4C9",

    pressOverlay: "rgba(22, 101, 52, 0.08)",
    overlay: "rgba(0, 0, 0, 0.45)",
  },
} as const;

// Spacing scale — premium: 8/12/16/24
export const spacing = {
  xs: 8,
  sm: 12,
  md: 16,
  base: 16,
  lg: 24,
  xl: 24,
  "2xl": 32,
  "3xl": 48,
} as const;

// Border radius — premium: 14
export const radius = {
  sm: 10,
  md: 14,
  lg: 14,
  xl: 18,
  full: 9999,
} as const;

// Premium design tokens (light golf surfaces)
export const premiumTokens = {
  background: "#F8FAF8",
  cardBorder: "#D4DED4",
  textPrimary: "#15251A",
  textSecondary: "#3D5344",
  cardShadow: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
} as const;

// Typography — tuned for 45+ / 50+ readability; line heights ~1.45× font size
// Optional extra scale via Settings → Text size (fontScaleContext)
export const typography = {
  title: {
    fontSize: 26,
    fontWeight: "700" as const,
    lineHeight: 32,
    letterSpacing: -0.2,
  },
  h1: {
    fontSize: 24,
    fontWeight: "700" as const,
    lineHeight: 30,
    letterSpacing: -0.15,
  },
  h2: {
    fontSize: 19,
    fontWeight: "700" as const,
    lineHeight: 26,
    letterSpacing: -0.08,
  },
  body: {
    fontSize: 17,
    fontWeight: "500" as const,
    lineHeight: 25,
    letterSpacing: 0,
  },
  bodyBold: {
    fontSize: 18,
    fontWeight: "700" as const,
    lineHeight: 26,
    letterSpacing: 0,
  },
  caption: {
    fontSize: 16,
    fontWeight: "500" as const,
    lineHeight: 23,
    letterSpacing: 0,
  },
  captionBold: {
    fontSize: 16,
    fontWeight: "700" as const,
    lineHeight: 23,
    letterSpacing: 0,
  },
  small: {
    fontSize: 15,
    fontWeight: "500" as const,
    lineHeight: 22,
    letterSpacing: 0,
  },
  display: {
    fontSize: 28,
    fontWeight: "800" as const,
    lineHeight: 34,
    letterSpacing: -0.2,
  },
  button: {
    fontSize: 17,
    fontWeight: "600" as const,
    lineHeight: 24,
    letterSpacing: 0,
  },
  buttonLarge: {
    fontSize: 19,
    fontWeight: "700" as const,
    lineHeight: 26,
    letterSpacing: 0,
  },
} as const;

export type TypographyTokens = typeof typography;
export type TypographyVariant = keyof TypographyTokens;

/** Scales font sizes and line heights for accessibility (Settings → Text size). */
export function scaleTypography(multiplier: number): TypographyTokens {
  if (multiplier === 1) return typography;
  const keys = Object.keys(typography) as TypographyVariant[];
  const out = {} as Record<TypographyVariant, TextStyle>;
  for (const key of keys) {
    const t = typography[key];
    out[key] = {
      ...t,
      fontSize: Math.round(t.fontSize * multiplier * 10) / 10,
      lineHeight: Math.round(t.lineHeight * multiplier * 10) / 10,
    };
  }
  return out as TypographyTokens;
}

// Shadows (iOS-style elevation)
export const shadows = {
  sm: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
} as const;

// Button heights — min 44px for primary/accessibility
export const buttonHeights = {
  sm: 40,
  md: 44,
  lg: 52,
} as const;

// Default theme (can be changed by user preference)
let currentTheme: ThemeMode = "light";

/**
 * Get current theme mode
 */
export function getThemeMode(): ThemeMode {
  return currentTheme;
}

/**
 * Set theme mode (does not persist - use storage for persistence)
 */
export function setThemeMode(mode: ThemeMode): void {
  currentTheme = mode;
}

/**
 * Get colors for current theme
 */
export function getColors() {
  return colors[currentTheme];
}

/**
 * Get color value by key for current theme
 */
export function getColor(key: keyof typeof colors.light): string {
  return colors[currentTheme][key];
}

/**
 * Load theme from storage (use in screens with useFocusEffect)
 */
export async function loadThemeFromStorage(): Promise<ThemeMode> {
  setThemeMode("light");
  return "light";
}

/**
 * Save theme to storage
 */
export async function saveThemeToStorage(mode: ThemeMode): Promise<void> {
  setThemeMode(mode);
}

