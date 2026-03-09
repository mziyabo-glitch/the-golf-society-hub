/**
 * Design System Theme Tokens
 * Light and dark theme support with consistent spacing, typography, and colors
 */

export type ThemeMode = "light" | "dark";

export const colors = {
  light: {
    // Primary brand color (golf green)
    primary: "#0B6E4F",
    primaryDark: "#094937",
    primaryLight: "#0FA578",
    
    // Semantic colors
    success: "#10B981",
    error: "#EF4444",
    warning: "#F59E0B",
    info: "#3B82F6",
    
    // Backgrounds
    background: "#FFFFFF",
    backgroundSecondary: "#F7F8FA",
    backgroundTertiary: "#F3F4F6",
    
    // Surfaces (cards, inputs)
    surface: "#FFFFFF",
    surfaceElevated: "#FFFFFF",
    surfaceDisabled: "#F3F4F6",
    
    // Text (slate palette: 900 / 600 / 500)
    text: "#0F172A",
    textSecondary: "#475569",
    textTertiary: "#64748B",
    textInverse: "#FFFFFF",
    
    // Borders
    border: "#E6E8EC",
    borderLight: "#E6E8EC",
    divider: "#E5E7EB",
    
    // Interactive
    pressOverlay: "rgba(0, 0, 0, 0.05)",
    overlay: "rgba(0, 0, 0, 0.5)",
  },
  dark: {
    // Primary brand color (slightly lighter for dark mode)
    primary: "#0FA578",
    primaryDark: "#0B6E4F",
    primaryLight: "#14D99F",
    
    // Semantic colors
    success: "#10B981",
    error: "#EF4444",
    warning: "#F59E0B",
    info: "#3B82F6",
    
    // Backgrounds
    background: "#111827",
    backgroundSecondary: "#1F2937",
    backgroundTertiary: "#374151",
    
    // Surfaces (cards, inputs)
    surface: "#1F2937",
    surfaceElevated: "#374151",
    surfaceDisabled: "#374151",
    
    // Text
    text: "#F9FAFB",
    textSecondary: "#D1D5DB",
    textTertiary: "#9CA3AF",
    textInverse: "#111827",
    
    // Borders
    border: "#374151",
    borderLight: "#4B5563",
    divider: "#374151",
    
    // Interactive
    pressOverlay: "rgba(255, 255, 255, 0.1)",
    overlay: "rgba(0, 0, 0, 0.7)",
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

// Premium design tokens
export const premiumTokens = {
  background: "#F7F8FA",
  cardBorder: "#E6E8EC",
  textPrimary: "#0F172A",
  textSecondary: "#475569",
  cardShadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
} as const;

// Typography — increased for 40+ readability, mobile-first premium scale
// ~12–15% larger than previous; line heights ~1.4x for comfortable reading
export const typography = {
  // pageTitle: hero headings, event names (was 20 → 24)
  title: {
    fontSize: 24,
    fontWeight: "700" as const,
    lineHeight: 30,
    letterSpacing: -0.2,
  },
  // h1: large section headings (was 18 → 22)
  h1: {
    fontSize: 22,
    fontWeight: "700" as const,
    lineHeight: 28,
    letterSpacing: -0.15,
  },
  // h2 / sectionTitle: card headers, section labels (was 15 → 18)
  h2: {
    fontSize: 18,
    fontWeight: "700" as const,
    lineHeight: 24,
    letterSpacing: -0.08,
  },
  // body: primary readable text (was 13 → 16)
  body: {
    fontSize: 16,
    fontWeight: "500" as const,
    lineHeight: 24,
    letterSpacing: 0,
  },
  // bodyBold: emphasized body, member names (was 14 → 17)
  bodyBold: {
    fontSize: 17,
    fontWeight: "700" as const,
    lineHeight: 24,
    letterSpacing: 0,
  },
  // caption: secondary info lines (was 12.5 → 15)
  caption: {
    fontSize: 15,
    fontWeight: "500" as const,
    lineHeight: 21,
    letterSpacing: 0,
  },
  // captionBold: labels, card sub-headers (was 12.5 → 15)
  captionBold: {
    fontSize: 15,
    fontWeight: "700" as const,
    lineHeight: 21,
    letterSpacing: 0,
  },
  // small / meta: helper text, timestamps, badges (was 12 → 14)
  small: {
    fontSize: 14,
    fontWeight: "500" as const,
    lineHeight: 20,
    letterSpacing: 0,
  },
  // display: key numbers (tee times, OOM points) — 800 weight
  display: {
    fontSize: 26,
    fontWeight: "800" as const,
    lineHeight: 32,
    letterSpacing: -0.2,
  },
  // button (was 14 → 16)
  button: {
    fontSize: 16,
    fontWeight: "600" as const,
    lineHeight: 22,
    letterSpacing: 0,
  },
  buttonLarge: {
    fontSize: 18,
    fontWeight: "700" as const,
    lineHeight: 24,
    letterSpacing: 0,
  },
} as const;

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

