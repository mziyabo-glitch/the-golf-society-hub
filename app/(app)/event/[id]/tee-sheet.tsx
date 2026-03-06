/**
 * Member Tee Sheet View
 *
 * When tee times are published, members can view their personal tee time
 * and the full tee sheet. Sticky "Your Tee Time" card at top, full sheet below.
 */

import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { SecondaryButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { useBootstrap } from "@/lib/useBootstrap";
import { getEvent, type EventDoc } from "@/lib/db_supabase/eventRepo";
import { getMembersBySocietyId, type MemberDoc } from "@/lib/db_supabase/memberRepo";
import { getEventRegistrations } from "@/lib/db_supabase/eventRegistrationRepo";
import { findMemberGroup } from "@/lib/findMemberGroup";
import { groupPlayers, assignTeeTimes, type PlayerGroup } from "@/lib/teeSheetGrouping";
import { formatHandicap } from "@/lib/whs";
import { getColors, spacing, radius } from "@/lib/ui/theme";
import { formatError, type FormattedError } from "@/lib/ui/formatError";

const DEFAULT_START = "08:00";
const DEFAULT_INTERVAL = 10;

type GroupWithTime = PlayerGroup & { teeTime: string };

function buildGroupsWithTimes(
  event: EventDoc,
  members: MemberDoc[],
  registrationMemberIds: string[] = [],
): GroupWithTime[] {
  const playerIds =
    event.playerIds?.length
      ? event.playerIds
      : registrationMemberIds;
  if (playerIds.length === 0) return [];

  const eventMembers = members
    .filter((m) => playerIds.includes(m.id))
    .map((m) => ({
      id: m.id,
      name: m.name || m.displayName || "Member",
      handicapIndex: m.handicapIndex ?? m.handicap_index ?? null,
      courseHandicap: null as number | null,
      playingHandicap: null as number | null,
    }));

  const groups = groupPlayers(eventMembers, true);
  const start = event.teeTimeStart ?? DEFAULT_START;
  const interval =
    Number.isFinite(event.teeTimeInterval) && (event.teeTimeInterval ?? 0) > 0
      ? Number(event.teeTimeInterval)
      : DEFAULT_INTERVAL;

  return assignTeeTimes(groups, start, interval) as GroupWithTime[];
}

export default function EventTeeSheetScreen() {
  const router = useRouter();
  const { id: eventId } = useLocalSearchParams<{ id: string }>();
  const { societyId, member } = useBootstrap();
  const colors = getColors();

  const [event, setEvent] = useState<EventDoc | null>(null);
  const [members, setMembers] = useState<MemberDoc[]>([]);
  const [registrationMemberIds, setRegistrationMemberIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FormattedError | null>(null);

  const loadData = useCallback(async () => {
    if (!eventId || !societyId) return;

    setLoading(true);
    setError(null);
    try {
      const [eventData, membersData, registrations] = await Promise.all([
        getEvent(eventId),
        getMembersBySocietyId(societyId),
        getEventRegistrations(eventId),
      ]);
      setEvent(eventData ?? null);
      setMembers(membersData);
      setRegistrationMemberIds(
        registrations.filter((r) => r.status === "in").map((r) => r.member_id),
      );
    } catch (err) {
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  }, [eventId, societyId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <Screen>
        <LoadingState message="Loading tee sheet..." />
      </Screen>
    );
  }

  if (!event || error) {
    return (
      <Screen>
        <View style={styles.header}>
          <SecondaryButton onPress={() => router.back()} size="sm">
            <Feather name="arrow-left" size={16} color={colors.text} /> Back
          </SecondaryButton>
        </View>
        <AppText variant="body" color="secondary" style={{ marginTop: spacing.lg }}>
          {error?.message ?? "Event not found."}
        </AppText>
      </Screen>
    );
  }

  const memberId = member?.id;
  const eventWithPlayers = {
    ...event,
    playerIds:
      event.playerIds?.length
        ? event.playerIds
        : registrationMemberIds,
  };
  const myGroup = memberId ? findMemberGroup(memberId, eventWithPlayers, members) : null;
  const groupsWithTimes = buildGroupsWithTimes(event, members, registrationMemberIds);

  const hasTeeTimes = !!event.teeTimePublishedAt;

  return (
    <Screen>
      <View style={styles.header}>
        <SecondaryButton onPress={() => router.back()} size="sm">
          <Feather name="arrow-left" size={16} color={colors.text} /> Back
        </SecondaryButton>
      </View>

      <AppText variant="title" style={styles.title}>
        Tee Sheet
      </AppText>
      <AppText variant="body" color="secondary" style={{ marginBottom: spacing.lg }}>
        {event.name}
        {event.date
          ? ` • ${new Date(event.date).toLocaleDateString("en-GB", {
              weekday: "short",
              day: "numeric",
              month: "short",
            })}`
          : ""}
      </AppText>

      {!hasTeeTimes ? (
        <AppCard>
          <AppText variant="body" color="secondary">
            Tee times have not been published yet. Check back later.
          </AppText>
        </AppCard>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Sticky "Your Tee Time" card */}
          {myGroup && (
            <AppCard style={[styles.stickyCard, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "40" }]}>
              <AppText variant="captionBold" color="primary" style={styles.stickyLabel}>
                You&apos;re in Group {myGroup.groupNumber}
              </AppText>
              <AppText variant="display" style={{ color: colors.text }}>
                Tee Time: {myGroup.teeTime}
              </AppText>
              {myGroup.groupMates.length > 0 && (
                <View style={styles.playingWith}>
                  <AppText variant="small" color="secondary">Playing with:</AppText>
                  {myGroup.groupMates.map((name) => (
                    <AppText key={name} variant="body" style={{ color: colors.text, marginTop: 2 }}>
                      {name}
                    </AppText>
                  ))}
                </View>
              )}
            </AppCard>
          )}

          {!myGroup && hasTeeTimes && (
            <AppCard style={[styles.stickyCard, { borderColor: colors.borderLight }]}>
              <AppText variant="body" color="secondary">
                Tee times published — you are not assigned yet.
              </AppText>
            </AppCard>
          )}

          {/* Full tee sheet */}
          <AppText variant="h2" style={styles.sectionTitle}>
            Full Tee Sheet
          </AppText>
          {groupsWithTimes.length === 0 ? (
            <AppCard>
              <AppText variant="body" color="secondary">No players added to this event.</AppText>
            </AppCard>
          ) : (
            groupsWithTimes.map((group) => (
              <AppCard key={group.groupNumber} style={styles.groupCard}>
                <View style={styles.groupHeader}>
                  <AppText variant="bodyBold" color="primary">
                    Group {group.groupNumber}
                  </AppText>
                  <View style={[styles.timeBadge, { backgroundColor: colors.primary + "20" }]}>
                    <AppText variant="captionBold" color="primary">{group.teeTime}</AppText>
                  </View>
                </View>
                <View style={styles.tableHeader}>
                  <AppText variant="caption" color="secondary" style={styles.nameCol}>Name</AppText>
                  <AppText variant="caption" color="secondary" style={styles.hiCol}>HI</AppText>
                </View>
                {group.players.map((player) => (
                  <View key={player.id} style={styles.tableRow}>
                    <AppText variant="body" numberOfLines={1} style={styles.nameCol}>
                      {player.name}
                      {player.id === memberId ? " (You)" : ""}
                    </AppText>
                    <AppText variant="body" color="secondary" style={styles.hiCol}>
                      {formatHandicap(player.handicapIndex, 1)}
                    </AppText>
                  </View>
                ))}
              </AppCard>
            ))
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  title: {
    marginBottom: spacing.xs,
  },
  stickyCard: {
    marginBottom: spacing.lg,
    borderWidth: 1,
  },
  stickyLabel: {
    marginBottom: 4,
  },
  playingWith: {
    marginTop: spacing.sm,
  },
  sectionTitle: {
    marginBottom: spacing.sm,
  },
  groupCard: {
    marginBottom: spacing.sm,
  },
  groupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  timeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  nameCol: {
    flex: 1,
  },
  hiCol: {
    width: 50,
    textAlign: "right",
  },
});
