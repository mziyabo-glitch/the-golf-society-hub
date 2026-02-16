/**
 * Rivalry Detail Screen
 * Shows standings (wins per participant), entry timeline, add/edit entries.
 * Both participants have full edit rights.
 */

import { useCallback, useState } from "react";
import { Pressable, Share, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";

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
  type SinbookWithParticipants,
  type SinbookEntry,
  type SinbookParticipant,
} from "@/lib/db_supabase/sinbookRepo";
import { getColors, spacing, radius } from "@/lib/ui/theme";
import { formatError, type FormattedError } from "@/lib/ui/formatError";
import { confirmDestructive, showAlert } from "@/lib/ui/alert";

export default function RivalryDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const sinbookId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { userId } = useBootstrap();
  const colors = getColors();

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
    if (!sinbookId) {
      setLoadError({ message: "Missing rivalry ID in route parameters." });
      setLoading(false);
      return;
    }
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

  // Derived data
  const acceptedParticipants = sinbook?.participants.filter((p) => p.status === "accepted") ?? [];
  const participantMap = new Map<string, SinbookParticipant>();
  for (const p of acceptedParticipants) participantMap.set(p.user_id, p);

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

  const handleDeleteEntry = (entry: SinbookEntry) => {
    confirmDestructive("Delete Entry", "Remove this entry?", "Delete", async () => {
      try {
        await deleteEntry(entry.id, sinbookId, sinbook?.title ?? "");
        loadData();
      } catch (err: any) {
        showAlert("Error", err?.message || "Failed to delete.");
      }
    });
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
    const code = sinbook?.join_code ?? sinbookId;
    try {
      await Share.share({
        message: `Join my rivalry "${sinbook?.title}" on The Golf Society Hub!\n\nJoin code: ${code}\n\nDownload the app:\nAndroid: https://play.google.com/store/apps/details?id=com.thegolfsocietyhub.app\niOS: https://apps.apple.com/app/the-golf-society-hub/id6740041032`,
      });
    } catch { /* cancelled */ }
  };

  const [actionBusy, setActionBusy] = useState(false);

  const handleDeleteSinbook = () => {
    if (actionBusy) return;
    if (sinbook?.created_by !== userId) {
      showAlert("Not Allowed", "Only the creator can delete this rivalry.");
      return;
    }
    confirmDestructive("Delete Sinbook?", "This will permanently delete the rivalry, all entries, and participants.", "Delete", async () => {
      setActionBusy(true);
      try {
        await deleteSinbook(sinbookId);
        router.replace("/(app)/(tabs)/sinbook");
      } catch (err: any) {
        setActionBusy(false);
        showAlert("Error", err?.message || "Failed to delete rivalry.");
      }
    });
  };

  const handleResetSinbook = () => {
    if (actionBusy) return;
    confirmDestructive("Reset all results?", "This will clear all entries and standings. Participants and settings are kept.", "Reset", async () => {
      setActionBusy(true);
      try {
        await resetSinbook(sinbookId);
        await loadData();
      } catch (err: any) {
        showAlert("Error", err?.message || "Failed to reset rivalry.");
      } finally {
        setActionBusy(false);
      }
    });
  };

  const getName = (uid: string | null) => {
    if (!uid) return "No winner";
    return participantMap.get(uid)?.display_name ?? "Unknown";
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
          action={{ label: "Retry", onPress: loadData }}
        />
      </Screen>
    );
  }

  // Entry form (add or edit)
  if (showAddEntry) {
    return (
      <Screen>
        <View style={styles.header}>
          <SecondaryButton onPress={cancelForm} size="sm">Cancel</SecondaryButton>
          <AppText variant="h2">{editingEntry ? "Edit Entry" : "Add Entry"}</AppText>
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
                    {p.display_name}
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
        <SecondaryButton onPress={() => router.back()} size="sm">
          <Feather name="arrow-left" size={16} color={colors.text} /> Back
        </SecondaryButton>
        <View style={{ flexDirection: "row", gap: spacing.xs }}>
          <Pressable onPress={handleShare} style={styles.iconBtn}>
            <Feather name="share-2" size={20} color={colors.primary} />
          </Pressable>
          {sinbook.created_by === userId && (
            <>
              <Pressable onPress={handleResetSinbook} style={styles.iconBtn} disabled={actionBusy}>
                <Feather name="rotate-ccw" size={20} color={actionBusy ? colors.textTertiary : colors.text} />
              </Pressable>
              <Pressable onPress={handleDeleteSinbook} style={styles.iconBtn} disabled={actionBusy}>
                <Feather name="trash-2" size={20} color={actionBusy ? colors.textTertiary : colors.error} />
              </Pressable>
            </>
          )}
        </View>
      </View>

      {/* Title */}
      <AppText variant="title" style={{ marginBottom: 2 }}>{sinbook.title}</AppText>
      {sinbook.stake && (
        <AppText variant="caption" color="secondary" style={{ marginBottom: spacing.sm }}>
          {sinbook.stake}
        </AppText>
      )}

      {/* Join Code Card */}
      {sinbook.join_code && (
        <AppCard style={{ marginTop: spacing.sm }}>
          <AppText variant="captionBold" color="primary" style={{ marginBottom: spacing.xs }}>
            JOIN CODE
          </AppText>
          <View style={styles.joinCodeRow}>
            <View style={[styles.joinCodeBadge, { backgroundColor: colors.backgroundTertiary, borderColor: colors.border }]}>
              <AppText variant="h1" style={styles.joinCodeText}>
                {sinbook.join_code}
              </AppText>
            </View>
            <View style={styles.joinCodeActions}>
              <Pressable
                onPress={handleShare}
                style={[styles.joinCodeBtn, { backgroundColor: colors.primary + "12" }]}
              >
                <Feather name="share-2" size={16} color={colors.primary} />
                <AppText variant="caption" style={{ color: colors.primary, marginLeft: 4 }}>Share</AppText>
              </Pressable>
            </View>
          </View>
          <AppText variant="small" color="tertiary" style={{ marginTop: spacing.xs }}>
            Share this code so others can join the rivalry.
          </AppText>
        </AppCard>
      )}

      {/* Standings Card */}
      <AppCard style={{ marginTop: spacing.sm }}>
        <AppText variant="captionBold" color="primary" style={{ marginBottom: spacing.sm }}>
          Standings
        </AppText>
        {acceptedParticipants.length < 2 ? (
          <View style={{ alignItems: "center", paddingVertical: spacing.sm }}>
            <AppText variant="body" color="secondary">Waiting for rival to join...</AppText>
            <PrimaryButton onPress={handleShare} size="sm" style={{ marginTop: spacing.sm }}>
              Invite Rival
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
                  <AppText variant="caption" color="secondary" numberOfLines={1}>
                    {p.display_name}
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
          <AppText variant="h2" style={{ marginBottom: spacing.sm }}>
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
                    <Pressable onPress={() => handleDeleteEntry(entry)} hitSlop={8}>
                      <Feather name="trash-2" size={16} color={colors.textTertiary} />
                    </Pressable>
                  </View>
                </View>
              </AppCard>
            </Pressable>
          ))}
        </View>
      )}

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
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderStyle: "dashed" as const,
  },
  joinCodeText: {
    letterSpacing: 4,
    fontVariant: ["tabular-nums"],
  },
  joinCodeActions: {
    flexDirection: "column",
    gap: spacing.xs,
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
