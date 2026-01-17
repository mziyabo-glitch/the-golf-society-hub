/**
 * HOW TO TEST:
 * - Set member roles via Settings → Roles & Permissions
 * - Confirm member can't create event (should show alert and redirect)
 * - Confirm captain can create/edit events
 * - Confirm secretary can edit venue notes only
 * - Confirm handicapper can access results/handicaps
 * - Verify role badge shows on dashboard (e.g., "John Doe (Captain, Treasurer)")
 */

import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
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
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { getColors, radius, shadows, spacing } from "@/lib/ui/theme";
import { useBootstrap } from "@/lib/useBootstrap";
import { subscribeSocietyDoc, type SocietyDoc } from "@/lib/db/societyRepo";
import { subscribeMembersBySociety, type MemberDoc } from "@/lib/db/memberRepo";
import { subscribeEventsBySociety, type EventDoc } from "@/lib/db/eventRepo";

const formatRoleLabel = (role: string) => role.charAt(0).toUpperCase() + role.slice(1);

const getInitials = (value?: string | null) => {
  if (!value) return "GS";
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "GS";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

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
  const isAdmin = normalizedRoles.includes("Captain");
  const roleChips = useMemo(() => {
    const roles = userRoles.filter((role) => role !== "member").map(formatRoleLabel);
    return roles.length > 0 ? roles : ["Member"];
  }, [userRoles]);
  const societyInitials = useMemo(() => getInitials(society?.name), [society?.name]);
  const navItems = useMemo(
    () => [
      { id: "members", label: "Members", icon: "people" as const },
      { id: "history", label: "History", icon: "history" as const },
      { id: "profile", label: "Profile", icon: "person" as const },
      ...(isAdmin ? [{ id: "settings", label: "Settings", icon: "settings" as const }] : []),
    ],
    [isAdmin]
  );
  const mancoActions = useMemo(() => {
    const actions: {
      id: string;
      title: string;
      subtitle: string;
      iconName: string;
      route: string;
    }[] = [];

    if (canViewFinanceRole) {
      actions.push({
        id: "finance",
        title: "Finance",
        subtitle: "Treasurer tools",
        iconName: "attach-money",
        route: "/finance",
      });
    }

    if (canEditVenueRole) {
      actions.push({
        id: "venue",
        title: "Venue Info",
        subtitle: "Edit venues",
        iconName: "place",
        route: "/venue-info",
      });
    }

    if (canEditHandicapsRole) {
      actions.push({
        id: "handicaps",
        title: "Handicaps",
        subtitle: "Manage handicaps",
        iconName: "sports-golf",
        route: "/handicaps",
      });
      actions.push({
        id: "leaderboard",
        title: "Order of Merit",
        subtitle: "View standings",
        iconName: "leaderboard",
        route: "/leaderboard",
      });
      actions.push({
        id: "tees",
        title: "Tees & Tee Sheet",
        subtitle: "Manage tees & schedule",
        iconName: "event-note",
        route: "/tees-teesheet",
      });
    }

    return actions;
  }, [canEditHandicapsRole, canEditVenueRole, canViewFinanceRole]);

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
      <Screen scrollable={false} contentStyle={styles.screenContent}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (!society) {
    return (
      <Screen contentStyle={styles.screenContent}>
        <EmptyState
          icon={<MaterialIcons name="sports-golf" size={28} color={colors.primary} />}
          title="No Society Found"
          message="Create a society to get started"
          action={{ label: "Create Society", onPress: () => router.push("/create-society") }}
          style={styles.emptyState}
        />
      </Screen>
    );
  }

  const nextEvent = getNextEvent();
  const lastEvent = getLastEvent();
  const lastWinner = lastEvent ? getLastWinner(lastEvent) : null;

  return (
    <Screen contentStyle={styles.screenContent}>
        <AppCard style={[styles.heroCard, { backgroundColor: colors.backgroundSecondary }]}>
          <View style={styles.heroRow}>
            <View style={[styles.heroBadge, { backgroundColor: colors.primaryLight }]}>
              <AppText variant="bodyBold" style={[styles.heroBadgeText, { color: colors.textInverse }]}>
                {societyInitials}
              </AppText>
            </View>
            <View style={styles.heroContent}>
              <AppText variant="title" style={styles.heroTitle}>
                {society.name}
              </AppText>
              {currentMember ? (
                <View style={styles.heroMeta}>
                  <AppText variant="bodyBold" style={styles.memberName}>
                    {currentMember.name}
                  </AppText>
                  <View style={styles.roleChips}>
                    {roleChips.map((role) => (
                      <View
                        key={role}
                        style={[styles.roleChip, { backgroundColor: colors.surface, borderColor: colors.border }]}
                      >
                        <AppText variant="small" style={styles.roleChipText}>
                          {role}
                        </AppText>
                      </View>
                    ))}
                  </View>
                </View>
              ) : (
                <Pressable onPress={() => router.push("/profile" as any)} style={styles.profileLink}>
                  <AppText variant="small" style={[styles.profileLinkText, { color: colors.primary }]}>
                    Select your profile →
                  </AppText>
                </Pressable>
              )}
            </View>
            {currentMember && (
              <SecondaryButton onPress={() => router.push("/profile" as any)} size="sm" style={styles.heroProfileButton}>
                Profile
              </SecondaryButton>
            )}
          </View>
        </AppCard>

        {canCreateEventsRole && (
          <View style={styles.createEventSection}>
            <Pressable
              onPress={() => router.push("/create-event" as any)}
              style={({ pressed }) => [
                styles.createEventButton,
                { backgroundColor: colors.primary },
                pressed && { opacity: 0.9 },
              ]}
            >
              <View style={styles.createEventContent}>
                <MaterialIcons name="add" size={20} color={colors.textInverse} />
                <AppText variant="button" color="inverse">
                  Create Event
                </AppText>
              </View>
            </Pressable>
            <AppText variant="small" color="secondary" style={styles.createEventHelper}>
              Schedule your next society day
            </AppText>
          </View>
        )}

        <View style={styles.navGrid}>
          {navItems.map((item) => {
            const isSelected = activeTab === item.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => {
                  setActiveTab(item.id);
                  const routes: Record<string, string> = {
                    members: "/members",
                    history: "/history",
                    profile: "/profile",
                    settings: "/settings",
                  };
                  router.push(routes[item.id] as any);
                }}
                style={({ pressed }) => [
                  styles.navCard,
                  { backgroundColor: colors.surface },
                  { borderColor: isSelected ? colors.primary : colors.border },
                  isSelected && { backgroundColor: colors.backgroundSecondary },
                  pressed && { opacity: 0.9 },
                ]}
              >
                <MaterialIcons
                  name={item.icon}
                  size={18}
                  color={isSelected ? colors.primary : colors.textSecondary}
                />
                <AppText
                  variant="small"
                  style={[styles.navLabel, { color: isSelected ? colors.primary : colors.textSecondary }]}
                >
                  {item.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        <SectionHeader title="Next Event" />
        {nextEvent ? (
          <AppCard style={styles.eventCard}>
            <Pressable
              onPress={() => router.push(`/event/${nextEvent.id}` as any)}
              style={({ pressed }) => [styles.eventPressable, pressed && { opacity: 0.96 }]}
            >
              <View style={styles.eventHeader}>
                <View style={[styles.eventIconWrap, { backgroundColor: colors.backgroundTertiary }]}>
                  <MaterialIcons name="event" size={20} color={colors.primary} />
                </View>
                <View style={styles.eventHeaderContent}>
                  <AppText variant="h2" style={styles.eventTitle}>
                    {nextEvent.name}
                  </AppText>
                  <AppText variant="body" color="secondary" style={styles.eventSubtitle}>
                    {formatDateDDMMYYYY(nextEvent.date)}
                  </AppText>
                </View>
              </View>
              {(() => {
                const rsvps = nextEvent.rsvps || {};
                const going = Object.values(rsvps).filter((r) => r === "going").length;
                const maybe = Object.values(rsvps).filter((r) => r === "maybe").length;
                const notGoing = Object.values(rsvps).filter((r) => r === "no").length;
                const rsvpText =
                  going > 0 || maybe > 0 || notGoing > 0
                    ? `RSVP: ${going} going, ${maybe} maybe, ${notGoing} not going`
                    : undefined;
                const detail =
                  rsvpText ||
                  (nextEvent.playerIds && nextEvent.playerIds.length > 0
                    ? `Players: ${nextEvent.playerIds.length}`
                    : nextEvent.courseName || undefined);
                return detail ? (
                  <AppText variant="small" color="secondary" style={styles.eventDetail}>
                    {detail}
                  </AppText>
                ) : null;
              })()}
              <PrimaryButton onPress={() => router.push(`/event/${nextEvent.id}` as any)} style={styles.eventButton}>
                {isAdmin ? "View / Edit" : "View"}
              </PrimaryButton>
            </Pressable>
          </AppCard>
        ) : (
          <EmptyState
            icon={<MaterialIcons name="event" size={28} color={colors.primary} />}
            title="No upcoming events"
            message={
              canCreateEventsRole
                ? "Tap Create Event to schedule your next society day"
                : "Ask your Captain or Secretary to create an event"
            }
            style={styles.inlineEmptyState}
          />
        )}

        <SectionHeader title="Last Event" style={styles.sectionHeader} />
        {lastEvent ? (
          <AppCard style={styles.eventCard}>
            <Pressable
              onPress={() => router.push(`/event/${lastEvent.id}` as any)}
              style={({ pressed }) => [styles.eventPressable, pressed && { opacity: 0.96 }]}
            >
              <View style={styles.eventHeader}>
                <View style={[styles.eventIconWrap, { backgroundColor: colors.backgroundTertiary }]}>
                  <MaterialIcons name="emoji-events" size={20} color={colors.primary} />
                </View>
                <View style={styles.eventHeaderContent}>
                  <AppText variant="h2" style={styles.eventTitle}>
                    {lastEvent.name}
                  </AppText>
                  <AppText variant="body" color="secondary" style={styles.eventSubtitle}>
                    {formatDateDDMMYYYY(lastEvent.date)}
                  </AppText>
                </View>
              </View>
              {(lastEvent.winnerName || lastWinner) && (
                <AppText variant="small" color="secondary" style={styles.eventDetail}>
                  Winner: {lastEvent.winnerName || lastWinner?.memberName}
                </AppText>
              )}
              <PrimaryButton onPress={() => router.push(`/event/${lastEvent.id}` as any)} style={styles.eventButton}>
                View Summary
              </PrimaryButton>
            </Pressable>
          </AppCard>
        ) : (
          <EmptyState
            icon={<MaterialIcons name="emoji-events" size={28} color={colors.primary} />}
            title="No completed events yet"
            message="Your completed events will appear here"
            style={styles.inlineEmptyState}
          />
        )}

        {/* ManCo Tools Section */}
        {isManCo && (
          <>
            <SectionHeader title="ManCo Tools" style={styles.sectionHeader} />
            <View style={styles.actionGrid}>
              {mancoActions.map((action) => (
                <ActionCard
                  key={action.id}
                  title={action.title}
                  subtitle={action.subtitle}
                  iconName={action.iconName}
                  onPress={() => router.push(action.route as any)}
                />
              ))}
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

type ActionCardProps = {
  title: string;
  subtitle: string;
  iconName: string;
  onPress: () => void;
};

function ActionCard({ title, subtitle, iconName, onPress }: ActionCardProps) {
  const colors = getColors();
  const icon = (
    <MaterialIcons name={iconName as keyof typeof MaterialIcons.glyphMap} size={20} color={colors.primary} />
  );

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.actionCardWrapper, pressed && { opacity: 0.95 }]}>
      <AppCard style={styles.actionCard} elevated>
        <View style={styles.actionCardHeader}>
          <View style={[styles.actionIconWrap, { backgroundColor: colors.backgroundTertiary }]}>{icon}</View>
          <MaterialIcons name="chevron-right" size={18} color={colors.textTertiary} />
        </View>
        <AppText variant="bodyBold" style={styles.actionTitle}>
          {title}
        </AppText>
        <AppText variant="small" color="secondary" style={styles.actionSubtitle}>
          {subtitle}
        </AppText>
      </AppCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    padding: spacing.base,
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  heroCard: {
    marginBottom: spacing.lg,
    marginTop: spacing.xs,
    borderRadius: radius.xl,
    borderWidth: 0,
    ...shadows.md,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  heroBadge: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  heroBadgeText: {
    fontSize: 18,
    fontWeight: "700",
  },
  heroContent: {
    flex: 1,
  },
  heroTitle: {
    marginBottom: spacing.xs,
  },
  heroMeta: {
    marginTop: spacing.xs,
  },
  memberName: {
    marginBottom: spacing.xs,
  },
  roleChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  roleChip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  roleChipText: {
    fontWeight: "600",
  },
  profileLink: {
    marginTop: spacing.xs,
  },
  profileLinkText: {
    fontWeight: "600",
  },
  heroProfileButton: {
    alignSelf: "flex-start",
  },
  createEventSection: {
    marginBottom: spacing.lg,
  },
  createEventButton: {
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 56,
    width: "100%",
    ...shadows.md,
  },
  createEventContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  createEventHelper: {
    marginTop: spacing.xs,
    textAlign: "center",
  },
  navGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  navCard: {
    flexBasis: "48%",
    flexGrow: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
    gap: spacing.xs,
    minHeight: 56,
    ...shadows.sm,
  },
  navLabel: {
    fontWeight: "600",
  },
  sectionHeader: {
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  eventCard: {
    marginBottom: spacing.base,
    borderRadius: radius.lg,
  },
  eventPressable: {
    width: "100%",
  },
  eventHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  eventIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  eventHeaderContent: {
    flex: 1,
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
  inlineEmptyState: {
    marginTop: 0,
    marginBottom: spacing.base,
  },
  emptyState: {
    marginTop: spacing.xl,
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  actionCardWrapper: {
    flexBasis: "48%",
    flexGrow: 1,
  },
  actionCard: {
    marginBottom: 0,
    borderRadius: radius.lg,
  },
  actionCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  actionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  actionTitle: {
    marginBottom: 2,
  },
  actionSubtitle: {
    marginBottom: 0,
  },
  leaderboardButton: {
    marginTop: spacing.xl,
  },
});
