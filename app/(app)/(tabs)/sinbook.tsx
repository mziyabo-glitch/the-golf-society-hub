/**
 * Sinbook Home Screen — Rivalry Hub
 *
 * Sections:
 *   1) Society competitions (e.g. Birdies League) — society-wide
 *   2) Your rivalries — summary strip, actions, invites, live/quiet lists
 */

import { useCallback, useMemo, useState } from "react";
import { ActionSheetIOS, Alert, Platform, Pressable, StyleSheet, View } from "react-native";
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
import { StatusBadge } from "@/components/ui/StatusBadge";
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
  canEditSinbookAsUser,
  type SinbookWithParticipants,
} from "@/lib/db_supabase/sinbookRepo";
import { canCreateSinbook } from "@/lib/sinbookEntitlement";
import { joinRivalrySelfDisplayName, resolvePersonDisplayName } from "@/lib/rivalryPersonName";
import { getColors, spacing, radius, iconSize } from "@/lib/ui/theme";
import { showAlert } from "@/lib/ui/alert";
import { formatError, type FormattedError } from "@/lib/ui/formatError";
import { useDestructiveConfirm } from "@/components/ui/DestructiveConfirmModal";
import { EditRivalryModal } from "@/components/sinbook/EditRivalryModal";
import { RivalriesSocietyCompetitionsSection } from "@/components/sinbook/RivalriesSocietyCompetitionsSection";
import {
  getActiveBirdiesLeague,
  getBirdiesLeagueStandings,
  pickBirdiesStandingForMember,
  scopeLabel,
  type BirdiesLeagueRow,
  type BirdiesLeagueStandingRow,
} from "@/lib/db_supabase/birdiesLeagueRepo";
import { getMembersBySocietyId, type MemberDoc } from "@/lib/db_supabase/memberRepo";
import { getPermissionsForMember } from "@/lib/rbac";
// ============================================================================
// Helpers
// ============================================================================

function getInitials(name: string): string {
  if (!name) return "?";
  const words = name.trim().split(/\s+/);
  return words.length === 1
    ? name.substring(0, 2).toUpperCase()
    : words
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase();
}

function formatShortDate(iso: string | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const dt = new Date(t);
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

function buildMetaLine(sb: SinbookWithParticipants): string {
  const parts: string[] = [];
  const stake = sb.stake?.trim();
  if (stake) parts.push(stake);
  const season = sb.season?.trim();
  if (season) parts.push(season);
  const fmt = (sb.scoring_format ?? "").trim();
  if (fmt) parts.push(fmt);
  if (sb.is_private) parts.push("Private");
  const end = (sb.ends_on ?? "").trim();
  if (end.length >= 10) parts.push(end.slice(0, 10));
  const desc = sb.description?.trim();
  if (desc) parts.push(desc.length > 24 ? `${desc.slice(0, 22)}…` : desc);
  const when = formatShortDate(sb.updated_at) || formatShortDate(sb.created_at);
  if (when) parts.push(when);
  return parts.length ? parts.join(" · ") : "—";
}

type StatusKind = "waiting" | "leading" | "trailing" | "level" | "fresh";

function getStatusInfo(
  myWins: number,
  rivalWins: number,
  hasRival: boolean,
): { kind: StatusKind; badgeLabel: string } {
  if (!hasRival) return { kind: "waiting", badgeLabel: "Waiting" };
  if (myWins === 0 && rivalWins === 0) return { kind: "fresh", badgeLabel: "Open" };
  if (myWins > rivalWins) return { kind: "leading", badgeLabel: "Leading" };
  if (rivalWins > myWins) return { kind: "trailing", badgeLabel: "Trailing" };
  return { kind: "level", badgeLabel: "Even" };
}

function statusAccentColor(kind: StatusKind, colors: ReturnType<typeof getColors>): string {
  if (kind === "leading") return colors.success;
  if (kind === "trailing") return colors.error;
  return colors.textTertiary;
}

function statusBadgeTone(kind: StatusKind): "success" | "danger" | "neutral" {
  if (kind === "leading") return "success";
  if (kind === "trailing") return "danger";
  return "neutral";
}

type ScorelineProps = {
  colors: ReturnType<typeof getColors>;
  title: string;
  myLabel: string;
  rivalLabel: string;
  myWins: number;
  rivalWins: number;
  hasRival: boolean;
  status: ReturnType<typeof getStatusInfo>;
  metaLine: string;
  onPress: () => void;
  canManage?: boolean;
  onMorePress?: () => void;
};

function RivalryScorelineRow({
  colors,
  title,
  myLabel,
  rivalLabel,
  myWins,
  rivalWins,
  hasRival,
  status,
  metaLine,
  onPress,
  canManage,
  onMorePress,
}: ScorelineProps) {
  const accent = statusAccentColor(status.kind, colors);
  const scoreDisplay = hasRival ? `${myWins}\u2013${rivalWins}` : "\u2014";
  const leftName = myLabel.length > 14 ? `${myLabel.slice(0, 13)}\u2026` : myLabel;
  const rightName = !hasRival ? "—" : rivalLabel.length > 14 ? `${rivalLabel.slice(0, 13)}\u2026` : rivalLabel;

  return (
    <AppCard style={styles.rivalryCard} padding="sm" variant="subtle">
      <View style={styles.cardRowWithAction}>
        <Pressable style={styles.cardPressMain} onPress={onPress}>
          <View style={[styles.scorelineWrap, { borderLeftColor: accent }]}>
            <AppText variant="captionBold" color="secondary" numberOfLines={1} style={styles.titleTop}>
              {title}
            </AppText>
            <View style={styles.scorelineRow1}>
              <View style={styles.colLeft}>
                <View style={[styles.miniAvatar, { backgroundColor: colors.primary + "18" }]}>
                  <AppText variant="captionBold" style={{ color: colors.primary, fontSize: 11 }}>
                    {getInitials(myLabel)}
                  </AppText>
                </View>
                <AppText variant="captionBold" color="secondary" numberOfLines={1} style={styles.colName}>
                  {leftName}
                </AppText>
              </View>

              <View style={styles.colScore} pointerEvents="none">
                <AppText variant="title" style={[styles.scoreText, { color: colors.text }]}>
                  {scoreDisplay}
                </AppText>
              </View>

              <View style={styles.colRight}>
                {hasRival ? (
                  <>
                    <View style={[styles.miniAvatar, { backgroundColor: colors.error + "12" }]}>
                      <AppText variant="captionBold" color="danger" style={{ fontSize: 11 }}>
                        {getInitials(rivalLabel)}
                      </AppText>
                    </View>
                    <AppText variant="captionBold" color="secondary" numberOfLines={1} style={[styles.colName, styles.colNameRight]}>
                      {rightName}
                    </AppText>
                  </>
                ) : (
                  <>
                    <View style={[styles.miniAvatar, { backgroundColor: colors.backgroundTertiary }]}>
                      <Feather name="user-plus" size={11} color={colors.textTertiary} />
                    </View>
                    <AppText variant="captionBold" color="muted" numberOfLines={1} style={[styles.colName, styles.colNameRight]}>
                      Rival
                    </AppText>
                  </>
                )}
              </View>
            </View>

            <View style={styles.scorelineRow2}>
              <StatusBadge label={status.badgeLabel} tone={statusBadgeTone(status.kind)} style={styles.statusBadgeCompact} />
              <AppText variant="caption" color="muted" numberOfLines={1} style={styles.metaLine}>
                {metaLine}
              </AppText>
            </View>
          </View>
        </Pressable>
        <View style={styles.rowTrail}>
          <Pressable onPress={onPress} hitSlop={10} style={styles.trailIconHit} accessibilityLabel="Open rivalry">
            <Feather name="chevron-right" size={20} color={colors.textTertiary} />
          </Pressable>
          {canManage && onMorePress ? (
            <Pressable onPress={onMorePress} hitSlop={10} style={styles.trailIconHit} accessibilityLabel="Rivalry options">
              <Feather name="more-horizontal" size={20} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </AppCard>
  );
}

// ============================================================================
// Component
// ============================================================================

export default function SinbookHomeScreen() {
  const router = useRouter();
  const { member, userId, profile, session, loading: bootstrapLoading, societyId, society } = useBootstrap();
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
  const [quietExpanded, setQuietExpanded] = useState(true);
  const [editTarget, setEditTarget] = useState<SinbookWithParticipants | null>(null);
  const [birdiesLeague, setBirdiesLeague] = useState<BirdiesLeagueRow | null>(null);
  const [birdiesStandings, setBirdiesStandings] = useState<BirdiesLeagueStandingRow[]>([]);
  const [birdiesMembers, setBirdiesMembers] = useState<MemberDoc[]>([]);

  // ============================================================================
  // Data
  // ============================================================================

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const [allSb, invites, unread] = await Promise.all([
        getMySinbooks(),
        getMyPendingInvites(),
        getUnreadNotificationCount(),
      ]);
      const active = allSb.filter((s) => s.participants.some((p) => p.user_id === userId && p.status === "accepted"));
      const ids = active.map((s) => s.id);
      const wins = await getWinCountsForSinbooks(ids);
      setSinbooks(active);
      setPendingInvites(invites);
      setWinCounts(wins);
      setUnreadCount(unread);

      if (societyId) {
        try {
          const league = await getActiveBirdiesLeague(societyId);
          setBirdiesLeague(league);
          if (league) {
            const [st, mem] = await Promise.all([
              getBirdiesLeagueStandings(societyId, league),
              getMembersBySocietyId(societyId),
            ]);
            setBirdiesStandings(st);
            setBirdiesMembers(mem);
          } else {
            setBirdiesStandings([]);
            setBirdiesMembers([]);
          }
        } catch {
          setBirdiesLeague(null);
          setBirdiesStandings([]);
          setBirdiesMembers([]);
        }
      } else {
        setBirdiesLeague(null);
        setBirdiesStandings([]);
        setBirdiesMembers([]);
      }
    } catch (err) {
      setLoadError(formatError(err));
    } finally {
      setLoading(false);
    }
  }, [userId, societyId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  // ============================================================================
  // Derived
  // ============================================================================

  const getRival = useCallback(
    (sb: SinbookWithParticipants) => {
      const opponent = sb.participants.find((p) => p.user_id !== userId && p.status === "accepted");
      if (!opponent) return { name: null, id: null, hasRival: false };
      const name = resolvePersonDisplayName({
        ...sb.rivalryNameHintsByUserId?.[opponent.user_id],
        participantDisplayName: opponent.display_name,
      }).name;
      return { name, id: opponent.user_id, hasRival: true };
    },
    [userId],
  );

  const getMyName = useCallback(
    (sb: SinbookWithParticipants) => {
      if (!userId) return "You";
      const me = sb.participants.find((p) => p.user_id === userId);
      return resolvePersonDisplayName(
        {
          ...sb.rivalryNameHintsByUserId?.[userId],
          participantDisplayName: me?.display_name,
        },
        { lastResort: "You" },
      ).name;
    },
    [userId],
  );

  const getStandings = useCallback(
    (sb: SinbookWithParticipants) => {
      const sbWins = winCounts.get(sb.id);
      const myWins = sbWins?.get(userId!) ?? 0;
      const rival = getRival(sb);
      const rivalWins = rival.id ? (sbWins?.get(rival.id) ?? 0) : 0;
      return { myWins, rivalWins, rival };
    },
    [winCounts, userId, getRival],
  );

  const { waitingList, activeLiveList, quietLiveList, summaryStats, quietCount } = useMemo(() => {
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

    const activeLive: SinbookWithParticipants[] = [];
    const quietLive: SinbookWithParticipants[] = [];
    for (const sb of live) {
      const { myWins, rivalWins } = getStandings(sb);
      if (myWins === 0 && rivalWins === 0) quietLive.push(sb);
      else activeLive.push(sb);
    }

    return {
      waitingList: waiting,
      activeLiveList: activeLive,
      quietLiveList: quietLive,
      summaryStats: { live: live.length, waiting: waiting.length, leading: leadingCount },
      quietCount: waiting.length + quietLive.length,
    };
  }, [sinbooks, getStandings]);

  const quietSinbooksOrdered = useMemo(
    () => [...waitingList, ...quietLiveList],
    [waitingList, quietLiveList],
  );

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
        creatorDisplayName: joinRivalrySelfDisplayName({
          memberDisplayName: member?.displayName,
          memberName: member?.name,
          profileFullName: profile?.full_name,
          authEmail: session?.user?.email,
          authMetadata: session?.user?.user_metadata,
        }),
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
    const code = joinCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    if (!code || code.length !== 6) {
      showAlert("Invalid Code", "Enter the 6-character rivalry code.");
      return;
    }
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
      setJoinCode("");
      setShowJoin(false);
      showAlert("Joined!", `You're now part of "${result.title}".`);
      await loadData();
    } catch {
      showAlert("Join failed", "Invite code not ready yet. Please try again.");
    } finally {
      setJoining(false);
    }
  };

  const handleAcceptInvite = async (id: string) => {
    try {
      await acceptInvite(id);
      await loadData();
    } catch (err: any) {
      showAlert("Error", err?.message || "Failed.");
    }
  };

  const handleDeclineInvite = async (id: string) => {
    try {
      await declineInvite(id);
      loadData();
    } catch (err: any) {
      showAlert("Error", err?.message || "Failed.");
    }
  };

  const openRivalry = (id: string) => router.push({ pathname: "/(app)/sinbook/[id]", params: { id } });
  const openNotifications = () => router.push("/(app)/sinbook/notifications");
  const openBirdiesLeague = () => router.push("/(app)/birdies-league" as never);

  const birdiesMy = useMemo(() => {
    const mid = member?.id != null ? String(member.id) : undefined;
    const hit = pickBirdiesStandingForMember(birdiesStandings, mid, birdiesMembers);
    if (!hit) return { rank: null as number | null, total: null as number | null, events: null as number | null };
    return { rank: hit.rank, total: hit.totalBirdies, events: hit.eventsCounted };
  }, [birdiesStandings, birdiesMembers, member?.id]);

  const canManageBirdiesLeague = useMemo(
    () => getPermissionsForMember(member).canManageBirdiesLeague,
    [member],
  );

  const handleDeleteSinbookFromList = useCallback(
    async (sb: SinbookWithParticipants) => {
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
    },
    [askConfirm, loadData],
  );

  const openRivalryRowMenu = useCallback(
    (sb: SinbookWithParticipants) => {
      const runEdit = () => setEditTarget(sb);
      const runDelete = () => void handleDeleteSinbookFromList(sb);
      const label = sb.title?.trim() || "Rivalry";
      if (Platform.OS === "ios") {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            title: label,
            options: ["Edit Rivalry", "Delete Rivalry", "Cancel"],
            destructiveButtonIndex: 1,
            cancelButtonIndex: 2,
          },
          (buttonIndex) => {
            if (buttonIndex === 0) runEdit();
            else if (buttonIndex === 1) runDelete();
          },
        );
      } else {
        Alert.alert(label, undefined, [
          { text: "Edit Rivalry", onPress: runEdit },
          { text: "Delete Rivalry", style: "destructive", onPress: runDelete },
          { text: "Cancel", style: "cancel" },
        ]);
      }
    },
    [handleDeleteSinbookFromList],
  );

  const triggerCreate = async () => {
    const gate = await canCreateSinbook();
    if (!gate.allowed) {
      showAlert("Upgrade to Pro", gate.reason || "Limit reached.");
      return;
    }
    setShowCreate(true);
  };

  const renderScoreline = (sb: SinbookWithParticipants) => {
    const { myWins, rivalWins, rival } = getStandings(sb);
    const myName = getMyName(sb);
    const rivalName = rival.hasRival ? rival.name! : "Awaiting opponent";
    const status = getStatusInfo(myWins, rivalWins, rival.hasRival);
    const canManage = canEditSinbookAsUser(sb, userId ?? undefined);
    const meta = buildMetaLine(sb);
    return (
      <RivalryScorelineRow
        key={sb.id}
        colors={colors}
        title={sb.title?.trim() || "Rivalry"}
        myLabel={myName}
        rivalLabel={rivalName}
        myWins={myWins}
        rivalWins={rivalWins}
        hasRival={rival.hasRival}
        status={status}
        metaLine={meta}
        onPress={() => openRivalry(sb.id)}
        canManage={canManage}
        onMorePress={canManage ? () => openRivalryRowMenu(sb) : undefined}
      />
    );
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
          <SecondaryButton onPress={() => setShowCreate(false)} size="sm">
            Cancel
          </SecondaryButton>
          <AppText variant="h2">New Rivalry</AppText>
          <View style={{ width: 60 }} />
        </View>
        <AppCard>
          <View style={styles.field}>
            <AppText variant="captionBold" style={styles.label}>
              Rivalry Name
            </AppText>
            <AppInput placeholder="e.g. Brian vs Dave" value={formTitle} onChangeText={setFormTitle} autoCapitalize="words" />
          </View>
          <View style={styles.field}>
            <AppText variant="captionBold" style={styles.label}>
              Optional treat / forfeit
            </AppText>
            <AppInput
              placeholder="e.g. Loser buys coffee (friendly only)"
              value={formStake}
              onChangeText={setFormStake}
              autoCapitalize="sentences"
            />
            <AppText variant="small" color="muted" style={{ marginTop: 4 }}>
              Tracking only — no payments.
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
      <Screen contentStyle={tabContentStyle}>
        <View style={styles.formHeader}>
          <SecondaryButton
            onPress={() => {
              setShowJoin(false);
              setJoinCode("");
            }}
            size="sm"
          >
            Cancel
          </SecondaryButton>
          <AppText variant="heading">Join Rivalry</AppText>
          <View style={{ width: 60 }} />
        </View>
        <AppCard>
          <View style={styles.field}>
            <AppText variant="captionBold" style={styles.label}>
              Join Code
            </AppText>
            <AppInput
              placeholder="e.g. ABC123"
              value={joinCode}
              onChangeText={(t) => setJoinCode(t.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
            />
            <AppText variant="small" color="muted" style={{ marginTop: 4 }}>
              6-character code from your rival.
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
    <Screen contentStyle={tabContentStyle}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <AppText variant="title">Rivalries</AppText>
          <AppText variant="caption" color="secondary">
            Society competitions first, then your head-to-head challenges — friendly tracking only, not staking.
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

      {societyId ? (
        <RivalriesSocietyCompetitionsSection
          colors={colors}
          societyName={society?.name}
          hasActiveLeague={birdiesLeague != null}
          scopeDescription={birdiesLeague ? scopeLabel(birdiesLeague.event_scope) : null}
          myRank={birdiesMy.rank}
          myTotalBirdies={birdiesMy.total}
          myEventsCounted={birdiesMy.events}
          canManageBirdiesLeague={canManageBirdiesLeague}
          onOpenBirdiesLeague={openBirdiesLeague}
        />
      ) : null}

      <AppText variant="captionBold" color="muted" style={styles.rivalriesGroupEyebrow}>
        Your rivalries
      </AppText>
      <AppText variant="small" color="secondary" style={{ marginBottom: spacing.sm }}>
        One-on-one scorelines with a single opponent. Use New or Join with code below.
      </AppText>

      {/* Summary strip — compact pills */}
      {sinbooks.length > 0 && (
        <View style={styles.summaryStrip}>
          <View style={[styles.summaryPillCompact, { backgroundColor: colors.primary + "12" }]}>
            <AppText variant="captionBold" color="primary">
              {summaryStats.live}
            </AppText>
            <AppText variant="caption" color="secondary">
              Live
            </AppText>
          </View>
          <View style={[styles.summaryPillCompact, { backgroundColor: colors.warning + "12" }]}>
            <AppText variant="captionBold" color="warning">
              {summaryStats.waiting}
            </AppText>
            <AppText variant="caption" color="secondary" numberOfLines={1}>
              Pending
            </AppText>
          </View>
          <View style={[styles.summaryPillCompact, { backgroundColor: colors.success + "12" }]}>
            <AppText variant="captionBold" style={{ color: colors.success }}>
              {summaryStats.leading}
            </AppText>
            <AppText variant="caption" color="secondary">
              Lead
            </AppText>
          </View>
        </View>
      )}

      {/* Action buttons — primary vs secondary weight */}
      <View style={styles.topActions}>
        <PrimaryButton
          onPress={triggerCreate}
          icon={<Feather name="plus" size={16} color={colors.textInverse} />}
          style={styles.newRivalryBtn}
        >
          New Rivalry
        </PrimaryButton>
        <Pressable
          onPress={() => setShowJoin(true)}
          style={({ pressed }) => [
            styles.joinCodePressable,
            {
              borderColor: colors.borderLight,
              backgroundColor: pressed ? colors.backgroundTertiary : colors.backgroundSecondary,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Join rivalry with code"
        >
          <Feather name="log-in" size={16} color={colors.textSecondary} />
          <AppText variant="captionBold" color="secondary" style={{ marginLeft: 6 }} numberOfLines={1}>
            Join with code
          </AppText>
        </Pressable>
      </View>

      {loadError && <InlineNotice variant="error" message={loadError.message} detail={loadError.detail} style={{ marginBottom: spacing.base }} />}

      {/* Pending invites */}
      {pendingInvites.length > 0 && (
        <View style={{ marginBottom: spacing.base }}>
          <AppText variant="captionBold" color="secondary" style={styles.sectionLabel}>
            INVITES
          </AppText>
          {pendingInvites.map((inv) => {
            const creator = inv.participants.find((p) => p.user_id === inv.created_by);
            const creatorLabel = creator
              ? resolvePersonDisplayName(
                  {
                    ...inv.rivalryNameHintsByUserId?.[creator.user_id],
                    participantDisplayName: creator.display_name,
                  },
                  { lastResort: "someone" },
                ).name
              : "someone";
            return (
              <AppCard key={inv.id} style={{ marginBottom: spacing.xs }}>
                <AppText variant="bodyBold" numberOfLines={1}>
                  {inv.title?.trim() || "Rivalry"}
                </AppText>
                <AppText variant="small" color="secondary" style={{ marginTop: 2 }}>
                  From {creatorLabel}
                  {inv.stake ? ` · ${inv.stake}` : ""}
                </AppText>
                <View style={styles.inviteActions}>
                  <PrimaryButton onPress={() => handleAcceptInvite(inv.id)} size="sm" style={{ flex: 1 }}>
                    Accept
                  </PrimaryButton>
                  <SecondaryButton onPress={() => handleDeclineInvite(inv.id)} size="sm" style={{ flex: 1 }}>
                    Decline
                  </SecondaryButton>
                </View>
              </AppCard>
            );
          })}
        </View>
      )}

      {/* Live rivalries (has scored results) */}
      {activeLiveList.length > 0 && (
        <View style={{ marginBottom: spacing.sm }}>
          <AppText variant="captionBold" color="secondary" style={styles.sectionLabel}>
            LIVE RIVALRIES
          </AppText>
          {activeLiveList.map((sb) => renderScoreline(sb))}
        </View>
      )}

      {/* Quiet: awaiting opponent or 0–0 — collapsible */}
      {quietCount > 0 && (
        <View style={{ marginBottom: spacing.base }}>
          <Pressable
            onPress={() => setQuietExpanded((e) => !e)}
            style={({ pressed }) => [styles.quietHeader, { opacity: pressed ? 0.85 : 1 }]}
            accessibilityRole="button"
            accessibilityState={{ expanded: quietExpanded }}
          >
            <AppText variant="captionBold" color="secondary" style={{ letterSpacing: 0.6 }}>
              QUIET & AWAITING
            </AppText>
            <View style={styles.quietHeaderRight}>
              <AppText variant="captionBold" color="muted">
                {quietCount}
              </AppText>
              <Feather name={quietExpanded ? "chevron-up" : "chevron-down"} size={18} color={colors.textTertiary} />
            </View>
          </Pressable>
          {quietExpanded ? quietSinbooksOrdered.map((sb) => renderScoreline(sb)) : null}
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
      <EditRivalryModal
        visible={editTarget != null}
        sinbook={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={() => {
          setEditTarget(null);
          void loadData();
        }}
      />
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
    top: 0,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  summaryStrip: {
    flexDirection: "row",
    gap: 6,
    marginBottom: spacing.sm,
  },
  summaryPillCompact: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.full,
  },
  topActions: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "stretch",
    marginBottom: spacing.base,
  },
  newRivalryBtn: {
    flex: 1,
    minHeight: 44,
  },
  joinCodePressable: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    maxWidth: 132,
  },
  sectionLabel: {
    letterSpacing: 0.8,
    marginBottom: 4,
    marginTop: 2,
  },
  rivalriesGroupEyebrow: {
    letterSpacing: 0.6,
    marginBottom: 4,
    marginTop: 2,
    textTransform: "uppercase",
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
    marginBottom: 4,
    paddingVertical: 0,
    overflow: "hidden",
  },
  cardRowWithAction: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 0,
  },
  cardPressMain: {
    flex: 1,
    minWidth: 0,
  },
  rowTrail: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 2,
    paddingRight: 2,
  },
  trailIconHit: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    justifyContent: "center",
  },
  scorelineWrap: {
    borderLeftWidth: 3,
    paddingLeft: spacing.sm,
    paddingVertical: 6,
    paddingRight: spacing.xs,
  },
  titleTop: {
    marginBottom: 4,
  },
  scorelineRow1: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 36,
  },
  colLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
    paddingRight: 4,
  },
  colScore: {
    width: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreText: {
    fontWeight: "800",
    letterSpacing: -0.5,
    fontSize: 20,
    lineHeight: 24,
  },
  colRight: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    minWidth: 0,
    paddingLeft: 4,
  },
  colName: {
    flex: 1,
    minWidth: 0,
  },
  colNameRight: {
    textAlign: "right",
  },
  scorelineRow2: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "nowrap",
  },
  statusBadgeCompact: {
    paddingVertical: 2,
    paddingHorizontal: spacing.xs + 2,
  },
  metaLine: {
    flex: 1,
    minWidth: 0,
  },
  quietHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
    marginBottom: 4,
  },
  quietHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  miniAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
});
