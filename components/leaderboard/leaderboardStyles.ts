import { StyleSheet } from "react-native";
import { getColors, premiumTokens, spacing, type TypographyTokens } from "@/lib/ui/theme";

export function makeLeaderboardStyles(
  typography: TypographyTokens,
  colors: ReturnType<typeof getColors>,
) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      padding: spacing.md,
    },
    centered: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },

    // Header
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 16,
    },
    headerTrailing: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      flexShrink: 0,
    },
    shareButton: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: colors.surfaceElevated,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: premiumTokens.cardShadow.shadowColor,
      shadowOffset: premiumTokens.cardShadow.shadowOffset,
      shadowOpacity: premiumTokens.cardShadow.shadowOpacity * 0.85,
      shadowRadius: premiumTokens.cardShadow.shadowRadius,
      elevation: premiumTokens.cardShadow.elevation,
    },

    // Title
    titleSection: {
      marginBottom: spacing.lg,
    },
    seasonText: {
      marginTop: spacing.xs,
    },
    tabHint: {
      marginTop: spacing.sm,
    },

    // OOM segment row (Leaderboard | Event Points + Honour)
    oomSegmentRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginBottom: spacing.lg,
    },
    oomSegmentControlWrap: {
      flex: 1,
      minWidth: 0,
    },
    honourLink: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      flexShrink: 0,
    },

    // Tabs (legacy inline — kept for any future use)
    tabContainer: {
      flexDirection: "row",
      backgroundColor: "rgba(255, 255, 255, 0.7)",
      borderRadius: 12,
      padding: 4,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: "rgba(0, 0, 0, 0.05)",
    },
    tab: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 12,
      borderRadius: 10,
    },
    tabActive: {
      backgroundColor: colors.surfaceElevated,
      shadowColor: premiumTokens.cardShadow.shadowColor,
      shadowOffset: premiumTokens.cardShadow.shadowOffset,
      shadowOpacity: premiumTokens.cardShadow.shadowOpacity * 0.85,
      shadowRadius: premiumTokens.cardShadow.shadowRadius,
      elevation: premiumTokens.cardShadow.elevation,
    },
    tabText: {
      fontSize: typography.button.fontSize,
      fontWeight: "600",
      color: colors.textTertiary,
    },
    tabTextActive: {
      color: colors.primary,
    },

    // Empty state
    emptyCard: {
      marginTop: 0,
    },

    // Podium
    podiumContainer: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "flex-end",
      marginBottom: 24,
      paddingHorizontal: 8,
    },
    podiumPosition: {
      flex: 1,
      alignItems: "center",
      maxWidth: 110,
    },
    podiumCard: {
      width: "100%",
      padding: 12,
      alignItems: "center",
      marginBottom: -8,
      zIndex: 1,
    },
    podiumFirst: {
      paddingVertical: 16,
    },
    podiumSecond: {},
    podiumThird: {},
    podiumMedal: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: "rgba(0, 0, 0, 0.03)",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 8,
    },
    podiumMedalGold: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.highlightMuted,
    },
    podiumMedalText: {
      fontSize: typography.h1.fontSize,
    },
    podiumName: {
      fontSize: typography.small.fontSize,
      fontWeight: "600",
      color: colors.textSecondary,
      marginBottom: 6,
      textAlign: "center",
      lineHeight: typography.small.lineHeight,
      minHeight: 32,
      paddingHorizontal: 4,
    },
    podiumPoints: {
      fontSize: typography.h1.fontSize,
      fontWeight: "800",
      color: colors.primary,
      fontVariant: ["tabular-nums"],
    },
    podiumPointsGold: {
      fontSize: typography.display.fontSize,
      color: colors.highlight,
    },
    podiumPtsLabel: {
      fontSize: typography.small.fontSize,
      color: colors.textTertiary,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    podiumBase: {
      width: "90%",
      borderRadius: 4,
      backgroundColor: colors.border,
    },
    podiumBaseFirst: {
      height: 48,
      backgroundColor: colors.highlight,
    },
    podiumBaseSecond: {
      height: 32,
      backgroundColor: colors.divider,
    },
    podiumBaseThird: {
      height: 20,
      backgroundColor: colors.textTertiary,
    },

    // Field
    fieldCard: {
      padding: 16,
      marginBottom: 16,
    },
    fieldTitle: {
      fontSize: typography.captionBold.fontSize,
      fontWeight: "700",
      color: colors.textTertiary,
      textTransform: "uppercase",
      letterSpacing: 1,
      marginBottom: 12,
    },
    fieldRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 14,
      minHeight: 48,
      borderBottomWidth: 1,
      borderBottomColor: "rgba(0, 0, 0, 0.04)",
    },
    fieldPosition: {
      width: 28,
      fontSize: typography.button.fontSize,
      fontWeight: "600",
      color: colors.textSecondary,
      textAlign: "center",
    },
    trendContainer: {
      width: 20,
      alignItems: "center",
      marginRight: 8,
    },
    fieldName: {
      flex: 1,
      fontSize: typography.body.fontSize,
      fontWeight: "500",
      color: colors.text,
      lineHeight: typography.body.lineHeight,
      paddingRight: 8,
    },
    fieldEvents: {
      width: 32,
      fontSize: typography.body.fontSize,
      color: colors.textTertiary,
      textAlign: "center",
    },
    fieldPoints: {
      width: 50,
      fontSize: typography.bodyBold.fontSize,
      fontWeight: "700",
      color: colors.primary,
      textAlign: "right",
      fontVariant: ["tabular-nums"],
    },

    // Accordion (Results Log)
    accordionContainer: {
      gap: 12,
    },
    accordionCard: {
      padding: 0,
      overflow: "hidden",
    },
    accordionHeader: {
      flexDirection: "row",
      alignItems: "center",
      padding: 16,
    },
    accordionEventInfo: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    accordionEventBadge: {
      width: 40,
      height: 40,
      borderRadius: 10,
      backgroundColor: colors.primary + "1A",
      alignItems: "center",
      justifyContent: "center",
    },
    accordionEventNumber: {
      fontSize: typography.body.fontSize,
      fontWeight: "700",
      color: colors.primary,
    },
    accordionEventDetails: {
      flex: 1,
    },
    accordionEventName: {
      fontSize: typography.body.fontSize,
      fontWeight: "600",
      color: colors.text,
      marginBottom: 2,
      lineHeight: typography.body.lineHeight,
    },
    accordionEventMeta: {
      fontSize: typography.small.fontSize,
      color: colors.textTertiary,
    },
    accordionChevron: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: "rgba(0, 0, 0, 0.03)",
      alignItems: "center",
      justifyContent: "center",
    },
    accordionContent: {
      borderTopWidth: 1,
      borderTopColor: "rgba(0, 0, 0, 0.06)",
      backgroundColor: "rgba(249, 250, 251, 0.5)",
    },
    accordionTableHeader: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: "rgba(0, 0, 0, 0.04)",
      backgroundColor: "rgba(0, 0, 0, 0.02)",
    },
    accordionColHeader: {
      fontSize: typography.small.fontSize,
      fontWeight: "700",
      color: colors.textTertiary,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    accordionColPos: {
      width: 40,
      textAlign: "center",
    },
    accordionColPlayer: {
      flex: 1,
      paddingRight: 8,
    },
    accordionColScore: {
      width: 52,
      textAlign: "center",
    },
    accordionColOom: {
      width: 52,
      textAlign: "right",
    },
    accordionRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: "rgba(0, 0, 0, 0.04)",
      minHeight: 48,
    },
    accordionRowAlt: {
      backgroundColor: "rgba(255, 255, 255, 0.45)",
    },
    accordionRowLast: {
      borderBottomWidth: 0,
    },
    accordionPosition: {
      width: 40,
      alignItems: "center",
    },
    accordionPositionText: {
      fontSize: typography.button.fontSize,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    accordionPositionMedal: {
      fontSize: typography.body.fontSize,
    },
    accordionPlayerName: {
      flex: 1,
      fontSize: typography.body.fontSize,
      fontWeight: "500",
      color: colors.textSecondary,
      paddingRight: 8,
      lineHeight: typography.body.lineHeight,
    },
    accordionScore: {
      width: 52,
      fontSize: typography.body.fontSize,
      fontWeight: "600",
      color: colors.text,
      textAlign: "center",
      fontVariant: ["tabular-nums"],
    },
    accordionPoints: {
      width: 52,
      fontSize: typography.body.fontSize,
      fontWeight: "700",
      color: colors.primary,
      textAlign: "right",
      fontVariant: ["tabular-nums"],
    },

    // Footer
    footer: {
      alignItems: "center",
      marginTop: 24,
      paddingTop: 16,
    },
    shareModalRoot: {
      flex: 1,
      justifyContent: "center",
      padding: spacing.md,
      backgroundColor: "rgba(17, 24, 39, 0.5)",
    },
    shareModalBackdrop: {
      ...StyleSheet.absoluteFillObject,
    },
    shareModalCard: {
      maxWidth: 400,
      width: "100%",
      alignSelf: "center",
      zIndex: 1,
      marginBottom: 0,
    },
    shareModalBody: {
      marginTop: spacing.sm,
      marginBottom: spacing.lg,
    },
    shareModalActions: {
      gap: spacing.sm,
    },
  });
}

export type LeaderboardStyles = ReturnType<typeof makeLeaderboardStyles>;
