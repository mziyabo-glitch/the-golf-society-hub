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
    backgroundSecondary: "#F9FAFB",
    backgroundTertiary: "#F3F4F6",
    
    // Surfaces (cards, inputs)
    surface: "#FFFFFF",
    surfaceElevated: "#FFFFFF",
    surfaceDisabled: "#F3F4F6",
    
    // Text
    text: "#111827",
    textSecondary: "#6B7280",
    textTertiary: "#9CA3AF",
    textInverse: "#FFFFFF",
    
    // Borders
    border: "#E5E7EB",
    borderLight: "#F3F4F6",
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

// Spacing scale (4px base unit)
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  "2xl": 32,
  "3xl": 48,
} as const;

// Border radius
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
} as const;

// Typography
export const typography = {
  title: {
    fontSize: 34,
    fontWeight: "800" as const,
    lineHeight: 40,
    letterSpacing: -0.5,
  },
  h1: {
    fontSize: 28,
    fontWeight: "700" as const,
    lineHeight: 34,
    letterSpacing: -0.3,
  },
  h2: {
    fontSize: 22,
    fontWeight: "600" as const,
    lineHeight: 28,
    letterSpacing: -0.2,
  },
  body: {
    fontSize: 16,
    fontWeight: "400" as const,
    lineHeight: 24,
    letterSpacing: 0,
  },
  bodyBold: {
    fontSize: 16,
    fontWeight: "600" as const,
    lineHeight: 24,
    letterSpacing: 0,
  },
  caption: {
    fontSize: 14,
    fontWeight: "400" as const,
    lineHeight: 20,
    letterSpacing: 0,
  },
  captionBold: {
    fontSize: 14,
    fontWeight: "600" as const,
    lineHeight: 20,
    letterSpacing: 0,
  },
  small: {
    fontSize: 12,
    fontWeight: "400" as const,
    lineHeight: 16,
    letterSpacing: 0,
  },
  button: {
    fontSize: 16,
    fontWeight: "600" as const,
    lineHeight: 24,
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

// Button heights
export const buttonHeights = {
  sm: 36,
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
  try {
    const { STORAGE_KEYS } = await import("@/lib/storage");
    const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.THEME_MODE);
    if (stored === "light" || stored === "dark") {
      setThemeMode(stored);
      return stored;
    }
  } catch (error) {
    console.error("[Theme] Error loading theme from storage:", error);
  }
  setThemeMode("light"); // Default to light
  return "light";
}

/**
 * Save theme to storage
 */
export async function saveThemeToStorage(mode: ThemeMode): Promise<void> {
  try {
    const { STORAGE_KEYS } = await import("@/lib/storage");
    const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
    await AsyncStorage.setItem(STORAGE_KEYS.THEME_MODE, mode);
    setThemeMode(mode);
  } catch (error) {
    console.error("[Theme] Error saving theme to storage:", error);
  }
}

