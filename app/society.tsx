/**
 * HOW TO TEST:
 * - Set member roles via Settings → Roles & Permissions
 * - Confirm member can't create event (should show alert and redirect)
 * - Confirm captain can create/edit events
 * - Confirm secretary can edit venue notes only
 * - Confirm handicapper can access results/handicaps
 * - Verify role badge shows on dashboard (e.g., "John Doe (Captain, Treasurer)")
 */

import { InfoCard } from "@/components/ui/info-card";
import { AppButton } from "@/components/ui/AppButton";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { formatDateDDMMYYYY, toJsDate } from "@/utils/date";
import {
  canAssignRoles,
  canCreateEvents,
  canEditHandicaps,
  canEditVenueInfo,
  canViewFinance,
  normalizeMemberRoles,
  normalizeSessionRole,
} from "@/lib/permissions";
import { getCurrentUserRoles, hasManCoRole } from "@/lib/roles";
import { getSession } from "@/lib/session";
import { STORAGE_KEYS } from "@/lib/storage";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { getColors, spacing } from "@/lib/ui/theme";

const STORAGE_KEY = STORAGE_KEYS.SOCIETY_ACTIVE;
const EVENTS_KEY = STORAGE_KEYS.EVENTS;
const MEMBERS_KEY = STORAGE_KEYS.MEMBERS;
const SCORES_KEY = STORAGE_KEYS.SCORES;
const DRAFT_KEY = STORAGE_KEYS.SOCIETY_DRAFT;

type SocietyData = {
  name: string;
  homeCourse: string;
  country: string;
  scoringMode: "Stableford" | "Strokeplay" | "Both";
  handicapRule: "Allow WHS" | "Fixed HCP" | "No HCP";
  logoUrl?: string | null;
};

type EventData = {
  id: string;
  name: string;
  date: any;
  courseName: string;
  format: "Stableford" | "Strokeplay" | "Both";
  playerIds?: string[];
  isCompleted?: boolean;
  completedAt?: string;
  resultsStatus?: "draft" | "published";
  publishedAt?: string;
  resultsUpdatedAt?: string;
  isOOM?: boolean;
  winnerId?: string;
  winnerName?: string;
  handicapSnapshot?: { [memberId: string]: number };
  rsvps?: {
    [memberId: string]: "going" | "maybe" | "no";
  };
  results?: {
    [memberId: string]: {
      grossScore: number;
      netScore?: number;
      stableford?: number;
      strokeplay?: number;
    };
  };
};

type MemberData = {
  id: string;
  name: string;
  handicap?: number;
};

type ScoreData = {
  stableford?: number;
  strokeplay?: number;
};

type ScoresData = {
  [eventId: string]: {
    [memberId: string]: ScoreData;
  };
};

export default function SocietyDashboardScreen() {
  const [society, setSociety] = useState<SocietyData | null>(null);
  const [events, setEvents] = useState<EventData[]>([]);
  const [members, setMembers] = useState<MemberData[]>([]);
  const [scores, setScores] = useState<ScoresData>({});
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [role, setRole] = useState<"admin" | "member">("member");
  const [currentMember, setCurrentMember] = useState<MemberData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isManCo, setIsManCo] = useState(false);
  const [canViewFinanceRole, setCanViewFinanceRole] = useState(false);
  const [canEditVenueRole, setCanEditVenueRole] = useState(false);
  const [canEditHandicapsRole, setCanEditHandicapsRole] = useState(false);
  const [canCreateEventsRole, setCanCreateEventsRole] = useState(false);
  const [canAssignRolesRole, setCanAssignRolesRole] = useState(false);
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string>("members");

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      const societyData = await AsyncStorage.getItem(STORAGE_KEY);
      if (societyData) {
        setSociety(JSON.parse(societyData));
      }

      const eventsData = await AsyncStorage.getItem(EVENTS_KEY);
      if (eventsData) {
        setEvents(JSON.parse(eventsData));
      }

      const membersData = await AsyncStorage.getItem(MEMBERS_KEY);
      const loadedMembers = membersData ? JSON.parse(membersData) : [];
      setMembers(loadedMembers);

      const scoresData = await AsyncStorage.getItem(SCORES_KEY);
      if (scoresData) {
        setScores(JSON.parse(scoresData));
      }

      // Load session (single source of truth)
      const session = await getSession();
      setCurrentUserId(session.currentUserId);
      setRole(session.role);
      
      // Find member data from loaded members
      if (session.currentUserId) {
        const member = loadedMembers.find((m: MemberData) => m.id === session.currentUserId);
        setCurrentMember(member || null);
      } else {
        setCurrentMember(null);
      }

      // Load current user roles for display
      const roles = await getCurrentUserRoles();
      setUserRoles(roles);
      const normalizedSessionRole = normalizeSessionRole(session.role);
      const normalizedRoles = normalizeMemberRoles(roles);

      // Check role permissions
      const manCo = await hasManCoRole();
      setIsManCo(manCo);
      setCanViewFinanceRole(canViewFinance(normalizedSessionRole, normalizedRoles));
      setCanEditVenueRole(canEditVenueInfo(normalizedSessionRole, normalizedRoles));
      setCanEditHandicapsRole(canEditHandicaps(normalizedSessionRole, normalizedRoles));
      setCanCreateEventsRole(canCreateEvents(normalizedSessionRole, normalizedRoles));
      setCanAssignRolesRole(canAssignRoles(normalizedSessionRole, normalizedRoles));
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  type EventWithDate = EventData & { eventDate: Date | null };

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const toLocalDateOnly = (d: Date): Date => {
    const copy = new Date(d);
    copy.setHours(0, 0, 0, 0);
    return copy;
  };

  const getEventsWithDate = (): EventWithDate[] => {
    return events.map((e) => ({
      ...e,
      eventDate: (() => {
        const d = toJsDate(e?.date);
        return d ? toLocalDateOnly(d) : null;
      })(),
    }));
  };

  const getNextEvent = (): EventWithDate | null => {
    const withDate = getEventsWithDate();
    const next = withDate
      .filter((e) => e.eventDate && e.eventDate.getTime() >= todayStart.getTime())
      .sort((a, b) => {
        const aTime = a.eventDate ? a.eventDate.getTime() : Number.POSITIVE_INFINITY;
        const bTime = b.eventDate ? b.eventDate.getTime() : Number.POSITIVE_INFINITY;
        return aTime - bTime;
      })[0];
    return next || null;
  };

  const getLastEvent = (): EventWithDate | null => {
    const withDate = getEventsWithDate();
    const last = withDate
      .filter((e) => e.eventDate && e.eventDate.getTime() < todayStart.getTime())
      .sort((a, b) => {
        const aTime = a.eventDate ? a.eventDate.getTime() : 0;
        const bTime = b.eventDate ? b.eventDate.getTime() : 0;
        return bTime - aTime;
      })[0];
    return last || null;
  };

  const getLastWinner = (event: EventData | null): { memberName: string } | null => {
    if (!event || !scores[event.id]) return null;

    const eventScores = scores[event.id];
    const memberScores = members
      .map((member) => {
        const memberScore = eventScores[member.id];
        if (!memberScore) return null;

        let score: number | null = null;
        let useStableford = false;

        if (event.format === "Stableford" && memberScore.stableford !== undefined) {
          score = memberScore.stableford;
          useStableford = true;
        } else if (event.format === "Strokeplay" && memberScore.strokeplay !== undefined) {
          score = memberScore.strokeplay;
          useStableford = false;
        } else if (event.format === "Both") {
          if (memberScore.stableford !== undefined) {
            score = memberScore.stableford;
            useStableford = true;
          } else if (memberScore.strokeplay !== undefined) {
            score = memberScore.strokeplay;
            useStableford = false;
          }
        }

        return score !== null ? { member, score, useStableford } : null;
      })
      .filter((item): item is { member: MemberData; score: number; useStableford: boolean } => item !== null);

    if (memberScores.length === 0) return null;

    const sorted = memberScores.sort((a, b) => {
      if (a.useStableford) {
        return b.score - a.score;
      } else {
        return a.score - b.score;
      }
    });

    return {
      memberName: sorted[0].member.name,
    };
  };

  const colors = getColors();

  if (loading) {
    return (
      <Screen scrollable={false}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (!society) {
    return (
      <Screen>
        <AppText variant="h1">No Society Found</AppText>
        <AppText variant="body" color="secondary" style={styles.emptyText}>
          Create a society to get started
        </AppText>
        <PrimaryButton
          onPress={() => router.push("/create-society")}
          style={styles.emptyButton}
        >
          Create Society
        </PrimaryButton>
      </Screen>
    );
  }

  const nextEvent = getNextEvent();
  const lastEvent = getLastEvent();
  const lastWinner = lastEvent ? getLastWinner(lastEvent) : null;

  const isAdmin = role === "admin";

  return (
    <Screen>
        <AppCard style={styles.headerCard}>
          <View style={styles.headerTop}>
            <View style={styles.headerContent}>
              <AppText variant="title">{society.name}</AppText>
              {currentMember ? (
                <AppText variant="small" color="secondary" style={styles.userIndicator}>
                  {currentMember.name} {userRoles.length > 0 && userRoles.filter(r => r !== "member").length > 0 
                    ? `(${userRoles.filter(r => r !== "member").map(r => r.charAt(0).toUpperCase() + r.slice(1)).join(", ")})`
                    : `(${role})`}
                </AppText>
              ) : (
                <Pressable
                  onPress={() => router.push("/profile" as any)}
                  style={styles.selectProfileButton}
                >
                  <AppText variant="small" style={styles.selectProfileButtonText}>
                    Select your profile →
                  </AppText>
                </Pressable>
              )}
            </View>
            {currentMember && (
              <SecondaryButton
                onPress={() => router.push("/profile" as any)}
                size="sm"
              >
                Profile
              </SecondaryButton>
            )}
          </View>
        </AppCard>

        {canCreateEventsRole && (
          <AppButton
            label="Create Event"
            onPress={() => router.push("/create-event" as any)}
            variant="primary"
            size="lg"
            fullWidth
            style={styles.primaryCTA}
          />
        )}

        <SegmentedTabs
          items={[
            { id: "members", label: "Members" },
            { id: "history", label: "History" },
            { id: "profile", label: "Profile" },
            ...(isAdmin ? [{ id: "settings", label: "Settings" }] : []),
          ]}
          selectedId={activeTab}
          onSelect={(id) => {
            setActiveTab(id);
            const routes: Record<string, string> = {
              members: "/members",
              history: "/history",
              profile: "/profile",
              settings: "/settings",
            };
            router.push(routes[id] as any);
          }}
        />

        <SectionHeader title="Next Event" />
        {nextEvent ? (
          <AppCard style={styles.eventCard}>
            <Pressable onPress={() => router.push(`/event/${nextEvent.id}` as any)}>
              <AppText variant="h2" style={styles.eventTitle}>{nextEvent.name}</AppText>
              <AppText variant="body" color="secondary" style={styles.eventSubtitle}>
                {formatDateDDMMYYYY(nextEvent.eventDate ?? nextEvent.date)}
              </AppText>
              {(() => {
                const rsvps = nextEvent.rsvps || {};
                const going = Object.values(rsvps).filter((r) => r === "going").length;
                const maybe = Object.values(rsvps).filter((r) => r === "maybe").length;
                const notGoing = Object.values(rsvps).filter((r) => r === "no").length;
                const rsvpText = going > 0 || maybe > 0 || notGoing > 0 
                  ? `RSVP: ${going} going, ${maybe} maybe, ${notGoing} not going` 
                  : undefined;
                const detail = rsvpText || (nextEvent.playerIds && nextEvent.playerIds.length > 0
                  ? `Players: ${nextEvent.playerIds.length}`
                  : nextEvent.courseName || undefined);
                return detail ? (
                  <AppText variant="small" color="secondary" style={styles.eventDetail}>
                    {detail}
                  </AppText>
                ) : null;
              })()}
              <SecondaryButton
                onPress={() => router.push(`/event/${nextEvent.id}` as any)}
                size="sm"
                style={styles.eventButton}
              >
                {isAdmin ? "View / Edit" : "View"}
              </SecondaryButton>
            </Pressable>
          </AppCard>
        ) : (
          <AppCard style={styles.eventCard}>
            <AppText variant="body" color="secondary" style={styles.emptyText}>
              {canCreateEventsRole 
                ? "Tap Create Event to schedule your next society day"
                : "Ask your Captain or Secretary to create an event"}
            </AppText>
          </AppCard>
        )}

        <SectionHeader title="Last Event" style={styles.sectionHeader} />
        {lastEvent ? (
          <AppCard style={styles.eventCard}>
            <Pressable onPress={() => router.push(`/event/${lastEvent.id}` as any)}>
              <AppText variant="h2" style={styles.eventTitle}>{lastEvent.name}</AppText>
              <AppText variant="body" color="secondary" style={styles.eventSubtitle}>
                {formatDateDDMMYYYY(lastEvent.eventDate ?? lastEvent.date)}
              </AppText>
              {(lastEvent.winnerName || lastWinner) && (
                <AppText variant="small" color="secondary" style={styles.eventDetail}>
                  Winner: {lastEvent.winnerName || lastWinner?.memberName}
                </AppText>
              )}
              <SecondaryButton
                onPress={() => router.push(`/event/${lastEvent.id}/results` as any)}
                size="sm"
                style={styles.eventButton}
              >
                View Summary
              </SecondaryButton>
            </Pressable>
          </AppCard>
        ) : (
          <AppCard style={styles.eventCard}>
            <AppText variant="body" color="secondary" style={styles.emptyText}>
              No past events yet
            </AppText>
          </AppCard>
        )}

        {/* ManCo Tools Section */}
        {isManCo && (
          <>
            <SectionHeader title="ManCo Tools" style={styles.sectionHeader} />
            <View style={styles.mancoGrid}>
              {canViewFinanceRole && (
                <AppCard style={styles.mancoTile}>
                  <Pressable
                    onPress={() => router.push("/finance" as any)}
                    style={styles.mancoTilePressable}
                  >
                    <AppText variant="bodyBold">Finance</AppText>
                    <AppText variant="small" color="secondary">Treasurer tools</AppText>
                  </Pressable>
                </AppCard>
              )}
              {canEditVenueRole && (
                <AppCard style={styles.mancoTile}>
                  <Pressable
                    onPress={() => router.push("/venue-info" as any)}
                    style={styles.mancoTilePressable}
                  >
                    <AppText variant="bodyBold">Venue Info</AppText>
                    <AppText variant="small" color="secondary">Edit venues</AppText>
                  </Pressable>
                </AppCard>
              )}
              {canEditHandicapsRole && (
                <AppCard style={styles.mancoTile}>
                  <Pressable
                    onPress={() => router.push("/handicaps" as any)}
                    style={styles.mancoTilePressable}
                  >
                    <AppText variant="bodyBold">Handicaps</AppText>
                    <AppText variant="small" color="secondary">Manage handicaps</AppText>
                  </Pressable>
                </AppCard>
              )}
              {canEditHandicapsRole && (
                <AppCard style={styles.mancoTile}>
                  <Pressable
                    onPress={() => router.push("/leaderboard" as any)}
                    style={styles.mancoTilePressable}
                  >
                    <AppText variant="bodyBold">Order of Merit / Leaderboard</AppText>
                    <AppText variant="small" color="secondary">View standings</AppText>
                  </Pressable>
                </AppCard>
              )}
              {canEditHandicapsRole && (
                <AppCard style={styles.mancoTile}>
                  <Pressable
                    onPress={() => router.push("/tees-teesheet" as any)}
                    style={styles.mancoTilePressable}
                  >
                    <AppText variant="bodyBold">Tees & Tee Sheet</AppText>
                    <AppText variant="small" color="secondary">Manage tees & schedule</AppText>
                  </Pressable>
                </AppCard>
              )}
            </View>
          </>
        )}

        <SecondaryButton
          onPress={() => router.push("/leaderboard" as any)}
          style={styles.leaderboardButton}
        >
          Season Leaderboard
        </SecondaryButton>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    maxWidth: 600,
    alignSelf: "center",
    width: "100%",
  },
  centerContent: {
    justifyContent: "center",
    alignItems: "center",
  },
  headerCard: {
    marginBottom: spacing.lg,
    marginTop: spacing.xs,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerContent: {
    flex: 1,
    marginRight: spacing.md,
  },
  userIndicator: {
    marginTop: spacing.xs,
  },
  selectProfileButton: {
    marginTop: spacing.xs,
  },
  selectProfileButtonText: {
    color: "#0B6E4F",
  },
  primaryCTA: {
    marginBottom: spacing.lg,
  },
  secondaryActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  secondaryButton: {
    flex: 1,
  },
  sectionHeader: {
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  eventCard: {
    marginBottom: spacing.base,
  },
  eventTitle: {
    marginBottom: spacing.xs,
  },
  eventSubtitle: {
    marginBottom: spacing.xs,
  },
  eventDetail: {
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  eventButton: {
    marginTop: spacing.sm,
  },
  emptyText: {
    textAlign: "center",
    paddingVertical: spacing.md,
  },
  mancoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  mancoTile: {
    flex: 1,
    minWidth: "47%",
    alignItems: "center",
  },
  mancoTilePressable: {
    width: "100%",
    alignItems: "center",
  },
  mancoTileTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  mancoTileSubtitle: {
    fontSize: 12,
    color: "#6b7280",
  },
  emptyButton: {
    minWidth: 200,
  },
  leaderboardButton: {
    marginTop: spacing.xl,
  },
});
