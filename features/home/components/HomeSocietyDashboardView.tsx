import { View, Pressable, type PressableStateCallbackType } from "react-native";
import { Feather } from "@expo/vector-icons";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { DashboardMemberIdentityCard } from "@/components/dashboard/DashboardMemberIdentityCard";
import { DashboardHeroEventCard } from "@/components/dashboard/DashboardHeroEventCard";
import { DashboardPrizePoolHomeCard } from "@/components/dashboard/DashboardPrizePoolHomeCard";
import { DashboardPlayabilityMiniCard } from "@/components/dashboard/DashboardPlayabilityMiniCard";
import { DashboardOomTopMetricsRow } from "@/components/dashboard/DashboardOomTopMetricsRow";
import { DashboardYourStatusCard } from "@/components/dashboard/DashboardYourStatusCard";
import { DashboardUpcomingList } from "@/components/dashboard/DashboardUpcomingList";
import { DashboardLeaderboardPreview } from "@/components/dashboard/DashboardLeaderboardPreview";
import { PrimaryButton } from "@/components/ui/Button";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { Toast } from "@/components/ui/Toast";
import { spacing } from "@/lib/ui/theme";
import { pressableSurfaceStyle } from "@/lib/ui/interaction";

import { HomeAppBar, PoweredByFooter } from "./HomeChrome";
import { homeDashboardStyles as styles } from "../homeDashboardStyles";
import type { HomeSocietyDashboardVm } from "../useHomeDashboard";
import { resolvePersonDisplayName } from "@/lib/rivalryPersonName";

export function HomeSocietyDashboardView(vm: HomeSocietyDashboardVm) {
  const cardPressStyle = ({ pressed }: PressableStateCallbackType) => [
    styles.cardPressable,
    pressableSurfaceStyle({ pressed }, { reduceMotion: vm.reduceMotion, scale: "card" }),
  ];
  const {
    tabContentStyle,
    colors,
    society,
    loadError,
    refreshing,
    profileComplete,
    licenceToast,
    setLicenceToast,
    showLicenceBanner,
    requestAlreadySent,
    requestSending,
    handleRequestAccess,
    memberHasSeat,
    memberIsCaptain,
    memberDisplayName,
    logoUrl,
    roleLabel,
    handicapIndexDisplay,
    canOpenLeaderboard,
    oomPointsMain,
    oomRankMain,
    showUnrankedHint,
    heroTeePreview,
    myReg,
    regBusy,
    canAdmin,
    showAdmin,
    setShowAdmin,
    toggleRegistration,
    handleMarkPaid,
    pushWithBlur,
    openEvent,
    openLeaderboard,
    openWeatherTab,
    nextEvent,
    nextEventIsJoint,
    canAccessNextEventTeeSheet,
    societyId,
    memberId,
    userId,
    events,
    upcomingAfterNext,
    recentActivityRows,
    oomStandings,
    activeSinbook,
    formatEventDate,
    formatFormatLabel,
    formatClassification,
    formatShortDate,
    formatPoints,
    router,
    prizePoolCard,
    bumpPrizePoolHomeCard,
  } = vm;

  return (
    <Screen
      style={{ backgroundColor: colors.backgroundSecondary }}
      contentStyle={[styles.screenContent, tabContentStyle]}
    >
      <HomeAppBar
        colors={colors}
        onOpenSettings={() => pushWithBlur("/(app)/(tabs)/settings")}
      />

      <DashboardMemberIdentityCard
        logoUrl={logoUrl}
        societyName={String(society?.name ?? "Society")}
        memberName={memberDisplayName}
        roleLabel={roleLabel}
        handicapIndexDisplay={handicapIndexDisplay}
        onEditHandicap={() => pushWithBlur("/(app)/my-profile")}
      />

      {loadError && (
        <InlineNotice
          variant="error"
          message={loadError.message}
          detail={loadError.detail}
          style={{ marginBottom: spacing.base }}
        />
      )}
      {refreshing && (
        <AppText variant="small" color="tertiary" style={{ marginBottom: spacing.xs }}>
          Refreshing...
        </AppText>
      )}

      {/* ================================================================== */}
      {/* COMPLETE PROFILE BANNER                                            */}
      {/* ================================================================== */}
      {!profileComplete && (
        <Pressable onPress={() => pushWithBlur("/(app)/my-profile")} style={cardPressStyle}>
          <AppCard style={[styles.premiumCard, styles.profileBanner, { borderColor: colors.info + "40" }]}>
            <View style={styles.profileBannerRow}>
              <View style={[styles.profileBannerIcon, { backgroundColor: colors.info + "18" }]}>
                <Feather name="user" size={20} color={colors.info} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyBold">Complete your profile</AppText>
                <AppText variant="small" color="secondary" style={{ marginTop: 2 }}>
                  Add your name and details to get the most out of the app.
                </AppText>
              </View>
              <Feather name="chevron-right" size={18} color={colors.info} />
            </View>
          </AppCard>
        </Pressable>
      )}

      {/* ================================================================== */}
      {/* LICENCE BANNER — non-captain members without a seat                */}
      {/* ================================================================== */}
      {showLicenceBanner && (
        <AppCard style={[styles.premiumCard, styles.licenceBanner, { borderColor: colors.warning + "40" }]}>
          <View style={styles.licenceBannerHeader}>
            <View style={[styles.licenceBannerIcon, { backgroundColor: colors.warning + "18" }]}>
              <Feather name="alert-circle" size={20} color={colors.warning} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="bodyBold">Licence required</AppText>
              <AppText variant="small" color="secondary" style={{ marginTop: 2 }}>
                {requestAlreadySent
                  ? "Your request has been sent. Waiting for your Captain to assign a licence."
                  : "Your Captain hasn\u2019t assigned you a licence yet."}
              </AppText>
            </View>
          </View>
          <View style={styles.licenceBannerActions}>
            {!requestAlreadySent ? (
              <PrimaryButton
                onPress={handleRequestAccess}
                loading={requestSending}
                disabled={requestSending}
                size="sm"
              >
                Request access
              </PrimaryButton>
            ) : (
              <View style={[styles.requestSentBadge, { backgroundColor: colors.success + "14" }]}>
                <Feather name="check-circle" size={14} color={colors.success} />
                <AppText variant="small" style={{ color: colors.success, marginLeft: 4 }}>
                  Request sent
                </AppText>
              </View>
            )}
          </View>
        </AppCard>
      )}

      {/* Licence Toast */}
      <Toast
        visible={licenceToast.visible}
        message={licenceToast.message}
        type={licenceToast.type}
        onHide={() => setLicenceToast((t) => ({ ...t, visible: false }))}
      />

      {/* ================================================================== */}
      {/* GATED CONTENT — only for licensed members / captains               */}
      {/* ================================================================== */}
      {(memberHasSeat || memberIsCaptain) && (<>

      <DashboardOomTopMetricsRow
        oomRankMain={oomRankMain}
        showUnrankedHint={showUnrankedHint}
        oomPointsMain={oomPointsMain}
        canOpenLeaderboard={canOpenLeaderboard}
        onOpenLeaderboard={openLeaderboard}
      />

      <DashboardHeroEventCard
        nextEvent={nextEvent}
        nextEventIsJoint={nextEventIsJoint}
        myReg={myReg}
        myTeeTimeInfo={heroTeePreview}
        canAccessNextEventTeeSheet={canAccessNextEventTeeSheet}
        formatEventDate={formatEventDate}
        formatFormatLabel={formatFormatLabel}
        formatClassification={formatClassification}
        onOpenEvent={() => nextEvent && openEvent(nextEvent.id)}
        onOpenTeeSheet={() =>
          nextEvent && router.push({ pathname: "/(app)/event/[id]/tee-sheet", params: { id: nextEvent.id } })
        }
      />

      {nextEvent?.prizePoolEnabled && prizePoolCard && memberId ? (
        <DashboardPrizePoolHomeCard
          eventId={nextEvent.id}
          myMemberId={memberId}
          managerName={prizePoolCard.managerName}
          paymentInstructions={nextEvent.prizePoolPaymentInstructions}
          entry={prizePoolCard.entry}
          loading={prizePoolCard.loading}
          onChanged={bumpPrizePoolHomeCard}
        />
      ) : null}

      {nextEvent ? (
        <DashboardYourStatusCard
          nextEvent={nextEvent}
          nextEventIsJoint={nextEventIsJoint}
          myReg={myReg}
          regBusy={regBusy}
          canAdmin={canAdmin}
          showAdmin={showAdmin}
          onToggleAdmin={() => setShowAdmin((v) => !v)}
          onToggleIn={() => toggleRegistration("in")}
          onToggleOut={() => toggleRegistration("out")}
          onMarkPaid={handleMarkPaid}
        />
      ) : null}

      <DashboardPlayabilityMiniCard
        nextEvent={nextEvent}
        enabled={!!societyId && !!memberId}
        onOpenWeatherTab={openWeatherTab}
        preferredTeeTimeLocal={heroTeePreview?.teeTime ?? null}
      />

      {/* Tee times published — after priority cards so OOM stays directly under identity */}
      {nextEvent?.teeTimePublishedAt && canAccessNextEventTeeSheet && (() => {
        const publishedAt = new Date(nextEvent.teeTimePublishedAt!);
        const daysSince = (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince > 7) return null;
        return (
          <Pressable
            onPress={() => router.push({ pathname: "/(app)/event/[id]/tee-sheet", params: { id: nextEvent.id } })}
            style={cardPressStyle}
          >
            <View style={[styles.notificationBanner, { backgroundColor: colors.success + "15", borderColor: colors.success + "30" }]}>
              <Feather name="bell" size={16} color={colors.success} />
              <View style={{ flex: 1 }}>
                <AppText variant="bodyBold" style={{ color: colors.success }}>
                  Tee times now available for this event
                </AppText>
                <AppText variant="small" color="secondary">
                  Tap to view your tee time and full tee sheet
                </AppText>
              </View>
              <Feather name="chevron-right" size={16} color={colors.success} />
            </View>
          </Pressable>
        );
      })()}

      <DashboardUpcomingList
        events={upcomingAfterNext}
        formatShortDate={formatShortDate}
        onOpenEvent={openEvent}
      />

      {oomStandings.length > 0 && canOpenLeaderboard ? (
        <DashboardLeaderboardPreview
          entries={oomStandings.slice(0, 3)}
          memberId={memberId}
          formatPoints={(pts) => `${formatPoints(pts)} pts`}
          onOpenLeaderboard={openLeaderboard}
        />
      ) : null}

      {/* ================================================================== */}
      {/* E) RECENT ACTIVITY                                                 */}
      {/* ================================================================== */}
      {recentActivityRows.length > 0 && (
        <View>
          <AppText variant="h2" style={styles.sectionTitle}>Recent Activity</AppText>

          {recentActivityRows.map((row) => (
            <Pressable key={row.eventId} onPress={() => openEvent(row.eventId)} style={cardPressStyle}>
              <AppCard style={[styles.recentCard, styles.premiumCard]}>
                <View style={styles.recentRow}>
                  <View style={[styles.recentDateBadge, { backgroundColor: colors.backgroundTertiary }]}>
                    <AppText variant="captionBold" color="primary">
                      {row.dateShort}
                    </AppText>
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyBold" numberOfLines={1}>{row.name}</AppText>
                    <AppText variant="small" style={{ color: row.statusColor }}>{row.statusText}</AppText>
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.textTertiary} />
                </View>
              </AppCard>
            </Pressable>
          ))}
        </View>
      )}

      {/* Empty state if absolutely no events */}
      {events.length === 0 && !nextEvent && recentActivityRows.length === 0 && (
        <AppCard style={[styles.premiumCard, { marginTop: spacing.sm }]}>
          <View style={styles.emptyState}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.backgroundTertiary }]}>
              <Feather name="calendar" size={24} color={colors.textTertiary} />
            </View>
            <AppText variant="body" color="secondary" style={{ textAlign: "center" }}>
              No events yet. Your society captain will create events soon.
            </AppText>
          </View>
        </AppCard>
      )}

      {/* ================================================================== */}
      {/* F) SINBOOK TEASER CARD                                             */}
      {/* ================================================================== */}
      <Pressable onPress={() => pushWithBlur("/(app)/(tabs)/sinbook")} style={cardPressStyle}>
        <AppCard style={styles.premiumCard}>
          <View style={styles.cardTitleRow}>
            <Feather name="zap" size={16} color={colors.primary} />
            <AppText variant="captionBold" color="primary">Rivalries</AppText>
          </View>
          {activeSinbook ? (
            <View style={{ marginTop: spacing.xs }}>
              <AppText variant="bodyBold" numberOfLines={1}>{activeSinbook.title?.trim() || "Rivalry"}</AppText>
              <AppText variant="caption" color="secondary">
                {(() => {
                  if (!userId) return "Awaiting opponent";
                  const opp = activeSinbook.participants.find((p) => p.user_id !== userId && p.status === "accepted");
                  if (!opp) return "Awaiting opponent";
                  return resolvePersonDisplayName({
                    ...activeSinbook.rivalryNameHintsByUserId?.[opp.user_id],
                    participantDisplayName: opp.display_name,
                  }).name;
                })()}
              </AppText>
            </View>
          ) : (
            <AppText variant="body" color="secondary" style={{ marginTop: spacing.xs }}>
              Start a rivalry with a mate. Track head-to-head results all season — for fun, not wagers.
            </AppText>
          )}
          <View style={styles.chevronHint}>
            <AppText variant="small" color="tertiary">
              {activeSinbook ? "View rivalry" : "Get started"}
            </AppText>
            <Feather name="chevron-right" size={16} color={colors.textTertiary} />
          </View>
        </AppCard>
      </Pressable>

      </>)}

      <PoweredByFooter colors={colors} />
    </Screen>  );
}
