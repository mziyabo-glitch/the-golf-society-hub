import { useEffect, useState } from "react";
import { StyleSheet, View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { LoadingState } from "@/components/ui/LoadingState";
import { useBootstrap } from "@/lib/useBootstrap";
import { subscribeMembersBySociety, type MemberDoc } from "@/lib/db/memberRepo";
import { subscribeEventsBySociety, type EventDoc } from "@/lib/db/eventRepo";
import { getColors, spacing, radius } from "@/lib/ui/theme";

export default function HomeScreen() {
  const router = useRouter();
  const { society, member, societyId, loading: bootstrapLoading } = useBootstrap();
  const colors = getColors();

  const [members, setMembers] = useState<MemberDoc[]>([]);
  const [events, setEvents] = useState<EventDoc[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!societyId) {
      setDataLoading(false);
      return;
    }

    setDataLoading(true);
    let membersLoaded = false;
    let eventsLoaded = false;

    const checkLoaded = () => {
      if (membersLoaded && eventsLoaded) {
        setDataLoading(false);
      }
    };

    const unsubMembers = subscribeMembersBySociety(
      societyId,
      (docs) => {
        setMembers(docs);
        membersLoaded = true;
        checkLoaded();
      },
      (err) => {
        console.error("Members subscription error:", err);
        membersLoaded = true;
        checkLoaded();
      }
    );

    const unsubEvents = subscribeEventsBySociety(
      societyId,
      (docs) => {
        setEvents(docs);
        eventsLoaded = true;
        checkLoaded();
      },
      (err) => {
        console.error("Events subscription error:", err);
        eventsLoaded = true;
        checkLoaded();
      }
    );

    return () => {
      unsubMembers();
      unsubEvents();
    };
  }, [societyId]);

  if (bootstrapLoading || dataLoading) {
    return (
      <Screen scrollable={false}>
        <View style={styles.centered}>
          <LoadingState message="Loading society..." />
        </View>
      </Screen>
    );
  }

  const upcomingEvents = events
    .filter((e) => !e.isCompleted && e.date && new Date(e.date) >= new Date())
    .slice(0, 3);

  const recentEvents = events
    .filter((e) => e.isCompleted)
    .slice(0, 2);

  return (
    <Screen>
      {/* Welcome Header */}
      <View style={styles.header}>
        <AppText variant="title">
          {society?.name || "Golf Society"}
        </AppText>
        {member?.displayName && (
          <AppText variant="body" color="secondary">
            Welcome back, {member.displayName}
          </AppText>
        )}
      </View>

      {/* Join Code Card */}
      {society?.joinCode && (
        <AppCard style={styles.joinCodeCard}>
          <View style={styles.joinCodeContent}>
            <View>
              <AppText variant="caption" color="secondary">Society Join Code</AppText>
              <AppText variant="h1" style={{ letterSpacing: 2 }}>{society.joinCode}</AppText>
            </View>
            <View style={[styles.joinCodeIcon, { backgroundColor: colors.backgroundTertiary }]}>
              <Feather name="share-2" size={20} color={colors.primary} />
            </View>
          </View>
          <AppText variant="small" color="tertiary" style={{ marginTop: spacing.xs }}>
            Share this code with friends to invite them
          </AppText>
        </AppCard>
      )}

      {/* Quick Stats */}
      <View style={styles.statsRow}>
        <Pressable
          style={({ pressed }) => [
            styles.statCard,
            { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={() => router.push("/(app)/(tabs)/members")}
        >
          <Feather name="users" size={24} color={colors.primary} />
          <AppText variant="h1" style={{ marginTop: spacing.xs }}>{members.length}</AppText>
          <AppText variant="caption" color="secondary">Members</AppText>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.statCard,
            { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={() => router.push("/(app)/(tabs)/event")}
        >
          <Feather name="calendar" size={24} color={colors.primary} />
          <AppText variant="h1" style={{ marginTop: spacing.xs }}>{events.length}</AppText>
          <AppText variant="caption" color="secondary">Events</AppText>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.statCard,
            { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={() => router.push("/(app)/(tabs)/leaderboard")}
        >
          <Feather name="award" size={24} color={colors.primary} />
          <AppText variant="h1" style={{ marginTop: spacing.xs }}>{events.filter((e) => e.isOOM).length}</AppText>
          <AppText variant="caption" color="secondary">OOM Events</AppText>
        </Pressable>
      </View>

      {/* Upcoming Events */}
      {upcomingEvents.length > 0 && (
        <View style={styles.section}>
          <AppText variant="h2" style={styles.sectionTitle}>Upcoming Events</AppText>
          {upcomingEvents.map((event) => (
            <Pressable
              key={event.id}
              onPress={() => router.push(`/(app)/event/${event.id}`)}
            >
              <AppCard style={styles.eventCard}>
                <View style={styles.eventRow}>
                  <View style={[styles.eventDate, { backgroundColor: colors.backgroundTertiary }]}>
                    <AppText variant="captionBold" color="primary">
                      {event.date ? new Date(event.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "TBD"}
                    </AppText>
                  </View>
                  <View style={styles.eventInfo}>
                    <AppText variant="bodyBold">{event.name}</AppText>
                    {event.courseName && (
                      <AppText variant="caption" color="secondary">{event.courseName}</AppText>
                    )}
                  </View>
                  <Feather name="chevron-right" size={20} color={colors.textTertiary} />
                </View>
              </AppCard>
            </Pressable>
          ))}
        </View>
      )}

      {/* Recent Results */}
      {recentEvents.length > 0 && (
        <View style={styles.section}>
          <AppText variant="h2" style={styles.sectionTitle}>Recent Results</AppText>
          {recentEvents.map((event) => (
            <Pressable
              key={event.id}
              onPress={() => router.push(`/(app)/event/${event.id}`)}
            >
              <AppCard style={styles.eventCard}>
                <View style={styles.eventRow}>
                  <View style={[styles.eventDate, { backgroundColor: colors.success + "20" }]}>
                    <Feather name="check-circle" size={16} color={colors.success} />
                  </View>
                  <View style={styles.eventInfo}>
                    <AppText variant="bodyBold">{event.name}</AppText>
                    {event.winnerName && (
                      <AppText variant="caption" color="secondary">Winner: {event.winnerName}</AppText>
                    )}
                  </View>
                  <Feather name="chevron-right" size={20} color={colors.textTertiary} />
                </View>
              </AppCard>
            </Pressable>
          ))}
        </View>
      )}

      {/* Empty state if no events */}
      {events.length === 0 && (
        <AppCard style={{ marginTop: spacing.lg }}>
          <View style={styles.emptyState}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.backgroundTertiary }]}>
              <Feather name="calendar" size={24} color={colors.textTertiary} />
            </View>
            <AppText variant="body" color="secondary" style={{ textAlign: "center" }}>
              No events yet. Create your first event to get started!
            </AppText>
          </View>
        </AppCard>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    marginBottom: spacing.lg,
  },
  joinCodeCard: {
    marginBottom: spacing.lg,
  },
  joinCodeContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  joinCodeIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  statsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.base,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    marginBottom: spacing.sm,
  },
  eventCard: {
    marginBottom: spacing.xs,
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  eventDate: {
    width: 50,
    height: 50,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  eventInfo: {
    flex: 1,
  },
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
});
