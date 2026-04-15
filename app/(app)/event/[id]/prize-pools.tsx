import { useCallback, useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { goBack } from "@/lib/navigation";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { useBootstrap } from "@/lib/useBootstrap";
import { canManageEventPaymentsForSociety } from "@/lib/rbac";
import { getEvent, type EventDoc } from "@/lib/db_supabase/eventRepo";
import {
  createEventDivision,
  deleteEventDivision,
  deletePrizePoolEntry,
  insertPrizePoolGuestEntrant,
  isMemberTheEventPrizePoolManager,
  listEventDivisions,
  listEventPrizePools,
  listPrizePoolOptInEntrants,
  setEventPrizePoolPaymentInstructions,
  setPrizePoolEntryPotMasterConfirmation,
} from "@/lib/db_supabase/eventPrizePoolRepo";
import { getEventGuests, type EventGuest } from "@/lib/db_supabase/eventGuestRepo";
import type { EventDivisionRow, EventPrizePoolRow } from "@/lib/event-prize-pools-types";
import { PrizePoolCard } from "@/components/event-prize-pools/PrizePoolCard";
import { getColors, spacing, radius, iconSize } from "@/lib/ui/theme";

export default function EventPrizePoolsListScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const eventId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { societyId, memberships, member } = useBootstrap();
  const colors = getColors();
  const memberId = member?.id;

  const isManco = useMemo(
    () => canManageEventPaymentsForSociety(memberships, societyId),
    [memberships, societyId],
  );

  const [event, setEvent] = useState<EventDoc | null>(null);
  const [pools, setPools] = useState<EventPrizePoolRow[]>([]);
  const [divisions, setDivisions] = useState<EventDivisionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPoolMgr, setIsPoolMgr] = useState(false);
  const [entrantsByPoolId, setEntrantsByPoolId] = useState<
    Record<string, Awaited<ReturnType<typeof listPrizePoolOptInEntrants>>>
  >({});
  const [eventGuests, setEventGuests] = useState<EventGuest[]>([]);
  const [payInstr, setPayInstr] = useState("");
  const [instrBusy, setInstrBusy] = useState(false);

  const [divModalOpen, setDivModalOpen] = useState(false);
  const [divName, setDivName] = useState("");
  const [divMin, setDivMin] = useState("");
  const [divMax, setDivMax] = useState("");
  const [divBusy, setDivBusy] = useState(false);

  const load = useCallback(async () => {
    if (!eventId) return;
    setError(null);
    setLoading(true);
    try {
      const [ev, pls, divs] = await Promise.all([
        getEvent(eventId),
        listEventPrizePools(eventId),
        listEventDivisions(eventId),
      ]);
      setEvent(ev);
      setPools(pls);
      setDivisions(divs);
      setPayInstr(ev?.prizePoolPaymentInstructions ?? "");

      let mgr = false;
      if (memberId) {
        mgr = await isMemberTheEventPrizePoolManager(eventId, memberId);
      }
      setIsPoolMgr(mgr);

      const allow = isManco || mgr;
      if (allow) {
        try {
          const guests = await getEventGuests(eventId);
          setEventGuests(guests);
          const lists = await Promise.all(pls.map((p) => listPrizePoolOptInEntrants(p.id)));
          const next: Record<string, Awaited<ReturnType<typeof listPrizePoolOptInEntrants>>> = {};
          pls.forEach((p, i) => {
            next[p.id] = lists[i] ?? [];
          });
          setEntrantsByPoolId(next);
        } catch (entErr: unknown) {
          console.error("[prize-pools] entrants/guests load failed:", entErr);
          setEntrantsByPoolId({});
          setEventGuests([]);
        }
      } else {
        setEntrantsByPoolId({});
        setEventGuests([]);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load prize pools.");
    } finally {
      setLoading(false);
    }
  }, [eventId, memberId, isManco]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const openPool = (poolId: string) => {
    router.push({
      pathname: "/(app)/event/[id]/prize-pool/[poolId]" as any,
      params: { id: eventId!, poolId },
    });
  };

  const addDivision = async () => {
    if (!eventId || !divName.trim()) return;
    setDivBusy(true);
    try {
      const minV = divMin.trim() === "" ? null : Number(divMin);
      const maxV = divMax.trim() === "" ? null : Number(divMax);
      await createEventDivision({
        eventId,
        name: divName.trim(),
        sortOrder: divisions.length,
        minHandicap: minV != null && !Number.isNaN(minV) ? minV : null,
        maxHandicap: maxV != null && !Number.isNaN(maxV) ? maxV : null,
      });
      setDivName("");
      setDivMin("");
      setDivMax("");
      setDivModalOpen(false);
      await load();
    } catch (e: unknown) {
      Alert.alert("Could not add division", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setDivBusy(false);
    }
  };

  const removeDivision = (d: EventDivisionRow) => {
    Alert.alert(
      "Remove division",
      `Remove “${d.name}” from this event? Prize pools in division mode need divisions.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await deleteEventDivision(d.id);
                await load();
              } catch (e: unknown) {
                Alert.alert("Error", e instanceof Error ? e.message : "Failed to delete");
              }
            })();
          },
        },
      ],
    );
  };

  const allowAccess = isManco || isPoolMgr;

  if (!loading && !allowAccess) {
    return (
      <Screen>
        <View style={styles.headerRow}>
          <Pressable onPress={() => goBack(router, "/(app)/(tabs)/events")} hitSlop={12} style={styles.backBtn}>
            <Feather name="arrow-left" size={iconSize.md} color={colors.text} />
          </Pressable>
          <AppText variant="h2">Prize Pools</AppText>
        </View>
        <InlineNotice
          variant="info"
          message="Only ManCo or the appointed Pot Master for this event can open this screen."
        />
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
          <AppText variant="h2">Prize Pools</AppText>
          {event?.name ? (
            <AppText variant="caption" color="secondary" numberOfLines={2}>
              {event.name}
            </AppText>
          ) : null}
        </View>
      </View>

        <InlineNotice
          variant="info"
          message="Configure Prize Pool (Pot) and Prize Pool (Pot) Splitter allocation from official results. Division pools split the total prize amount evenly across active divisions, then apply the chosen payout percentages within each division."
        />

      {loading ? (
        <LoadingState message="Loading…" />
      ) : error ? (
        <InlineNotice variant="error" message={error} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl, gap: spacing.md }}>
          <AppCard style={{ borderRadius: radius.md }}>
              <AppText variant="subheading" style={{ marginBottom: spacing.sm }}>
                Notes for entrants
              </AppText>
              <AppText variant="small" color="muted" style={{ marginBottom: spacing.sm }}>
                Optional bank details, how you run the pot, or other notes. Shown on the home card for members who
                choose to enter the prize pool (separate from main event fees).
              </AppText>
              <AppInput
                value={payInstr}
                onChangeText={setPayInstr}
                placeholder="Bank name, sort code, account number, reference…"
                multiline
                style={{ minHeight: 100, textAlignVertical: "top" }}
              />
              <PrimaryButton
                loading={instrBusy}
                onPress={() => {
                  void (async () => {
                    if (!eventId) return;
                    setInstrBusy(true);
                    try {
                      await setEventPrizePoolPaymentInstructions(eventId, payInstr);
                      await load();
                    } catch (e: unknown) {
                      Alert.alert("Save failed", e instanceof Error ? e.message : "Unknown error");
                    } finally {
                      setInstrBusy(false);
                    }
                  })();
                }}
                style={{ marginTop: spacing.sm }}
              >
                Save notes
              </PrimaryButton>
            </AppCard>

          <AppCard style={{ borderRadius: radius.md }}>
            <AppText variant="subheading" style={{ marginBottom: spacing.sm }}>
              Pot Master entrants
            </AppText>
            <AppText variant="caption" color="secondary" style={{ marginBottom: spacing.sm }}>
              Opt-in and confirmation are per prize pool. Only confirmed entrants for that pool are used when it is
              calculated.
            </AppText>
            {!event?.prizePoolEnabled ? (
              <AppText variant="caption" color="secondary">
                Prize pool opt-in is off for this event. A Captain can enable it from the event screen.
              </AppText>
            ) : pools.length === 0 ? (
              <AppText variant="caption" color="secondary">
                Create a prize pool below, then manage entrants for each pool here.
              </AppText>
            ) : (
              pools.map((p) => {
                const entrants = entrantsByPoolId[p.id] ?? [];
                return (
                  <View
                    key={p.id}
                    style={{
                      marginBottom: spacing.md,
                      paddingBottom: spacing.sm,
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: colors.borderLight,
                      gap: spacing.xs,
                    }}
                  >
                    <AppText variant="bodyBold" numberOfLines={2}>
                      {(p.competition_name || p.name).trim()}
                    </AppText>
                    {entrants.length === 0 ? (
                      <AppText variant="caption" color="secondary">
                        No opt-in requests or guest entrants yet.
                      </AppText>
                    ) : (
                      entrants.map((en) => (
                        <View
                          key={en.id}
                          style={{
                            paddingVertical: spacing.sm,
                            borderBottomWidth: StyleSheet.hairlineWidth,
                            borderBottomColor: colors.borderLight,
                            gap: spacing.xs,
                          }}
                        >
                          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                            <View style={{ flex: 1 }}>
                              <AppText variant="bodyBold" numberOfLines={1}>
                                {en.displayName}
                              </AppText>
                              <AppText variant="caption" color="secondary">
                                {en.participant_type === "guest"
                                  ? "Guest"
                                  : en.opted_in
                                    ? "Member · requested entry"
                                    : "Member"}
                              </AppText>
                            </View>
                            <AppText variant="captionBold" color={en.confirmed_by_pot_master ? "primary" : "secondary"}>
                              {en.confirmed_by_pot_master ? "Confirmed" : "Not confirmed"}
                            </AppText>
                          </View>
                          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                            <SecondaryButton
                              size="sm"
                              onPress={() => {
                                void (async () => {
                                  try {
                                    await setPrizePoolEntryPotMasterConfirmation(en.id, !en.confirmed_by_pot_master);
                                    await load();
                                  } catch (e: unknown) {
                                    Alert.alert("Update failed", e instanceof Error ? e.message : "Unknown error");
                                  }
                                })();
                              }}
                            >
                              {en.confirmed_by_pot_master ? "Unconfirm" : "Confirm"}
                            </SecondaryButton>
                            <SecondaryButton
                              size="sm"
                              onPress={() => {
                                Alert.alert("Remove entrant?", `Remove ${en.displayName} from this pool?`, [
                                  { text: "Cancel", style: "cancel" },
                                  {
                                    text: "Remove",
                                    style: "destructive",
                                    onPress: () => {
                                      void (async () => {
                                        try {
                                          await deletePrizePoolEntry(en.id);
                                          await load();
                                        } catch (e: unknown) {
                                          Alert.alert("Error", e instanceof Error ? e.message : "Failed to remove");
                                        }
                                      })();
                                    },
                                  },
                                ]);
                              }}
                            >
                              Remove
                            </SecondaryButton>
                          </View>
                        </View>
                      ))
                    )}

                    {event?.prizePoolEnabled ? (
                      <View style={{ marginTop: spacing.sm }}>
                        <AppText variant="captionBold" color="secondary" style={{ marginBottom: spacing.xs }}>
                          Add guest to this pool
                        </AppText>
                        {eventGuests
                          .filter((g) => !entrants.some((e) => e.guest_id === g.id))
                          .map((g) => (
                            <View
                              key={g.id}
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                paddingVertical: spacing.xs,
                                gap: spacing.sm,
                              }}
                            >
                              <AppText variant="body" style={{ flex: 1 }} numberOfLines={1}>
                                {g.name}
                              </AppText>
                              <SecondaryButton
                                size="sm"
                                onPress={() => {
                                  void (async () => {
                                    try {
                                      await insertPrizePoolGuestEntrant(p.id, g.id);
                                      await load();
                                    } catch (e: unknown) {
                                      Alert.alert(
                                        "Could not add guest",
                                        e instanceof Error ? e.message : "Unknown error",
                                      );
                                    }
                                  })();
                                }}
                              >
                                Add
                              </SecondaryButton>
                            </View>
                          ))}
                        {eventGuests.filter((g) => !entrants.some((e) => e.guest_id === g.id)).length === 0 ? (
                          <AppText variant="caption" color="secondary">
                            No guests to add for this pool, or every event guest is already listed.
                          </AppText>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}
          </AppCard>

          <AppCard style={{ borderRadius: radius.md }}>
            <View style={styles.divHead}>
              <AppText variant="subheading">Event divisions</AppText>
              <SecondaryButton size="sm" onPress={() => setDivModalOpen(true)}>
                <AppText variant="captionBold">Add</AppText>
              </SecondaryButton>
            </View>
            <AppText variant="small" color="muted" style={{ marginBottom: spacing.sm }}>
              Used when a prize pool uses division payout. Handicap ranges are inclusive.
            </AppText>
            {divisions.length === 0 ? (
              <AppText variant="caption" color="secondary">
                No divisions yet. Add at least one before running a division prize pool.
              </AppText>
            ) : (
              divisions.map((d) => (
                <View key={d.id} style={[styles.divRow, { borderColor: colors.borderLight }]}>
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyBold">{d.name}</AppText>
                    <AppText variant="caption" color="secondary">
                      HI{" "}
                      {d.min_handicap != null || d.max_handicap != null
                        ? `${d.min_handicap ?? "—"}–${d.max_handicap ?? "—"}`
                        : "any"}
                    </AppText>
                  </View>
                  <Pressable onPress={() => removeDivision(d)} hitSlop={10}>
                    <Feather name="trash-2" size={18} color={colors.error} />
                  </Pressable>
                </View>
              ))
            )}
          </AppCard>

          <PrimaryButton
            onPress={() =>
              router.push({ pathname: "/(app)/event/[id]/prize-pool/new" as any, params: { id: eventId! } })
            }
 style={{ marginBottom: spacing.sm }}
          >
            Add prize pool
          </PrimaryButton>

          {pools.length === 0 ? (
            <EmptyState title="No prize pools" message="Create a pool to set payout rules and allocate prizes." />
          ) : (
            pools.map((p) => <PrizePoolCard key={p.id} pool={p} onOpen={() => openPool(p.id)} />)
          )}
        </ScrollView>
      )}

      <Modal visible={divModalOpen} animationType="slide" transparent onRequestClose={() => setDivModalOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => !divBusy && setDivModalOpen(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.background }]} onPress={(e) => e.stopPropagation()}>
            <AppText variant="h2" style={{ marginBottom: spacing.sm }}>
              Add division
            </AppText>
            <AppText variant="caption" color="secondary" style={{ marginBottom: 4 }}>
              Name
            </AppText>
            <AppInput value={divName} onChangeText={setDivName} placeholder="e.g. Division1" />
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <AppText variant="caption" color="secondary" style={{ marginBottom: 4 }}>
                  Min HI (optional)
                </AppText>
                <AppInput value={divMin} onChangeText={setDivMin} keyboardType="decimal-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="caption" color="secondary" style={{ marginBottom: 4 }}>
                  Max HI (optional)
                </AppText>
                <AppInput value={divMax} onChangeText={setDivMax} keyboardType="decimal-pad" />
              </View>
            </View>
            <PrimaryButton loading={divBusy} onPress={() => void addDivision()} style={{ marginTop: spacing.md }}>
              Save division
            </PrimaryButton>
            <SecondaryButton onPress={() => setDivModalOpen(false)} style={{ marginTop: spacing.sm }}>
              Cancel
            </SecondaryButton>
          </Pressable>
        </Pressable>
      </Modal>
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
  divHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  divRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalCard: {
    padding: spacing.lg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
});
