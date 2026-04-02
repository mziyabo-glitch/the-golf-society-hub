import { StyleSheet } from "react-native";
import { spacing } from "@/lib/ui/theme";

/** Matches home dashboard premium cards — use with theme borderColor + backgroundColor */
export const DASHBOARD_CARD_RADIUS = 22;

const shadow = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.06,
  shadowRadius: 12,
  elevation: 3,
} as const;

export const dashboardShell = StyleSheet.create({
  /** Card surface without outer vertical spacing — use inside row or custom wrappers */
  cardBase: {
    borderRadius: DASHBOARD_CARD_RADIUS,
    borderWidth: 1,
    padding: spacing.md,
    ...shadow,
  },
  card: {
    borderRadius: DASHBOARD_CARD_RADIUS,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    marginBottom: spacing.md,
    ...shadow,
  },
  sectionEyebrow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
});
