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
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { loadThemeFromStorage } from "@/lib/ui/theme";
import { formatDateDDMMYYYY } from "@/utils/date";
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
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

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
};

type EventData = {
  id: string;
  name: string;
  date: string;
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
      loadThemeFromStorage(); // Load theme preference
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

  const getNextEvent = (): EventData | null => {
    if (events.length === 0) return null;
    const now = new Date().getTime();
    const futureEvents = events
      .filter((e) => {
        if (e.isCompleted) return false;
        if (!e.date) return false;
        const eventDate = new Date(e.date).getTime();
        return eventDate >= now;
      })
      .sort((a, b) => {
        const dateA = a.date ? new Date(a.date).getTime() : Infinity;
        const dateB = b.date ? new Date(b.date).getTime() : Infinity;
        return dateA - dateB;
      });
    return futureEvents.length > 0 ? futureEvents[0] : null;
  };

  const getLastEvent = (): EventData | null => {
    if (events.length === 0) return null;
    
    // Determine if event is completed:
    // - has isCompleted flag, OR
    // - has completedAt timestamp, OR
    // - has results (results exist means event was completed)
    const isEventCompleted = (e: EventData): boolean => {
      if (e.isCompleted) return true;
      if (e.completedAt) return true;
      if (e.results && Object.keys(e.results).length > 0) return true;
      return false;
    };
    
    // Get all completed events
    const completedEvents = events
      .filter(isEventCompleted)
      .sort((a, b) => {
        // Sort by completedAt if available, otherwise by date
        const dateA = a.completedAt 
          ? new Date(a.completedAt).getTime() 
          : (a.date ? new Date(a.date).getTime() : 0);
        const dateB = b.completedAt 
          ? new Date(b.completedAt).getTime() 
          : (b.date ? new Date(b.date).getTime() : 0);
        return dateB - dateA; // Most recent first
      });
    
    // If no completed events, try to find past events by date
    if (completedEvents.length === 0) {
      const now = new Date().getTime();
      const pastEvents = events
        .filter((e) => {
          if (!e.date) return false;
          const eventDate = new Date(e.date).getTime();
          return eventDate < now;
        })
        .sort((a, b) => {
          const dateA = a.date ? new Date(a.date).getTime() : 0;
          const dateB = b.date ? new Date(b.date).getTime() : 0;
          return dateB - dateA;
        });
      return pastEvents.length > 0 ? pastEvents[0] : null;
    }
    
    return completedEvents[0];
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

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#0B6E4F" />
      </View>
    );
  }

  if (!society) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.emptyTitle}>No Society Found</Text>
        <Text style={styles.emptyText}>Create a society to get started</Text>
        <PrimaryButton
          label="Create Society"
          onPress={() => router.push("/create-society")}
          style={styles.emptyButton}
        />
      </View>
    );
  }

  const nextEvent = getNextEvent();
  const lastEvent = getLastEvent();
  const lastWinner = lastEvent ? getLastWinner(lastEvent) : null;

  const isAdmin = role === "admin";

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.headerContent}>
              <Text style={styles.societyName}>{society.name}</Text>
              {currentMember ? (
                <Text style={styles.userIndicator}>
                  {currentMember.name} {userRoles.length > 0 && userRoles.filter(r => r !== "member").length > 0 
                    ? `(${userRoles.filter(r => r !== "member").map(r => r.charAt(0).toUpperCase() + r.slice(1)).join(", ")})`
                    : `(${role})`}
                </Text>
              ) : (
                <Pressable
                  onPress={() => router.push("/profile" as any)}
                  style={styles.selectProfileButton}
                >
                  <Text style={styles.selectProfileButtonText}>
                    Select your profile →
                  </Text>
                </Pressable>
              )}
            </View>
            {currentMember && (
              <Pressable
                onPress={() => router.push("/profile" as any)}
                style={styles.profileButton}
              >
                <Text style={styles.profileButtonText}>Profile</Text>
              </Pressable>
            )}
          </View>
          <View style={styles.divider} />
        </View>

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

        <View style={styles.eventsSection}>
          <Text style={styles.sectionLabel}>Next Event</Text>
          {nextEvent ? (
            <InfoCard
              title={nextEvent.name}
              subtitle={formatDateDDMMYYYY(nextEvent.date)}
              detail={
                (() => {
                  const rsvps = nextEvent.rsvps || {};
                  const going = Object.values(rsvps).filter((r) => r === "going").length;
                  const maybe = Object.values(rsvps).filter((r) => r === "maybe").length;
                  const notGoing = Object.values(rsvps).filter((r) => r === "no").length;
                  const rsvpText = going > 0 || maybe > 0 || notGoing > 0 
                    ? `RSVP: ${going} going, ${maybe} maybe, ${notGoing} not going` 
                    : undefined;
                  return rsvpText || (nextEvent.playerIds && nextEvent.playerIds.length > 0
                    ? `Players: ${nextEvent.playerIds.length}`
                    : nextEvent.courseName || undefined);
                })()
              }
              ctaLabel={isAdmin ? "View / Edit" : "View"}
              onPress={() => router.push(`/event/${nextEvent.id}` as any)}
            />
          ) : (
            <InfoCard
              title="No upcoming event"
              subtitle={canCreateEventsRole 
                ? "Tap Create Event to schedule your next society day"
                : "Ask your Captain or Secretary to create an event"}
              emptyState
            />
          )}
        </View>

        <View style={styles.eventsSection}>
          <Text style={styles.sectionLabel}>Last Event</Text>
          {lastEvent ? (
            <InfoCard
              title={lastEvent.name}
              subtitle={formatDateDDMMYYYY(lastEvent.date)}
              detail={
                lastEvent.winnerName
                  ? `Winner: ${lastEvent.winnerName}`
                  : lastWinner
                    ? `Winner: ${lastWinner.memberName}`
                    : lastEvent.courseName || undefined
              }
              ctaLabel="View Summary"
              onPress={() => router.push(`/event/${lastEvent.id}` as any)}
            />
          ) : (
            <InfoCard
              title="No events yet"
              subtitle="Your completed events will appear here"
              emptyState
            />
          )}
        </View>

        {/* ManCo Tools Section */}
        {isManCo && (
          <View style={styles.mancoSection}>
            <Text style={styles.sectionLabel}>ManCo Tools</Text>
            <View style={styles.mancoGrid}>
              {canViewFinanceRole && (
                <Pressable
                  onPress={() => router.push("/finance" as any)}
                  style={styles.mancoTile}
                >
                  <Text style={styles.mancoTileTitle}>Finance</Text>
                  <Text style={styles.mancoTileSubtitle}>Treasurer tools</Text>
                </Pressable>
              )}
              {canEditVenueRole && (
                <Pressable
                  onPress={() => router.push("/venue-info" as any)}
                  style={styles.mancoTile}
                >
                  <Text style={styles.mancoTileTitle}>Venue Info</Text>
                  <Text style={styles.mancoTileSubtitle}>Edit venues</Text>
                </Pressable>
              )}
              {canEditHandicapsRole && (
                <Pressable
                  onPress={() => router.push("/handicaps" as any)}
                  style={styles.mancoTile}
                >
                  <Text style={styles.mancoTileTitle}>Handicaps</Text>
                  <Text style={styles.mancoTileSubtitle}>Manage handicaps</Text>
                </Pressable>
              )}
              {canEditHandicapsRole && (
                <Pressable
                  onPress={() => router.push("/leaderboard" as any)}
                  style={styles.mancoTile}
                >
                  <Text style={styles.mancoTileTitle}>OOM / Leaderboard</Text>
                  <Text style={styles.mancoTileSubtitle}>View standings</Text>
                </Pressable>
              )}
              {canEditHandicapsRole && (
                <Pressable
                  onPress={() => router.push("/tees-teesheet" as any)}
                  style={styles.mancoTile}
                >
                  <Text style={styles.mancoTileTitle}>Tees & Tee Sheet</Text>
                  <Text style={styles.mancoTileSubtitle}>Manage tees & schedule</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}

        <Pressable
          onPress={() => router.push("/leaderboard" as any)}
          style={styles.leaderboardButton}
        >
          <Text style={styles.leaderboardButtonText}>Season Leaderboard</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  contentContainer: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    padding: 24,
    maxWidth: 600,
    alignSelf: "center",
    width: "100%",
  },
  centerContent: {
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    marginBottom: 28,
    marginTop: 8,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  headerContent: {
    flex: 1,
  },
  societyName: {
    fontSize: 32,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  userIndicator: {
    fontSize: 14,
    color: "#6b7280",
    fontWeight: "500",
  },
  profileButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
  },
  profileButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0B6E4F",
  },
  selectProfileButton: {
    marginTop: 4,
  },
  selectProfileButtonText: {
    fontSize: 14,
    color: "#0B6E4F",
    fontWeight: "600",
  },
  divider: {
    height: 1,
    backgroundColor: "#e5e7eb",
    width: "100%",
  },
  primaryCTA: {
    marginBottom: 20,
  },
  secondaryActions: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 32,
  },
  secondaryButton: {
    flex: 1,
  },
  eventsSection: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 2,
  },
  mancoSection: {
    marginBottom: 24,
  },
  mancoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  mancoTile: {
    flex: 1,
    minWidth: "47%",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
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
  emptyTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    opacity: 0.7,
    color: "#111827",
    marginBottom: 24,
  },
  emptyButton: {
    minWidth: 200,
  },
  leaderboardButton: {
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 20,
  },
  leaderboardButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0B6E4F",
  },
});
