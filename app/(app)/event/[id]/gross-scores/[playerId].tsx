/**
 * Gross score entry for one player — saves only via {@link savePlayerRoundGrossScores}.
 * Live hole preview uses {@link scoreEnteredHolesFromGross} (same engine as persistence).
 */

import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { goBack } from "@/lib/navigation";
import { getEvent } from "@/lib/db_supabase/eventRepo";
import { grossScoresMapFromStringDraft, validateGrossScoresAgainstSnapshot } from "@/lib/scoring/grossScoreEntryValidation";
import { scoreEnteredHolesFromGross } from "@/lib/scoring/eventScoringEngine";
import { grossScoresFromHoleRows, loadScoreEntrySheet, type ScoreEntrySheetLoad } from "@/lib/services/eventScoreEntryLoad";
import { savePlayerRoundGrossScores } from "@/lib/services/eventPlayerScoringService";
import type { EventPlayerHoleScoreRow, EventPlayerRoundRow, SavePlayerRoundGrossScoresResult } from "@/types/eventPlayerScoring";
import { getPermissionsForMember, isSecretary } from "@/lib/rbac";
import { useBootstrap } from "@/lib/useBootstrap";
import { usePaidAccess } from "@/lib/access/usePaidAccess";
import { spacing } from "@/lib/ui/theme";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { scoringOfficialBadgeLabel, scoringOfficialUiKind } from "@/lib/scoring/scoringOfficialUi";

function initDraftFromGross(holeNumbers: readonly number[], gross: Readonly<Record<number, number>>): Record<number, string> {
  const d: Record<number, string> = {};
  for (const n of holeNumbers) {
    d[n] = gross[n] != null ? String(gross[n]) : "";
  }
  return d;
}

export default function EventGrossScoreEntryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; playerId: string }>();
  const eventId = Array.isArray(params.id) ? params.id[0] : params.id;
  const playerId = Array.isArray(params.playerId) ? params.playerId[0] : params.playerId;
  const { member, loading: bootstrapLoading } = useBootstrap();
  const permissions = getPermissionsForMember(member);
  const canEnterGrossScores = permissions.canManageHandicaps || isSecretary(member);
  const { needsLicence, guardPaidAction } = usePaidAccess();

  const [sheet, setSheet] = useState<ScoreEntrySheetLoad | null>(null);
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);
  const [lastSave, setLastSave] = useState<SavePlayerRoundGrossScoresResult | null>(null);
  const [persistedHoles, setPersistedHoles] = useState<EventPlayerHoleScoreRow[]>([]);
  const [persistedRound, setPersistedRound] = useState<EventPlayerRoundRow | null>(null);
  const [officialKind, setOfficialKind] = useState<ReturnType<typeof scoringOfficialUiKind>>("draft");

  const load = useCallback(async () => {
    if (!eventId || !playerId) {
      setError("Missing event or player.");
      setLoading(false);
      return;
    }
    setError(null);
    setFormNotice(null);
    try {
      const [s, ev] = await Promise.all([loadScoreEntrySheet(eventId, playerId), getEvent(eventId)]);
      setOfficialKind(scoringOfficialUiKind(ev?.scoring_results_status ?? ev?.scoringResultsStatus));
      setSheet(s);
      const nums = s.ctx.holes.map((h) => h.holeNumber).sort((a, b) => a - b);
      setDraft(initDraftFromGross(nums, s.grossScoresByHole));
      setPersistedHoles(s.savedHoleRows);
      setPersistedRound(s.persistedRound);
      setLastSave(null);
    } catch (e) {
      setSheet(null);
      setOfficialKind("draft");
      setError(e instanceof Error ? e.message : "Load failed.");
    } finally {
      setLoading(false);
    }
  }, [eventId, playerId]);

  useFocusEffect(
    useCallback(() => {
      if (bootstrapLoading) return;
      if (needsLicence) {
        setLoading(false);
        return;
      }
      setLoading(true);
      void load();
    }, [bootstrapLoading, needsLicence, load]),
  );

  const grossMapForPreview = useMemo(() => {
    if (!sheet) return {};
    return grossScoresMapFromStringDraft(draft, sheet.ctx.holes);
  }, [draft, sheet]);

  const preview = useMemo(() => {
    if (!sheet || !playerId) return null;
    try {
      const keys = Object.keys(grossMapForPreview);
      if (keys.length === 0) return null;
      return scoreEnteredHolesFromGross(sheet.ctx, playerId, grossMapForPreview);
    } catch {
      return null;
    }
  }, [grossMapForPreview, playerId, sheet]);

  const displayPlayerName = sheet?.ctx.players.find((p) => p.memberId === playerId)?.displayName ?? "Player";

  const onSave = async () => {
    if (!sheet || !eventId || !playerId) return;
    if (!guardPaidAction()) return;
    setFormNotice(null);
    const map = grossScoresMapFromStringDraft(draft, sheet.ctx.holes);
    const issues = validateGrossScoresAgainstSnapshot(map, sheet.ctx.holes);
    if (issues.length) {
      setFormNotice(issues.join("\n"));
      return;
    }
    setSaving(true);
    try {
      const result = await savePlayerRoundGrossScores(eventId, playerId, map);
      setLastSave(result);
      setPersistedRound(result.round);
      setPersistedHoles(result.holes);
      const nums = sheet.ctx.holes.map((h) => h.holeNumber).sort((a, b) => a - b);
      setDraft(initDraftFromGross(nums, grossScoresFromHoleRows(result.holes)));
      setFormNotice(null);
    } catch (e) {
      setFormNotice(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  if (bootstrapLoading) {
    return (
      <Screen>
        <LoadingState message="Loading score entry…" />
      </Screen>
    );
  }

  if (needsLicence) {
    return (
      <Screen>
        <EmptyState
          title="Live scoring is premium"
          message="Entering and saving gross holes needs a society seat (or Captain access). Official published results stay free to view from the leaderboard after publish."
        />
        <PrimaryButton label="Unlock live scoring" onPress={() => router.push("/(app)/premium-scoring" as never)} style={{ marginTop: spacing.base }} />
        <SecondaryButton label="Back" onPress={() => goBack(router)} style={{ marginTop: spacing.sm }} />
      </Screen>
    );
  }

  if (loading) {
    return (
      <Screen>
        <LoadingState message="Loading score entry…" />
      </Screen>
    );
  }

  if (error || !sheet) {
    return (
      <Screen>
        <EmptyState title="Cannot open score entry" message={error ?? "Unknown error."} />
        <SecondaryButton label="Back" onPress={() => goBack(router)} style={{ marginTop: spacing.base }} />
      </Screen>
    );
  }

  if (!canEnterGrossScores) {
    return (
      <Screen>
        <EmptyState
          title="No access"
          message="Only Captain, Secretary, or Handicapper can enter gross scores for this society."
        />
        <SecondaryButton label="Back" onPress={() => goBack(router)} style={{ marginTop: spacing.base }} />
      </Screen>
    );
  }

  const summaryRound = lastSave?.round ?? persistedRound;
  const summaryHoles = lastSave?.holes ?? persistedHoles;

  return (
    <Screen>
      <View style={styles.top}>
        <SecondaryButton size="sm" label="Back" onPress={() => goBack(router)} />
        <Pressable
          onPress={() => {
            if (officialKind !== "published" && !guardPaidAction()) return;
            router.push({ pathname: "/(app)/event/[id]/gross-scores/leaderboard", params: { id: eventId! } } as never);
          }}
        >
          <AppText variant="bodyBold" color="primary">
            Leaderboard
          </AppText>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap", marginBottom: spacing.xs }}>
          <AppText variant="heading">{displayPlayerName}</AppText>
          <StatusBadge
            label={scoringOfficialBadgeLabel(officialKind)}
            tone={officialKind === "published" ? "success" : "warning"}
          />
        </View>
        <AppText variant="small" color="muted" style={{ marginBottom: spacing.sm }}>
          {sheet.ctx.name} · {sheet.ctx.format.replace(/_/g, " ")}
        </AppText>
        <InlineNotice
          variant="info"
          message={
            officialKind === "published"
              ? "Official results are published. You can still edit gross strokes here (stored card). To change official placings or OOM, open Publish scoring results → Reopen, then republish when ready."
              : officialKind === "reopened"
                ? "Draft (reopened): edits here are not official until you publish again."
                : "Draft: saves update the live leaderboard only. Official placings / OOM apply after publish."
          }
          style={{ marginBottom: spacing.base }}
        />

        {formNotice ? <InlineNotice variant="error" message={formNotice} style={{ marginBottom: spacing.base }} /> : null}

        {sheet.ctx.holes.map((h) => {
          const prevHole = preview?.enteredHoles.find((x) => x.holeNumber === h.holeNumber);
          const strokesReceived = prevHole?.strokesReceived ?? null;
          return (
            <AppCard key={h.holeNumber} style={styles.holeCard}>
              <View style={styles.holeHeader}>
                <AppText variant="bodyBold">
                  Hole {h.holeNumber}
                </AppText>
                <AppText variant="caption" color="muted">
                  Par {h.par} · SI {h.strokeIndex}
                  {strokesReceived != null ? ` · Strokes received ${strokesReceived}` : ""}
                </AppText>
              </View>
              <AppText variant="caption" color="muted" style={{ marginBottom: spacing.xs }}>
                Gross strokes
              </AppText>
              <AppInput
                keyboardType="number-pad"
                value={draft[h.holeNumber] ?? ""}
                onChangeText={(t) => setDraft((d) => ({ ...d, [h.holeNumber]: t }))}
                placeholder="—"
              />
              {prevHole ? (
                <AppText variant="small" color="secondary" style={{ marginTop: spacing.sm }}>
                  Preview: net {prevHole.netStrokes}
                  {sheet.ctx.format === "stableford" ? ` · ${prevHole.stablefordPoints} pts` : ""}
                </AppText>
              ) : null}
            </AppCard>
          );
        })}

        <PrimaryButton
          label={saving ? "Saving…" : "Save scores"}
          onPress={() => void onSave()}
          disabled={saving}
          loading={saving}
        />

        {summaryRound ? (
          <AppCard style={{ marginTop: spacing.lg }}>
            <AppText variant="subheading" style={{ marginBottom: spacing.sm }}>
              Saved round summary
            </AppText>
            <AppText variant="body">Gross total: {summaryRound.gross_total}</AppText>
            <AppText variant="body">Net total: {summaryRound.net_total}</AppText>
            {sheet.ctx.format === "stableford" ? (
              <AppText variant="body">Stableford: {summaryRound.stableford_points} pts</AppText>
            ) : null}
            <AppText variant="body">
              Course HCP: {summaryRound.course_handicap ?? "—"} · Playing HCP: {summaryRound.playing_handicap ?? "—"}
            </AppText>
            <AppText variant="body">
              Holes played: {summaryRound.holes_played} / {sheet.ctx.holes.length}
            </AppText>
          </AppCard>
        ) : null}

        {summaryHoles.length > 0 ? (
          <AppCard style={{ marginTop: spacing.base }}>
            <AppText variant="subheading" style={{ marginBottom: spacing.sm }}>
              Per-hole (saved)
            </AppText>
            {summaryHoles.map((row) => (
              <View key={row.hole_number} style={styles.savedRow}>
                <AppText variant="bodyBold" style={{ width: 56 }}>
                  H{row.hole_number}
                </AppText>
                <AppText variant="body" style={{ flex: 1 }}>
                  Gross {row.gross_strokes} · Net {row.net_strokes} · Shots {row.strokes_received}
                  {sheet.ctx.format === "stableford" ? ` · ${row.stableford_points} pts` : ""}
                </AppText>
              </View>
            ))}
          </AppCard>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
  },
  scroll: { padding: spacing.base, paddingBottom: spacing.xl, gap: spacing.sm },
  holeCard: { marginBottom: spacing.sm },
  holeHeader: { marginBottom: spacing.sm },
  savedRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: spacing.xs },
});
