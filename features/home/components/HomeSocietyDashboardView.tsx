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
import { HomeNextEventCard } from "./HomeNextEventCard";
import { HomePrizePoolCard } from "./HomePrizePoolCard";
import { HomeLatestResultsCard } from "./HomeLatestResultsCard";
import { HomeOomSnapshotCard } from "./HomeOomSnapshotCard";
import { HomeWeatherSnapshotCard } from "./HomeWeatherSnapshotCard";

export function HomeSocietyDashboardView(vm: HomeSocietyDashboardVm) {
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
    oomPointsMain,
    oomRankMain,
    showUnrankedHint,
    heroTeePreview,
    nextEventAttendance,
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

      <AppText variant="captionBold" color="secondary" style={rhythmStyles.sectionEyebrow}>
        NEXT EVENT
      </AppText>
      <HomeNextEventCard
        nextEvent={nextEvent}
        nextEventIsJoint={nextEventIsJoint}
        myReg={myReg}
        formatEventDate={formatEventDate}
        formatFormatLabel={formatFormatLabel}
        formatClassification={formatClassification}
        onOpenEvent={() => nextEvent && openEvent(nextEvent.id)}
        canManage={canAdmin}
      />

      {/* Event RSVP + payment status summary directly below Next Event */}
      {nextEvent ? (
        <AppCard
          style={[
            rhythmStyles.secondaryCard,
            { borderColor: colors.borderLight, backgroundColor: colors.surface },
          ]}
        >
          <AppText variant="captionBold" color="secondary" style={{ marginBottom: spacing.xs }}>
            Event attendance
          </AppText>
          <AppText variant="small" color="secondary">
            {nextEventAttendance.guestCount > 0
              ? `${nextEventAttendance.attendingCount} attending • ${nextEventAttendance.guestCount} guests`
              : `${nextEventAttendance.attendingCount} attending`}
          </AppText>
          <AppText variant="small" color="secondary">
            Cost: {nextEvent.entryFeeDisplay?.trim() || "—"}
          </AppText>
          <AppText variant="small" color="secondary" style={{ marginBottom: spacing.sm }}>
            Paid: {myReg?.paid ? "Yes" : "No"}
          </AppText>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <PrimaryButton
              size="sm"
              onPress={() => toggleRegistration("in")}
              loading={regBusy}
              disabled={regBusy}
              style={{ flex: 1 }}
            >
              Playing
            </PrimaryButton>
            <PrimaryButton
              size="sm"
              onPress={() => toggleRegistration("out")}
              loading={regBusy}
              disabled={regBusy}
              style={{ flex: 1 }}
            >
              Not Playing
            </PrimaryButton>
          </View>

          {nextEvent.teeTimePublishedAt && canAccessNextEventTeeSheet ? (
            <Pressable
              onPress={() => pushWithBlur({ pathname: "/(app)/event/[id]/tee-sheet", params: { id: nextEvent.id } })}
              style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1, marginTop: spacing.sm })}
            >
              <View style={[styles.notificationBanner, { backgroundColor: colors.success + "15", borderColor: colors.success + "30", marginBottom: 0 }]}>
                <Feather name="bell" size={16} color={colors.success} />
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyBold" style={{ color: colors.success }}>
                    Tee times now available
                  </AppText>
                  <AppText variant="small" color="secondary">
                    Tap to view your tee time and full tee sheet.
                  </AppText>
                </View>
                <Feather name="chevron-right" size={16} color={colors.success} />
              </View>
            </Pressable>
          ) : null}

          {canAdmin ? (
            <Pressable
              onPress={() => setShowAdmin((v) => !v)}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, marginTop: spacing.sm })}
            >
              <AppText variant="small" color="primary">
                {showAdmin ? "Hide admin actions" : "Show admin actions"}
              </AppText>
            </Pressable>
          ) : null}
          {canAdmin && showAdmin ? (
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
              <PrimaryButton
                size="sm"
                onPress={() => handleMarkPaid(true)}
                loading={regBusy}
                disabled={regBusy}
                style={{ flex: 1 }}
              >
                Mark Paid
              </PrimaryButton>
              <PrimaryButton
                size="sm"
                onPress={() => handleMarkPaid(false)}
                loading={regBusy}
                disabled={regBusy}
                style={{ flex: 1 }}
              >
                Mark Unpaid
              </PrimaryButton>
            </View>
          ) : null}
        </AppCard>
      ) : null}

      <AppText variant="captionBold" color="secondary" style={rhythmStyles.sectionEyebrow}>
        PRIZE POOL
      </AppText>
      <HomePrizePoolCard
        eventId={nextEvent?.prizePoolEnabled || prizePoolCard?.managerName ? nextEvent?.id ?? null : null}
        myMemberId={memberId}
        managerName={prizePoolCard?.managerName ?? null}
        paymentInstructions={nextEvent?.prizePoolPaymentInstructions}
        entry={prizePoolCard?.entry ?? null}
        loading={prizePoolCard?.loading ?? false}
        onChanged={bumpPrizePoolHomeCard}
      />

      <AppText variant="captionBold" color="secondary" style={rhythmStyles.sectionEyebrow}>
        LATEST RESULTS
      </AppText>
      <HomeLatestResultsCard
        snapshot={latestResultsSnapshot}
        onOpenEvent={openEvent}
      />

      <AppText variant="captionBold" color="secondary" style={rhythmStyles.sectionEyebrow}>
        ORDER OF MERIT
      </AppText>
      <HomeOomSnapshotCard
        rank={oomRankMain}
        points={oomPointsMain}
        unranked={showUnrankedHint}
        entries={oomStandings}
        memberId={memberId}
        onOpenLeaderboard={openLeaderboard}
        formatPoints={formatPoints}
      />

      <AppText variant="captionBold" color="secondary" style={rhythmStyles.sectionEyebrow}>
        WEATHER
      </AppText>
      <HomeWeatherSnapshotCard
        nextEvent={nextEvent}
        enabled={!!societyId && !!memberId}
        onOpenWeatherTab={openWeatherTab}
        preferredTeeTimeLocal={heroTeePreview?.teeTime ?? null}
      />

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

      {/* Legacy Rivalries card kept as utility action */}
      <Pressable onPress={() => pushWithBlur("/(app)/(tabs)/sinbook")}>
        <AppCard
          style={[
            rhythmStyles.secondaryCard,
            { borderColor: colors.borderLight, backgroundColor: colors.surface },
          ]}
        >
          <View style={styles.cardTitleRow}>
            <Feather name="zap" size={16} color={colors.primary} />
            <AppText variant="captionBold" color="primary">Rivalries</AppText>
          </View>
          <AppText variant="body" color="secondary" style={{ marginTop: spacing.xs }}>
            Track your season head-to-head matchups.
          </AppText>
          <View style={styles.chevronHint}>
            <AppText variant="small" color="tertiary">Open Rivalries</AppText>
            <Feather name="chevron-right" size={16} color={colors.textTertiary} />
          </View>
        </AppCard>
      </Pressable>

      </>)}

      <PoweredByFooter colors={colors} />
    </Screen>  );
}

const rhythmStyles = StyleSheet.create({
  brandLine: {
    marginTop: -2,
    marginBottom: spacing.xs,
  },
  sectionEyebrow: {
    marginTop: 2,
    marginBottom: -6,
    letterSpacing: 0.5,
  },
  secondaryCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: spacing.base,
  },
});
