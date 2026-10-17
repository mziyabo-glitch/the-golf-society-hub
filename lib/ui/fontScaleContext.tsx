/**
 * Global text size scale for accessibility (persisted). Wraps the app so AppText and
 * components using useScaledTypography() stay consistent.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { scaleTypography } from "@/lib/ui/theme";
import {
  loadTextSizeLevel,
  saveTextSizeLevel,
  TEXT_SIZE_MULTIPLIERS,
  type TextSizeLevel,
} from "@/lib/ui/textSizePreference";

type FontScaleContextValue = {
  level: TextSizeLevel;
  multiplier: number;
  setLevel: (level: TextSizeLevel) => Promise<void>;
  /** Typography tokens scaled for the current level — use in AppText via useFontScale(). */
  typography: ReturnType<typeof scaleTypography>;
  ready: boolean;
};

const FontScaleContext = createContext<FontScaleContextValue | null>(null);

export function FontScaleProvider({ children }: { children: ReactNode }) {
  const [level, setLevelState] = useState<TextSizeLevel>("default");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    loadTextSizeLevel().then((l) => {
      if (mounted) {
        setLevelState(l);
        setReady(true);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const multiplier = TEXT_SIZE_MULTIPLIERS[level];

  const typography = useMemo(() => scaleTypography(multiplier), [multiplier]);

  const setLevel = useCallback(async (next: TextSizeLevel) => {
    setLevelState(next);
    await saveTextSizeLevel(next);
  }, []);

  const value = useMemo<FontScaleContextValue>(
    () => ({
      level,
      multiplier,
      setLevel,
      typography,
      ready,
    }),
    [level, multiplier, setLevel, typography, ready],
  );

  return <FontScaleContext.Provider value={value}>{children}</FontScaleContext.Provider>;
}

/** Returns scaled typography; falls back to base theme if provider is missing. */
export function useFontScale(): FontScaleContextValue {
  const ctx = useContext(FontScaleContext);
  if (!ctx) {
    return {
      level: "default",
      multiplier: 1,
      setLevel: async () => {},
      typography: scaleTypography(1),
      ready: true,
    };
  }
  return ctx;
}

/** For StyleSheet.create in components: scaled tokens that update when text size changes. */
export function useScaledTypography() {
  return useFontScale().typography;
}

export type { TextSizeLevel };
