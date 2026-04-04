import { StyleSheet } from "react-native";
import { colors, spacing, radius, typography } from "@/lib/ui/theme";

export const personalHomeStyles = StyleSheet.create({
  welcomeSection: {
    alignItems: "center",
    paddingVertical: spacing.xl,
    marginBottom: spacing.xs,
  },
  welcomeShield: {
    width: 50,
    height: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  welcomeShieldIcon: {
    width: 32,
    height: 32,
  },
  welcomeTitle: {
    textAlign: "center",
    marginBottom: spacing.xs,
  },
  welcomeSubtitle: {
    textAlign: "center",
    paddingHorizontal: spacing.lg,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  comingSoonBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  nudgeCard: {
    borderWidth: 1,
    marginTop: spacing.md,
  },
  nudgeHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  nudgeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  nudgeActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  nudgeSecondary: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
  },
  nudgeDismiss: {
    alignSelf: "center",
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
  },
});

export const homeDashboardStyles = StyleSheet.create({
  screenContent: {
    backgroundColor: "transparent",
    paddingTop: spacing.md,
    gap: spacing.base,
  },
  premiumCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  cardPressable: {
    borderRadius: 22,
  },

  // Premium two-tier header
  appBarTier: {
    minHeight: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.xs,
  },
  appBarSpacer: {
    width: 30,
    height: 30,
  },
  appBarAction: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  appBarActionPressed: {
    opacity: 0.75,
  },
  poweredByWrap: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  poweredByIcon: {
    width: 14,
    height: 14,
    opacity: 0.55,
  },
  poweredByText: {
    opacity: 0.8,
  },
  societyHeroCard: {
    alignItems: "center",
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.base,
  },
  heroLogoFrame: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  heroLogoImage: {
    width: 52,
    height: 52,
  },
  heroSocietyName: {
    marginTop: spacing.sm,
    textAlign: "center",
    fontWeight: "700",
  },
  heroSecondaryText: {
    marginTop: 4,
    textAlign: "center",
  },
  headerDivider: {
    height: 1,
    opacity: 0.7,
    marginTop: spacing.xs,
  },
  atGlanceRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  statTilePressable: {
    flex: 1,
  },
  statTileCard: {
    marginBottom: 0,
    minHeight: 118,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  statTileIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  statTileTextWrap: {
    minHeight: 62,
    justifyContent: "space-between",
  },
  statTileValue: {
    marginTop: 2,
    marginBottom: 1,
  },

  // Profile banner
  profileBanner: {
    borderWidth: 1,
    marginBottom: spacing.base,
  },
  profileBannerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  profileBannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },

  // Licence banner
  licenceBanner: {
    borderWidth: 1,
    marginBottom: spacing.base,
  },
  licenceBannerHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  licenceBannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  licenceBannerActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  requestSentBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },

  // Notification banner
  notificationBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.base,
  },

  // Weather card
  weatherCard: {
    marginBottom: spacing.xs,
  },
  weatherHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  weatherIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },

  // Card title row
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: 2,
  },

  // Next Event Card
  nextEventCard: {
    marginBottom: spacing.md,
  },
  nextEventTitle: {
    marginTop: spacing.xs,
  },
  nextEventMeta: {
    marginTop: 4,
  },
  regRow: {
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
    borderTopWidth: 1,
  },
  regStatusWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  regBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  regActions: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  regBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  paidPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  paidPillText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: typography.small.fontSize,
  },
  nextEventDetails: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.sm,
    alignItems: "center",
  },
  jointChipHome: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  oomPremiumPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    backgroundColor: colors.light.highlightMuted,
    borderWidth: 1,
    borderColor: `${colors.light.highlight}4D`,
    marginTop: spacing.sm,
  },
  oomPremiumPillText: {
    color: colors.light.highlight,
    fontWeight: "600",
    marginLeft: 4,
  },
  oomBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    marginTop: spacing.sm,
  },
  yourTeeTimeCard: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  yourTeeTimeLabel: {
    marginBottom: 4,
  },
  yourTeeTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  groupPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  playingWithRow: {
    marginTop: spacing.xs,
  },
  viewTeeSheetBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: spacing.sm,
  },
  teeTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
  },

  // Chevron hint
  chevronHint: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    marginTop: spacing.md,
  },

  // Season Snapshot
  snapshotGrid: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.md,
  },
  snapshotItem: {
    flex: 1,
    alignItems: "center",
  },
  snapshotDivider: {
    width: 1,
    height: 36,
  },

  // OOM Teaser
  oomRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  oomRank: {
    width: 28,
    textAlign: "center",
  },
  pinnedSeparator: {
    borderTopWidth: 1,
    borderStyle: "dashed",
    marginVertical: 2,
  },

  // Recent Activity
  sectionTitle: {
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  recentCard: {
    marginBottom: spacing.sm,
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  recentDateBadge: {
    width: 50,
    height: 50,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },

  // Empty state
  emptyState: {
    alignItems: "center",
    paddingVertical: spacing.xl,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },

});