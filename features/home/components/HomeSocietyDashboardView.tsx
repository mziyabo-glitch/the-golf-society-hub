import { View, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { PrimaryButton } from "@/components/ui/Button";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { Toast } from "@/components/ui/Toast";
import { spacing } from "@/lib/ui/theme";

import { HomeAppBar, PoweredByFooter } from "./HomeChrome";
import { homeDashboardStyles as styles } from "../homeDashboardStyles";
import type { HomeSocietyDashboardVm } from "../useHomeDashboard";
import { HomeIdentityHeroCard } from "./HomeIdentityHeroCard";
import { HomeCurrentSocietySwitcherCard } from "@/components/SocietySwitcher";
import { HomeEventAttendanceCard } from "./HomeEventAttendanceCard";
import { HomeNextEventCard } from "./HomeNextEventCard";
import { HomePrizePoolCard } from "./HomePrizePoolCard";
import { HomeLatestResultsCard } from "./HomeLatestResultsCard";
import { HomeOomSnapshotCard } from "./HomeOomSnapshotCard";
import { HomeBirdiesLeagueCard } from "./HomeBirdiesLeagueCard";
import { HomeWeatherSnapshotCard } from "./HomeWeatherSnapshotCard";

export function HomeSocietyDashboardView(vm: HomeSocietyDashboardVm) {
  const {
    tabContentStyle,
    colors,
    society,
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
    logoUrl,
    roleLabel,
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
    societyId,
    memberId,
    events,
    latestResultsSnapshot,
    oomStandings,
    canOpenLeaderboard,
    formatEventDate,
    formatFormatLabel,
    formatClassification,
    formatPoints,
    prizePoolCard,
    bumpPrizePoolHomeCard,
    birdiesLeague,
    birdiesMyRank,
    birdiesMyTotal,
    birdiesMyEvents,
    birdiesPreviewRows,
    openBirdiesLeague,
  } = vm;

  return (
    <Screen
      style={{ backgroundColor: colors.backgroundSecondary }}
      contentStyle={[styles.screenContent, tabContentStyle]}
    >
      <HomeAppBar colors={colors} onOpenMore={() => pushWithBlur("/(app)/(tabs)/more")} />

      <HomeCurrentSocietySwitcherCard />

      <AppText variant="captionBold" color="primary" style={rhythmStyles.sectionEyebrow}>
        Next event
      </AppText>
      <HomeNextEventCard
        nextEvent={nextEvent}
        nextEventIsJoint={nextEventIsJoint}
        myReg={myReg}
        formatEventDate={formatEventDate}
        formatFormatLabel={formatFormatLabel}
        formatClassification={formatClassification}
        onOpenEvent={() => nextEvent && openEvent(nextEvent.id)}
        canManage={Boolean((memberHasSeat || memberIsCaptain) && canAdmin)}
      />

      {postJoinMessage ? (
        <InlineNotice
          variant="success"
          message={postJoinMessage}
          style={{ marginBottom: spacing.sm }}
        />
      ) : null}

      <HomeIdentityHeroCard
        logoUrl={logoUrl}
        societyName={String(society?.name ?? "Society")}
        memberName={memberDisplayName}
        roleLabel={roleLabel}
        handicapIndexDisplay={handicapIndexDisplay}
        oomRankMain={oomRankMain}
        oomPointsMain={oomPointsMain}
        showUnrankedHint={showUnrankedHint}
        onEditHandicap={() => pushWithBlur("/(app)/my-profile")}
      />

      <AppText variant="small" color="secondary" style={rhythmStyles.brandLine}>
        Event Results, Prize Pools, and Season Standings — all in one place.
      </AppText>

      <Pressable onPress={() => pushWithBlur("/(app)/free-play")}>
        <AppCard style={[styles.premiumCard, { borderColor: colors.primary + "33" }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <View style={{ backgroundColor: colors.primary + "18", borderRadius: 12, padding: 10 }}>
              <Feather name="flag" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText variant="bodyBold">Free Play Scorecard</AppText>
              <AppText variant="small" color="secondary" numberOfLines={2}>
                Create or resume a society round — verified courses, live leaderboard.
              </AppText>
            </View>
            <Feather name="chevron-right" size={18} color={colors.textTertiary} />
          </View>
        </AppCard>
      </Pressable>

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

      {/* Event RSVP + payment status summary directly below Next Event */}
      {nextEvent ? (
        <>
          <HomeEventAttendanceCard
            nextEvent={nextEvent}
            nextEventAttendance={nextEventAttendance}
            myReg={myReg}
            regBusy={regBusy}
            canAccessNextEventTeeSheet={canAccessNextEventTeeSheet}
            canAdmin={canAdmin}
            showAdmin={showAdmin}
            onToggleAdmin={() => setShowAdmin((v) => !v)}
            onToggleRegistration={toggleRegistration}
            onMarkPaid={handleMarkPaid}
            onOpenTeeSheet={() =>
              pushWithBlur({ pathname: "/(app)/event/[id]/tee-sheet", params: { id: nextEvent.id } })
            }
          />
          {regError ? (
            <InlineNotice
              variant="error"
              message={regError}
              style={{ marginTop: spacing.sm }}
            />
          ) : null}
        </>
      ) : null}

      <AppText variant="captionBold" color="primary" style={rhythmStyles.sectionEyebrow}>
        FairwayWeather
      </AppText>
      <HomeWeatherSnapshotCard
        nextEvent={nextEvent}
        enabled
        onOpenWeatherDetail={openWeatherTab}
        preferredTeeTimeLocal={heroTeePreview?.teeTime ?? null}
      />

      <AppText variant="captionBold" color="primary" style={rhythmStyles.sectionEyebrow}>
        Prize pools
      </AppText>
      <HomePrizePoolCard
        eventId={nextEvent?.prizePoolEnabled || prizePoolCard?.managerName ? nextEvent?.id ?? null : null}
        myMemberId={memberId ?? undefined}
        managerName={prizePoolCard?.managerName ?? null}
        paymentInstructions={nextEvent?.prizePoolPaymentInstructions}
        poolRows={prizePoolCard?.poolRows ?? []}
        loading={prizePoolCard?.loading ?? false}
        onChanged={bumpPrizePoolHomeCard}
      />

      <AppText variant="captionBold" color="primary" style={rhythmStyles.sectionEyebrow}>
        Latest results
      </AppText>
      <HomeLatestResultsCard
        snapshot={latestResultsSnapshot}
        onOpenEvent={openEvent}
      />

      <AppText variant="captionBold" color="primary" style={rhythmStyles.sectionEyebrow}>
        Order of merit
      </AppText>
      <HomeOomSnapshotCard
        rank={oomRankMain}
        points={oomPointsMain}
        unranked={showUnrankedHint}
        entries={oomStandings}
        memberId={memberId ?? undefined}
        onOpenLeaderboard={openLeaderboard}
        formatPoints={formatPoints}
      />

      {birdiesLeague ? (
        <>
          <AppText variant="captionBold" color="primary" style={rhythmStyles.sectionEyebrow}>
            Birdies league
          </AppText>
          <HomeBirdiesLeagueCard
            myRank={birdiesMyRank}
            myTotalBirdies={birdiesMyTotal}
            myEventsCounted={birdiesMyEvents}
            previewRows={birdiesPreviewRows}
            onOpen={openBirdiesLeague}
          />
        </>
      ) : null}

      {/* Secondary list kept compact below primary cards */}
      {events.length === 0 && !nextEvent ? (
        <AppCard style={[styles.premiumCard, { marginTop: spacing.sm }]}>
          <View style={styles.emptyState}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.backgroundTertiary }]}>
              <Feather name="calendar" size={24} color={colors.textTertiary} />
            </View>
            <AppText variant="bodyBold" style={{ textAlign: "center" }}>
              No upcoming event
            </AppText>
            <AppText variant="body" color="secondary" style={{ textAlign: "center", marginTop: spacing.xs }}>
              Your next society event will appear here.
            </AppText>
          </View>
        </AppCard>
      ) : null}

      </>)}

      <PoweredByFooter colors={colors} />
    </Screen>  );
}

const rhythmStyles = StyleSheet.create({
  brandLine: {
    marginTop: -2,
    marginBottom: spacing.sm,
  },
  sectionEyebrow: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    letterSpacing: 1.2,
    fontSize: 11,
    opacity: 0.92,
  },
  secondaryCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: spacing.base,
  },
});
