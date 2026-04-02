/**
 * Rivalry Detail Screen
 * Shows standings (wins per participant), entry timeline, add/edit entries.
 * Both participants have full edit rights.
 */

import { useCallback, useState } from "react";
import { Pressable, Share, StyleSheet, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { goBack } from "@/lib/navigation";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { useBootstrap } from "@/lib/useBootstrap";
import {
  getSinbook,
  getEntries,
  addEntry,
  updateEntry,
  deleteEntry,
  deleteSinbook,
  resetSinbook,
  canDeleteSinbookAsUser,
  type SinbookWithParticipants,
  type SinbookEntry,
  type SinbookParticipant,
} from "@/lib/db_supabase/sinbookRepo";
import { getColors, spacing, radius } from "@/lib/ui/theme";
import { formatError, type FormattedError } from "@/lib/ui/formatError";
import { showAlert } from "@/lib/ui/alert";
import { Toast } from "@/components/ui/Toast";
import { useDestructiveConfirm } from "@/components/ui/DestructiveConfirmModal";
import { getRivalryInviteMessage } from "@/lib/appConfig";

export default function RivalryDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const sinbookId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { userId } = useBootstrap();
  const colors = getColors();
  const { destructiveConfirmModal, askConfirm } = useDestructiveConfirm();

  const [sinbook, setSinbook] = useState<SinbookWithParticipants | null>(null);
  const [entries, setEntries] = useState<SinbookEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<FormattedError | null>(null);

  // Add entry form
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [entryDesc, setEntryDesc] = useState("");
  const [entryWinner, setEntryWinner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Edit entry
  const [editingEntry, setEditingEntry] = useState<SinbookEntry | null>(null);

  const loadData = useCallback(async () => {
    if (!sinbookId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [sb, ent] = await Promise.all([
        getSinbook(sinbookId),
        getEntries(sinbookId),
      ]);
      setSinbook(sb);
      setEntries(ent);
    } catch (err) {
      setLoadError(formatError(err));
    } finally {
      setLoading(false);
    }
  }, [sinbookId]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // Derived data — map ALL participants by user_id for name resolution
  const allParticipants = sinbook?.participants ?? [];
  const acceptedParticipants = allParticipants.filter((p) => p.status === "accepted");
  const participantMap = new Map<string, SinbookParticipant>();
  for (const p of allParticipants) participantMap.set(p.user_id, p);

  // Standings: count wins per participant
  const standings = new Map<string, number>();
  for (const p of acceptedParticipants) standings.set(p.user_id, 0);
  for (const e of entries) {
    if (e.winner_id && standings.has(e.winner_id)) {
      standings.set(e.winner_id, (standings.get(e.winner_id) ?? 0) + 1);
    }
  }

  const handleAddEntry = async () => {
    if (!entryDesc.trim()) {
      showAlert("Required", "Describe what happened.");
      return;
    }
    setSubmitting(true);
    try {
      await addEntry(sinbookId, {
        description: entryDesc.trim(),
        winner_id: entryWinner ?? undefined,
      }, sinbook?.title ?? "");
      setEntryDesc("");
      setEntryWinner(null);
      setShowAddEntry(false);
      loadData();
    } catch (err: any) {
      showAlert("Error", err?.message || "Failed to add entry.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingEntry || !entryDesc.trim()) return;
    setSubmitting(true);
    try {
      await updateEntry(editingEntry.id, sinbookId, {
        description: entryDesc.trim(),
        winner_id: entryWinner,
      }, sinbook?.title ?? "");
      setEditingEntry(null);
      setEntryDesc("");
      setEntryWinner(null);
      loadData();
    } catch (err: any) {
      showAlert("Error", err?.message || "Failed to update entry.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteEntry = async (entry: SinbookEntry) => {
    const ok = await askConfirm(
      "Remove entry?",
      "This removes this result from your rivalry timeline. Standings update automatically.",
      "Remove",
    );
    if (!ok) return;
    try {
      await deleteEntry(entry.id, sinbookId, sinbook?.title ?? "");
      loadData();
    } catch (err: any) {
      showAlert("Error", err?.message || "Failed to remove entry.");
    }
  };

  const startEdit = (entry: SinbookEntry) => {
    setEditingEntry(entry);
    setEntryDesc(entry.description);
    setEntryWinner(entry.winner_id);
    setShowAddEntry(true);
  };

  const cancelForm = () => {
    setShowAddEntry(false);
    setEditingEntry(null);
    setEntryDesc("");
    setEntryWinner(null);
  };

  const handleShare = async () => {
    const code = sinbook?.join_code?.trim() ?? "";
    if (!code) {
      setToast({ visible: true, message: "Invite code not ready yet. Please try again in a moment.", type: "info" });
      return;
    }
    const message = getRivalryInviteMessage(sinbook?.title?.trim() || "Rivalry", code.toUpperCase());
    try {
      await Share.share({ message });
    } catch { /* cancelled */ }
  };

  const [actionBusy, setActionBusy] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: "", type: "success" as "success" | "error" | "info" });

  const handleCopyCode = async () => {
    const code = sinbook?.join_code?.trim();
    if (!code) {
      setToast({ visible: true, message: "Invite code not ready yet. Please try again in a moment.", type: "info" });
      return;
    }
    try {
      await Clipboard.setStringAsync(code.toUpperCase());
      setToast({ visible: true, message: "Join code copied", type: "success" });
    } catch {
      showAlert("Copy failed", "Could not copy to clipboard.");
    }
  };


  const handleDeleteSinbook = async () => {
    if (actionBusy) return;
    const ok = await askConfirm(
      "Delete this rivalry?",
      "This permanently deletes the rivalry, all participants, and timeline entries.",
      "Delete",
    );
    if (!ok) return;
    setActionBusy(true);
    try {
      await deleteSinbook(sinbookId);
      router.replace("/(app)/(tabs)/sinbook");
    } catch (err: any) {
      setActionBusy(false);
      showAlert("Error", err?.message || "Failed to delete rivalry.");
    }
  };

  const handleResetSinbook = async () => {
    if (actionBusy) return;
    const ok = await askConfirm(
      "Reset all results?",
      "This clears timeline entries and standings. Participants and settings stay.",
      "Reset",
    );
    if (!ok) return;
    setActionBusy(true);
    try {
      await resetSinbook(sinbookId);
      await loadData();
    } catch (err: any) {
      showAlert("Error", err?.message || "Failed to reset rivalry.");
    } finally {
      setActionBusy(false);
    }
  };

  const getName = (uid: string | null): string => {
    if (!uid) return "No winner";
    const p = participantMap.get(uid);
    const name = p?.display_name?.trim();
    if (name && name !== "Player") return name;
    return uid === userId ? "You" : "Opponent";
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    } catch { return dateStr; }
  };

  // ============================================================================
  // Render
  // ============================================================================

  if (loading) {
    return (
      <Screen scrollable={false}>
        <View style={styles.centered}>
          <LoadingState message="Loading rivalry..." />
        </View>
      </Screen>
    );
  }

  if (loadError || !sinbook) {
    return (
      <Screen>
        <EmptyState
          icon={<Feather name="alert-circle" size={24} color={colors.error} />}
          title="Error"
          message={loadError?.message || "Rivalry not found."}
          action={{ label: "Go Back", onPress: () => goBack(router, "/(app)/(tabs)/sinbook") }}
        />
      </Screen>
    );
  }

  const canDeleteRivalry = canDeleteSinbookAsUser(sinbook, userId ?? undefined);

  // Entry form (add or edit)
  if (showAddEntry) {
    return (
      <Screen>
        <View style={styles.header}>
          <SecondaryButton onPress={cancelForm} size="sm">Cancel</SecondaryButton>
          <AppText variant="heading">{editingEntry ? "Edit Entry" : "Add Entry"}</AppText>
          <View style={{ width: 60 }} />
        </View>

        <AppCard>
          <View style={styles.formField}>
            <AppText variant="captionBold" style={styles.label}>What happened?</AppText>
            <AppInput
              placeholder="e.g. Closest to pin on 7th"
              value={entryDesc}
              onChangeText={setEntryDesc}
              autoCapitalize="sentences"
              multiline
            />
          </View>

          <View style={styles.formField}>
            <AppText variant="captionBold" style={styles.label}>Winner</AppText>
            <View style={styles.winnerRow}>
              <Pressable
                onPress={() => setEntryWinner(null)}
                style={[
                  styles.winnerChip,
                  {
                    backgroundColor: entryWinner === null ? colors.primary + "15" : colors.backgroundTertiary,
                    borderColor: entryWinner === null ? colors.primary : colors.border,
                  },
                ]}
              >
                <AppText variant="caption" style={{ color: entryWinner === null ? colors.primary : colors.textSecondary }}>
                  No winner
                </AppText>
              </Pressable>
              {acceptedParticipants.map((p) => (
                <Pressable
                  key={p.user_id}
                  onPress={() => setEntryWinner(p.user_id)}
                  style={[
                    styles.winnerChip,
                    {
                      backgroundColor: entryWinner === p.user_id ? colors.primary + "15" : colors.backgroundTertiary,
                      borderColor: entryWinner === p.user_id ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <AppText variant="caption" style={{ color: entryWinner === p.user_id ? colors.primary : colors.text }}>
                    {getName(p.user_id)}
                  </AppText>
                </Pressable>
              ))}
            </View>
          </View>

          <PrimaryButton
            onPress={editingEntry ? handleSaveEdit : handleAddEntry}
            loading={submitting}
            style={{ marginTop: spacing.sm }}
          >
            {editingEntry ? "Save Changes" : "Add Entry"}
          </PrimaryButton>
        </AppCard>
      </Screen>
    );
  }

  return (
    <Screen>
      {/* Header */}
      <View style={styles.header}>
        <SecondaryButton onPress={() => goBack(router, "/(app)/(tabs)/sinbook")} size="sm">
          <Feather name="arrow-left" size={16} color={colors.text} /> Back
        </SecondaryButton>
        <View style={{ flexDirection: "row", gap: spacing.xs }}>
          <Pressable onPress={handleShare} style={styles.iconBtn}>
            <Feather name="share-2" size={20} color={colors.primary} />
          </Pressable>
          {sinbook.created_by === userId && (
            <Pressable onPress={() => void handleResetSinbook()} style={styles.iconBtn} disabled={actionBusy}>
              <Feather name="rotate-ccw" size={20} color={actionBusy ? colors.textTertiary : colors.text} />
            </Pressable>
          )}
          {canDeleteRivalry ? (
            <Pressable onPress={() => void handleDeleteSinbook()} style={styles.iconBtn} disabled={actionBusy}>
              <Feather name="trash-2" size={20} color={actionBusy ? colors.textTertiary : colors.error} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Title */}
      <AppText variant="title" style={{ marginBottom: 2 }}>{sinbook.title?.trim() || "Rivalry"}</AppText>
      {sinbook.stake && (
        <AppText variant="caption" color="secondary" style={{ marginBottom: spacing.sm }}>
          Friendly forfeit / treat: {sinbook.stake}
        </AppText>
      )}

      {/* Join Code Card — always show when rivalry is inviteable or user is owner */}
      {(acceptedParticipants.length < 2 || sinbook.created_by === userId) && (
        <AppCard style={{ marginTop: spacing.sm }}>
          <AppText variant="captionBold" color="primary" style={{ marginBottom: spacing.sm }}>
            JOIN CODE
          </AppText>
          {sinbook.join_code ? (
            <>
              <View style={styles.joinCodeRow}>
                <View style={[styles.joinCodeBadge, { backgroundColor: colors.backgroundTertiary, borderColor: colors.border }]}>
                  <AppText variant="h1" style={styles.joinCodeText}>
                    {sinbook.join_code}
                  </AppText>
                </View>
                <View style={styles.joinCodeActions}>
                  <Pressable
                    onPress={handleCopyCode}
                    style={[styles.joinCodeBtn, { backgroundColor: colors.backgroundTertiary }]}
                  >
                    <Feather name="copy" size={14} color={colors.text} />
                    <AppText variant="caption" style={{ marginLeft: 4 }}>Copy Code</AppText>
                  </Pressable>
                  <Pressable
                    onPress={handleShare}
                    style={[styles.joinCodeBtn, { backgroundColor: colors.primary + "12" }]}
                  >
                    <Feather name="share-2" size={14} color={colors.primary} />
                    <AppText variant="caption" style={{ color: colors.primary, marginLeft: 4 }}>Share Invite</AppText>
                  </Pressable>
                </View>
              </View>
              <AppText variant="small" color="muted" style={{ marginTop: spacing.xs }}>
                Share this code or the invite link so others can join the rivalry.
              </AppText>
            </>
          ) : (
            <AppText variant="body" color="secondary">
              Invite code not ready yet. Please try again in a moment.
            </AppText>
          )}
        </AppCard>
      )}

      {/* Standings Card */}
      <AppCard style={{ marginTop: spacing.sm }}>
        <AppText variant="captionBold" color="primary" style={{ marginBottom: spacing.sm }}>
          Standings
        </AppText>
        {acceptedParticipants.length < 2 ? (
          <View style={{ alignItems: "center", paddingVertical: spacing.sm }}>
            <AppText variant="body" color="secondary">Waiting for opponent to join...</AppText>
            <PrimaryButton onPress={handleShare} size="sm" style={{ marginTop: spacing.sm }}>
              Invite opponent
            </PrimaryButton>
          </View>
        ) : (
          <View style={styles.standingsRow}>
            {acceptedParticipants.map((p) => {
              const wins = standings.get(p.user_id) ?? 0;
              const isLeading = wins > 0 && wins === Math.max(...standings.values());
              return (
                <View key={p.user_id} style={styles.standingItem}>
                  <AppText variant="h1" style={{ color: isLeading ? colors.primary : colors.text }}>
                    {wins}
                  </AppText>
                  <AppText variant="bodyBold" numberOfLines={1}>
                    {getName(p.user_id)}
                  </AppText>
                </View>
              );
            })}
          </View>
        )}
      </AppCard>

      {/* Add Entry Button */}
      {acceptedParticipants.length >= 2 && (
        <PrimaryButton
          onPress={() => { setEditingEntry(null); setEntryDesc(""); setEntryWinner(null); setShowAddEntry(true); }}
          icon={<Feather name="plus" size={16} color={colors.textInverse} />}
          style={{ marginTop: spacing.sm, marginBottom: spacing.sm }}
        >
          Add Entry
        </PrimaryButton>
      )}

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast((t) => ({ ...t, visible: false }))}
      />

      {/* Timeline */}
      {entries.length === 0 ? (
        <AppCard style={{ marginTop: spacing.sm }}>
          <View style={{ alignItems: "center", paddingVertical: spacing.lg }}>
            <Feather name="clipboard" size={24} color={colors.textTertiary} />
            <AppText variant="body" color="secondary" style={{ marginTop: spacing.sm, textAlign: "center" }}>
              No entries yet. Add one to start tracking.
            </AppText>
          </View>
        </AppCard>
      ) : (
        <View style={{ marginTop: spacing.sm }}>
          <AppText variant="heading" style={{ marginBottom: spacing.sm }}>
            Timeline ({entries.length})
          </AppText>
          {entries.map((entry) => (
            <Pressable key={entry.id} onLongPress={() => startEdit(entry)}>
              <AppCard style={styles.entryCard}>
                <View style={styles.entryRow}>
                  <View style={[styles.entryDot, {
                    backgroundColor: entry.winner_id ? colors.primary : colors.backgroundTertiary,
                  }]} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyBold">{entry.description}</AppText>
                    <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: 2 }}>
                      <AppText variant="small" color="secondary">
                        {formatDate(entry.entry_date)}
                      </AppText>
                      {entry.winner_id && (
                        <AppText variant="small" color="primary" style={{ fontWeight: "600" }}>
                          Won by {getName(entry.winner_id)}
                        </AppText>
                      )}
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", gap: spacing.xs }}>
                    <Pressable onPress={() => startEdit(entry)} hitSlop={8}>
                      <Feather name="edit-2" size={16} color={colors.textTertiary} />
                    </Pressable>
                    <Pressable
                      onPress={() => void handleDeleteEntry(entry)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Remove rivalry timeline entry"
                    >
                      <Feather name="trash-2" size={16} color={colors.textTertiary} />
                    </Pressable>
                  </View>
                </View>
              </AppCard>
            </Pressable>
          ))}
        </View>
      )}

      {canDeleteRivalry ? (
        <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
          <SecondaryButton onPress={() => void handleDeleteSinbook()} disabled={actionBusy} size="sm">
            Delete this rivalry
          </SecondaryButton>
          <AppText variant="small" color="muted" style={{ textAlign: "center" }}>
            Confirmation opens in the app (reliable in Safari — no browser popup).
          </AppText>
        </View>
      ) : null}

      {destructiveConfirmModal}

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
  iconBtn: { padding: spacing.xs },
  standingsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  standingItem: { alignItems: "center", flex: 1 },
  winnerRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  winnerChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  joinCodeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  joinCodeBadge: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderStyle: "dashed" as const,
    alignItems: "center",
    justifyContent: "center",
  },
  joinCodeText: {
    letterSpacing: 4,
    fontVariant: ["tabular-nums"],
  },
  joinCodeActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  joinCodeBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  entryCard: { marginBottom: spacing.xs },
  entryRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  entryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
