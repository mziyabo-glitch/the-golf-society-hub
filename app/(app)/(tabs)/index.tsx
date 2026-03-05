/**
 * Member Home Screen
 * Premium, personal home landing for logged-in members.
 * Read-only, member-first experience with society context.
 *
 * Cards (top to bottom):
 *  A) Premium Header — app bar + society identity hero
 *  B) Next Event Card — upcoming event + FairwayWeather link
 *  C) My Season Snapshot Card — events played, OOM points, rank
 *  D) Order of Merit Teaser Card — top 5 + pinned current user
 *  E) Recent Activity Card — last 3 past events with result status
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, View, Pressable, Image, Linking, type PressableStateCallbackType } from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { LinkRowCard } from "@/components/ui/LinkRowCard";
import { SocietyHeaderCard } from "@/components/ui/SocietyHeaderCard";
import { Chip } from "@/components/ui/Chip";
import { PrimaryButton } from "@/components/ui/Button";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { Toast } from "@/components/ui/Toast";
import { useBootstrap } from "@/lib/useBootstrap";
import { isCaptain, isTreasurer } from "@/lib/rbac";
import { supabase } from "@/lib/supabase";
import { getEventsBySocietyId, type EventDoc } from "@/lib/db_supabase/eventRepo";
import {
  getOrderOfMeritTotals,
  getEventResults,
  type OrderOfMeritEntry,
  type EventResultDoc,
} from "@/lib/db_supabase/resultsRepo";
import { getColors, spacing, radius } from "@/lib/ui/theme";
import { formatError, type FormattedError } from "@/lib/ui/formatError";
import { getSocietyLogoUrl } from "@/lib/societyLogo";
import { getMySinbooks, type SinbookWithParticipants } from "@/lib/db_supabase/sinbookRepo";
import {
  getMyRegistration,
  setMyStatus,
  markMePaid,
  type EventRegistration,
} from "@/lib/db_supabase/eventRegistrationRepo";
import { blurWebActiveElement } from "@/lib/ui/focus";
import { SocietySwitcherPill } from "@/components/SocietySwitcher";

const appIcon = require("@/assets/images/app-icon.png");

// ============================================================================
// Helpers
// ============================================================================

/** Format a role string for display as a badge label */
function formatRole(role?: string): string {
  if (!role) return "Member";
  const r = role.toLowerCase();
  const map: Record<string, string> = {
    captain: "Captain",
    secretary: "Secretary",
    treasurer: "Treasurer",
    handicapper: "Handicapper",
    member: "Member",
  };
  return map[r] || "Member";
}

/** Pretty-print a date string as "Sun 12 Apr" style */
function formatEventDate(dateStr?: string): string {
  if (!dateStr) return "TBD";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  } catch {
    return "TBD";
  }
}

/** Short date for compact display: "12 Apr" */
function formatShortDate(dateStr?: string): string {
  if (!dateStr) return "TBD";
  try {
    return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  } catch {
    return "TBD";
  }
}

/** Format event format label for display */
function formatFormatLabel(format?: string): string {
  if (!format) return "";
  const map: Record<string, string> = {
    stableford: "Stableford",
    strokeplay_net: "Strokeplay (Net)",
    strokeplay_gross: "Strokeplay (Gross)",
    medal: "Medal",
  };
  return map[format.toLowerCase()] || format;
}

/** Format event classification for display */
function formatClassification(classification?: string): string {
  if (!classification) return "General";
  const map: Record<string, string> = {
    general: "General",
    oom: "Order of Merit",
    major: "Major",
    friendly: "Friendly",
  };
  return map[classification.toLowerCase()] || classification;
}

/** Format OOM points nicely */
function formatPoints(pts: number): string {
  if (pts === Math.floor(pts)) return pts.toString();
  return pts.toFixed(1);
}

/** Get initials from a name */
function getInitials(name: string): string {
  if (!name) return "GS";
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return name.substring(0, 2).toUpperCase();
  return words.slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function HomeAppBar({
  colors,
  onOpenSettings,
}: {
  colors: ReturnType<typeof getColors>;
  onOpenSettings: () => void;
}) {
  return (
    <View style={[styles.appBarTier, { borderBottomColor: colors.borderLight }]}>
      <SocietySwitcherPill />

      <Pressable
        onPress={onOpenSettings}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Open settings"
        style={({ pressed }) => [
          styles.appBarAction,
          { backgroundColor: colors.backgroundTertiary, borderColor: colors.borderLight },
          pressed && styles.appBarActionPressed,
        ]}
      >
        <Feather name="settings" size={16} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}

function PoweredByFooter({
  colors,
}: {
  colors: ReturnType<typeof getColors>;
}) {
  return (
    <View style={styles.poweredByWrap}>
      <Image source={appIcon} style={styles.poweredByIcon} resizeMode="contain" />
      <AppText style={[styles.poweredByText, { color: colors.textTertiary }]}>
        Powered by Golf Society Hub
      </AppText>
    </View>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function HomeScreen() {
  const router = useRouter();
  const { society, member, societyId, profile, loading: bootstrapLoading } = useBootstrap();
  const colors = getColors();
  const tabBarHeight = useBottomTabBarHeight();
  const tabContentStyle = {
    paddingTop: 16,
    paddingBottom: tabBarHeight + 24,
  };

  // Data state
  const [events, setEvents] = useState<EventDoc[]>([]);
  const [oomStandings, setOomStandings] = useState<OrderOfMeritEntry[]>([]);
  const [recentResultsMap, setRecentResultsMap] = useState<Record<string, EventResultDoc[]>>({});
  const [dataLoading, setDataLoading] = useState(true);
  const [loadError, setLoadError] = useState<FormattedError | null>(null);
  const [activeSinbook, setActiveSinbook] = useState<SinbookWithParticipants | null>(null);

  // Event registration state
  const [myReg, setMyReg] = useState<EventRegistration | null>(null);
  const [regBusy, setRegBusy] = useState(false);

  // Licence banner state
  const [requestSending, setRequestSending] = useState(false);
  const [requestAlreadySent, setRequestAlreadySent] = useState(false);
  const [licenceToast, setLicenceToast] = useState<{ visible: boolean; message: string; type: "success" | "error" | "info" }>({
    visible: false, message: "", type: "success",
  });

  const profileComplete = profile?.profile_complete === true;

  const memberHasSeat = (member as any)?.has_seat === true;
  const memberIsCaptain = isCaptain(member as any);
  const showLicenceBanner = !!societyId && !!member && !memberHasSeat && !memberIsCaptain;

  // Check for existing pending request on mount
  useEffect(() => {
    if (!societyId || !member || memberHasSeat || memberIsCaptain) return;
    supabase
      .from("licence_requests")
      .select("id")
      .eq("society_id", societyId)
      .eq("requester_user_id", (member as any)?.user_id)
      .eq("status", "pending")
      .maybeSingle()
      .then(({ data }) => {
        if (data) setRequestAlreadySent(true);
      });
  }, [societyId, member, memberHasSeat, memberIsCaptain]);

  const handleRequestAccess = async () => {
    if (!societyId || requestSending) return;
    setRequestSending(true);
    try {
      const { error } = await supabase.rpc("create_licence_request", {
        p_society_id: societyId,
      });
      if (error) {
        if (error.message?.includes("already have a licence")) {
          setLicenceToast({ visible: true, message: "You already have a licence!", type: "info" });
        } else {
          setLicenceToast({ visible: true, message: error.message || "Failed to send request.", type: "error" });
        }
        return;
      }
      setRequestAlreadySent(true);
      setLicenceToast({ visible: true, message: "Request sent to your Captain.", type: "success" });
    } catch (e: any) {
      setLicenceToast({ visible: true, message: e?.message || "Something went wrong.", type: "error" });
    } finally {
      setRequestSending(false);
    }
  };

  // ============================================================================
  // Data Loading
  // ============================================================================

  const loadData = useCallback(async () => {
    if (!societyId || (!memberHasSeat && !memberIsCaptain)) {
      setDataLoading(false);
      return;
    }

    setDataLoading(true);
    setLoadError(null);
    try {
      const [eventsData, standingsData] = await Promise.all([
        getEventsBySocietyId(societyId),
        getOrderOfMeritTotals(societyId),
      ]);
      setEvents(eventsData);
      setOomStandings(standingsData);

      // Fetch results for the last 3 completed events (for Recent Activity card)
      const pastEvents = eventsData
        .filter((e) => e.isCompleted)
        .slice(0, 3);

      const resultsFetches = await Promise.all(
        pastEvents.map(async (event) => {
          try {
            const results = await getEventResults(event.id);
            return { eventId: event.id, results };
          } catch {
            return { eventId: event.id, results: [] as EventResultDoc[] };
          }
        })
      );

      const resultsMap: Record<string, EventResultDoc[]> = {};
      for (const { eventId, results } of resultsFetches) {
        resultsMap[eventId] = results;
      }
      setRecentResultsMap(resultsMap);

      // Load first active sinbook for teaser card (non-blocking)
      try {
        const sbs = await getMySinbooks();
        const active = sbs.find((s) =>
          s.participants.some((p) => p.status === "accepted")
        );
        setActiveSinbook(active ?? null);
      } catch {
        // Non-critical — silently ignore
      }
    } catch (err) {
      console.error("[Home] Failed to load data:", err);
      setLoadError(formatError(err));
    } finally {
      setDataLoading(false);
    }
  }, [societyId, memberHasSeat, memberIsCaptain]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      if (societyId && (memberHasSeat || memberIsCaptain)) {
        loadData();
      }
    }, [societyId, memberHasSeat, memberIsCaptain, loadData])
  );

  // ============================================================================
  // Derived Data
  // ============================================================================

  const logoUrl = getSocietyLogoUrl(society);
  const memberId = member?.id;

  // Today's date at midnight for comparison
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Next upcoming event (date >= today, not completed, sorted ascending)
  const nextEvent = useMemo(() => {
    return events
      .filter((e) => !e.isCompleted && e.date && new Date(e.date) >= today)
      .sort((a, b) => new Date(a.date!).getTime() - new Date(b.date!).getTime())[0] ?? null;
  }, [events, today]);

  const nextEventId = nextEvent?.id ?? null;

  // Load registration for the next event whenever it changes
  useEffect(() => {
    if (!nextEventId || !memberId) {
      setMyReg(null);
      return;
    }
    let cancelled = false;
    getMyRegistration(nextEventId, memberId).then((reg) => {
      if (!cancelled) setMyReg(reg);
    });
    return () => { cancelled = true; };
  }, [nextEventId, memberId]);

  // Past events (completed, sorted desc) — last 3
  const recentEvents = useMemo(() => {
    return events
      .filter((e) => e.isCompleted)
      .slice(0, 3);
  }, [events]);

  // My season snapshot (year-based)
  const mySnapshot = useMemo(() => {
    if (!memberId) return null;

    // Find current user in OOM standings
    const myOomEntry = oomStandings.find((s) => s.memberId === memberId);
    const membersWithPoints = oomStandings.filter((s) => s.totalPoints > 0);

    return {
      totalPoints: myOomEntry?.totalPoints ?? 0,
      rank: myOomEntry?.rank ?? 0,
      totalWithPoints: membersWithPoints.length,
    };
  }, [memberId, oomStandings]);

  // OOM teaser: top 5 + current user pinned
  const oomTeaser = useMemo(() => {
    const top5 = oomStandings.slice(0, 5);
    const isInTop5 = top5.some((s) => s.memberId === memberId);
    const myEntry = !isInTop5
      ? oomStandings.find((s) => s.memberId === memberId)
      : null;
    return { top5, isInTop5, myEntry };
  }, [oomStandings, memberId]);

  // ============================================================================
  // Registration Helpers
  // ============================================================================

  const canAdmin = isCaptain(member as any) || isTreasurer(member as any);
  const [showAdmin, setShowAdmin] = useState(false);

  const toggleRegistration = async (newStatus: "in" | "out") => {
    if (!nextEvent || !societyId || !memberId || regBusy) return;
    setRegBusy(true);
    try {
      const updated = await setMyStatus({ eventId: nextEvent.id, societyId, memberId, status: newStatus });
      setMyReg(updated);
    } catch {
      // silently degrade — user can retry
    } finally {
      setRegBusy(false);
    }
  };

  const handleMarkPaid = async (paid: boolean) => {
    if (!nextEvent || !memberId || regBusy) return;
    setRegBusy(true);
    try {
      await markMePaid(nextEvent.id, memberId, paid);
      const refreshed = await getMyRegistration(nextEvent.id, memberId);
      setMyReg(refreshed);
    } catch {
      // silently degrade
    } finally {
      setRegBusy(false);
    }
  };

  // ============================================================================
  // Navigation Helpers
  // ============================================================================

  const pushWithBlur = (href: Parameters<typeof router.push>[0]) => {
    blurWebActiveElement();
    router.push(href);
  };

  const openEvent = (eventId: string) => {
    if (!eventId) return;
    pushWithBlur({ pathname: "/(app)/event/[id]", params: { id: eventId } });
  };

  const openLeaderboard = () => {
    pushWithBlur("/(app)/(tabs)/leaderboard");
  };

  const openFairwayWeather = async () => {
    const baseUrl = "https://www.fairwayweather.com";
    try {
      await WebBrowser.openBrowserAsync(baseUrl);
    } catch {
      // Fallback: open in external browser
      Linking.openURL(baseUrl).catch(() => {});
    }
  };

  // ============================================================================
  // Loading / No Society States
  // ============================================================================

  if (bootstrapLoading || dataLoading) {
    return (
      <Screen
        scrollable
        style={{ backgroundColor: colors.backgroundSecondary }}
        contentStyle={[styles.screenContent, tabContentStyle]}
      >
        <SkeletonCards colors={colors} />
      </Screen>
    );
  }

  if (!societyId || !society) {
    return <PersonalModeHome colors={colors} router={router} />;
  }

  // ============================================================================
  // Render
  // ============================================================================

  // Handicap and identity meta for hero text
  // Guard: ensure the raw value is a primitive before converting to Number
  const _hiRaw = (member as any)?.handicap_index ?? member?.handicapIndex ?? null;
  const _hiNum =
    _hiRaw != null && typeof _hiRaw !== "object"
      ? Number(_hiRaw)
      : null;
  const memberHiText =
    _hiNum != null && Number.isFinite(_hiNum)
      ? `HI ${_hiNum.toFixed(1)}`
      : null;
  const memberDisplayName = String(member?.displayName || member?.name || "Member");
  const roleLabel = formatRole(member?.role);
  const heroSecondaryText = memberHiText
    ? `${memberDisplayName} • ${roleLabel} • ${memberHiText}`
    : `${memberDisplayName} • ${roleLabel}`;
  const canOpenLeaderboard = memberHasSeat || memberIsCaptain;
  const atGlanceRank =
    mySnapshot && (mySnapshot.rank ?? 0) > 0 ? String(mySnapshot.rank) : "—";
  const atGlancePoints =
    mySnapshot && (mySnapshot.totalPoints ?? 0) > 0
      ? formatPoints(Number(mySnapshot.totalPoints) || 0)
      : "—";
  const cardPressStyle = ({ pressed }: PressableStateCallbackType) => [
    styles.cardPressable,
    pressed && styles.cardPressablePressed,
  ];

  return (
    <Screen
      style={{ backgroundColor: colors.backgroundSecondary }}
      contentStyle={[styles.screenContent, tabContentStyle]}
    >
      <HomeAppBar
        colors={colors}
        onOpenSettings={() => pushWithBlur("/(app)/(tabs)/settings")}
      />

      <SocietyHeaderCard
        logoUrl={logoUrl}
        societyName={String(society.name ?? "Society")}
        subtitle={heroSecondaryText}
        getInitials={getInitials}
      />

      {/* OOM Rank + Points compact StatCards */}
      <View style={styles.atGlanceRow}>
        <StatCard
          icon="award"
          label="OOM Rank"
          value={atGlanceRank}
          detail={mySnapshot && mySnapshot.rank > 0 ? `of ${String(mySnapshot.totalWithPoints)}` : "No rank yet"}
          onPress={canOpenLeaderboard ? openLeaderboard : undefined}
        />
        <StatCard
          icon="bar-chart-2"
          label="Points"
          value={atGlancePoints}
          detail="Order of Merit"
          onPress={canOpenLeaderboard ? openLeaderboard : undefined}
        />
      </View>

      {loadError && (
        <InlineNotice
          variant="error"
          message={loadError.message}
          detail={loadError.detail}
          style={{ marginBottom: spacing.base }}
        />
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

      {/* ================================================================== */}
      {/* NOTIFICATION: Tee times published                                  */}
      {/* ================================================================== */}
      {nextEvent?.teeTimePublishedAt && (() => {
        const publishedAt = new Date(nextEvent.teeTimePublishedAt!);
        const daysSince = (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince > 7) return null;
        return (
          <Pressable onPress={() => openEvent(nextEvent.id)} style={cardPressStyle}>
            <View style={[styles.notificationBanner, { backgroundColor: colors.success + "15", borderColor: colors.success + "30" }]}>
              <Feather name="bell" size={16} color={colors.success} />
              <View style={{ flex: 1 }}>
                <AppText variant="bodyBold" style={{ color: colors.success }}>
                  Tee times now available!
                </AppText>
                <AppText variant="small" color="secondary">
                  {String(nextEvent.name ?? "Event")} — First tee: {String(nextEvent.teeTimeStart || "TBC")}
                </AppText>
              </View>
              <Feather name="chevron-right" size={16} color={colors.success} />
            </View>
          </Pressable>
        );
      })()}

      {/* Course Weather — compact LinkRowCard */}
      <LinkRowCard
        icon="cloud"
        title="Course Weather"
        subtitle="Powered by FairwayWeather"
        onPress={openFairwayWeather}
      />

      {/* Next Event — tightened card */}
      {nextEvent ? (
        <Pressable onPress={() => openEvent(nextEvent.id)} style={cardPressStyle}>
          <Card style={styles.nextEventCard}>
            <View style={styles.cardTitleRow}>
              <Feather name="calendar" size={16} color={colors.primary} />
              <AppText variant="captionBold" color="primary">Next Event</AppText>
            </View>
            <AppText variant="h2" style={styles.nextEventTitle}>
              {String(nextEvent.name ?? "Event")}
            </AppText>
            <AppText variant="small" color="secondary" style={styles.nextEventMeta}>
              {formatEventDate(nextEvent.date)}
              {nextEvent.courseName ? ` • ${String(nextEvent.courseName)}` : ""}
            </AppText>
            <View style={styles.nextEventDetails}>
              {nextEvent.format && <Chip>{formatFormatLabel(nextEvent.format)}</Chip>}
              {nextEvent.classification && <Chip>{formatClassification(nextEvent.classification)}</Chip>}
            </View>
            {nextEvent.isOOM && (
              <View style={styles.oomPremiumPill}>
                <Feather name="award" size={12} color="#9A6700" />
                <AppText variant="small" style={styles.oomPremiumPillText}>
                  Counts toward Order of Merit
                </AppText>
              </View>
            )}

            {/* Registration + Payment */}
            <View style={[styles.regRow, { borderTopColor: colors.borderLight }]}>
              <View style={{ flex: 1, gap: spacing.xs }}>
                {/* Status line */}
                <View style={styles.regStatusWrap}>
                  <AppText variant="small" color="secondary" style={{ fontWeight: "600" }}>You:</AppText>
                  {myReg?.status === "in" ? (
                    <>
                      <View style={[styles.regBadge, { backgroundColor: colors.success + "18" }]}>
                        <Feather name="check-circle" size={12} color={colors.success} />
                        <AppText variant="small" style={{ color: colors.success, fontWeight: "700" }}>IN</AppText>
                      </View>
                      {myReg.paid ? (
                        <View style={[styles.paidPill, { backgroundColor: colors.success }]}>
                          <AppText style={styles.paidPillText}>PAID</AppText>
                        </View>
                      ) : (
                        <View style={[styles.paidPill, { backgroundColor: colors.error }]}>
                          <AppText style={styles.paidPillText}>UNPAID</AppText>
                        </View>
                      )}
                    </>
                  ) : myReg?.status === "out" ? (
                    <View style={[styles.regBadge, { backgroundColor: colors.textTertiary + "18" }]}>
                      <Feather name="x-circle" size={12} color={colors.textTertiary} />
                      <AppText variant="small" style={{ color: colors.textTertiary, fontWeight: "700" }}>OUT</AppText>
                    </View>
                  ) : (
                    <AppText variant="small" color="tertiary">Not registered</AppText>
                  )}
                </View>

                {/* Action buttons */}
                <View style={styles.regActions}>
                  {myReg?.status === "in" ? (
                    <Pressable
                      hitSlop={8}
                      disabled={regBusy}
                      onPress={(e) => { e.stopPropagation(); toggleRegistration("out"); }}
                      style={[styles.regBtn, { borderColor: colors.border }]}
                    >
                      <AppText variant="small" color="secondary">Can&apos;t make it</AppText>
                    </Pressable>
                  ) : (
                    <Pressable
                      hitSlop={8}
                      disabled={regBusy}
                      onPress={(e) => { e.stopPropagation(); toggleRegistration("in"); }}
                      style={[styles.regBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                    >
                      <AppText variant="small" style={{ color: "#fff", fontWeight: "600" }}>I&apos;m playing</AppText>
                    </Pressable>
                  )}

                  {/* Captain / Treasurer micro-admin */}
                  {canAdmin && (
                    <Pressable
                      hitSlop={8}
                      onPress={(e) => { e.stopPropagation(); setShowAdmin((v) => !v); }}
                      style={[styles.regBtn, { borderColor: colors.border }]}
                    >
                      <Feather name="shield" size={12} color={colors.textSecondary} />
                      <AppText variant="small" color="secondary">Admin</AppText>
                    </Pressable>
                  )}
                </View>

                {/* Admin panel (collapsed) */}
                {canAdmin && showAdmin && (
                  <View style={[styles.regActions, { marginTop: 2 }]}>
                    <Pressable
                      hitSlop={8}
                      disabled={regBusy}
                      onPress={(e) => { e.stopPropagation(); handleMarkPaid(true); }}
                      style={[styles.regBtn, { backgroundColor: colors.success, borderColor: colors.success }]}
                    >
                      <AppText variant="small" style={{ color: "#fff", fontWeight: "600" }}>Mark ME Paid</AppText>
                    </Pressable>
                    <Pressable
                      hitSlop={8}
                      disabled={regBusy}
                      onPress={(e) => { e.stopPropagation(); handleMarkPaid(false); }}
                      style={[styles.regBtn, { backgroundColor: colors.error, borderColor: colors.error }]}
                    >
                      <AppText variant="small" style={{ color: "#fff", fontWeight: "600" }}>Mark ME Unpaid</AppText>
                    </Pressable>
                  </View>
                )}
              </View>
            </View>

            <View style={[styles.teeTimeRow, { borderTopColor: colors.borderLight, marginTop: spacing.sm }]}>
              <Feather name="flag" size={14} color={nextEvent.teeTimePublishedAt ? colors.success : colors.textSecondary} />
              {nextEvent.teeTimePublishedAt ? (
                <AppText variant="small" style={{ color: colors.success, fontWeight: "600", flex: 1 }}>
                  Tee times available — First tee: {String(nextEvent.teeTimeStart || "TBC")}
                  {nextEvent.teeTimeInterval ? `, ${String(nextEvent.teeTimeInterval)} min intervals` : ""}
                </AppText>
              ) : (
                <AppText variant="small" color="secondary" style={{ flex: 1 }}>
                  Tee times to be published
                </AppText>
              )}
              <Feather name="chevron-right" size={16} color={colors.textTertiary} />
            </View>
          </Card>
        </Pressable>
      ) : (
        <Card style={styles.nextEventCard}>
          <View style={styles.cardTitleRow}>
            <Feather name="calendar" size={16} color={colors.textTertiary} />
            <AppText variant="captionBold" color="tertiary">Next Event</AppText>
          </View>
          <AppText variant="body" color="secondary" style={{ marginTop: spacing.sm }}>
            No upcoming events scheduled. Check back soon!
          </AppText>
        </Card>
      )}

      {/* ================================================================== */}
      {/* D) ORDER OF MERIT TEASER                                           */}
      {/* ================================================================== */}
      {oomStandings.length > 0 && (
        <Pressable onPress={openLeaderboard} style={cardPressStyle}>
          <AppCard style={styles.premiumCard}>
            <View style={styles.cardTitleRow}>
              <Feather name="award" size={16} color={colors.primary} />
              <AppText variant="captionBold" color="primary">Order of Merit</AppText>
            </View>

            {oomTeaser.top5.map((entry, idx) => {
              const isMe = entry.memberId === memberId;
              return (
                <View
                  key={entry.memberId}
                  style={[
                    styles.oomRow,
                    isMe && { backgroundColor: colors.primary + "10", borderRadius: radius.sm },
                    idx === oomTeaser.top5.length - 1 && !oomTeaser.myEntry && { borderBottomWidth: 0 },
                  ]}
                >
                  <AppText
                    variant="captionBold"
                    style={[styles.oomRank, { color: colors.textSecondary }]}
                  >
                    {String(entry.rank)}
                  </AppText>
                  <AppText
                    variant={isMe ? "bodyBold" : "body"}
                    style={{ flex: 1 }}
                    numberOfLines={1}
                  >
                    {String(entry.memberName ?? "Unknown")}{isMe ? " (You)" : ""}
                  </AppText>
                  <AppText variant="captionBold" color="primary">
                    {formatPoints(Number(entry.totalPoints) || 0)} pts
                  </AppText>
                </View>
              );
            })}

            {/* Pinned current user row if not in top 5 but has points */}
            {oomTeaser.myEntry && (
              <>
                <View style={[styles.pinnedSeparator, { borderColor: colors.borderLight }]} />
                <View
                  style={[
                    styles.oomRow,
                    { backgroundColor: colors.primary + "10", borderRadius: radius.sm, borderBottomWidth: 0 },
                  ]}
                >
                  <AppText
                    variant="captionBold"
                    style={[styles.oomRank, { color: colors.textSecondary }]}
                  >
                    {String(oomTeaser.myEntry.rank)}
                  </AppText>
                  <AppText variant="bodyBold" style={{ flex: 1 }} numberOfLines={1}>
                    You
                  </AppText>
                  <AppText variant="captionBold" color="primary">
                    {formatPoints(Number(oomTeaser.myEntry.totalPoints) || 0)} pts
                  </AppText>
                </View>
              </>
            )}

            <View style={styles.chevronHint}>
              <AppText variant="small" color="tertiary">View full leaderboard</AppText>
              <Feather name="chevron-right" size={16} color={colors.textTertiary} />
            </View>
          </AppCard>
        </Pressable>
      )}

      {/* ================================================================== */}
      {/* E) RECENT ACTIVITY                                                 */}
      {/* ================================================================== */}
      {recentEvents.length > 0 && (
        <View>
          <AppText variant="h2" style={styles.sectionTitle}>Recent Activity</AppText>

          {recentEvents.map((event) => {
            const results = recentResultsMap[event.id] ?? [];
            const hasResults = results.length > 0;
            const myResult = hasResults
              ? results.find((r) => r.member_id === memberId)
              : null;

            // Determine status text — guard against non-primitive points values
            let statusText = "Results pending";
            let statusColor: string = colors.textTertiary;
            if (hasResults && event.isOOM && myResult) {
              const pts = Number(myResult.points) || 0;
              statusText = `${formatPoints(pts)} Order of Merit pts`;
              statusColor = colors.primary;
            } else if (hasResults && event.isOOM && !myResult) {
              statusText = "No Order of Merit points";
              statusColor = colors.textSecondary;
            } else if (hasResults && !event.isOOM) {
              statusText = "Results available";
              statusColor = colors.success;
            }

            return (
              <Pressable key={event.id} onPress={() => openEvent(event.id)} style={cardPressStyle}>
                <AppCard style={[styles.recentCard, styles.premiumCard]}>
                  <View style={styles.recentRow}>
                    <View style={[styles.recentDateBadge, { backgroundColor: colors.backgroundTertiary }]}>
                      <AppText variant="captionBold" color="primary">
                        {formatShortDate(typeof event.date === "string" ? event.date : undefined)}
                      </AppText>
                    </View>
                    <View style={{ flex: 1 }}>
                      <AppText variant="bodyBold" numberOfLines={1}>{String(event.name ?? "Event")}</AppText>
                      <AppText variant="small" style={{ color: statusColor }}>{statusText}</AppText>
                    </View>
                    <Feather name="chevron-right" size={18} color={colors.textTertiary} />
                  </View>
                </AppCard>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Empty state if absolutely no events */}
      {events.length === 0 && !nextEvent && recentEvents.length === 0 && (
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
            <AppText variant="captionBold" color="primary">Sinbook</AppText>
          </View>
          {activeSinbook ? (
            <View style={{ marginTop: spacing.xs }}>
              <AppText variant="bodyBold" numberOfLines={1}>{String(activeSinbook.title ?? "Rivalry")}</AppText>
              <AppText variant="caption" color="secondary">
                vs {String(activeSinbook.participants.find((p) => p.user_id !== memberId && p.status === "accepted")?.display_name || "rival")}
              </AppText>
            </View>
          ) : (
            <AppText variant="body" color="secondary" style={{ marginTop: spacing.xs }}>
              Start a rivalry with a mate. Track side bets all season.
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
    </Screen>
  );
}

// ============================================================================
// Skeleton Loading Placeholders
// ============================================================================

function PersonalModeHome({
  colors,
  router,
}: {
  colors: ReturnType<typeof getColors>;
  router: ReturnType<typeof useRouter>;
}) {
  const tabBarHeight = useBottomTabBarHeight();
  const tabContentStyle = {
    paddingTop: 16,
    paddingBottom: tabBarHeight + 24,
  };
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const { profile: pmProfile } = useBootstrap();
  const pmProfileComplete = pmProfile?.profile_complete === true;
  const cardPressStyle = ({ pressed }: PressableStateCallbackType) => [
    styles.cardPressable,
    pressed && styles.cardPressablePressed,
  ];
  const pushWithBlur = (href: Parameters<typeof router.push>[0]) => {
    blurWebActiveElement();
    router.push(href);
  };
  const openJoinByCode = () => {
    const targetPath = "/join?mode=join";
    console.log("ENTER JOIN CODE CLICK", targetPath);
    blurWebActiveElement();
    router.push({ pathname: "/join", params: { mode: "join" } });
  };
  const openCreateSociety = () => {
    blurWebActiveElement();
    router.push({ pathname: "/onboarding", params: { mode: "create" } });
  };

  return (
    <Screen
      style={{ backgroundColor: colors.backgroundSecondary }}
      contentStyle={[styles.screenContent, tabContentStyle]}
    >
      <HomeAppBar
        colors={colors}
        onOpenSettings={() => pushWithBlur("/(app)/(tabs)/settings")}
      />

      {/* Welcome header */}
      <AppCard style={[styles.premiumCard, personalStyles.welcomeSection, { borderColor: colors.borderLight }]}>
        <View style={[personalStyles.welcomeShield, { backgroundColor: colors.primary + "12" }]}>
          <Image source={appIcon} style={personalStyles.welcomeShieldIcon} resizeMode="contain" />
        </View>
        <AppText variant="title" style={personalStyles.welcomeTitle}>
          Welcome
        </AppText>
        <AppText variant="body" color="secondary" style={personalStyles.welcomeSubtitle}>
          Use the app as an individual, or join a society when you are ready.
        </AppText>
      </AppCard>

      {/* Complete profile banner */}
      {!pmProfileComplete && (
        <Pressable onPress={() => pushWithBlur("/(app)/my-profile")} style={cardPressStyle}>
          <AppCard style={[styles.premiumCard, styles.profileBanner, { borderColor: colors.info + "40" }]}>
            <View style={styles.profileBannerRow}>
              <View style={[styles.profileBannerIcon, { backgroundColor: colors.info + "18" }]}>
                <Feather name="user" size={20} color={colors.info} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyBold">Complete your profile</AppText>
                <AppText variant="small" color="secondary" style={{ marginTop: 2 }}>
                  Add your name and details to get started.
                </AppText>
              </View>
              <Feather name="chevron-right" size={18} color={colors.info} />
            </View>
          </AppCard>
        </Pressable>
      )}

      {/* Feature cards */}
      <Pressable onPress={() => pushWithBlur("/(app)/(tabs)/sinbook")} style={cardPressStyle}>
        <AppCard style={styles.premiumCard}>
          <View style={personalStyles.featureRow}>
            <View style={[personalStyles.featureIcon, { backgroundColor: colors.primary + "14" }]}>
              <Feather name="zap" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="bodyBold">Sinbook Rivalries</AppText>
              <AppText variant="small" color="secondary">
                Challenge a mate to a side bet and track it all season
              </AppText>
            </View>
            <Feather name="chevron-right" size={18} color={colors.textTertiary} />
          </View>
        </AppCard>
      </Pressable>

      <AppCard style={styles.premiumCard}>
        <View style={personalStyles.featureRow}>
          <View style={[personalStyles.featureIcon, { backgroundColor: colors.info + "14" }]}>
            <Feather name="cloud" size={20} color={colors.info} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="bodyBold">Weather</AppText>
            <AppText variant="small" color="secondary">
              Course-specific forecasts for your round
            </AppText>
          </View>
          <View style={[personalStyles.comingSoonBadge, { backgroundColor: colors.backgroundTertiary }]}>
            <AppText variant="small" color="tertiary">Soon</AppText>
          </View>
        </View>
      </AppCard>

      <Pressable onPress={() => pushWithBlur("/(app)/(tabs)/settings")} style={cardPressStyle}>
        <AppCard style={styles.premiumCard}>
          <View style={personalStyles.featureRow}>
            <View style={[personalStyles.featureIcon, { backgroundColor: colors.backgroundTertiary }]}>
              <Feather name="user" size={20} color={colors.textSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="bodyBold">Profile</AppText>
              <AppText variant="small" color="secondary">
                Your account and preferences
              </AppText>
            </View>
            <Feather name="chevron-right" size={18} color={colors.textTertiary} />
          </View>
        </AppCard>
      </Pressable>

      {/* Society join nudge — subtle card */}
      {!nudgeDismissed && (
        <AppCard style={[styles.premiumCard, personalStyles.nudgeCard, { borderColor: colors.primary + "25" }]}>
          <View style={personalStyles.nudgeHeader}>
            <View style={[personalStyles.nudgeIcon, { backgroundColor: colors.primary + "14" }]}>
              <Feather name="users" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="bodyBold">Join a Society</AppText>
              <AppText variant="small" color="secondary" style={{ marginTop: 2 }}>
                Get events, tee sheets, and leaderboards when you join your society.
              </AppText>
            </View>
          </View>

          <View style={personalStyles.nudgeActions}>
            <PrimaryButton
              onPress={openJoinByCode}
              size="sm"
              style={{ flex: 1 }}
            >
              Enter join code
            </PrimaryButton>
            <Pressable
              onPress={openCreateSociety}
              style={({ pressed }) => [
                personalStyles.nudgeSecondary,
                { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <AppText variant="small" color="primary" style={{ fontWeight: "600" }}>
                Create a society
              </AppText>
            </Pressable>
          </View>

          <Pressable
            onPress={() => setNudgeDismissed(true)}
            style={personalStyles.nudgeDismiss}
            hitSlop={8}
          >
            <AppText variant="small" color="tertiary">Not now</AppText>
          </Pressable>
        </AppCard>
      )}

      <PoweredByFooter colors={colors} />
    </Screen>
  );
}

const personalStyles = StyleSheet.create({
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

// ============================================================================
// Skeleton Loading Placeholders
// ============================================================================

function SkeletonCards({ colors }: { colors: ReturnType<typeof getColors> }) {
  const shimmer = colors.backgroundTertiary;

  return (
    <>
      {/* Two-tier header skeleton */}
      <View style={[styles.appBarTier, { borderBottomColor: colors.borderLight }]}>
        <View style={styles.appBarSpacer} />
        <View style={[styles.appBarAction, { backgroundColor: shimmer, borderColor: colors.borderLight }]} />
      </View>
      <AppCard style={[styles.skeletonHeaderCard, styles.premiumCard]}>
        <View style={[styles.skeletonLogoFrame, { backgroundColor: shimmer }]} />
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <View style={[styles.skeletonLine, { width: "70%", backgroundColor: shimmer }]} />
          <View style={[styles.skeletonLine, { width: "50%", backgroundColor: shimmer, marginTop: 6 }]} />
        </View>
      </AppCard>

      <View style={styles.atGlanceRow}>
        <AppCard style={[styles.premiumCard, styles.skeletonStatCard]}>
          <View style={[styles.skeletonIconCircle, { backgroundColor: shimmer }]} />
          <View style={[styles.skeletonLine, { width: "48%", backgroundColor: shimmer, marginBottom: 8 }]} />
          <View style={[styles.skeletonLine, { width: "34%", backgroundColor: shimmer, height: 20 }]} />
        </AppCard>
        <AppCard style={[styles.premiumCard, styles.skeletonStatCard]}>
          <View style={[styles.skeletonIconCircle, { backgroundColor: shimmer }]} />
          <View style={[styles.skeletonLine, { width: "48%", backgroundColor: shimmer, marginBottom: 8 }]} />
          <View style={[styles.skeletonLine, { width: "34%", backgroundColor: shimmer, height: 20 }]} />
        </AppCard>
      </View>

      {/* Next event skeleton */}
      <AppCard style={styles.premiumCard}>
        <View style={[styles.skeletonLine, { width: "30%", backgroundColor: shimmer }]} />
        <View style={[styles.skeletonLine, { width: "80%", backgroundColor: shimmer, marginTop: 10 }]} />
        <View style={[styles.skeletonLine, { width: "50%", backgroundColor: shimmer, marginTop: 6 }]} />
        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: 12 }}>
          <View style={[styles.skeletonBadge, { backgroundColor: shimmer }]} />
          <View style={[styles.skeletonBadge, { backgroundColor: shimmer }]} />
        </View>
      </AppCard>

      {/* Snapshot skeleton */}
      <AppCard style={styles.premiumCard}>
        <View style={[styles.skeletonLine, { width: "40%", backgroundColor: shimmer }]} />
        <View style={{ flexDirection: "row", justifyContent: "space-around", marginTop: 16 }}>
          <View style={[styles.skeletonCircle, { backgroundColor: shimmer }]} />
          <View style={[styles.skeletonCircle, { backgroundColor: shimmer }]} />
          <View style={[styles.skeletonCircle, { backgroundColor: shimmer }]} />
        </View>
      </AppCard>
    </>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
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
  cardPressablePressed: {
    opacity: 0.94,
    transform: [{ scale: 0.995 }],
  },

  // Premium two-tier header
  appBarTier: {
    height: 44,
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
    fontSize: 11,
    lineHeight: 14,
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
    fontSize: 10,
  },
  nextEventDetails: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  oomPremiumPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    marginTop: spacing.sm,
  },
  oomPremiumPillText: {
    color: "#9A6700",
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

  // Skeleton
  skeletonLine: {
    height: 14,
    borderRadius: 7,
  },
  skeletonBadge: {
    width: 80,
    height: 24,
    borderRadius: 12,
  },
  skeletonCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  skeletonHeaderCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
  },
  skeletonLogoFrame: {
    width: 48,
    height: 48,
    borderRadius: 14,
  },
  skeletonStatCard: {
    flex: 1,
    padding: spacing.md,
    minHeight: 88,
  },
  skeletonIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginBottom: spacing.sm,
  },
});
