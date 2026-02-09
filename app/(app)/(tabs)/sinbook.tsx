/**
 * Sinbook Home Screen
 *
 * SECTION 1: Pending Invites (if any) — accept / decline
 * SECTION 2: Active Sinbooks — card per rivalry with standings + stake line
 * SECTION 3: Create New — "+ New Sinbook" + join code
 *
 * No editing on this screen. Read-only cards with [View] action.
 */

import { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";

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
  acceptInviteByLink,
  getUnreadNotificationCount,
  getWinCountsForSinbooks,
  type SinbookWithParticipants,
} from "@/lib/db_supabase/sinbookRepo";
import { canCreateSinbook } from "@/lib/sinbookEntitlement";
import { getColors, spacing, radius } from "@/lib/ui/theme";
import { showAlert } from "@/lib/ui/alert";
import { formatError, type FormattedError } from "@/lib/ui/formatError";

// ============================================================================
// Helpers
// ============================================================================

/** Build a status line like "You're leading 4–2" */
function buildStatusLine(
  myWins: number,
  rivalWins: number,
  rivalName: string,
  hasRival: boolean,
): string {
  if (!hasRival) return "Waiting for rival to join";
  if (myWins === 0 && rivalWins === 0) return "No entries yet";
  if (myWins > rivalWins) return `You're leading ${myWins}–${rivalWins}`;
  if (rivalWins > myWins) return `Trailing ${myWins}–${rivalWins}`;
  return `Level ${myWins}–${rivalWins}`;
}

/** Build muted ledger line from stake + season */
function buildLedgerLine(stake: string | null, season: string | null): string | null {
  const parts: string[] = [];
  if (stake) parts.push(stake);
  if (season) parts.push(`Season ${season}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

// ============================================================================
// Component
// ============================================================================

export default function SinbookHomeScreen() {
  const router = useRouter();
  const { member, userId, loading: bootstrapLoading } = useBootstrap();
  const colors = getColors();

  // Data
  const [sinbooks, setSinbooks] = useState<SinbookWithParticipants[]>([]);
  const [pendingInvites, setPendingInvites] = useState<SinbookWithParticipants[]>([]);
  const [winCounts, setWinCounts] = useState<Map<string, Map<string, number>>>(new Map());
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<FormattedError | null>(null);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formStake, setFormStake] = useState("");
  const [creating, setCreating] = useState(false);

  // Join form
  const [showJoin, setShowJoin] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);

  // ============================================================================
  // Data Loading
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

      // Fetch win counts for active sinbooks
      const ids = active.map((s) => s.id);
      const wins = await getWinCountsForSinbooks(ids);

      setSinbooks(active);
      setPendingInvites(invites);
      setWinCounts(wins);
      setUnreadCount(unread);
    } catch (err) {
      console.error("[sinbook] load error:", err);
      setLoadError(formatError(err));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // ============================================================================
  // Actions
  // ============================================================================

  const handleCreate = async () => {
    if (!formTitle.trim()) {
      showAlert("Missing Title", "Give your rivalry a name.");
      return;
    }
    setCreating(true);
    try {
      const gate = await canCreateSinbook();
      if (!gate.allowed) {
        showAlert("Upgrade to Pro", gate.reason || "Limit reached.");
        return;
      }
      await createSinbook({
        title: formTitle.trim(),
        stake: formStake.trim() || undefined,
        creatorDisplayName: member?.displayName || member?.name || "Player",
      });
      setFormTitle("");
      setFormStake("");
      setShowCreate(false);
      loadData();
    } catch (err: any) {
      showAlert("Error", err?.message || "Failed to create rivalry.");
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async () => {
    const code = joinCode.trim();
    if (!code) {
      showAlert("Missing Code", "Paste the invite code you received.");
      return;
    }
    setJoining(true);
    try {
      await acceptInviteByLink(code, member?.displayName || member?.name || "Player");
      setJoinCode("");
      setShowJoin(false);
      showAlert("Joined!", "You're now part of the rivalry.");
      loadData();
    } catch (err: any) {
      showAlert("Error", err?.message || "Invalid code or failed to join.");
    } finally {
      setJoining(false);
    }
  };

  const handleAcceptInvite = async (sinbookId: string) => {
    try {
      await acceptInvite(sinbookId);
      loadData();
    } catch (err: any) {
      showAlert("Error", err?.message || "Failed to accept invite.");
    }
  };

  const handleDeclineInvite = async (sinbookId: string) => {
    try {
      await declineInvite(sinbookId);
      loadData();
    } catch (err: any) {
      showAlert("Error", err?.message || "Failed to decline invite.");
    }
  };

  const openRivalry = (id: string) => {
    router.push({ pathname: "/(app)/sinbook/[id]", params: { id } });
  };

  const openNotifications = () => {
    router.push("/(app)/sinbook/notifications");
  };

  const triggerCreate = async () => {
    const gate = await canCreateSinbook();
    if (!gate.allowed) {
      showAlert("Upgrade to Pro", gate.reason || "Limit reached.");
      return;
    }
    setShowCreate(true);
  };

  // ============================================================================
  // Render helpers
  // ============================================================================

  /** Get rival info for a sinbook */
  const getRival = (sb: SinbookWithParticipants) => {
    const other = sb.participants.find((p) => p.user_id !== userId && p.status === "accepted");
    return { name: other?.display_name || "Rival", id: other?.user_id ?? null, hasRival: !!other };
  };

  /** Get my wins / rival wins for a sinbook */
  const getStandings = (sb: SinbookWithParticipants) => {
    const sbWins = winCounts.get(sb.id);
    const myWins = sbWins?.get(userId!) ?? 0;
    const rival = getRival(sb);
    const rivalWins = rival.id ? (sbWins?.get(rival.id) ?? 0) : 0;
    return { myWins, rivalWins };
  };

  // ============================================================================
  // Render
  // ============================================================================

  if (bootstrapLoading || loading) {
    return (
      <Screen scrollable={false}>
        <View style={styles.centered}>
          <LoadingState message="Loading Sinbook..." />
        </View>
      </Screen>
    );
  }

  // ── Create Form ──
  if (showCreate) {
    return (
      <Screen>
        <View style={styles.formHeader}>
          <SecondaryButton onPress={() => setShowCreate(false)} size="sm">Cancel</SecondaryButton>
          <AppText variant="h2">New Sinbook</AppText>
          <View style={{ width: 60 }} />
        </View>
        <AppCard>
          <View style={styles.field}>
            <AppText variant="captionBold" style={styles.label}>Rivalry Name</AppText>
            <AppInput
              placeholder="e.g. Brian vs Dave — 2026"
              value={formTitle}
              onChangeText={setFormTitle}
              autoCapitalize="words"
            />
          </View>
          <View style={styles.field}>
            <AppText variant="captionBold" style={styles.label}>Stake (optional)</AppText>
            <AppInput
              placeholder="e.g. Loser buys dinner"
              value={formStake}
              onChangeText={setFormStake}
              autoCapitalize="sentences"
            />
            <AppText variant="small" color="tertiary" style={{ marginTop: 4 }}>
              Tracking only — no payments through the app.
            </AppText>
          </View>
          <PrimaryButton onPress={handleCreate} loading={creating} style={{ marginTop: spacing.sm }}>
            Create Sinbook
          </PrimaryButton>
        </AppCard>
      </Screen>
    );
  }

  // ── Join Form ──
  if (showJoin) {
    return (
      <Screen>
        <View style={styles.formHeader}>
          <SecondaryButton onPress={() => { setShowJoin(false); setJoinCode(""); }} size="sm">Cancel</SecondaryButton>
          <AppText variant="h2">Join Rivalry</AppText>
          <View style={{ width: 60 }} />
        </View>
        <AppCard>
          <View style={styles.field}>
            <AppText variant="captionBold" style={styles.label}>Invite Code</AppText>
            <AppInput
              placeholder="Paste the code your rival sent you"
              value={joinCode}
              onChangeText={setJoinCode}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <AppText variant="small" color="tertiary" style={{ marginTop: 4 }}>
              Your rival shares the code from inside their rivalry.
            </AppText>
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
    <Screen>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <AppText variant="title">Sinbook</AppText>
          <AppText variant="caption" color="secondary">Track rivalries and side bets</AppText>
        </View>
        <Pressable onPress={openNotifications} style={styles.bellBtn}>
          <Feather name="bell" size={20} color={colors.text} />
          {unreadCount > 0 && (
            <View style={[styles.unreadDot, { backgroundColor: colors.error }]}>
              <AppText variant="small" color="inverse" style={{ fontSize: 9, fontWeight: "700" }}>
                {unreadCount > 9 ? "9+" : unreadCount}
              </AppText>
            </View>
          )}
        </Pressable>
      </View>

      {loadError && (
        <InlineNotice variant="error" message={loadError.message} detail={loadError.detail} style={{ marginBottom: spacing.base }} />
      )}

      {/* ── SECTION 1: Pending Invites ── */}
      {pendingInvites.length > 0 && (
        <View style={{ marginBottom: spacing.lg }}>
          <AppText variant="captionBold" color="secondary" style={styles.sectionLabel}>
            PENDING INVITES
          </AppText>
          {pendingInvites.map((invite) => {
            const creator = invite.participants.find((p) => p.user_id === invite.created_by);
            const ledger = buildLedgerLine(invite.stake, invite.season);
            return (
              <AppCard key={invite.id} style={{ marginBottom: spacing.xs }}>
                <AppText variant="bodyBold" numberOfLines={1}>{invite.title}</AppText>
                <AppText variant="caption" color="secondary" style={{ marginTop: 2 }}>
                  From {creator?.display_name || "a rival"}
                </AppText>
                {ledger && (
                  <AppText variant="small" color="tertiary" numberOfLines={1} style={{ marginTop: 2 }}>
                    {ledger}
                  </AppText>
                )}
                <View style={styles.inviteActions}>
                  <PrimaryButton onPress={() => handleAcceptInvite(invite.id)} size="sm" style={{ flex: 1 }}>
                    Accept
                  </PrimaryButton>
                  <SecondaryButton onPress={() => handleDeclineInvite(invite.id)} size="sm" style={{ flex: 1 }}>
                    Decline
                  </SecondaryButton>
                </View>
              </AppCard>
            );
          })}
        </View>
      )}

      {/* ── SECTION 2: Active Sinbooks ── */}
      {sinbooks.length > 0 && (
        <View style={{ marginBottom: spacing.lg }}>
          {(sinbooks.length > 0 || pendingInvites.length > 0) && (
            <AppText variant="captionBold" color="secondary" style={styles.sectionLabel}>
              MY RIVALRIES
            </AppText>
          )}
          {sinbooks.map((sb) => {
            const rival = getRival(sb);
            const { myWins, rivalWins } = getStandings(sb);
            const statusLine = buildStatusLine(myWins, rivalWins, rival.name, rival.hasRival);
            const ledger = buildLedgerLine(sb.stake, sb.season);
            const isLeading = myWins > rivalWins && rival.hasRival;
            const isTrailing = rivalWins > myWins && rival.hasRival;

            return (
              <Pressable key={sb.id} onPress={() => openRivalry(sb.id)}>
                <AppCard style={{ marginBottom: spacing.xs }}>
                  <View style={styles.cardRow}>
                    <View style={{ flex: 1 }}>
                      {/* Line 1: Rivalry name */}
                      <AppText variant="bodyBold" numberOfLines={1}>{sb.title}</AppText>

                      {/* Line 2: Status */}
                      <AppText
                        variant="caption"
                        numberOfLines={1}
                        style={{
                          marginTop: 2,
                          color: isLeading ? colors.success : isTrailing ? colors.error : colors.textSecondary,
                          fontWeight: "600",
                        }}
                      >
                        {statusLine}
                      </AppText>

                      {/* Line 3: Ledger / stake */}
                      {ledger && (
                        <AppText variant="small" color="tertiary" numberOfLines={1} style={{ marginTop: 2 }}>
                          {ledger}
                        </AppText>
                      )}
                    </View>

                    <View style={[styles.viewBtn, { backgroundColor: colors.primary + "12" }]}>
                      <AppText variant="captionBold" style={{ color: colors.primary }}>View</AppText>
                    </View>
                  </View>
                </AppCard>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* ── Empty state (no sinbooks, no invites) ── */}
      {sinbooks.length === 0 && pendingInvites.length === 0 && !loadError && (
        <EmptyState
          icon={<Feather name="zap" size={24} color={colors.textTertiary} />}
          title="No Rivalries Yet"
          message="Start a rivalry with a mate and track who owes who all season."
          action={{ label: "+ New Sinbook", onPress: triggerCreate }}
        />
      )}

      {/* ── SECTION 3: Create / Join buttons ── */}
      {(sinbooks.length > 0 || pendingInvites.length > 0) && (
        <View style={styles.bottomActions}>
          <PrimaryButton
            onPress={triggerCreate}
            icon={<Feather name="plus" size={16} color={colors.textInverse} />}
            style={{ flex: 1 }}
          >
            New Sinbook
          </PrimaryButton>
          <SecondaryButton onPress={() => setShowJoin(true)} style={{ flex: 1 }}>
            Join with Code
          </SecondaryButton>
        </View>
      )}

      <View style={{ height: spacing["2xl"] }} />
    </Screen>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  bellBtn: {
    padding: spacing.xs,
    position: "relative",
  },
  unreadDot: {
    position: "absolute",
    top: 0,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },

  // Section label
  sectionLabel: {
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },

  // Forms
  formHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  field: { marginBottom: spacing.base },
  label: { marginBottom: spacing.xs },

  // Invite actions
  inviteActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },

  // Rivalry card
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  viewBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },

  // Bottom actions
  bottomActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
});
