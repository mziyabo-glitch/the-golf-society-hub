/**
 * Sinbook Home Screen
 * Lists active rivalries, pending invites, and create button.
 */

import { useCallback, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
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
  type SinbookWithParticipants,
} from "@/lib/db_supabase/sinbookRepo";
import { canCreateSinbook } from "@/lib/sinbookEntitlement";
import { getColors, spacing, radius } from "@/lib/ui/theme";
import { formatError, type FormattedError } from "@/lib/ui/formatError";

export default function SinbookHomeScreen() {
  const router = useRouter();
  const { member, userId, loading: bootstrapLoading } = useBootstrap();
  const colors = getColors();

  const [sinbooks, setSinbooks] = useState<SinbookWithParticipants[]>([]);
  const [pendingInvites, setPendingInvites] = useState<SinbookWithParticipants[]>([]);
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

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const [sb, invites, unread] = await Promise.all([
        getMySinbooks(),
        getMyPendingInvites(),
        getUnreadNotificationCount(),
      ]);
      // Active = accepted, not pending-only
      const active = sb.filter((s) =>
        s.participants.some((p) => p.user_id === userId && p.status === "accepted")
      );
      setSinbooks(active);
      setPendingInvites(invites);
      setUnreadCount(unread);
    } catch (err) {
      console.error("[sinbook] load error:", err);
      setLoadError(formatError(err));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleCreate = async () => {
    if (!formTitle.trim()) {
      Alert.alert("Missing Title", "Give your rivalry a name.");
      return;
    }

    setCreating(true);
    try {
      const gate = await canCreateSinbook();
      if (!gate.allowed) {
        Alert.alert("Upgrade to Pro", gate.reason || "Limit reached.");
        return;
      }

      const displayName = member?.displayName || member?.name || "Player";
      await createSinbook({
        title: formTitle.trim(),
        stake: formStake.trim() || undefined,
        creatorDisplayName: displayName,
      });

      setFormTitle("");
      setFormStake("");
      setShowCreate(false);
      loadData();
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Failed to create rivalry.");
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async () => {
    const code = joinCode.trim();
    if (!code) {
      Alert.alert("Missing Code", "Paste the invite code you received.");
      return;
    }

    setJoining(true);
    try {
      const displayName = member?.displayName || member?.name || "Player";
      await acceptInviteByLink(code, displayName);
      setJoinCode("");
      setShowJoin(false);
      Alert.alert("Joined!", "You're now part of the rivalry.");
      loadData();
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Invalid code or failed to join.");
    } finally {
      setJoining(false);
    }
  };

  const handleAcceptInvite = async (sinbookId: string) => {
    try {
      await acceptInvite(sinbookId);
      loadData();
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Failed to accept invite.");
    }
  };

  const handleDeclineInvite = async (sinbookId: string) => {
    try {
      await declineInvite(sinbookId);
      loadData();
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Failed to decline invite.");
    }
  };

  const openRivalry = (id: string) => {
    router.push({ pathname: "/(app)/sinbook/[id]", params: { id } });
  };

  const openNotifications = () => {
    router.push("/(app)/sinbook/notifications");
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

  if (showCreate) {
    return (
      <Screen>
        <View style={styles.header}>
          <SecondaryButton onPress={() => setShowCreate(false)} size="sm">
            Cancel
          </SecondaryButton>
          <AppText variant="h2">New Rivalry</AppText>
          <View style={{ width: 60 }} />
        </View>

        <AppCard>
          <View style={styles.formField}>
            <AppText variant="captionBold" style={styles.label}>Rivalry Name</AppText>
            <AppInput
              placeholder="e.g. Brian vs Dave — 2026"
              value={formTitle}
              onChangeText={setFormTitle}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.formField}>
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
            Create Rivalry
          </PrimaryButton>
        </AppCard>
      </Screen>
    );
  }

  if (showJoin) {
    return (
      <Screen>
        <View style={styles.header}>
          <SecondaryButton onPress={() => { setShowJoin(false); setJoinCode(""); }} size="sm">
            Cancel
          </SecondaryButton>
          <AppText variant="h2">Join Rivalry</AppText>
          <View style={{ width: 60 }} />
        </View>

        <AppCard>
          <View style={styles.formField}>
            <AppText variant="captionBold" style={styles.label}>Invite Code</AppText>
            <AppInput
              placeholder="Paste the code your rival sent you"
              value={joinCode}
              onChangeText={setJoinCode}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <AppText variant="small" color="tertiary" style={{ marginTop: 4 }}>
              Your rival can share the code from the rivalry screen.
            </AppText>
          </View>

          <PrimaryButton onPress={handleJoin} loading={joining} style={{ marginTop: spacing.sm }}>
            Join Rivalry
          </PrimaryButton>
        </AppCard>
      </Screen>
    );
  }

  const rival = (sb: SinbookWithParticipants) => {
    const other = sb.participants.find((p) => p.user_id !== userId && p.status === "accepted");
    return other?.display_name || "Awaiting rival";
  };

  return (
    <Screen>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <AppText variant="title">Sinbook</AppText>
          <AppText variant="caption" color="secondary">Rivalry tracker</AppText>
        </View>
        <View style={{ flexDirection: "row", gap: spacing.xs, alignItems: "center" }}>
          <Pressable onPress={openNotifications} style={styles.iconBtn}>
            <Feather name="bell" size={20} color={colors.text} />
            {unreadCount > 0 && (
              <View style={[styles.badge, { backgroundColor: colors.error }]}>
                <AppText variant="small" color="inverse" style={{ fontSize: 10, fontWeight: "700" }}>
                  {unreadCount > 9 ? "9+" : unreadCount}
                </AppText>
              </View>
            )}
          </Pressable>
          <SecondaryButton onPress={() => setShowJoin(true)} size="sm">
            Join
          </SecondaryButton>
          <PrimaryButton onPress={() => setShowCreate(true)} size="sm">
            New
          </PrimaryButton>
        </View>
      </View>

      {loadError && (
        <InlineNotice variant="error" message={loadError.message} detail={loadError.detail} style={{ marginBottom: spacing.sm }} />
      )}

      {/* Pending Invites */}
      {pendingInvites.length > 0 && (
        <View style={{ marginBottom: spacing.lg }}>
          <AppText variant="h2" style={{ marginBottom: spacing.sm }}>
            Pending Invites ({pendingInvites.length})
          </AppText>
          {pendingInvites.map((invite) => {
            const inviter = invite.participants.find((p) => p.user_id === invite.created_by);
            return (
              <AppCard key={invite.id} style={styles.inviteCard}>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyBold">{invite.title}</AppText>
                  <AppText variant="caption" color="secondary">
                    From {inviter?.display_name || "someone"}
                  </AppText>
                  {invite.stake && (
                    <AppText variant="small" color="tertiary">Stake: {invite.stake}</AppText>
                  )}
                </View>
                <View style={styles.inviteActions}>
                  <PrimaryButton onPress={() => handleAcceptInvite(invite.id)} size="sm">
                    Accept
                  </PrimaryButton>
                  <SecondaryButton onPress={() => handleDeclineInvite(invite.id)} size="sm">
                    Decline
                  </SecondaryButton>
                </View>
              </AppCard>
            );
          })}
        </View>
      )}

      {/* Active Rivalries */}
      {sinbooks.length === 0 && pendingInvites.length === 0 && !loadError ? (
        <EmptyState
          icon={<Feather name="zap" size={24} color={colors.textTertiary} />}
          title="No Rivalries Yet"
          message="Start a rivalry with a mate. Track who owes who across the season."
          action={{ label: "Create Rivalry", onPress: () => setShowCreate(true) }}
        />
      ) : sinbooks.length > 0 ? (
        <View>
          <AppText variant="h2" style={{ marginBottom: spacing.sm }}>
            My Rivalries ({sinbooks.length})
          </AppText>
          {sinbooks.map((sb) => (
            <Pressable key={sb.id} onPress={() => openRivalry(sb.id)}>
              <AppCard style={styles.rivalryCard}>
                <View style={styles.rivalryRow}>
                  <View style={[styles.rivalryIcon, { backgroundColor: colors.primary + "15" }]}>
                    <Feather name="zap" size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyBold" numberOfLines={1}>{sb.title}</AppText>
                    <AppText variant="caption" color="secondary">vs {rival(sb)}</AppText>
                    {sb.stake && (
                      <AppText variant="small" color="tertiary" numberOfLines={1}>
                        {sb.stake}
                      </AppText>
                    )}
                  </View>
                  <Feather name="chevron-right" size={20} color={colors.textTertiary} />
                </View>
              </AppCard>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={{ height: spacing["2xl"] }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  formField: { marginBottom: spacing.base },
  label: { marginBottom: spacing.xs },
  iconBtn: { padding: spacing.xs, position: "relative" },
  badge: {
    position: "absolute",
    top: -2,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  inviteCard: { marginBottom: spacing.xs },
  inviteActions: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.sm },
  rivalryCard: { marginBottom: spacing.xs },
  rivalryRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rivalryIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
});
