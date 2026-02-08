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
import { LoadingState } from "@/components/ui/LoadingState";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { EmptyState } from "@/components/ui/EmptyState";
import { useBootstrap } from "@/lib/useBootstrap";
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
  const { society, member, societyId, loading: bootstrapLoading } = useBootstrap();
  const colors = getColors();

  // Data state
  const [events, setEvents] = useState<EventDoc[]>([]);
  const [oomStandings, setOomStandings] = useState<OrderOfMeritEntry[]>([]);
  const [recentResultsMap, setRecentResultsMap] = useState<Record<string, EventResultDoc[]>>({});
  const [dataLoading, setDataLoading] = useState(true);
  const [loadError, setLoadError] = useState<FormattedError | null>(null);

  // ============================================================================
  // Data Loading
  // ============================================================================

  const loadData = useCallback(async () => {
    if (!societyId) {
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
    } catch (err) {
      console.error("[Home] Failed to load data:", err);
      setLoadError(formatError(err));
    } finally {
      setDataLoading(false);
    }
  }, [societyId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      if (societyId) {
        loadData();
      }
    }, [societyId, loadData])
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
    return (
      <Screen>
        <EmptyState
          icon={<Feather name="users" size={24} color={colors.textTertiary} />}
          title="Welcome to The Golf Society Hub"
          message="Join an existing society with a code, or create your own."
          action={{
            label: "Join or Create a Society",
            onPress: () => router.replace("/onboarding"),
          }}
        />
      </Screen>
    );
  }

  // ============================================================================
  // Render
  // ============================================================================

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
          {(() => {
            const raw = member?.handicapIndex ?? (member as any)?.handicap_index ?? null;
            const hi = raw != null ? Number(raw) : null;
            const show = hi != null && Number.isFinite(hi);
            return show ? (
              <View style={[styles.badge, { backgroundColor: colors.info + "15" }]}>
                <AppText variant="small" style={{ fontWeight: "600", color: colors.info }}>
                  HI {hi!.toFixed(1)}
                </AppText>
              </View>
            ) : null;
          })()}
        </View>
      </AppCard>

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

            {/* Tee time placeholder */}
            <View style={[styles.teeTimeRow, { borderTopColor: colors.borderLight }]}>
              <Feather name="flag" size={14} color={colors.textTertiary} />
              <AppText variant="small" color="tertiary">Tee time to be published</AppText>
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
            let statusColor = colors.textTertiary;
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

      {/* Bottom spacing */}
      <View style={{ height: spacing["2xl"] }} />
    </Screen>
  );
}

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
