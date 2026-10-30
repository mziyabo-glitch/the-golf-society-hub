/**
 * React wiring for persisted theme: loads preference on startup, re-renders the tree when
 * preference or system appearance changes (for "system" mode).
 *
 * Startup: web uses sync localStorage peek (`runSyncThemeHydration`) before first paint; native
 * keeps the splash screen up (`lib/ui/themeSplash.ts` + `hideAsync` after storage resolves).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Appearance, Platform } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import {
  getResolvedPaletteMode,
  getThemePreference,
  resolveInitialTheme,
  runSyncThemeHydration,
  setStoredTheme,
  subscribeThemePreference,
  type ThemePaletteMode,
  type ThemePreference,
} from "@/lib/ui/theme";

type ThemeContextValue = {
  /** User-facing choice (light / dark / system). */
  preference: ThemePreference;
  /** Resolved palette key for colors.light / colors.dark. */
  resolved: ThemePaletteMode;
  /** Persist and apply; updates UI immediately. */
  setPreference: (next: ThemePreference) => Promise<void>;
  /**
   * True after the first storage read has finished (success or fallback).
   * Root shell should treat bootstrap UI as “safe to show” only when this is true.
   */
  ready: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const syncHydrationRan = useRef(false);
  if (!syncHydrationRan.current) {
    syncHydrationRan.current = true;
    runSyncThemeHydration();
  }

  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [ready, setReady] = useState(false);

  const preference = getThemePreference();
  const resolved = getResolvedPaletteMode();

  useEffect(() => {
    return subscribeThemePreference(() => bump());
  }, []);

  useEffect(() => {
    let cancelled = false;
    void resolveInitialTheme().finally(() => {
        if (cancelled) return;
        setReady(true);
        if (Platform.OS !== "web") {
          requestAnimationFrame(() => {
            void SplashScreen.hideAsync();
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const sub = Appearance.addChangeListener(() => {
      if (getThemePreference() === "system") bump();
    });
    return () => sub.remove();
  }, []);

  const setPreference = useCallback(async (next: ThemePreference) => {
    await setStoredTheme(next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      resolved,
      setPreference,
      ready,
    }),
    [preference, resolved, setPreference, ready],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      preference: getThemePreference(),
      resolved: getResolvedPaletteMode(),
      setPreference: setStoredTheme,
      ready: true,
    };
  }
  return ctx;
}

export type { ThemePreference, ThemePaletteMode };
