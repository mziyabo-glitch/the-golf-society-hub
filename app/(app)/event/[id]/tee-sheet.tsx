/**
 * Member Tee Sheet View
 *
 * When tee times are published, members can view their personal tee time
 * and the full tee sheet. Sticky "Your Tee Time" card at top, full sheet below.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, View, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { goBack } from "@/lib/navigation";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { SecondaryButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { useBootstrap } from "@/lib/useBootstrap";
import { getEvent, type EventDoc } from "@/lib/db_supabase/eventRepo";
import { getJointEventDetail } from "@/lib/db_supabase/jointEventRepo";
import { buildSocietyIdToNameMap, societyLabelFromMember } from "@/lib/jointEventSocietyLabel";
import { dedupeJointGroupedPlayers, dedupeJointMembers } from "@/lib/jointPersonDedupe";
import { getMembersBySocietyId, getMembersByIds, type MemberDoc } from "@/lib/db_supabase/memberRepo";
import { resolveAttendeeDisplayName } from "@/lib/eventAttendeeName";
import { getEventRegistrations, isTeeSheetEligible, scopeEventRegistrations } from "@/lib/db_supabase/eventRegistrationRepo";
import { getEventGuests } from "@/lib/db_supabase/eventGuestRepo";
import { getTeeGroups, getTeeGroupPlayers, teeTimeToDisplay } from "@/lib/db_supabase/teeGroupsRepo";
import { findMemberGroup, findMemberGroupFromTeeSheet } from "@/lib/findMemberGroup";
import { groupPlayers, assignTeeTimes, type GroupedPlayer, type PlayerGroup } from "@/lib/teeSheetGrouping";
import { formatHandicap } from "@/lib/whs";
import { getColors, spacing, radius } from "@/lib/ui/theme";
import { formatError, type FormattedError } from "@/lib/ui/formatError";
import { JOINT_EVENT_CHIP_LONG } from "@/lib/eventModuleUi";

const DEFAULT_START = "08:00";
const DEFAULT_INTERVAL = 10;

type GroupWithTime = PlayerGroup & { teeTime: string };

const MemberGroupCard = React.memo(function MemberGroupCard({
  group,
  memberId,
}: {
  group: GroupWithTime;
  memberId: string | undefined;
}) {
  const colors = getColors();
  return (
    <AppCard style={styles.groupCard}>
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
          <View style={styles.nameCol}>
            <AppText variant="body" numberOfLines={2}>
              {player.name}
              {player.id === memberId ? " (You)" : ""}
            </AppText>
            {player.societyLabel ? (
              <AppText variant="caption" color="secondary" numberOfLines={2} style={{ marginTop: 2 }}>
                {player.societyLabel}
              </AppText>
            ) : null}
          </View>
          <AppText variant="body" color="secondary" style={styles.hiCol}>
            {formatHandicap(player.handicapIndex, 1)}
          </AppText>
        </View>
      ))}
    </AppCard>
  );
});

function buildGroupsWithTimes(
  event: EventDoc,
  members: MemberDoc[],
  registrationMemberIds: string[] = [],
  guests: { id: string; name: string; sex: "male" | "female"; handicap_index: number | null }[] = [],
  isJoint = false,
  societyIdToName?: Map<string, string>,
): GroupWithTime[] {
  const playerIds =
    event.playerIds?.length
      ? event.playerIds
      : registrationMemberIds;

  const subset = members.filter((m) => playerIds.includes(m.id));

  const eventMembers: GroupedPlayer[] =
    isJoint && societyIdToName && societyIdToName.size > 0
      ? dedupeJointMembers(subset, societyIdToName).map((d) => ({
          id: d.representative.id,
          name: resolveAttendeeDisplayName(d.representative, { memberId: d.representative.id }).name,
          handicapIndex: d.representative.handicapIndex ?? d.representative.handicap_index ?? null,
          courseHandicap: null as number | null,
          playingHandicap: null as number | null,
          societyLabel: d.societyLabelMerged,
        }))
      : subset.map((m) => ({
          id: m.id,
          name: resolveAttendeeDisplayName(m, { memberId: m.id }).name,
          handicapIndex: m.handicapIndex ?? m.handicap_index ?? null,
          courseHandicap: null as number | null,
          playingHandicap: null as number | null,
          societyLabel: undefined,
        }));

  const guestPlayers = guests.map((g) => ({
    id: `guest-${g.id}`,
    name: g.name,
    handicapIndex: g.handicap_index ?? null,
    courseHandicap: null as number | null,
    playingHandicap: null as number | null,
  }));

  const allPlayers = [...eventMembers, ...guestPlayers];
  if (allPlayers.length === 0) return [];

  const groups = groupPlayers(allPlayers, true);
  const start = event.teeTimeStart ?? DEFAULT_START;
  const interval =
    Number.isFinite(event.teeTimeInterval) && (event.teeTimeInterval ?? 0) > 0
      ? Number(event.teeTimeInterval)
      : DEFAULT_INTERVAL;

  return assignTeeTimes(groups, start, interval) as GroupWithTime[];
}

function buildGroupsWithTimesFromDb(
  teeGroups: { group_number: number; tee_time: string | null }[],
  teeGroupPlayers: { player_id: string; group_number: number; position: number }[],
  members: MemberDoc[],
  guests: { id: string; name: string; sex: "male" | "female"; handicap_index: number | null }[],
  isJoint = false,
  societyIdToName?: Map<string, string>,
): GroupWithTime[] {
  const lookup = (playerId: string) => {
    if (playerId.startsWith("guest-")) {
      const g = guests.find((x) => x.id === playerId.slice(6));
      return g
        ? {
            id: playerId,
            name: g.name,
            handicapIndex: g.handicap_index ?? null,
            courseHandicap: null as number | null,
            playingHandicap: null as number | null,
            societyLabel: undefined as string | undefined,
          }
        : null;
    }
    const m = members.find((x) => x.id === playerId);
    if (!m) return null;
    return {
      id: m.id,
      name: resolveAttendeeDisplayName(m, { memberId: m.id }).name,
      handicapIndex: m.handicapIndex ?? m.handicap_index ?? null,
      courseHandicap: null as number | null,
      playingHandicap: null as number | null,
      societyLabel:
        isJoint && societyIdToName && societyIdToName.size > 0
          ? societyLabelFromMember(m, societyIdToName) ?? undefined
          : undefined,
    };
  };

  const byGroup = new Map<number, { teeTime: string; players: { player_id: string; position: number }[] }>();
  for (const g of teeGroups) {
    byGroup.set(g.group_number, { teeTime: g.tee_time ? teeTimeToDisplay(g.tee_time) : "08:00", players: [] });
  }
  for (const p of teeGroupPlayers) {
    const data = byGroup.get(p.group_number);
    if (data) data.players.push({ player_id: p.player_id, position: p.position });
  }
  for (const [, data] of byGroup) {
    data.players.sort((a, b) => a.position - b.position);
  }

  return [...byGroup.keys()].sort((a, b) => a - b).map((groupNumber) => {
    const data = byGroup.get(groupNumber)!;
    let players = data.players
      .map(({ player_id }) => lookup(player_id))
      .filter(Boolean) as GroupedPlayer[];
    if (isJoint && societyIdToName && societyIdToName.size > 0) {
      players = dedupeJointGroupedPlayers(players, members, societyIdToName);
    }
    return {
      groupNumber,
      players,
      teeTime: data.teeTime,
    } as GroupWithTime;
  });
}

export default function EventTeeSheetScreen() {
  const router = useRouter();
  const { id: eventId } = useLocalSearchParams<{ id: string }>();
  const { societyId, member } = useBootstrap();
  const colors = getColors();

  const [event, setEvent] = useState<EventDoc | null>(null);
  const [members, setMembers] = useState<MemberDoc[]>([]);
  const [registrationMemberIds, setRegistrationMemberIds] = useState<string[]>([]);
  const [guests, setGuests] = useState<{ id: string; name: string; sex: "male" | "female"; handicap_index: number | null }[]>([]);
  const [teeGroups, setTeeGroups] = useState<{ group_number: number; tee_time: string | null }[]>([]);
  const [teeGroupPlayers, setTeeGroupPlayers] = useState<{ player_id: string; group_number: number; position: number }[]>([]);
  const [jointParticipatingSocieties, setJointParticipatingSocieties] = useState<
    { society_id: string; society_name?: string | null }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FormattedError | null>(null);

  const loadData = useCallback(async () => {
    if (!eventId || !societyId) return;

    setLoading(true);
    setError(null);
    try {
      const [eventData, registrations, guestList, groupsData, playersData] = await Promise.all([
        getEvent(eventId),
        getEventRegistrations(eventId),
        getEventGuests(eventId),
        getTeeGroups(eventId),
        getTeeGroupPlayers(eventId),
      ]);
      setEvent(eventData ?? null);

      let participantSocietyIds: string[] = [];
      if (eventData?.is_joint_event === true) {
        const jd = await getJointEventDetail(eventId);
        participantSocietyIds = jd?.participating_societies?.map((s) => s.society_id).filter(Boolean) ?? [];
        setJointParticipatingSocieties(
          jd?.participating_societies?.map((s) => ({
            society_id: s.society_id,
            society_name: s.society_name,
          })) ?? [],
        );
      } else {
        setJointParticipatingSocieties([]);
      }

      const hostId = eventData?.society_id ?? societyId;
      let membersMerged: MemberDoc[] = [];
      if (eventData?.is_joint_event === true && participantSocietyIds.length > 0) {
        const lists = await Promise.all(participantSocietyIds.map((sid) => getMembersBySocietyId(sid)));
        membersMerged = lists.flat();
      } else {
        membersMerged = await getMembersBySocietyId(hostId);
      }

      const scopedRegs =
        eventData?.is_joint_event === true
          ? scopeEventRegistrations(registrations, {
              kind: "joint_participants",
              participantSocietyIds,
            })
          : scopeEventRegistrations(registrations, { kind: "standard", hostSocietyId: hostId });

      const byId = new Map<string, MemberDoc>();
      for (const m of membersMerged) byId.set(m.id, m);
      const regIds = scopedRegs.filter(isTeeSheetEligible).map((r) => r.member_id);
      const teeMemberIds = playersData
        .map((p) => p.player_id)
        .filter((id) => id && !String(id).startsWith("guest-"));
      const eventPlayerIds = eventData?.playerIds ?? [];
      const allIds = [...new Set([...regIds, ...teeMemberIds, ...eventPlayerIds.map(String)])];
      const missing = allIds.filter((id) => id && !byId.has(id));
      if (missing.length > 0) {
        const extra = await getMembersByIds(missing);
        for (const m of extra) {
          if (m?.id && !byId.has(m.id)) byId.set(m.id, m);
        }
      }
      setMembers(Array.from(byId.values()));
      setRegistrationMemberIds(regIds);
      setGuests(guestList);
      setTeeGroups(groupsData);
      setTeeGroupPlayers(playersData);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  }, [eventId, societyId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /** Must run before any early return — Rules of Hooks. */
  const jointSocietyIdToName = useMemo(
    () => buildSocietyIdToNameMap(jointParticipatingSocieties),
    [jointParticipatingSocieties],
  );

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
          <SecondaryButton onPress={() => goBack(router, "/(app)/(tabs)/events")} size="sm">
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
  const isJointEvent = event.is_joint_event === true;
  const usePersistedTeeSheet = teeGroups.length > 0 && teeGroupPlayers.length > 0;
  const eventWithPlayers = {
    ...event,
    playerIds:
      event.playerIds?.length
        ? event.playerIds
        : registrationMemberIds,
  };
  const myGroup = memberId
    ? (usePersistedTeeSheet
        ? findMemberGroupFromTeeSheet(
            memberId,
            teeGroups,
            teeGroupPlayers,
            members,
            isJointEvent ? jointSocietyIdToName : undefined,
          )
        : findMemberGroup(
            memberId,
            eventWithPlayers,
            members,
            isJointEvent ? jointSocietyIdToName : undefined,
          ))
    : null;
  const groupsWithTimes = usePersistedTeeSheet
    ? buildGroupsWithTimesFromDb(
        teeGroups,
        teeGroupPlayers,
        members,
        guests,
        isJointEvent,
        jointSocietyIdToName,
      )
    : buildGroupsWithTimes(
        event,
        members,
        registrationMemberIds,
        guests,
        isJointEvent,
        jointSocietyIdToName,
      );

  const hasTeeTimes = !!event.teeTimePublishedAt;

  return (
    <Screen>
      <View style={styles.header}>
        <SecondaryButton onPress={() => goBack(router, "/(app)/(tabs)/events")} size="sm">
          <Feather name="arrow-left" size={16} color={colors.text} /> Back
        </SecondaryButton>
      </View>

      <AppText variant="title" style={styles.title}>
        Tee Sheet
      </AppText>
      <AppText variant="body" color="secondary" style={{ marginBottom: spacing.sm }}>
        {event.name}
        {event.date
          ? ` • ${new Date(event.date).toLocaleDateString("en-GB", {
              weekday: "short",
              day: "numeric",
              month: "short",
            })}`
          : ""}
      </AppText>

      {isJointEvent && (
        <View
          style={[
            styles.jointTeeBanner,
            { borderColor: colors.info + "44", backgroundColor: colors.info + "0A" },
          ]}
        >
          <Feather name="link" size={16} color={colors.info} />
          <AppText variant="caption" color="secondary" style={{ flex: 1 }}>
            {JOINT_EVENT_CHIP_LONG} — mixed societies; each player appears once.
          </AppText>
        </View>
      )}

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
              <MemberGroupCard key={group.groupNumber} group={group} memberId={memberId} />
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
  jointTeeBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    marginBottom: spacing.lg,
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
    marginBottom: 14,
    padding: 18,
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
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  nameCol: {
    flex: 1.8,
  },
  hiCol: {
    flex: 0.6,
    textAlign: "center",
  },
});
