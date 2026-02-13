/**
 * Member Home Screen
 * Premium, personal home landing for logged-in members.
 * Read-only, member-first experience with society context.
 *
 * Cards (top to bottom):
 *  A) Header Card — identity, role badge, handicap
 *  B) Next Event Card — upcoming event + FairwayWeather link
 *  C) My Season Snapshot Card — events played, OOM points, rank
 *  D) Order of Merit Teaser Card — top 5 + pinned current user
 *  E) Recent Activity Card — last 3 past events with result status
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, View, Pressable, Image, Linking } from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { PrimaryButton } from "@/components/ui/Button";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { Toast } from "@/components/ui/Toast";
import { useBootstrap } from "@/lib/useBootstrap";
import { isCaptain } from "@/lib/rbac";
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

// ============================================================================
// Main Component
// ============================================================================

export default function HomeScreen() {
  const router = useRouter();
  const { society, member, societyId, profile, loading: bootstrapLoading } = useBootstrap();
  const colors = getColors();

  // Data state
  const [events, setEvents] = useState<EventDoc[]>([]);
  const [oomStandings, setOomStandings] = useState<OrderOfMeritEntry[]>([]);
  const [recentResultsMap, setRecentResultsMap] = useState<Record<string, EventResultDoc[]>>({});
  const [dataLoading, setDataLoading] = useState(true);
  const [loadError, setLoadError] = useState<FormattedError | null>(null);
  const [activeSinbook, setActiveSinbook] = useState<SinbookWithParticipants | null>(null);

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
  const currentYear = new Date().getFullYear();

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
  // Navigation Helpers
  // ============================================================================

  const openEvent = (eventId: string) => {
    if (!eventId) return;
    router.push({ pathname: "/(app)/event/[id]", params: { id: eventId } });
  };

  const openLeaderboard = () => {
    router.push("/(app)/(tabs)/leaderboard");
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
      <Screen scrollable>
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

  // Handicap for header badge — computed once, no IIFE
  const _hiRaw = (member as any)?.handicap_index ?? member?.handicapIndex ?? null;
  const _hiNum = _hiRaw != null ? Number(_hiRaw) : null;
  const memberHiText = (_hiNum != null && Number.isFinite(_hiNum)) ? `HI ${_hiNum.toFixed(1)}` : null;
  console.log("[Home] handicap render:", { handicap_index: (member as any)?.handicap_index, handicapIndex: member?.handicapIndex, memberHiText });

  return (
    <Screen>
      {loadError && (
        <InlineNotice
          variant="error"
          message={loadError.message}
          detail={loadError.detail}
          style={{ marginBottom: spacing.base }}
        />
      )}

      {/* ================================================================== */}
      {/* A) HEADER CARD — Identity                                          */}
      {/* ================================================================== */}
      <AppCard style={styles.headerCard}>
        <View style={styles.headerRow}>
          {logoUrl ? (
            <Image source={{ uri: logoUrl }} style={styles.headerLogo} resizeMode="contain" />
          ) : (
            <View style={[styles.headerLogoPlaceholder, { backgroundColor: colors.primary + "15" }]}>
              <AppText variant="h1" color="primary">{getInitials(society.name)}</AppText>
            </View>
          )}
          <View style={styles.headerTextBlock}>
            <AppText variant="h2" numberOfLines={1}>{society.name}</AppText>
            <AppText variant="body" color="secondary" numberOfLines={1}>
              {member?.displayName || member?.name || "Member"}
            </AppText>
          </View>
        </View>

        <View style={styles.headerMeta}>
          {/* Role badge */}
          <View style={[styles.badge, { backgroundColor: colors.primary + "15" }]}>
            <AppText variant="small" color="primary" style={{ fontWeight: "600" }}>
              {formatRole(member?.role)}
            </AppText>
          </View>

          {/* Handicap */}
          {memberHiText ? (
            <View style={[styles.badge, { backgroundColor: colors.info + "15" }]}>
              <AppText variant="small" style={{ fontWeight: "600", color: colors.info }}>
                {memberHiText}
              </AppText>
            </View>
          ) : null}
        </View>
      </AppCard>

      {/* ================================================================== */}
      {/* COMPLETE PROFILE BANNER                                            */}
      {/* ================================================================== */}
      {!profileComplete && (
        <Pressable onPress={() => router.push("/(app)/my-profile")}>
          <AppCard style={[styles.profileBanner, { borderColor: colors.info + "40" }]}>
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
        <AppCard style={[styles.licenceBanner, { borderColor: colors.warning + "40" }]}>
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
          <Pressable onPress={() => openEvent(nextEvent.id)}>
            <View style={[styles.notificationBanner, { backgroundColor: colors.success + "15", borderColor: colors.success + "30" }]}>
              <Feather name="bell" size={16} color={colors.success} />
              <View style={{ flex: 1 }}>
                <AppText variant="bodyBold" style={{ color: colors.success }}>
                  Tee times now available!
                </AppText>
                <AppText variant="small" color="secondary">
                  {nextEvent.name} — First tee: {nextEvent.teeTimeStart || "TBC"}
                </AppText>
              </View>
              <Feather name="chevron-right" size={16} color={colors.success} />
            </View>
          </Pressable>
        );
      })()}

      {/* ================================================================== */}
      {/* B) NEXT EVENT CARD                                                 */}
      {/* ================================================================== */}
      {nextEvent ? (
        <Pressable onPress={() => openEvent(nextEvent.id)}>
          <AppCard style={styles.nextEventCard} elevated>
            <View style={styles.cardTitleRow}>
              <Feather name="calendar" size={16} color={colors.primary} />
              <AppText variant="captionBold" color="primary">Next Event</AppText>
            </View>

            <AppText variant="h2" style={{ marginTop: spacing.xs }}>
              {nextEvent.name}
            </AppText>

            {nextEvent.courseName && (
              <AppText variant="body" color="secondary" style={{ marginTop: 2 }}>
                {nextEvent.courseName}
              </AppText>
            )}

            <View style={styles.nextEventDetails}>
              <View style={styles.nextEventChip}>
                <Feather name="clock" size={13} color={colors.textSecondary} />
                <AppText variant="small" color="secondary">{formatEventDate(nextEvent.date)}</AppText>
              </View>
              {nextEvent.format && (
                <View style={styles.nextEventChip}>
                  <Feather name="target" size={13} color={colors.textSecondary} />
                  <AppText variant="small" color="secondary">{formatFormatLabel(nextEvent.format)}</AppText>
                </View>
              )}
              {nextEvent.classification && (
                <View style={styles.nextEventChip}>
                  <Feather name="tag" size={13} color={colors.textSecondary} />
                  <AppText variant="small" color="secondary">{formatClassification(nextEvent.classification)}</AppText>
                </View>
              )}
            </View>

            {/* OOM badge */}
            {nextEvent.isOOM && (
              <View style={[styles.oomBadge, { backgroundColor: colors.warning + "20" }]}>
                <Feather name="award" size={12} color={colors.warning} />
                <AppText variant="small" style={{ color: colors.warning, fontWeight: "600", marginLeft: 4 }}>
                  Counts toward Order of Merit
                </AppText>
              </View>
            )}

            {/* Tee time info */}
            <View style={[styles.teeTimeRow, { borderTopColor: colors.borderLight }]}>
              <Feather name="flag" size={14} color={nextEvent.teeTimePublishedAt ? colors.success : colors.textTertiary} />
              {nextEvent.teeTimePublishedAt ? (
                <AppText variant="small" style={{ color: colors.success, fontWeight: "600" }}>
                  Tee times available — First tee: {nextEvent.teeTimeStart || "TBC"}
                  {nextEvent.teeTimeInterval ? `, ${nextEvent.teeTimeInterval} min intervals` : ""}
                </AppText>
              ) : (
                <AppText variant="small" color="tertiary">Tee times to be published</AppText>
              )}
            </View>

            {/* FairwayWeather mini-card */}
            <Pressable
              onPress={openFairwayWeather}
              style={({ pressed }) => [
                styles.weatherRow,
                { backgroundColor: colors.backgroundTertiary, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Feather name="cloud" size={14} color={colors.primary} />
              <AppText variant="small" color="primary" style={{ flex: 1, fontWeight: "500" }}>
                View detailed forecast
              </AppText>
              <AppText variant="small" color="tertiary" style={{ fontSize: 10 }}>
                Powered by FairwayWeather.com
              </AppText>
              <Feather name="external-link" size={12} color={colors.textTertiary} style={{ marginLeft: 4 }} />
            </Pressable>

            <View style={styles.chevronHint}>
              <Feather name="chevron-right" size={18} color={colors.textTertiary} />
            </View>
          </AppCard>
        </Pressable>
      ) : (
        <AppCard>
          <View style={styles.cardTitleRow}>
            <Feather name="calendar" size={16} color={colors.textTertiary} />
            <AppText variant="captionBold" color="tertiary">Next Event</AppText>
          </View>
          <AppText variant="body" color="secondary" style={{ marginTop: spacing.sm }}>
            No upcoming events scheduled. Check back soon!
          </AppText>
        </AppCard>
      )}

      {/* ================================================================== */}
      {/* C) MY SEASON SNAPSHOT                                              */}
      {/* ================================================================== */}
      {mySnapshot && (
        <Pressable onPress={openLeaderboard}>
          <AppCard>
            <View style={styles.cardTitleRow}>
              <Feather name="bar-chart-2" size={16} color={colors.primary} />
              <AppText variant="captionBold" color="primary">My {currentYear} Season</AppText>
            </View>

            <View style={styles.snapshotGrid}>
              <View style={styles.snapshotItem}>
                <AppText variant="h1">
                  {mySnapshot.totalPoints > 0 ? formatPoints(mySnapshot.totalPoints) : "—"}
                </AppText>
                <AppText variant="small" color="secondary">Order of Merit Pts</AppText>
              </View>
              <View style={[styles.snapshotDivider, { backgroundColor: colors.borderLight }]} />
              <View style={styles.snapshotItem}>
                <AppText variant="h1">
                  {mySnapshot.rank > 0 ? `${mySnapshot.rank}` : "—"}
                </AppText>
                <AppText variant="small" color="secondary">
                  {mySnapshot.rank > 0 ? `of ${mySnapshot.totalWithPoints}` : "Rank"}
                </AppText>
              </View>
            </View>

            {mySnapshot.totalPoints === 0 && (
              <AppText
                variant="small"
                color="tertiary"
                style={{ textAlign: "center", marginTop: spacing.sm }}
              >
                Play an Order of Merit event to enter the standings
              </AppText>
            )}

            <View style={styles.chevronHint}>
              <Feather name="chevron-right" size={18} color={colors.textTertiary} />
            </View>
          </AppCard>
        </Pressable>
      )}

      {/* ================================================================== */}
      {/* D) ORDER OF MERIT TEASER                                           */}
      {/* ================================================================== */}
      {oomStandings.length > 0 && (
        <Pressable onPress={openLeaderboard}>
          <AppCard>
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
                    {entry.rank}
                  </AppText>
                  <AppText
                    variant={isMe ? "bodyBold" : "body"}
                    style={{ flex: 1 }}
                    numberOfLines={1}
                  >
                    {entry.memberName}{isMe ? " (You)" : ""}
                  </AppText>
                  <AppText variant="captionBold" color="primary">
                    {formatPoints(entry.totalPoints)} pts
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
                    {oomTeaser.myEntry.rank}
                  </AppText>
                  <AppText variant="bodyBold" style={{ flex: 1 }} numberOfLines={1}>
                    You
                  </AppText>
                  <AppText variant="captionBold" color="primary">
                    {formatPoints(oomTeaser.myEntry.totalPoints)} pts
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

            // Determine status text
            let statusText = "Results pending";
            let statusColor: string = colors.textTertiary;
            if (hasResults && event.isOOM && myResult) {
              statusText = `${formatPoints(myResult.points)} Order of Merit pts`;
              statusColor = colors.primary;
            } else if (hasResults && event.isOOM && !myResult) {
              statusText = "No Order of Merit points";
              statusColor = colors.textSecondary;
            } else if (hasResults && !event.isOOM) {
              statusText = "Results available";
              statusColor = colors.success;
            }

            return (
              <Pressable key={event.id} onPress={() => openEvent(event.id)}>
                <AppCard style={styles.recentCard}>
                  <View style={styles.recentRow}>
                    <View style={[styles.recentDateBadge, { backgroundColor: colors.backgroundTertiary }]}>
                      <AppText variant="captionBold" color="primary">
                        {formatShortDate(event.date)}
                      </AppText>
                    </View>
                    <View style={{ flex: 1 }}>
                      <AppText variant="bodyBold" numberOfLines={1}>{event.name}</AppText>
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
        <AppCard style={{ marginTop: spacing.sm }}>
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
      <Pressable onPress={() => router.push("/(app)/(tabs)/sinbook")}>
        <AppCard>
          <View style={styles.cardTitleRow}>
            <Feather name="zap" size={16} color={colors.primary} />
            <AppText variant="captionBold" color="primary">Sinbook</AppText>
          </View>
          {activeSinbook ? (
            <View style={{ marginTop: spacing.xs }}>
              <AppText variant="bodyBold" numberOfLines={1}>{activeSinbook.title}</AppText>
              <AppText variant="caption" color="secondary">
                vs {activeSinbook.participants.find((p) => p.user_id !== memberId && p.status === "accepted")?.display_name || "rival"}
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

      {/* Bottom spacing */}
      <View style={{ height: spacing["2xl"] }} />
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
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const { profile: pmProfile } = useBootstrap();
  const pmProfileComplete = pmProfile?.profile_complete === true;

  return (
    <Screen>
      {/* Welcome header */}
      <View style={personalStyles.welcomeSection}>
        <View style={[personalStyles.welcomeIcon, { backgroundColor: colors.primary + "14" }]}>
          <Feather name="flag" size={32} color={colors.primary} />
        </View>
        <AppText variant="title" style={personalStyles.welcomeTitle}>
          Welcome
        </AppText>
        <AppText variant="body" color="secondary" style={personalStyles.welcomeSubtitle}>
          Use the app as an individual, or join a society when you're ready.
        </AppText>
      </View>

      {/* Complete profile banner */}
      {!pmProfileComplete && (
        <Pressable onPress={() => router.push("/(app)/my-profile")}>
          <AppCard style={[styles.profileBanner, { borderColor: colors.info + "40" }]}>
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
      <Pressable onPress={() => router.push("/(app)/(tabs)/sinbook")}>
        <AppCard>
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

      <AppCard>
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

      <Pressable onPress={() => router.push("/(app)/(tabs)/settings")}>
        <AppCard>
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
        <AppCard style={[personalStyles.nudgeCard, { borderColor: colors.primary + "25" }]}>
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
              onPress={() => router.push("/onboarding")}
              size="sm"
              style={{ flex: 1 }}
            >
              Enter join code
            </PrimaryButton>
            <Pressable
              onPress={() => router.push("/onboarding")}
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

      <View style={{ height: spacing["2xl"] }} />
    </Screen>
  );
}

const personalStyles = StyleSheet.create({
  welcomeSection: {
    alignItems: "center",
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  welcomeIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
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
      {/* Header skeleton */}
      <AppCard>
        <View style={styles.headerRow}>
          <View style={[styles.headerLogoPlaceholder, { backgroundColor: shimmer }]} />
          <View style={styles.headerTextBlock}>
            <View style={[styles.skeletonLine, { width: "60%", backgroundColor: shimmer }]} />
            <View style={[styles.skeletonLine, { width: "40%", backgroundColor: shimmer, marginTop: 6 }]} />
          </View>
        </View>
        <View style={[styles.headerMeta, { marginTop: spacing.sm }]}>
          <View style={[styles.skeletonBadge, { backgroundColor: shimmer }]} />
          <View style={[styles.skeletonBadge, { backgroundColor: shimmer }]} />
        </View>
      </AppCard>

      {/* Next event skeleton */}
      <AppCard>
        <View style={[styles.skeletonLine, { width: "30%", backgroundColor: shimmer }]} />
        <View style={[styles.skeletonLine, { width: "80%", backgroundColor: shimmer, marginTop: 10 }]} />
        <View style={[styles.skeletonLine, { width: "50%", backgroundColor: shimmer, marginTop: 6 }]} />
        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: 12 }}>
          <View style={[styles.skeletonBadge, { backgroundColor: shimmer }]} />
          <View style={[styles.skeletonBadge, { backgroundColor: shimmer }]} />
        </View>
      </AppCard>

      {/* Snapshot skeleton */}
      <AppCard>
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
  // Header Card
  headerCard: {
    marginBottom: spacing.base,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  headerLogo: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
  },
  headerLogoPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  headerMeta: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
    flexWrap: "wrap",
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
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

  // Card title row
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },

  // Next Event Card
  nextEventCard: {
    marginBottom: spacing.base,
  },
  nextEventDetails: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  nextEventChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
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
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
  },

  // FairwayWeather
  weatherRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },

  // Chevron hint
  chevronHint: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    marginTop: spacing.sm,
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
  },
  recentCard: {
    marginBottom: spacing.xs,
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
    paddingVertical: spacing.lg,
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
});
