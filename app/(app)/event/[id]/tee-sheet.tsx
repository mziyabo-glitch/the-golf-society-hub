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
import { fetchMemberRowsForAuthUser } from "@/lib/db_supabase/mySocietiesRepo";
import { getJointEventDetail, getJointMetaForEventIds } from "@/lib/db_supabase/jointEventRepo";
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
import {
  isActiveSocietyParticipantForEvent,
  pickPreferredMembershipSocietyForJointEvent,
} from "@/lib/jointEventAccess";

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

function duplicateMemberRowsBySociety(
  rows: { societyId: string }[],
): { societyId: string; rowCount: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (!r.societyId) continue;
    m.set(r.societyId, (m.get(r.societyId) ?? 0) + 1);
  }
  return [...m.entries()].filter(([, n]) => n > 1).map(([societyId, rowCount]) => ({ societyId, rowCount }));
}

export default function EventTeeSheetScreen() {
  const router = useRouter();
  const { id: eventId } = useLocalSearchParams<{ id: string }>();
  const { societyId, member, userId, activeSocietyId, memberships, profile, switchSociety } =
    useBootstrap();
  const colors = getColors();

  const [canonical, setCanonical] = useState<CanonicalTeeSheetResult | null>(null);
  const [members, setMembers] = useState<MemberDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FormattedError | null>(null);

  const loadData = useCallback(async () => {
    if (!eventId || !societyId) {
      console.log("[joint-access-user]", {
        phase: "blocked_missing_event_or_society",
        eventId: eventId ?? null,
        userId: userId ?? null,
        activeSocietyId: societyId ?? null,
        profileActiveSocietyId: profile?.active_society_id ?? null,
        bootstrapMembershipSocietyIds: memberships.map((m) => m.societyId).sort(),
        userSocietyIds: [],
        memberRowsFresh: [],
        duplicateMemberRowsBySociety: [],
        participantSocietyIdsMismatchBootstrapVsFresh: null,
        hostSocietyId: null,
        participantSocietyIds: [],
        participantMatch: null,
        derivedIsJoint: false,
        isActiveSocietyParticipantForEvent_inputs: null,
        canView: false,
      });
      if (__DEV__) {
        console.log("[joint-access] final gate", {
          eventId: eventId ?? null,
          activeSocietyId: societyId ?? null,
          hostSocietyId: null,
          participantSocietyIds: [],
          derivedIsJoint: false,
          canView: false,
        });
      }
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const memberRowsFresh = await fetchMemberRowsForAuthUser();
      const userSocietyIds = [...new Set(memberRowsFresh.map((r) => r.societyId).filter(Boolean))].sort();
      const bootstrapIds = [...new Set(memberships.map((m) => m.societyId))].sort();
      const participantSocietyIdsMismatchBootstrapVsFresh =
        bootstrapIds.join(",") !== userSocietyIds.join(",")
          ? { bootstrap: bootstrapIds, fresh: userSocietyIds }
          : null;

      const c = await loadCanonicalTeeSheet(eventId);
      if (!c) {
        console.log("[joint-access-user]", {
          phase: "blocked_canonical_null",
          eventId,
          userId: userId ?? null,
          activeSocietyId: societyId,
          profileActiveSocietyId: profile?.active_society_id ?? null,
          bootstrapMembershipSocietyIds: bootstrapIds,
          userSocietyIds,
          memberRowsFresh: memberRowsFresh.map((r) => ({
            memberId: r.memberId,
            societyId: r.societyId,
            userId: r.userId,
            createdAt: r.createdAt,
          })),
          duplicateMemberRowsBySociety: duplicateMemberRowsBySociety(memberRowsFresh),
          participantSocietyIdsMismatchBootstrapVsFresh,
          hostSocietyId: null,
          participantSocietyIds: [],
          participantMatch: null,
          derivedIsJoint: false,
          isActiveSocietyParticipantForEvent_inputs: null,
          canView: false,
        });
        if (__DEV__) {
          console.log("[tee-debug] loadCanonicalTeeSheet returned null — member tee sheet cannot render (often events RLS for participant societies).", {
            eventId,
            activeSocietyId: societyId,
          });
          console.log("[joint-access] final gate", {
            eventId,
            activeSocietyId: societyId,
            hostSocietyId: null,
            participantSocietyIds: [],
            derivedIsJoint: false,
            canView: false,
          });
        }
        setCanonical(null);
        setError(formatError(new Error("Event not found")));
        return;
      }

      const hostSid = c.event.society_id ?? "";
      const fromCanon = (c.jointParticipatingSocieties ?? []).map((s) => s.society_id).filter(Boolean);
      const jointMetaForGate = await getJointMetaForEventIds([eventId]);
      const fromEventSocieties = jointMetaForGate.get(eventId)?.participantSocietyIds ?? [];
      /** Full participant set for joint: event_societies (authoritative) ∪ RPC ∪ host — avoids host-only gate when joint detail payload is empty. */
      const gateParticipants: string[] = c.isJoint
        ? [...new Set([hostSid, ...fromEventSocieties, ...fromCanon].filter(Boolean))]
        : [hostSid].filter(Boolean);
      const legacyGateParticipants =
        c.isJoint && c.jointParticipatingSocieties?.length
          ? c.jointParticipatingSocieties.map((s) => s.society_id).filter(Boolean)
          : [hostSid].filter(Boolean);

      if (c.isJoint && memberships.length > 0) {
        const pref = pickPreferredMembershipSocietyForJointEvent(
          memberships,
          gateParticipants,
          hostSid,
        );
        const activeOkForEvent = isActiveSocietyParticipantForEvent(
          societyId,
          hostSid,
          gateParticipants,
        );
        if (
          pref &&
          String(pref.societyId) !== String(societyId) &&
          !activeOkForEvent
        ) {
          if (__DEV__) {
            console.log("[joint-society-context]", {
              userId: userId ?? null,
              profileActiveSocietyId: profile?.active_society_id ?? null,
              resolvedMembershipSocietyIds: memberships.map((m) => m.societyId).sort(),
              chosenActiveSocietyId: pref.societyId,
              reason: "tee_sheet_switch_to_first_membership_in_joint_participants",
              eventId,
              hostSocietyId: hostSid,
              gateParticipantIds: gateParticipants,
            });
          }
          await switchSociety(pref.societyId);
          return;
        }
      }

      const derivedIsJoint = c.isJoint === true;
      const participantMatch = gateParticipants.some((id) => String(id) === String(societyId));
      const helperInputs = {
        activeSocietyId: societyId,
        hostSocietyId: hostSid,
        participantSocietyIds: gateParticipants,
      };
      // Access uses participant/host membership only — not getMembersBySocietyId row count
      // (that query is often host-scoped; ZGS-only users see 0 rows for the host society).
      console.log("[joint-access-user]", {
        phase: "before_canView",
        eventId,
        userId: userId ?? null,
        activeSocietyId: societyId,
        profileActiveSocietyId: profile?.active_society_id ?? null,
        activeEqualsProfileSociety:
          societyId != null && profile?.active_society_id != null
            ? String(societyId) === String(profile.active_society_id)
            : null,
        bootstrapMembershipSocietyIds: bootstrapIds,
        userSocietyIds,
        memberRowsFresh: memberRowsFresh.map((r) => ({
          memberId: r.memberId,
          societyId: r.societyId,
          userId: r.userId,
          createdAt: r.createdAt,
        })),
        duplicateMemberRowsBySociety: duplicateMemberRowsBySociety(memberRowsFresh),
        participantSocietyIdsMismatchBootstrapVsFresh,
        hostSocietyId: hostSid,
        participantSocietyIds: gateParticipants,
        participantMatch,
        derivedIsJoint,
        isActiveSocietyParticipantForEvent_inputs: helperInputs,
        canView: null,
      });
      const canView = isActiveSocietyParticipantForEvent(
        societyId,
        c.event.society_id,
        gateParticipants,
      );
      if (__DEV__) {
        const metaEntry = jointMetaForGate.get(eventId) ?? null;
        const jointDetailPayload = await getJointEventDetail(eventId);
        const jointDetailParticipatingIds =
          jointDetailPayload?.participating_societies?.map((s) => s.society_id).filter(Boolean) ?? [];
        const activeInGate = gateParticipants.some((id) => String(id) === String(societyId));
        console.log("[joint-gate-debug]", {
          eventId,
          activeSocietyId: societyId,
          hostSocietyId: hostSid,
          canonicalIsJoint: c.isJoint,
          fromJointParticipatingSocieties: (c.jointParticipatingSocieties ?? []).map((s) => ({
            society_id: s.society_id,
            society_name: s.society_name ?? null,
          })),
          fromEventSocietiesMeta: [...fromEventSocieties],
          fromCanon: [...fromCanon],
          gateParticipants: [...gateParticipants],
          canView,
          activeInGate,
          /** If ZGS is in gate but canView is false, mismatch is elsewhere (e.g. missing activeSocietyId). */
          denyDespiteActiveInGate: activeInGate && !canView,
        });
        console.log("[joint-gate-debug] getJointMetaForEventIds raw", {
          eventId,
          metaEntry,
          mapSize: jointMetaForGate.size,
          mapKeys: [...jointMetaForGate.keys()],
        });
        console.log("[joint-gate-debug] canonical.jointParticipatingSocieties raw", c.jointParticipatingSocieties ?? null);
        console.log("[joint-gate-debug] getJointEventDetail payload", {
          eventId,
          detailIsNull: jointDetailPayload == null,
          detailIsJoint: jointDetailPayload?.event?.is_joint_event ?? null,
          participatingSocietyIds: jointDetailParticipatingIds,
        });

        const legacyCanView = isActiveSocietyParticipantForEvent(
          societyId,
          c.event.society_id,
          legacyGateParticipants,
        );
        const nm = (s: string) => (s || "").toLowerCase();
        const isDualMember = userSocietyIds.length >= 2;
        const isZgsMember = memberships.some((m) => nm(m.societyName).includes("zgs"));
        const isM4Member = memberships.some(
          (m) => /\bm4\b/i.test(m.societyName) || nm(m.societyName).includes("m4"),
        );
        const roleForActiveSociety =
          memberships.find((m) => String(m.societyId) === String(societyId))?.role ??
          (member as { role?: string })?.role ??
          null;
        let reason: string;
        if (canView) {
          if (!legacyCanView) {
            reason = "allowed_fixed_by_event_societies_meta_union";
          } else if (societyId && hostSid && String(societyId) === String(hostSid)) {
            reason = "allowed_host_match";
          } else {
            reason = "allowed_participant_match";
          }
        } else if (!societyId || !hostSid) {
          reason = "deny_missing_active_or_host";
        } else {
          reason = "deny_active_not_in_host_or_event_societies_union";
        }
        console.log("[joint-zgs-debug]", {
          eventId,
          userId: userId ?? null,
          activeSocietyId: societyId,
          userSocietyIds,
          resolvedMembershipRows: memberRowsFresh.map((r) => ({
            memberId: r.memberId,
            societyId: r.societyId,
          })),
          participantSocietyIds: gateParticipants,
          fromEventSocietiesRowCount: fromEventSocieties.length,
          fromCanonRowCount: fromCanon.length,
          legacyGateParticipantIds: legacyGateParticipants,
          legacyCanView,
          fixedByEventSocietiesMetaUnion: !legacyCanView && canView,
          derivedIsJoint,
          canView,
          isDualMember,
          isZgsMember,
          isM4Member,
          roleForActiveSociety,
          reason,
        });
      }
      console.log("[joint-access-user]", {
        phase: canView ? "access_allowed" : "blocked_canView_false",
        eventId,
        userId: userId ?? null,
        activeSocietyId: societyId,
        profileActiveSocietyId: profile?.active_society_id ?? null,
        activeEqualsProfileSociety:
          societyId != null && profile?.active_society_id != null
            ? String(societyId) === String(profile.active_society_id)
            : null,
        bootstrapMembershipSocietyIds: bootstrapIds,
        userSocietyIds,
        memberRowsFresh: memberRowsFresh.map((r) => ({
          memberId: r.memberId,
          societyId: r.societyId,
          userId: r.userId,
          createdAt: r.createdAt,
        })),
        duplicateMemberRowsBySociety: duplicateMemberRowsBySociety(memberRowsFresh),
        participantSocietyIdsMismatchBootstrapVsFresh,
        hostSocietyId: hostSid,
        participantSocietyIds: gateParticipants,
        participantMatch,
        derivedIsJoint,
        isActiveSocietyParticipantForEvent_inputs: helperInputs,
        canView,
      });
      if (!canView) {
        if (__DEV__) {
          console.log("[joint-access] final gate", {
            eventId,
            activeSocietyId: societyId,
            hostSocietyId: c.event.society_id,
            participantSocietyIds: gateParticipants,
            derivedIsJoint,
            canView: false,
          });
        }
        setCanonical(null);
        setMembers([]);
        setError(formatError(new Error("You don't have access to this tee sheet.")));
        return;
      }

      setCanonical(c);

      const eventData = c.event;
      const hostId = eventData.society_id ?? societyId;
      const participantSocietyIdsForPool =
        c.isJoint && gateParticipants.length > 0 ? gateParticipants : [];

      let membersMerged: MemberDoc[] = [];
      if (c.isJoint && participantSocietyIdsForPool.length > 0) {
        const lists = await Promise.all(participantSocietyIdsForPool.map((sid) => getMembersBySocietyId(sid)));
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
        console.log("[joint-access] final gate", {
          eventId,
          activeSocietyId: societyId,
          hostSocietyId: c.event.society_id,
          participantSocietyIds: gateParticipants,
          derivedIsJoint,
          canView: true,
          published: !!c.event.teeTimePublishedAt,
          groupCount: c.groups.length,
          source: c.source,
        });
      }
    } catch (err) {
      console.log("[joint-access-user]", {
        phase: "blocked_load_error",
        eventId: eventId ?? null,
        userId: userId ?? null,
        activeSocietyId: societyId ?? null,
        profileActiveSocietyId: profile?.active_society_id ?? null,
        bootstrapMembershipSocietyIds: memberships.map((m) => m.societyId).sort(),
        userSocietyIds: [],
        memberRowsFresh: [],
        duplicateMemberRowsBySociety: [],
        participantSocietyIdsMismatchBootstrapVsFresh: null,
        hostSocietyId: null,
        participantSocietyIds: [],
        participantMatch: null,
        derivedIsJoint: false,
        isActiveSocietyParticipantForEvent_inputs: null,
        canView: false,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      setError(formatError(err));
      setCanonical(null);
    } finally {
      setLoading(false);
    }
  }, [eventId, societyId, userId, profile, memberships, switchSociety]);

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
  const isJointEvent = canonical.isJoint === true;

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
