import { View, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { PrimaryButton } from "@/components/ui/Button";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { Toast } from "@/components/ui/Toast";
import { DashboardLeaderboardPreview } from "@/components/dashboard/DashboardLeaderboardPreview";
import { spacing } from "@/lib/ui/theme";

import { HomeAppBar, PoweredByFooter } from "./HomeChrome";
import { homeDashboardStyles as styles } from "../homeDashboardStyles";
import type { HomeSocietyDashboardVm } from "../useHomeDashboard";
import { HomeMemberSummaryStrip } from "./HomeMemberSummaryStrip";
import { HomeUnifiedNextEventPanel } from "./HomeUnifiedNextEventPanel";
import { HomePublishedTeeSheetCard } from "./HomePublishedTeeSheetCard";
import { HomePrizePoolCard } from "./HomePrizePoolCard";
import { HomeLatestResultsCard } from "./HomeLatestResultsCard";
import { HomeBirdiesLeagueCard } from "./HomeBirdiesLeagueCard";
import { HomeWeatherSnapshotCard } from "./HomeWeatherSnapshotCard";

function memberInitialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "ME";
  if (parts.length === 1) return parts[0].slice(0, 2);
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`;
}

export function HomeSocietyDashboardView(vm: HomeSocietyDashboardVm) {
  const {
    tabContentStyle,
    colors,
    loadError,
    refreshing,
    profileComplete,
    postJoinMessage,
    licenceToast,
    setLicenceToast,
    showLicenceBanner,
    requestAlreadySent,
    requestSending,
    handleRequestAccess,
    memberHasSeat,
    memberIsCaptain,
    memberDisplayName,
    handicapIndexDisplay,
    oomPointsMain,
    oomRankMain,
    showUnrankedHint,
    heroTeePreview,
    nextEventAttendance,
    myReg,
    regBusy,
    regError,
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
    memberId,
    latestResultsSnapshot,
    oomStandings,
    canOpenLeaderboard,
    formatEventDate,
    formatFormatLabel,
    formatClassification,
    formatPoints,
    prizePoolCard,
    bumpPrizePoolHomeCard,
    birdiesMyRank,
    birdiesMyTotal,
    birdiesMyEvents,
    birdiesPreviewRows,
    openBirdiesLeague,
    showBirdiesLeagueCard,
  } = vm;

  const licensed = memberHasSeat || memberIsCaptain;
  const prizePoolEventId =
    nextEvent?.prizePoolEnabled || prizePoolCard?.managerName ? nextEvent?.id ?? null : null;
  const showPrizePool =
    licensed &&
    Boolean(
      prizePoolEventId &&
        memberId &&
        (prizePoolCard?.loading || (prizePoolCard?.poolRows?.length ?? 0) > 0),
    );
  const showPublishedTeeSheet = Boolean(
    licensed &&
      nextEvent?.teeTimePublishedAt &&
      canAccessNextEventTeeSheet,
  );
  const showWeather = licensed && Boolean(nextEvent);
  const showOomPreview = licensed && canOpenLeaderboard && oomStandings.length > 0;

  return (
    <Screen
      style={{ backgroundColor: colors.backgroundSecondary }}
      contentStyle={[styles.screenContent, tabContentStyle]}
    >
      <HomeAppBar
        colors={colors}
        onOpenMore={() => pushWithBlur("/(app)/(tabs)/more")}
        onOpenProfile={() => pushWithBlur("/(app)/my-profile")}
        memberInitials={memberInitialsFromName(memberDisplayName)}
      />

      <HomeMemberSummaryStrip
        handicapIndexDisplay={handicapIndexDisplay}
        oomRankMain={oomRankMain}
        oomPointsMain={oomPointsMain}
        showUnrankedHint={showUnrankedHint}
        onEditHandicap={() => pushWithBlur("/(app)/my-profile")}
        onOpenLeaderboard={canOpenLeaderboard ? openLeaderboard : undefined}
        showOom={licensed}
      />

      <HomeUnifiedNextEventPanel
        nextEvent={nextEvent}
        nextEventIsJoint={nextEventIsJoint}
        myReg={myReg}
        nextEventAttendance={nextEventAttendance}
        formatEventDate={formatEventDate}
        formatFormatLabel={formatFormatLabel}
        formatClassification={formatClassification}
        onOpenEvent={() => nextEvent && openEvent(nextEvent.id)}
        canManage={Boolean(licensed && canAdmin)}
        interactive={licensed}
        regBusy={regBusy}
        canAdmin={canAdmin}
        showAdmin={showAdmin}
        onToggleAdmin={() => setShowAdmin((v) => !v)}
        onToggleRegistration={toggleRegistration}
        onMarkPaid={handleMarkPaid}
      />

      {regError ? (
        <InlineNotice variant="error" message={regError} style={{ marginTop: -spacing.sm }} />
      ) : null}

      {postJoinMessage ? (
        <InlineNotice variant="success" message={postJoinMessage} />
      ) : null}

      {loadError ? (
        <InlineNotice variant="error" message={loadError.message} detail={loadError.detail} />
      ) : null}
      {refreshing ? (
        <AppText variant="small" color="tertiary">
          Refreshing...
        </AppText>
      ) : null}

      {!profileComplete ? (
        <Pressable onPress={() => pushWithBlur("/(app)/my-profile")}>
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
      ) : null}

      {showLicenceBanner ? (
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
      ) : null}

      <Toast
        visible={licenceToast.visible}
        message={licenceToast.message}
        type={licenceToast.type}
        onHide={() => setLicenceToast((t) => ({ ...t, visible: false }))}
      />

      {showPublishedTeeSheet && nextEvent ? (
        <HomePublishedTeeSheetCard
          onOpenTeeSheet={() =>
            pushWithBlur({ pathname: "/(app)/event/[id]/tee-sheet", params: { id: nextEvent.id } })
          }
          teeTimePreview={heroTeePreview?.teeTime ?? null}
          groupNumber={heroTeePreview?.groupNumber ?? null}
        />
      ) : null}

      {showWeather ? (
        <HomeWeatherSnapshotCard
          nextEvent={nextEvent}
          enabled
          onOpenWeatherDetail={openWeatherTab}
          preferredTeeTimeLocal={heroTeePreview?.teeTime ?? null}
        />
      ) : null}

      {showPrizePool ? (
        <HomePrizePoolCard
          eventId={prizePoolEventId}
          myMemberId={memberId ?? undefined}
          managerName={prizePoolCard?.managerName ?? null}
          paymentInstructions={nextEvent?.prizePoolPaymentInstructions}
          poolRows={prizePoolCard?.poolRows ?? []}
          loading={prizePoolCard?.loading ?? false}
          onChanged={bumpPrizePoolHomeCard}
        />
      ) : null}

      {licensed ? (
        <HomeLatestResultsCard snapshot={latestResultsSnapshot} onOpenEvent={openEvent} />
      ) : null}

      {showOomPreview ? (
        <DashboardLeaderboardPreview
          entries={oomStandings.slice(0, 3)}
          memberId={memberId ?? undefined}
          formatPoints={(pts) => `${formatPoints(pts)} pts`}
          onOpenLeaderboard={openLeaderboard}
        />
      ) : null}

      {showBirdiesLeagueCard ? (
        <HomeBirdiesLeagueCard
          myRank={birdiesMyRank}
          myTotalBirdies={birdiesMyTotal}
          myEventsCounted={birdiesMyEvents}
          previewRows={birdiesPreviewRows}
          onOpen={openBirdiesLeague}
        />
      ) : null}

      <PoweredByFooter colors={colors} />
    </Screen>
  );
}
