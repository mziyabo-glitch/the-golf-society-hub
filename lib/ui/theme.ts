/**
 * Design System Theme Tokens
 * Light and dark theme support with consistent spacing, typography, and colors
 */

import type { TextStyle } from "react-native";
import { Appearance } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

/** Stored user choice — may follow the OS when `system`. */
export type ThemePreference = "light" | "dark" | "system";

/** Keys into `colors` (resolved palette). */
export type ThemePaletteMode = "light" | "dark";

/** @deprecated Use `ThemePreference` — kept for older call sites. */
export type ThemeMode = ThemePreference;

const THEME_STORAGE_KEY = "@golf_society_hub_theme_preference";

export const DEFAULT_THEME_PREFERENCE: ThemePreference = "light";

/** Validate a stored string; returns null if unknown. */
export function parseThemePreference(raw: string | null | undefined): ThemePreference | null {
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  return null;
}

/**
 * Web: read the same `localStorage` key `@react-native-async-storage/async-storage` uses on web,
 * synchronously before the first paint. Removes light→dark flash on reload when a theme is saved.
 * Native: returns null (AsyncStorage has no sync API — use native splash hold instead).
 */
export function peekStoredThemePreferenceSync(): ThemePreference | null {
  if (typeof globalThis === "undefined") return null;
  const win = globalThis as { window?: { localStorage?: Storage } };
  if (typeof win.window === "undefined" || !win.window?.localStorage) return null;
  try {
    return parseThemePreference(win.window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return null;
  }
}

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

// ---------------------------------------------------------------------------
// Runtime preference + persistence (AsyncStorage, same pattern as text size)
// ---------------------------------------------------------------------------

let themePreference: ThemePreference = DEFAULT_THEME_PREFERENCE;

/**
 * Apply preference from `peekStoredThemePreferenceSync` without notifying subscribers, so the first
 * `getColors()` matches storage. Call once during `ThemeProvider` mount (before paint).
 */
export function runSyncThemeHydration(): ThemePreference | null {
  const peeked = peekStoredThemePreferenceSync();
  if (peeked) {
    themePreference = peeked;
  }
  return peeked;
}

const themePreferenceListeners = new Set<() => void>();

export function subscribeThemePreference(listener: () => void): () => void {
  themePreferenceListeners.add(listener);
  return () => {
    themePreferenceListeners.delete(listener);
  };
}

function notifyThemePreferenceListeners(): void {
  themePreferenceListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore subscriber errors */
    }
  });
}

function getSystemColorScheme(): ThemePaletteMode {
  const s = Appearance.getColorScheme();
  return s === "dark" ? "dark" : "light";
}

/**
 * Map preference (+ optional explicit system scheme) to a palette mode.
 */
export function resolvePaletteMode(
  preference: ThemePreference,
  systemScheme: ThemePaletteMode = getSystemColorScheme(),
): ThemePaletteMode {
  if (preference === "system") return systemScheme;
  return preference;
}

/** Current in-memory preference (light / dark / system). */
export function getThemePreference(): ThemePreference {
  return themePreference;
}

/** Resolved `light` | `dark` for tokens and `getColors()`. */
export function getResolvedPaletteMode(): ThemePaletteMode {
  return resolvePaletteMode(themePreference);
}

function applyInMemoryThemePreference(next: ThemePreference): void {
  themePreference = next;
  notifyThemePreferenceListeners();
}

/**
 * Update preference in memory only (no storage). Triggers UI subscribers.
 * Prefer `setStoredTheme` from settings / bootstrap.
 */
export function setThemePreference(next: ThemePreference): void {
  const p = parseThemePreference(next);
  if (!p) return;
  applyInMemoryThemePreference(p);
}

/**
 * Read validated preference from storage without changing in-memory state.
 * On failure or invalid value, returns `DEFAULT_THEME_PREFERENCE`.
 */
export async function getStoredTheme(): Promise<ThemePreference> {
  try {
    const raw = await AsyncStorage.getItem(THEME_STORAGE_KEY);
    const parsed = parseThemePreference(raw);
    if (parsed) return parsed;
  } catch {
    /* ignore */
  }
  return DEFAULT_THEME_PREFERENCE;
}

/**
 * Apply preference from storage and notify listeners. Call once at startup (see `ThemeProvider`).
 */
export async function resolveInitialTheme(): Promise<{
  preference: ThemePreference;
  resolved: ThemePaletteMode;
}> {
  try {
    const preference = await getStoredTheme();
    applyInMemoryThemePreference(preference);
    return { preference, resolved: getResolvedPaletteMode() };
  } catch {
    applyInMemoryThemePreference(DEFAULT_THEME_PREFERENCE);
    return {
      preference: DEFAULT_THEME_PREFERENCE,
      resolved: getResolvedPaletteMode(),
    };
  }
}

/**
 * Apply immediately, then persist asynchronously (memory first for snappy UI).
 */
export async function setStoredTheme(next: ThemePreference): Promise<void> {
  const p = parseThemePreference(next);
  if (!p) return;
  applyInMemoryThemePreference(p);
  try {
    await AsyncStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    /* keep in-memory value; persistence best-effort */
  }
}

/**
 * @deprecated Use `getThemePreference()` for the full choice, or `getResolvedPaletteMode()` for palette keys.
 */
export function getThemeMode(): ThemePreference {
  return getThemePreference();
}

/**
 * @deprecated Use `setThemePreference` (memory) or `setStoredTheme` (persist).
 */
export function setThemeMode(mode: ThemePreference): void {
  setThemePreference(mode);
}

/**
 * Get colors for the resolved palette (light or dark).
 */
export function getColors() {
  return colors[getResolvedPaletteMode()];
}

/**
 * Get color value by key for the resolved palette.
 */
export function getColor(key: keyof typeof colors.light): string {
  return colors[getResolvedPaletteMode()][key];
}

/**
 * Load theme from storage into memory (startup / focus refresh).
 */
export async function loadThemeFromStorage(): Promise<ThemePreference> {
  const { preference } = await resolveInitialTheme();
  return preference;
}

/**
 * Persist theme and apply in memory.
 */
export async function saveThemeToStorage(mode: ThemePreference): Promise<void> {
  await setStoredTheme(mode);
}

