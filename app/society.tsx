/**
 * HOW TO TEST:
 * - Set member roles via Settings → Roles & Permissions
 * - Confirm member can't create event (should show alert and redirect)
 * - Confirm captain can create/edit events
 * - Confirm secretary can edit venue notes only
 * - Confirm handicapper can access results/handicaps
 * - Verify role badge shows on dashboard (e.g., "John Doe (Captain, Treasurer)")
 */

import { AppButton } from "@/components/ui/AppButton";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
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
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { getColors, spacing } from "@/lib/ui/theme";
import { useBootstrap } from "@/lib/useBootstrap";
import { subscribeSocietyDoc, type SocietyDoc } from "@/lib/db/societyRepo";
import { subscribeMembersBySociety, type MemberDoc } from "@/lib/db/memberRepo";
import { subscribeEventsBySociety, type EventDoc } from "@/lib/db/eventRepo";

export default function SocietyDashboardScreen() {
  const { user } = useBootstrap();
  const [society, setSociety] = useState<SocietyDoc | null>(null);
  const [events, setEvents] = useState<EventDoc[]>([]);
  const [members, setMembers] = useState<MemberDoc[]>([]);
  const [currentMember, setCurrentMember] = useState<MemberDoc | null>(null);
  const [loadingSociety, setLoadingSociety] = useState(true);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("members");

  useEffect(() => {
    if (!user?.activeSocietyId) {
      setSociety(null);
      setLoadingSociety(false);
      return;
    }
    setLoadingSociety(true);
    const unsubscribe = subscribeSocietyDoc(user.activeSocietyId, (doc) => {
      setSociety(doc);
      setLoadingSociety(false);
    });
    return () => unsubscribe();
  }, [user?.activeSocietyId]);

  useEffect(() => {
    if (!user?.activeSocietyId) {
      setMembers([]);
      setLoadingMembers(false);
      return;
    }
    setLoadingMembers(true);
    const unsubscribe = subscribeMembersBySociety(user.activeSocietyId, (items) => {
      setMembers(items);
      setLoadingMembers(false);
    });
    return () => unsubscribe();
  }, [user?.activeSocietyId]);

  useEffect(() => {
    if (!user?.activeSocietyId) {
      setEvents([]);
      setLoadingEvents(false);
      return;
    }
    setLoadingEvents(true);
    const unsubscribe = subscribeEventsBySociety(user.activeSocietyId, (items) => {
      setEvents(items);
      setLoadingEvents(false);
    });
    return () => unsubscribe();
  }, [user?.activeSocietyId]);

  useEffect(() => {
    if (!user?.activeMemberId) {
      setCurrentMember(null);
      return;
    }
    const member = members.find((m) => m.id === user.activeMemberId) || null;
    setCurrentMember(member);
  }, [members, user?.activeMemberId]);

  const userRoles = useMemo(() => currentMember?.roles ?? ["member"], [currentMember?.roles]);
  const normalizedSessionRole = useMemo(() => normalizeSessionRole("member"), []);
  const normalizedRoles = useMemo(() => normalizeMemberRoles(userRoles), [userRoles]);

  const isManCo = useMemo(
    () => normalizedRoles.some((role) => role !== "Member"),
    [normalizedRoles]
  );
  const canViewFinanceRole = useMemo(
    () => canViewFinance(normalizedSessionRole, normalizedRoles),
    [normalizedRoles, normalizedSessionRole]
  );
  const canEditVenueRole = useMemo(
    () => canEditVenueInfo(normalizedSessionRole, normalizedRoles),
    [normalizedRoles, normalizedSessionRole]
  );
  const canEditHandicapsRole = useMemo(
    () => canEditHandicaps(normalizedSessionRole, normalizedRoles),
    [normalizedRoles, normalizedSessionRole]
  );
  const canCreateEventsRole = useMemo(
    () => canCreateEvents(normalizedSessionRole, normalizedRoles),
    [normalizedRoles, normalizedSessionRole]
  );
  const canAssignRolesRole = useMemo(
    () => canAssignRoles(normalizedSessionRole, normalizedRoles),
    [normalizedRoles, normalizedSessionRole]
  );

  const getNextEvent = (): EventDoc | null => {
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

  const getLastEvent = (): EventDoc | null => {
    if (events.length === 0) return null;
    
    // Determine if event is completed:
    // - has isCompleted flag, OR
    // - has completedAt timestamp, OR
    // - has results (results exist means event was completed)
    const isEventCompleted = (e: EventDoc): boolean => {
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

  const getLastWinner = (event: EventDoc | null): { memberName: string } | null => {
    if (!event) return null;
    if (event.winnerName) {
      return { memberName: event.winnerName };
    }
    if (event.winnerId) {
      const member = members.find((m) => m.id === event.winnerId);
      return member ? { memberName: member.name } : null;
    }
    return null;
  };

  const colors = getColors();

  if (loadingSociety || loadingMembers || loadingEvents) {
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

  const isAdmin = normalizedRoles.includes("Captain");

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
                    : "(Member)"}
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
                {formatDateDDMMYYYY(nextEvent.date)}
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
                {formatDateDDMMYYYY(lastEvent.date)}
              </AppText>
              {(lastEvent.winnerName || lastWinner) && (
                <AppText variant="small" color="secondary" style={styles.eventDetail}>
                  Winner: {lastEvent.winnerName || lastWinner?.memberName}
                </AppText>
              )}
              <SecondaryButton
                onPress={() => router.push(`/event/${lastEvent.id}` as any)}
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
              Your completed events will appear here
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
