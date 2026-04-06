/**
 * Sinbook Home Screen — Rivalry Hub
 *
 * Sections:
 *   1) Summary strip (live / waiting / leading counts)
 *   2) Pending invites
 *   3) Waiting for rival
 *   4) Live rivalries
 *   5) Action buttons (New / Join)
 */

import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { useBootstrap } from "@/lib/useBootstrap";
import {
  getMySinbooks,
  getMyPendingInvites,
  createSinbook,
  acceptInvite,
  declineInvite,
  joinByCode,
  getUnreadNotificationCount,
  getWinCountsForSinbooks,
  deleteSinbook,
  canDeleteSinbookAsUser,
  type SinbookWithParticipants,
} from "@/lib/db_supabase/sinbookRepo";
import { canCreateSinbook } from "@/lib/sinbookEntitlement";
import { joinRivalrySelfDisplayName, resolvePersonDisplayName } from "@/lib/rivalryPersonName";
import { getColors, spacing, radius, iconSize } from "@/lib/ui/theme";
import { showAlert } from "@/lib/ui/alert";
import { formatError, type FormattedError } from "@/lib/ui/formatError";
import { useDestructiveConfirm } from "@/components/ui/DestructiveConfirmModal";
// ============================================================================
// Helpers
// ============================================================================

function getInitials(name: string): string {
  if (!name) return "?";
  const words = name.trim().split(/\s+/);
  return words.length === 1
    ? name.substring(0, 2).toUpperCase()
    : words.slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

type StatusKind = "waiting" | "leading" | "trailing" | "level" | "fresh";

function getStatusInfo(
  myWins: number,
  rivalWins: number,
  hasRival: boolean,
): { kind: StatusKind; label: string } {
  if (!hasRival) return { kind: "waiting", label: "Awaiting opponent" };
  if (myWins === 0 && rivalWins === 0) return { kind: "fresh", label: "No entries yet" };
  if (myWins > rivalWins) return { kind: "leading", label: `Leading ${myWins}–${rivalWins}` };
  if (rivalWins > myWins) return { kind: "trailing", label: `Trailing ${myWins}–${rivalWins}` };
  return { kind: "level", label: `Level ${myWins}–${rivalWins}` };
}

// ============================================================================
// Component
// ============================================================================

export default function SinbookHomeScreen() {
  const router = useRouter();
  const { member, userId, profile, session, loading: bootstrapLoading } = useBootstrap();
  const { destructiveConfirmModal, askConfirm } = useDestructiveConfirm();
  const colors = getColors();
  const tabBarHeight = useBottomTabBarHeight();
  const tabContentStyle = { paddingTop: 16, paddingBottom: tabBarHeight + 24 };
  const [sinbooks, setSinbooks] = useState<SinbookWithParticipants[]>([]);
  const [pendingInvites, setPendingInvites] = useState<SinbookWithParticipants[]>([]);
  const [winCounts, setWinCounts] = useState<Map<string, Map<string, number>>>(new Map());
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<FormattedError | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formStake, setFormStake] = useState("");
  const [creating, setCreating] = useState(false);

  const [showJoin, setShowJoin] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);

  // ============================================================================
  // Data
  // ============================================================================

  const loadData = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    setLoadError(null);
    try {
      const [allSb, invites, unread] = await Promise.all([
        getMySinbooks(),
        getMyPendingInvites(),
        getUnreadNotificationCount(),
      ]);
      const active = allSb.filter((s) =>
        s.participants.some((p) => p.user_id === userId && p.status === "accepted")
      );
      const ids = active.map((s) => s.id);
      const wins = await getWinCountsForSinbooks(ids);
      setSinbooks(active);
      setPendingInvites(invites);
      setWinCounts(wins);
      setUnreadCount(unread);
    } catch (err) {
      setLoadError(formatError(err));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // ============================================================================
  // Derived
  // ============================================================================

  const getRival = useCallback((sb: SinbookWithParticipants) => {
    const opponent = sb.participants.find((p) => p.user_id !== userId && p.status === "accepted");
    if (!opponent) return { name: null, id: null, hasRival: false };
    const name = resolvePersonDisplayName({
      ...sb.rivalryNameHintsByUserId?.[opponent.user_id],
      participantDisplayName: opponent.display_name,
    }).name;
    return { name, id: opponent.user_id, hasRival: true };
  }, [userId]);

  const getMyName = useCallback((sb: SinbookWithParticipants) => {
    if (!userId) return "You";
    const me = sb.participants.find((p) => p.user_id === userId);
    return resolvePersonDisplayName(
      {
        ...sb.rivalryNameHintsByUserId?.[userId],
        participantDisplayName: me?.display_name,
      },
      { lastResort: "You" },
    ).name;
  }, [userId]);

  const getStandings = useCallback((sb: SinbookWithParticipants) => {
    const sbWins = winCounts.get(sb.id);
    const myWins = sbWins?.get(userId!) ?? 0;
    const rival = getRival(sb);
    const rivalWins = rival.id ? (sbWins?.get(rival.id) ?? 0) : 0;
    return { myWins, rivalWins, rival };
  }, [winCounts, userId, getRival]);

  const { waitingList, liveList, summaryStats } = useMemo(() => {
    const waiting: SinbookWithParticipants[] = [];
    const live: SinbookWithParticipants[] = [];
    let leadingCount = 0;

    for (const sb of sinbooks) {
      const { myWins, rivalWins, rival } = getStandings(sb);
      if (!rival.hasRival) {
        waiting.push(sb);
      } else {
        live.push(sb);
        if (myWins > rivalWins) leadingCount++;
      }
    }

    return {
      waitingList: waiting,
      liveList: live,
      summaryStats: { live: live.length, waiting: waiting.length, leading: leadingCount },
    };
  }, [sinbooks, getStandings]);

  // ============================================================================
  // Actions
  // ============================================================================

  const handleCreate = async () => {
    if (!formTitle.trim()) { showAlert("Missing Title", "Give your rivalry a name."); return; }
    setCreating(true);
    try {
      const gate = await canCreateSinbook();
      if (!gate.allowed) { showAlert("Upgrade to Pro", gate.reason || "Limit reached."); return; }
      await createSinbook({
        title: formTitle.trim(),
        stake: formStake.trim() || undefined,
        creatorDisplayName: joinRivalrySelfDisplayName({
          memberDisplayName: member?.displayName,
          memberName: member?.name,
          profileFullName: profile?.full_name,
          authEmail: session?.user?.email,
          authMetadata: session?.user?.user_metadata,
        }),
      });
      setFormTitle(""); setFormStake(""); setShowCreate(false);
      loadData();
    } catch (err: any) {
      showAlert("Error", err?.message || "Failed to create rivalry.");
    } finally { setCreating(false); }
  };

  const handleJoin = async () => {
    const code = joinCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    if (!code || code.length !== 6) { showAlert("Invalid Code", "Enter the 6-character rivalry code."); return; }
    setJoining(true);
    try {
      const displayName = joinRivalrySelfDisplayName({
        memberDisplayName: member?.displayName,
        memberName: member?.name,
        profileFullName: profile?.full_name,
        authEmail: session?.user?.email,
        authMetadata: session?.user?.user_metadata,
      });
      const result = await joinByCode(code, displayName);
      setJoinCode(""); setShowJoin(false);
      showAlert("Joined!", `You're now part of "${result.title}".`);
      await loadData();
    } catch { showAlert("Join failed", "Invite code not ready yet. Please try again."); }
    finally { setJoining(false); }
  };

  const handleAcceptInvite = async (id: string) => {
    try { await acceptInvite(id); await loadData(); }
    catch (err: any) { showAlert("Error", err?.message || "Failed."); }
  };

  const handleDeclineInvite = async (id: string) => {
    try { await declineInvite(id); loadData(); }
    catch (err: any) { showAlert("Error", err?.message || "Failed."); }
  };

  const openRivalry = (id: string) => router.push({ pathname: "/(app)/sinbook/[id]", params: { id } });
  const openNotifications = () => router.push("/(app)/sinbook/notifications");

  const handleDeleteSinbookFromList = async (sb: SinbookWithParticipants) => {
    const ok = await askConfirm(
      "Delete this rivalry?",
      `“${sb.title?.trim() || "Rivalry"}” will be removed for everyone, including pending invites.`,
      "Delete",
    );
    if (!ok) return;
    try {
      await deleteSinbook(sb.id);
      await loadData();
    } catch (err: unknown) {
      const e = err as { message?: string };
      showAlert("Error", e?.message || "Could not delete rivalry.");
    }
  };

  const triggerCreate = async () => {
    const gate = await canCreateSinbook();
    if (!gate.allowed) { showAlert("Upgrade to Pro", gate.reason || "Limit reached."); return; }
    setShowCreate(true);
  };

  // ============================================================================
  // Status chip color map
  // ============================================================================

  const statusColor: Record<StatusKind, string> = {
    waiting: colors.warning,
    leading: colors.success,
    trailing: colors.error,
    level: colors.textSecondary,
    fresh: colors.textTertiary,
  };

  // ============================================================================
  // Render
  // ============================================================================

  if (bootstrapLoading || loading) {
    return (
      <Screen scrollable={false}>
        <View style={styles.centered}>
          <LoadingState message="Loading Rivalries..." />
        </View>
      </Screen>
    );
  }

  if (showCreate) {
    return (
      <Screen contentStyle={tabContentStyle}>
        <View style={styles.formHeader}>
          <SecondaryButton onPress={() => setShowCreate(false)} size="sm">Cancel</SecondaryButton>
          <AppText variant="h2">New Rivalry</AppText>
          <View style={{ width: 60 }} />
        </View>
        <AppCard>
          <View style={styles.field}>
            <AppText variant="captionBold" style={styles.label}>Rivalry Name</AppText>
            <AppInput placeholder="e.g. Brian vs Dave" value={formTitle} onChangeText={setFormTitle} autoCapitalize="words" />
          </View>
          <View style={styles.field}>
            <AppText variant="captionBold" style={styles.label}>Optional treat / forfeit</AppText>
            <AppInput
              placeholder="e.g. Loser buys coffee (friendly only)"
              value={formStake}
              onChangeText={setFormStake}
              autoCapitalize="sentences"
            />
            <AppText variant="small" color="muted" style={{ marginTop: 4 }}>Tracking only — no payments.</AppText>
          </View>
          <PrimaryButton onPress={handleCreate} loading={creating} style={{ marginTop: spacing.sm }}>
            Create Rivalry
          </PrimaryButton>
        </AppCard>
      </Screen>
    );
  }

  if (showJoin) {
    return (
      <Screen contentStyle={tabContentStyle}>
        <View style={styles.formHeader}>
          <SecondaryButton onPress={() => { setShowJoin(false); setJoinCode(""); }} size="sm">Cancel</SecondaryButton>
          <AppText variant="heading">Join Rivalry</AppText>
          <View style={{ width: 60 }} />
        </View>
        <AppCard>
          <View style={styles.field}>
            <AppText variant="captionBold" style={styles.label}>Join Code</AppText>
            <AppInput
              placeholder="e.g. ABC123"
              value={joinCode}
              onChangeText={(t) => setJoinCode(t.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
            />
            <AppText variant="small" color="muted" style={{ marginTop: 4 }}>6-character code from your rival.</AppText>
          </View>
          <PrimaryButton onPress={handleJoin} loading={joining} style={{ marginTop: spacing.sm }}>
            Join Rivalry
          </PrimaryButton>
        </AppCard>
      </Screen>
    );
  }

  // ── Main Screen ──
  return (
    <Screen contentStyle={tabContentStyle}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <AppText variant="title">Rivalries</AppText>
          <AppText variant="caption" color="secondary">
            Head-to-head challenges between mates — not a betting or staking service.
          </AppText>
        </View>
        <Pressable onPress={openNotifications} style={styles.bellBtn}>
          <Feather name="bell" size={20} color={colors.text} />
          {unreadCount > 0 && (
            <View style={[styles.unreadDot, { backgroundColor: colors.error }]}>
              <AppText variant="captionBold" color="inverse">
                {unreadCount > 9 ? "9+" : unreadCount}
              </AppText>
            </View>
          )}
        </Pressable>
      </View>

      {/* Summary strip */}
      {sinbooks.length > 0 && (
        <View style={styles.summaryStrip}>
          <View style={[styles.summaryPill, { backgroundColor: colors.primary + "10" }]}>
            <AppText variant="bodyBold" color="primary">{summaryStats.live}</AppText>
            <AppText variant="small" color="secondary">Live</AppText>
          </View>
          <View style={[styles.summaryPill, { backgroundColor: colors.warning + "10" }]}>
            <AppText variant="bodyBold" color="warning">{summaryStats.waiting}</AppText>
            <AppText variant="small" color="secondary">Waiting</AppText>
          </View>
          <View style={[styles.summaryPill, { backgroundColor: colors.success + "10" }]}>
            <AppText variant="bodyBold" style={{ color: colors.success }}>{summaryStats.leading}</AppText>
            <AppText variant="small" color="secondary">Leading</AppText>
          </View>
        </View>
      )}

      {/* Action buttons */}
      <View style={styles.topActions}>
        <PrimaryButton onPress={triggerCreate} icon={<Feather name="plus" size={iconSize.sm} color={colors.textInverse} />} style={{ flex: 1 }}>
          New Rivalry
        </PrimaryButton>
        <SecondaryButton onPress={() => setShowJoin(true)} icon={<Feather name="log-in" size={iconSize.sm} color={colors.primary} />} style={{ flex: 1 }}>
          Join with Code
        </SecondaryButton>
      </View>

      {loadError && <InlineNotice variant="error" message={loadError.message} detail={loadError.detail} style={{ marginBottom: spacing.base }} />}

      {/* Pending invites */}
      {pendingInvites.length > 0 && (
        <View style={{ marginBottom: spacing.base }}>
          <AppText variant="captionBold" color="secondary" style={styles.sectionLabel}>INVITES</AppText>
          {pendingInvites.map((inv) => {
            const creator = inv.participants.find((p) => p.user_id === inv.created_by);
            const creatorLabel = creator
              ? resolvePersonDisplayName({
                  ...inv.rivalryNameHintsByUserId?.[creator.user_id],
                  participantDisplayName: creator.display_name,
                }, { lastResort: "someone" }).name
              : "someone";
            return (
              <AppCard key={inv.id} style={{ marginBottom: spacing.xs }}>
                <AppText variant="bodyBold" numberOfLines={1}>{inv.title?.trim() || "Rivalry"}</AppText>
                <AppText variant="small" color="secondary" style={{ marginTop: 2 }}>
                  From {creatorLabel}
                  {inv.stake ? ` · ${inv.stake}` : ""}
                </AppText>
                <View style={styles.inviteActions}>
                  <PrimaryButton onPress={() => handleAcceptInvite(inv.id)} size="sm" style={{ flex: 1 }}>Accept</PrimaryButton>
                  <SecondaryButton onPress={() => handleDeclineInvite(inv.id)} size="sm" style={{ flex: 1 }}>Decline</SecondaryButton>
                </View>
              </AppCard>
            );
          })}
        </View>
      )}

      {/* Waiting for rival */}
      {waitingList.length > 0 && (
        <View style={{ marginBottom: spacing.base }}>
          <AppText variant="captionBold" color="secondary" style={styles.sectionLabel}>AWAITING OPPONENT</AppText>
          {waitingList.map((sb) => {
            const myName = getMyName(sb);
            const canDelete = canDeleteSinbookAsUser(sb, userId ?? undefined);
            return (
              <AppCard key={sb.id} style={styles.rivalryCard}>
                <View style={styles.cardRowWithAction}>
                  <Pressable style={styles.cardPressMain} onPress={() => openRivalry(sb.id)}>
                    <View style={styles.cardBody}>
                      <View style={styles.initialsRow}>
                        <View style={[styles.initialCircle, { backgroundColor: colors.primary + "14" }]}>
                          <AppText variant="captionBold" style={{ color: colors.primary }}>{getInitials(myName)}</AppText>
                        </View>
                        <AppText variant="small" color="muted">vs</AppText>
                        <View style={[styles.initialCircle, { backgroundColor: colors.backgroundTertiary }]}>
                          <Feather name="user-plus" size={12} color={colors.textTertiary} />
                        </View>
                      </View>
                      <View style={{ flex: 1 }}>
                        <AppText variant="bodyBold" numberOfLines={1}>{sb.title?.trim() || "Rivalry"}</AppText>
                        {sb.stake && <AppText variant="small" color="muted" numberOfLines={1}>{sb.stake}</AppText>}
                      </View>
                      <View style={[styles.statusChip, { backgroundColor: colors.warning + "14" }]}>
                        <AppText variant="captionBold" color="warning">Waiting</AppText>
                      </View>
                    </View>
                  </Pressable>
                  {canDelete && (
                    <Pressable
                      style={styles.cardTrashHit}
                      onPress={() => void handleDeleteSinbookFromList(sb)}
                      accessibilityLabel="Delete rivalry"
                    >
                      <Feather name="trash-2" size={18} color={colors.error} />
                    </Pressable>
                  )}
                </View>
              </AppCard>
            );
          })}
        </View>
      )}

      {/* Live rivalries */}
      {liveList.length > 0 && (
        <View style={{ marginBottom: spacing.base }}>
          <AppText variant="captionBold" color="secondary" style={styles.sectionLabel}>LIVE RIVALRIES</AppText>
          {liveList.map((sb) => {
            const { myWins, rivalWins, rival } = getStandings(sb);
            const myName = getMyName(sb);
            const rivalName = rival.hasRival ? rival.name! : "Awaiting opponent";
            const status = getStatusInfo(myWins, rivalWins, rival.hasRival);
            const chipColor = statusColor[status.kind];
            const canDelete = canDeleteSinbookAsUser(sb, userId ?? undefined);

            return (
              <AppCard key={sb.id} style={styles.rivalryCard}>
                <View style={styles.cardRowWithAction}>
                  <Pressable style={styles.cardPressMain} onPress={() => openRivalry(sb.id)}>
                    <View style={styles.cardBody}>
                      <View style={styles.initialsRow}>
                        <View style={[styles.initialCircle, { backgroundColor: colors.primary + "14" }]}>
                          <AppText variant="captionBold" style={{ color: colors.primary }}>{getInitials(myName)}</AppText>
                        </View>
                        <AppText variant="small" color="muted">vs</AppText>
                        <View style={[styles.initialCircle, { backgroundColor: colors.error + "10" }]}>
                          <AppText variant="captionBold" color="danger">{getInitials(rivalName)}</AppText>
                        </View>
                      </View>
                      <View style={{ flex: 1 }}>
                        <AppText variant="bodyBold" numberOfLines={1}>
                          {sb.title?.trim() || "Rivalry"}
                        </AppText>
                        <AppText variant="small" color="secondary" style={{ marginTop: 2 }}>
                          {rivalName}
                        </AppText>
                        <AppText variant="captionBold" style={{ color: chipColor, marginTop: 1 }}>
                          {status.label}
                        </AppText>
                        {sb.stake && <AppText variant="small" color="muted" numberOfLines={1} style={{ marginTop: 1 }}>{sb.stake}</AppText>}
                      </View>
                      <Feather name="chevron-right" size={iconSize.md} color={colors.textTertiary} />
                    </View>
                  </Pressable>
                  {canDelete && (
                    <Pressable
                      style={styles.cardTrashHit}
                      onPress={() => void handleDeleteSinbookFromList(sb)}
                      accessibilityLabel="Delete rivalry"
                    >
                      <Feather name="trash-2" size={18} color={colors.error} />
                    </Pressable>
                  )}
                </View>
              </AppCard>
            );
          })}
        </View>
      )}

      {/* Empty state */}
      {sinbooks.length === 0 && pendingInvites.length === 0 && !loadError && (
        <EmptyState
          icon={<Feather name="zap" size={iconSize.lg} color={colors.textTertiary} />}
          title="No Rivalries Yet"
          message="Start a rivalry with a mate, or join one using a code."
        />
      )}
      {destructiveConfirmModal}
    </Screen>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  bellBtn: { padding: spacing.xs, position: "relative" },
  unreadDot: {
    position: "absolute",
    top: 0, right: 0,
    minWidth: 16, height: 16, borderRadius: 8,
    alignItems: "center", justifyContent: "center",
    paddingHorizontal: 3,
  },
  summaryStrip: {
    flexDirection: "row",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  summaryPill: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  topActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.base,
  },
  sectionLabel: {
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
    marginTop: spacing.xs,
  },
  formHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  field: { marginBottom: spacing.base },
  label: { marginBottom: spacing.xs },
  inviteActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  rivalryCard: {
    marginBottom: spacing.xs,
  },
  cardRowWithAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  cardPressMain: {
    flex: 1,
    minWidth: 0,
  },
  cardTrashHit: {
    padding: spacing.sm,
    justifyContent: "center",
  },
  cardBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  initialsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  initialCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  statusChip: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
});
