/**
 * Visual tokens for the premium Free Play / scorecard experience.
 * Use alongside `getColors()` for semantic colors that already exist in the app theme.
 */

import { radius, spacing } from "@/lib/ui/theme";

export const freePlayPremium = {
  /** Hero / flagship surfaces */
  heroRadius: radius.lg,
  cardRadius: radius.md,
  sectionGap: spacing.lg,
  /** Soft elevation for “card stack” feel */
  cardShadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  heroShadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
  },
  /** Deep accents — pair with theme `primary` / `background` */
  accentDeepGreen: "#0d3b2c",
  accentNavy: "#0f1f2e",
  creamSurface: "#f6f3ee",
} as const;
