import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { goBack } from "@/lib/navigation";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppInput } from "@/components/ui/AppInput";
import { PrimaryButton, SecondaryButton, DestructiveButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { useBootstrap } from "@/lib/useBootstrap";
import { canManageEventPaymentsForSociety } from "@/lib/rbac";
import { getEvent, type EventDoc } from "@/lib/db_supabase/eventRepo";
import { getMembersByIds } from "@/lib/db_supabase/memberRepo";
import { getEventGuests } from "@/lib/db_supabase/eventGuestRepo";
import {
  calculateEventPrizePool,
  deleteEventPrizePool,
  finaliseEventPrizePool,
  getPotMasterConfirmedPrizePoolEntrantCount,
  getEventPrizePoolWithRules,
  listEventPrizePoolSplitterScores,
  listPrizePoolOptInEntrants,
  listEventPrizePoolResults,
  replaceEventPrizePoolSplitterScores,
  updateEventPrizePool,
  replaceEventPrizePoolRules,
} from "@/lib/db_supabase/eventPrizePoolRepo";
import type { EventPrizePoolResultRow, EventPrizePoolRow } from "@/lib/event-prize-pools-types";
import { PRIZE_POOL_PAYOUT_TEMPLATES } from "@/lib/event-prize-pools-types";
import { validateRuleBasisPointsTotal } from "@/lib/event-prize-pools-calc";
import { PrizePoolStatusBadge } from "@/components/event-prize-pools/PrizePoolStatusBadge";
import { PrizePoolSummary } from "@/components/event-prize-pools/PrizePoolSummary";
import { getColors, spacing, iconSize, radius } from "@/lib/ui/theme";

function parseGbpToPence(raw: string): number | null {
  const t = raw.replace(/[£,\s]/g, "").trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function penceToGbpInput(p: number): string {
  return (p / 100).toFixed(2);
}

export default function PrizePoolDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; poolId: string }>();
  const eventId = Array.isArray(params.id) ? params.id[0] : params.id;
  const poolId = Array.isArray(params.poolId) ? params.poolId[0] : params.poolId;
  const { memberships, societyId } = useBootstrap();
  const colors = getColors();

  const canManage = useMemo(
    () => canManageEventPaymentsForSociety(memberships, societyId),
    [memberships, societyId],
  );

  const [event, setEvent] = useState<EventDoc | null>(null);
  const [pool, setPool] = useState<EventPrizePoolRow | null>(null);
  const [results, setResults] = useState<EventPrizePoolResultRow[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [totalGbp, setTotalGbp] = useState("0");
  const [competitionType, setCompetitionType] = useState<"standard" | "splitter">("standard");
  const [totalAmountMode, setTotalAmountMode] = useState<"manual" | "per_entrant">("manual");
  const [potEntryValueGbp, setPotEntryValueGbp] = useState("0");
  const [payoutMode, setPayoutMode] = useState<"overall" | "division">("overall");
  const [placesPaid, setPlacesPaid] = useState(3);
  const [percents, setPercents] = useState<number[]>([50, 30, 20]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [nameByMemberId, setNameByMemberId] = useState<Map<string, string>>(new Map());
  const [nameByGuestId, setNameByGuestId] = useState<Map<string, string>>(new Map());
  const [confirmedEntrants, setConfirmedEntrants] = useState(0);
  const [splitterInputRows, setSplitterInputRows] = useState<
    { participantKey: string; memberId: string | null; guestId: string | null; name: string }[]
  >([]);
  const [splitterInputsByParticipant, setSplitterInputsByParticipant] = useState<
    Record<string, { front9Score: string; back9Score: string; birdies: string }>
  >({});
  const [splitterBusy, setSplitterBusy] = useState(false);

  const load = useCallback(async () => {
    if (!eventId || !poolId) return;
    setLoading(true);
    try {
      const [ev, full, resRows, entrantRows, splitterScores] = await Promise.all([
        getEvent(eventId),
        getEventPrizePoolWithRules(poolId),
        listEventPrizePoolResults(poolId),
        listPrizePoolOptInEntrants(poolId),
        listEventPrizePoolSplitterScores(poolId),
      ]);
      setEvent(ev);
      if (!full) {
        setPool(null);
        return;
      }
      setPool(full.pool);
      setResults(resRows);
      setName(full.pool.name);
      setDescription(full.pool.description ?? "");
      setNotes(full.pool.notes ?? "");
      setTotalGbp(penceToGbpInput(full.pool.total_amount_pence));
      setCompetitionType(full.pool.competition_type ?? "standard");
      setTotalAmountMode(full.pool.total_amount_mode ?? "manual");
      setPotEntryValueGbp(
        full.pool.pot_entry_value_pence != null ? penceToGbpInput(full.pool.pot_entry_value_pence) : "0.00",
      );
      setPayoutMode(full.pool.payout_mode);
      setPlacesPaid(full.pool.places_paid);
      const ordered = [...full.rules].sort((a, b) => a.position - b.position);
      setPercents(ordered.map((r) => r.percentage_basis_points / 100));

      const memberIds = [...new Set(resRows.map((r) => r.member_id).filter(Boolean) as string[])];
      const guestIds = [...new Set(resRows.map((r) => r.event_guest_id).filter(Boolean) as string[])];
      const [members, guests] = await Promise.all([
        memberIds.length ? getMembersByIds(memberIds) : Promise.resolve([]),
        guestIds.length && eventId ? getEventGuests(eventId) : Promise.resolve([]),
      ]);
      const m = new Map<string, string>();
      for (const mem of members) {
        m.set(mem.id, (mem.displayName || mem.display_name || mem.name || "Member").trim());
      }
      setNameByMemberId(m);
      const gmap = new Map<string, string>();
      for (const g of guests) {
        if (guestIds.includes(g.id)) gmap.set(g.id, (g.name || "Guest").trim());
      }
      setNameByGuestId(gmap);
      const count = await getPotMasterConfirmedPrizePoolEntrantCount(poolId);
      setConfirmedEntrants(count);

      const splitterScoreByKey = new Map<
        string,
        { front9Score: string; back9Score: string; birdies: string }
      >();
      for (const row of splitterScores) {
        if (row.member_id) {
          splitterScoreByKey.set(`member:${String(row.member_id)}`, {
            front9Score: String(row.front9_score),
            back9Score: String(row.back9_score),
            birdies: String(row.birdies),
          });
        } else if (row.guest_id) {
          splitterScoreByKey.set(`guest:${String(row.guest_id)}`, {
            front9Score: String(row.front9_score),
            back9Score: String(row.back9_score),
            birdies: String(row.birdies),
          });
        }
      }

      const confirmedRows = entrantRows
        .filter((r) => r.confirmed_by_pot_master)
        .map((r) => ({
          participantKey:
            r.participant_type === "guest"
              ? `guest:${String(r.guest_id)}`
              : `member:${String(r.member_id)}`,
          memberId: r.member_id ? String(r.member_id) : null,
          guestId: r.guest_id ? String(r.guest_id) : null,
          name: (r.displayName || "Entrant").trim(),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
      setSplitterInputRows(confirmedRows);

      const initialInputs: Record<string, { front9Score: string; back9Score: string; birdies: string }> = {};
      for (const row of confirmedRows) {
        initialInputs[row.participantKey] = splitterScoreByKey.get(row.participantKey) ?? {
          front9Score: "",
          back9Score: "",
          birdies: "",
        };
      }
      setSplitterInputsByParticipant(initialInputs);
    } finally {
      setLoading(false);
    }
  }, [eventId, poolId]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyTemplate = (n: number) => {
    const t = PRIZE_POOL_PAYOUT_TEMPLATES[n];
    if (!t) return;
    setPlacesPaid(n);
    setPercents(t.map((x) => x));
  };

  const setPercentAt = (idx: number, raw: string) => {
    const v = Number(raw.replace(/,/g, ""));
    const next = [...percents];
    next[idx] = Number.isFinite(v) ? v : 0;
    setPercents(next);
  };

  useEffect(() => {
    if (competitionType === "splitter") {
      setPlacesPaid(4);
      setPercents([20, 20, 20, 40]);
      setPayoutMode("overall");
    }
  }, [competitionType]);

  const locked = pool?.status === "finalised";

  const saveConfig = async () => {
    if (!poolId || !pool || locked || !canManage) return;
    const manualPence = parseGbpToPence(totalGbp);
    const perEntrantPence = parseGbpToPence(potEntryValueGbp);
    const computedPerEntrantTotal = (perEntrantPence ?? 0) * confirmedEntrants;
    const pence = totalAmountMode === "per_entrant" ? computedPerEntrantTotal : manualPence;
    if (!name.trim()) {
      Alert.alert("Name required", "Enter a pool name.");
      return;
    }
    if (pence == null || pence <= 0) {
      Alert.alert("Amount", "Enter a valid total amount in GBP.");
      return;
    }
    if (totalAmountMode === "per_entrant" && perEntrantPence == null) {
      Alert.alert("Pot entry value", "Enter a valid per-entrant value in GBP.");
      return;
    }
    const rulePayload = Array.from({ length: placesPaid }).map((_, i) => ({
      position: i + 1,
      percentage_basis_points: Math.round((percents[i] ?? 0) * 100),
    }));
    const v = validateRuleBasisPointsTotal(rulePayload);
    if (!v.ok) {
      Alert.alert("Payout rules", "Payout percentages must total 100%.");
      return;
    }
    if (rulePayload.length !== placesPaid) {
      Alert.alert("Payout rules", "Payout rules must match places paid.");
      return;
    }

    setBusy(true);
    try {
      await updateEventPrizePool(poolId, {
        name: name.trim(),
        competitionName: competitionType === "splitter" ? "Prize Pool (Pot) Splitter" : "Prize Pool (Pot)",
        competitionType,
        description: description.trim() || null,
        notes: notes.trim() || null,
        totalAmountPence: pence,
        totalAmountMode,
        potEntryValuePence: totalAmountMode === "per_entrant" ? perEntrantPence : null,
        birdieFallbackToOverall: true,
        payoutMode: competitionType === "splitter" ? "overall" : payoutMode,
        divisionSource: competitionType === "splitter" ? "none" : payoutMode === "division" ? "event" : "none",
        placesPaid: competitionType === "splitter" ? 4 : placesPaid,
      });
      await replaceEventPrizePoolRules(
        poolId,
        competitionType === "splitter"
          ? [
              { position: 1, percentage_basis_points: 2000 },
              { position: 2, percentage_basis_points: 2000 },
              { position: 3, percentage_basis_points: 2000 },
              { position: 4, percentage_basis_points: 4000 },
            ]
          : rulePayload,
      );
      await load();
      Alert.alert("Saved", "Prize pool updated.");
    } catch (e: unknown) {
      Alert.alert("Save failed", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  };

  const runCalculate = () => {
    if (!poolId || locked) return;
    Alert.alert(
      "Calculate payouts",
      competitionType === "splitter"
        ? "Calculate splitter payouts using official event scores (Best Overall) and Pot Master Front 9 / Back 9 / Birdies inputs?"
        : "Calculate payouts from official event results?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Calculate",
          onPress: () => {
            void (async () => {
              setBusy(true);
              try {
                await calculateEventPrizePool(poolId);
                await load();
              } catch (e: unknown) {
                Alert.alert("Calculation failed", e instanceof Error ? e.message : "Unknown error");
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ],
    );
  };

  const runFinalise = () => {
    if (!poolId || locked) return;
    Alert.alert(
      "Finalise pool",
      "Finalise this prize pool? Finalised pools can no longer be edited.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Finalise",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setBusy(true);
              try {
                await finaliseEventPrizePool(poolId);
                await load();
              } catch (e: unknown) {
                Alert.alert("Could not finalise", e instanceof Error ? e.message : "Unknown error");
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ],
    );
  };

  const runDelete = () => {
    if (!poolId || locked) return;
    Alert.alert("Delete prize pool", "Delete this pool and all payout rows?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setBusy(true);
            try {
              await deleteEventPrizePool(poolId);
              router.replace({ pathname: "/(app)/event/[id]/prize-pools" as any, params: { id: eventId! } });
            } catch (e: unknown) {
              Alert.alert("Delete failed", e instanceof Error ? e.message : "Unknown error");
            } finally {
              setBusy(false);
            }
          })();
        },
      },
    ]);
  };

  const updateSplitterInputField = (
    participantKey: string,
    field: "front9Score" | "back9Score" | "birdies",
    value: string,
  ) => {
    if (locked) return;
    setSplitterInputsByParticipant((prev) => ({
      ...prev,
      [participantKey]: {
        front9Score: prev[participantKey]?.front9Score ?? "",
        back9Score: prev[participantKey]?.back9Score ?? "",
        birdies: prev[participantKey]?.birdies ?? "",
        [field]: value,
      },
    }));
  };

  const saveSplitterInputs = async () => {
    if (!pool || pool.competition_type !== "splitter" || !eventId || !poolId || locked || !canManage) return;
    const payload: Array<{
      memberId: string | null;
      guestId: string | null;
      front9Score: number;
      back9Score: number;
      birdies: number;
    }> = [];
    for (const row of splitterInputRows) {
      const input = splitterInputsByParticipant[row.participantKey] ?? {
        front9Score: "",
        back9Score: "",
        birdies: "",
      };
      const f9 = parseInt(String(input.front9Score).trim(), 10);
      const b9 = parseInt(String(input.back9Score).trim(), 10);
      const bd = parseInt(String(input.birdies).trim(), 10);
      if (Number.isNaN(f9) || Number.isNaN(b9) || Number.isNaN(bd) || f9 < 0 || b9 < 0 || bd < 0) {
        Alert.alert("Splitter inputs", `Enter valid Front 9, Back 9, and Birdies for ${row.name}.`);
        return;
      }
      payload.push({
        memberId: row.memberId,
        guestId: row.guestId,
        front9Score: f9,
        back9Score: b9,
        birdies: bd,
      });
    }

    setSplitterBusy(true);
    try {
      await replaceEventPrizePoolSplitterScores(poolId, eventId, payload);
      await load();
      Alert.alert("Saved", "Splitter inputs saved.");
    } catch (e: unknown) {
      Alert.alert("Save failed", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSplitterBusy(false);
    }
  };

  if (!canManage) {
    return (
      <Screen>
        <InlineNotice variant="info" message="Only event managers can edit prize pools." />
      </Screen>
    );
  }

  if (loading) return <LoadingState message="Loading…" />;
  if (!pool) {
    return (
      <Screen>
        <InlineNotice variant="error" message="Prize pool not found." />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Pressable onPress={() => goBack(router, "/(app)/(tabs)/events")} hitSlop={12} style={styles.backBtn}>
          <Feather name="arrow-left" size={iconSize.md} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" }}>
            <AppText variant="h2" style={{ flexShrink: 1 }} numberOfLines={2}>
              {pool.name}
            </AppText>
            <PrizePoolStatusBadge status={pool.status} />
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl, gap: spacing.md }}>
        {competitionType !== "splitter" && payoutMode === "division" ? (
          <InlineNotice
            variant="info"
            message="Division pools split the total prize amount evenly across active divisions, then apply the chosen payout percentages within each division."
          />
        ) : null}

        {locked ? <InlineNotice variant="info" message="This pool is finalised and cannot be edited." /> : null}

        <AppText variant="caption" color="secondary">
          Pool name
        </AppText>
        <AppInput value={name} onChangeText={setName} editable={!locked} />

        <AppText variant="caption" color="secondary">
          Description (optional)
        </AppText>
        <AppInput value={description} onChangeText={setDescription} editable={!locked} />

        <AppText variant="subheading">Competition type</AppText>
        <View style={styles.modeRow}>
          <SecondaryButton
            size="sm"
            disabled={locked}
            onPress={() => setCompetitionType("standard")}
            style={competitionType === "standard" ? { borderWidth: 2, borderColor: colors.primary } : undefined}
          >
            Prize Pool (Pot)
          </SecondaryButton>
          <SecondaryButton
            size="sm"
            disabled={locked}
            onPress={() => setCompetitionType("splitter")}
            style={competitionType === "splitter" ? { borderWidth: 2, borderColor: colors.primary } : undefined}
          >
            Prize Pool (Pot) Splitter
          </SecondaryButton>
        </View>

        <AppText variant="subheading">Total mode</AppText>
        <View style={styles.modeRow}>
          <SecondaryButton
            size="sm"
            disabled={locked}
            onPress={() => setTotalAmountMode("manual")}
            style={totalAmountMode === "manual" ? { borderWidth: 2, borderColor: colors.primary } : undefined}
          >
            Manual total
          </SecondaryButton>
          <SecondaryButton
            size="sm"
            disabled={locked}
            onPress={() => setTotalAmountMode("per_entrant")}
            style={totalAmountMode === "per_entrant" ? { borderWidth: 2, borderColor: colors.primary } : undefined}
          >
            Per entrant
          </SecondaryButton>
        </View>

        {totalAmountMode === "manual" ? (
          <>
            <AppText variant="caption" color="secondary">
              Total Prize Pool (£)
            </AppText>
            <AppInput
              value={totalGbp}
              onChangeText={setTotalGbp}
              keyboardType="decimal-pad"
              editable={!locked}
            />
          </>
        ) : (
          <>
            <AppText variant="caption" color="secondary">
              Pot entry value (£)
            </AppText>
            <AppInput
              value={potEntryValueGbp}
              onChangeText={setPotEntryValueGbp}
              keyboardType="decimal-pad"
              editable={!locked}
            />
          </>
        )}

        <InlineNotice
          variant="info"
          message={`Confirmed entrants: ${confirmedEntrants} · Total Prize Pool: £${(
            ((totalAmountMode === "per_entrant"
              ? (parseGbpToPence(potEntryValueGbp) ?? 0) * confirmedEntrants
              : parseGbpToPence(totalGbp) ?? 0) || 0) / 100
          ).toFixed(2)}`}
        />

        {competitionType !== "splitter" ? (
          <>
            <AppText variant="subheading">Payout mode</AppText>
            <View style={styles.modeRow}>
              <SecondaryButton
                size="sm"
                disabled={locked}
                onPress={() => setPayoutMode("overall")}
                style={payoutMode === "overall" ? { borderWidth: 2, borderColor: colors.primary } : undefined}
              >
                Overall
              </SecondaryButton>
              <SecondaryButton
                size="sm"
                disabled={locked}
                onPress={() => setPayoutMode("division")}
                style={payoutMode === "division" ? { borderWidth: 2, borderColor: colors.primary } : undefined}
              >
                Division
              </SecondaryButton>
            </View>
          </>
        ) : null}

        {competitionType !== "splitter" ? (
          <>
            <AppText variant="caption" color="secondary">
              Places paid (1–10)
            </AppText>
            <AppInput
              value={String(placesPaid)}
              editable={!locked}
              onChangeText={(t) => {
                const n = parseInt(t, 10);
                if (!Number.isNaN(n) && n >= 1 && n <= 10) {
                  setPlacesPaid(n);
                  setPercents((prev) => {
                    const next = prev.slice(0, n);
                    while (next.length < n) next.push(0);
                    return next;
                  });
                }
              }}
              keyboardType="number-pad"
            />
          </>
        ) : null}

        {competitionType === "splitter" ? (
          <>
            <AppText variant="subheading">Fixed Splitter breakdown</AppText>
            <InlineNotice
              variant="info"
              message="Best Front 9 — 20% · Best Back 9 — 20% · Most Birdies — 20% · Best Overall Score — 40%"
            />
            <InlineNotice
              variant="info"
              message="If no birdies are recorded, the birdie prize is added to Best Overall Score."
            />
            <AppText variant="subheading">Splitter inputs</AppText>
            <InlineNotice
              variant="info"
              message="Full scores are taken from official event results."
            />
            <AppText variant="caption" color="secondary">
              Pot Master enters Front 9, Back 9, and Birdies only.
            </AppText>
            {splitterInputRows.length === 0 ? (
              <InlineNotice
                variant="info"
                message="No confirmed entrants yet. Confirm entrants on the prize pools list first."
              />
            ) : (
              <View style={[styles.splitterTableWrap, { borderColor: colors.borderLight }]}>
                <View
                  style={[
                    styles.splitterHeadRow,
                    {
                      borderBottomColor: colors.borderLight,
                      backgroundColor: colors.backgroundSecondary,
                    },
                  ]}
                >
                  <AppText variant="captionBold" color="secondary" style={styles.splitterNameCol}>
                    Player
                  </AppText>
                  <AppText variant="captionBold" color="secondary" style={styles.splitterNumCol}>
                    F9
                  </AppText>
                  <AppText variant="captionBold" color="secondary" style={styles.splitterNumCol}>
                    B9
                  </AppText>
                  <AppText variant="captionBold" color="secondary" style={styles.splitterNumCol}>
                    Birdies
                  </AppText>
                </View>
                {splitterInputRows.map((row) => {
                  const input = splitterInputsByParticipant[row.participantKey] ?? {
                    front9Score: "",
                    back9Score: "",
                    birdies: "",
                  };
                  return (
                    <View
                      key={row.participantKey}
                      style={[styles.splitterDataRow, { borderBottomColor: colors.borderLight }]}
                    >
                      <AppText variant="body" numberOfLines={1} style={styles.splitterNameCol}>
                        {row.name}
                      </AppText>
                      <View style={styles.splitterNumCol}>
                        <AppInput
                          value={input.front9Score}
                          onChangeText={(t) => updateSplitterInputField(row.participantKey, "front9Score", t)}
                          keyboardType="number-pad"
                          editable={!locked}
                          placeholder="-"
                          style={styles.splitterInput}
                        />
                      </View>
                      <View style={styles.splitterNumCol}>
                        <AppInput
                          value={input.back9Score}
                          onChangeText={(t) => updateSplitterInputField(row.participantKey, "back9Score", t)}
                          keyboardType="number-pad"
                          editable={!locked}
                          placeholder="-"
                          style={styles.splitterInput}
                        />
                      </View>
                      <View style={styles.splitterNumCol}>
                        <AppInput
                          value={input.birdies}
                          onChangeText={(t) => updateSplitterInputField(row.participantKey, "birdies", t)}
                          keyboardType="number-pad"
                          editable={!locked}
                          placeholder="-"
                          style={styles.splitterInput}
                        />
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
            {!locked ? (
              <SecondaryButton loading={splitterBusy} onPress={() => void saveSplitterInputs()}>
                Save splitter inputs
              </SecondaryButton>
            ) : null}
          </>
        ) : (
          <>
            <AppText variant="subheading">Payout rules (%)</AppText>
            <View style={styles.tplRow}>
              {([1, 2, 3, 4, 5] as const).map((n) => (
                <SecondaryButton key={n} size="sm" disabled={locked} onPress={() => applyTemplate(n)}>
                  {n} place{n > 1 ? "s" : ""}
                </SecondaryButton>
              ))}
            </View>
            {Array.from({ length: placesPaid }).map((_, i) => (
              <View key={i} style={{ marginBottom: spacing.xs }}>
                <AppText variant="caption" color="secondary">
                  Position {i + 1}
                </AppText>
                <AppInput
                  value={String(percents[i] ?? 0)}
                  editable={!locked}
                  onChangeText={(t) => setPercentAt(i, t)}
                  keyboardType="decimal-pad"
                />
              </View>
            ))}
          </>
        )}

        <InlineNotice
          variant="info"
          message="Who counts in a pool is controlled on the prize pools list: Pot Master–confirmed entrants with official results. Paid/confirmed attendance on the pool is not used in v1."
        />

        <AppText variant="caption" color="secondary">
          Notes (optional)
        </AppText>
        <AppInput value={notes} onChangeText={setNotes} editable={!locked} />

        {!locked ? (
          <PrimaryButton loading={busy} onPress={() => void saveConfig()}>
            Save changes
          </PrimaryButton>
        ) : null}

        {pool.status !== "finalised" ? (
          <SecondaryButton loading={busy} onPress={runCalculate}>
            Calculate payouts
          </SecondaryButton>
        ) : null}

        {pool.status === "calculated" ? (
          <PrimaryButton loading={busy} onPress={runFinalise}>
            Finalise pool
          </PrimaryButton>
        ) : null}

        {results.length > 0 && pool.status !== "draft" ? (
          <PrizePoolSummary
            pool={pool}
            results={results}
            eventFormat={event?.format}
            nameByMemberId={nameByMemberId}
            nameByGuestId={nameByGuestId}
          />
        ) : null}

        {pool.status !== "finalised" ? (
          <DestructiveButton loading={busy} onPress={runDelete} style={{ marginTop: spacing.lg }}>
            Delete pool
          </DestructiveButton>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  backBtn: { padding: spacing.xs },
  modeRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  tplRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginBottom: spacing.sm },
  splitterTableWrap: {
    borderWidth: 1,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  splitterHeadRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  splitterDataRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  splitterNameCol: {
    flex: 1,
    minWidth: 0,
  },
  splitterNumCol: {
    width: 64,
  },
  splitterInput: {
    minHeight: 36,
    textAlign: "center",
    paddingHorizontal: spacing.xs,
  },
});
