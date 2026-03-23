/**
 * Member Tee Sheet View
 *
 * When tee times are published, members can view their personal tee time
 * and the full tee sheet. Sticky "Your Tee Time" card at top, full sheet below.
 *
 * Data source: `loadCanonicalTeeSheet` (joint entries, tee_groups snapshot, or computed fallback).
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
import { buildSocietyIdToNameMap } from "@/lib/jointEventSocietyLabel";
import { getMembersBySocietyId, getMembersByIds, type MemberDoc } from "@/lib/db_supabase/memberRepo";
import {
  loadCanonicalTeeSheet,
  findMemberGroupInfoFromCanonical,
  type CanonicalTeeSheetResult,
} from "@/lib/teeSheet/canonicalTeeSheet";
import type { GroupedPlayer, PlayerGroup } from "@/lib/teeSheetGrouping";
import { formatHandicap } from "@/lib/whs";
import { getColors, spacing, radius } from "@/lib/ui/theme";
import { formatError, type FormattedError } from "@/lib/ui/formatError";
import { JOINT_EVENT_CHIP_LONG } from "@/lib/eventModuleUi";

type GroupWithTime = PlayerGroup & { teeTime: string };

function canonicalToGroupsWithTime(canonical: CanonicalTeeSheetResult): GroupWithTime[] {
  return canonical.groups.map((g) => ({
    groupNumber: g.groupNumber,
    teeTime: g.teeTime,
    players: g.players.map(
      (p) =>
        ({
          id: p.id,
          name: p.name,
          handicapIndex: p.handicapIndex,
          courseHandicap: null as number | null,
          playingHandicap: null as number | null,
          societyLabel: p.societyLabel ?? undefined,
        }) satisfies GroupedPlayer,
    ),
  }));
}

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

export default function EventTeeSheetScreen() {
  const router = useRouter();
  const { id: eventId } = useLocalSearchParams<{ id: string }>();
  const { societyId, member } = useBootstrap();
  const colors = getColors();

  const [canonical, setCanonical] = useState<CanonicalTeeSheetResult | null>(null);
  const [members, setMembers] = useState<MemberDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FormattedError | null>(null);

  const loadData = useCallback(async () => {
    if (!eventId || !societyId) return;

    setLoading(true);
    setError(null);
    try {
      const c = await loadCanonicalTeeSheet(eventId);
      if (!c) {
        setCanonical(null);
        setError(formatError(new Error("Event not found")));
        return;
      }
      setCanonical(c);

      const eventData = c.event;
      const hostId = eventData.society_id ?? societyId;
      const participantSocietyIds =
        c.isJoint && c.jointParticipatingSocieties?.length
          ? c.jointParticipatingSocieties.map((s) => s.society_id).filter(Boolean)
          : [];

      let membersMerged: MemberDoc[] = [];
      if (c.isJoint && participantSocietyIds.length > 0) {
        const lists = await Promise.all(participantSocietyIds.map((sid) => getMembersBySocietyId(sid)));
        membersMerged = lists.flat();
      } else {
        membersMerged = await getMembersBySocietyId(hostId);
      }

      const byId = new Map<string, MemberDoc>();
      for (const m of membersMerged) byId.set(m.id, m);
      const flatIds = c.groups.flatMap((g) => g.players.map((p) => p.id));
      const memberIds = flatIds.filter((id) => id && !String(id).startsWith("guest-"));
      const missing = memberIds.filter((id) => id && !byId.has(id));
      if (missing.length > 0) {
        const extra = await getMembersByIds(missing);
        for (const m of extra) {
          if (m?.id && !byId.has(m.id)) byId.set(m.id, m);
        }
      }
      setMembers(Array.from(byId.values()));

      if (__DEV__) {
        const renderedIds = [...new Set(c.groups.flatMap((g) => g.players.map((p) => p.id)))];
        console.log("[teesheet] canonical render (member tee sheet)", {
          eventId: c.eventId,
          source: c.source,
          groupCount: c.groups.length,
          memberIdsRendered: renderedIds,
          societies: c.jointParticipatingSocieties?.map((s) => s.society_name ?? s.society_id),
        });
      }
    } catch (err) {
      setError(formatError(err));
      setCanonical(null);
    } finally {
      setLoading(false);
    }
  }, [eventId, societyId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const jointSocietyIdToName = useMemo(
    () =>
      canonical?.jointParticipatingSocieties?.length
        ? buildSocietyIdToNameMap(canonical.jointParticipatingSocieties)
        : undefined,
    [canonical?.jointParticipatingSocieties],
  );

  if (loading) {
    return (
      <Screen>
        <LoadingState message="Loading tee sheet..." />
      </Screen>
    );
  }

  if (!canonical || error) {
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

  const event = canonical.event;
  const memberId = member?.id;
  const isJointEvent = event.is_joint_event === true;

  const myGroup = memberId
    ? findMemberGroupInfoFromCanonical(memberId, canonical, members, jointSocietyIdToName)
    : null;
  const groupsWithTimes = canonicalToGroupsWithTime(canonical);

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
