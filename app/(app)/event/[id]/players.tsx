/**
 * Event Players Screen
 * - Select players for the event
 * - Add guest players (name, sex, handicap index)
 * - Uses Supabase instead of Firebase
 * Note: Tee sheet generation moved to ManCo Tools
 */

import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { buildSocietyIdToNameMap, societyLabelFromMember } from "@/lib/jointEventSocietyLabel";
import {
  dedupeJointMembers,
  normalizeJointSelectedMemberIds,
  representativeMemberIdForJoint,
} from "@/lib/jointPersonDedupe";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
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
import { getEvent, updateEvent, type EventDoc } from "@/lib/db_supabase/eventRepo";
import { getMembersBySocietyId, type MemberDoc } from "@/lib/db_supabase/memberRepo";
import { resolveAttendeeDisplayName } from "@/lib/eventAttendeeName";
import { getJointMetaForEventIds, getJointEventDetail, syncJointEventEntries } from "@/lib/db_supabase/jointEventRepo";
import {
  getEventGuests,
  addEventGuest,
  deleteEventGuest,
  type EventGuest,
} from "@/lib/db_supabase/eventGuestRepo";
import { getPermissionsForMember } from "@/lib/rbac";
import { getColors, spacing, radius, typography } from "@/lib/ui/theme";
import { JOINT_EVENT_CHIP_LONG } from "@/lib/eventModuleUi";

export default function EventPlayersScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const { societyId, member, loading: bootstrapLoading } = useBootstrap();
  const colors = getColors();

  const eventId = useMemo(() => {
    const raw = (params as any)?.id;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [params]);

  const [event, setEvent] = useState<EventDoc | null>(null);
  const [members, setMembers] = useState<MemberDoc[]>([]);
  const [guests, setGuests] = useState<EventGuest[]>([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [participatingSocietyIds, setParticipatingSocietyIds] = useState<string[]>([]);
  const [jointParticipatingSocieties, setJointParticipatingSocieties] = useState<
    { society_id: string; society_name?: string | null }[]
  >([]);

  // Add guest modal
  const [showAddGuest, setShowAddGuest] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestSex, setGuestSex] = useState<"male" | "female">("male");
  const [guestHandicap, setGuestHandicap] = useState("");
  const [addingGuest, setAddingGuest] = useState(false);

  const permissions = getPermissionsForMember(member as any);

  const jointSocietyIdToName = useMemo(
    () => buildSocietyIdToNameMap(jointParticipatingSocieties),
    [jointParticipatingSocieties],
  );

  const dedupedJointMembers = useMemo(() => {
    if (!event || event.is_joint_event !== true || members.length === 0) return [];
    return dedupeJointMembers(members, jointSocietyIdToName);
  }, [event, members, jointSocietyIdToName]);

  const loadGuests = useCallback(async () => {
    if (!eventId) return [];
    const list = await getEventGuests(eventId);
    setGuests(list);
    return list;
  }, [eventId]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (bootstrapLoading) return;

      if (!societyId) {
        setError("Missing society");
        setLoading(false);
        return;
      }

      if (!eventId) {
        setError("Missing event ID");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        console.log("[players] loading event + members + guests", { eventId, societyId });

        const jointMeta = await getJointMetaForEventIds([eventId]);
        const joint = jointMeta.get(eventId)?.is_joint_event ?? false;

        if (joint) {
          const [jointPayload, guestList] = await Promise.all([
            getJointEventDetail(eventId),
            getEventGuests(eventId),
          ]);
          if (cancelled) return;
          const evt = jointPayload ? await getEvent(eventId) : null;
          setEvent(evt);
          setGuests(guestList ?? []);

          if (jointPayload) {
            const societies = jointPayload.participating_societies ?? [];
            setJointParticipatingSocieties(
              societies.map((s) => ({ society_id: s.society_id, society_name: s.society_name })),
            );
            const societyIds = societies.map((s) => s.society_id).filter(Boolean);
            setParticipatingSocietyIds(societyIds);

            const allMembers: MemberDoc[] = [];
            for (const sid of societyIds) {
              const m = await getMembersBySocietyId(sid);
              allMembers.push(...m);
            }
            setMembers(allMembers);

            const entryPlayerIds = (jointPayload.entries ?? []).map((e) => e.player_id).filter(Boolean);
            const legacyPlayerIds = evt?.playerIds ?? [];
            const mergedIds = new Set([
              ...entryPlayerIds.map(String),
              ...legacyPlayerIds.map(String),
            ]);
            const map = buildSocietyIdToNameMap(
              societies.map((s) => ({ society_id: s.society_id, society_name: s.society_name })),
            );
            setSelectedPlayerIds(normalizeJointSelectedMemberIds(mergedIds, allMembers, map));

            if (__DEV__) {
              console.log("[players] attendee confirmation restore:", {
                eventId,
                societyId,
                isJointEvent: true,
                persistedFromEntries: entryPlayerIds.length,
                persistedFromEventPlayerIds: legacyPlayerIds.length,
                mergedCount: mergedIds.size,
              });
            }
          } else {
            setMembers([]);
            setParticipatingSocietyIds([]);
            setJointParticipatingSocieties([]);
            setSelectedPlayerIds(new Set());
          }
        } else {
          const [evt, mems, guestList] = await Promise.all([
            getEvent(eventId),
            getMembersBySocietyId(societyId),
            getEventGuests(eventId),
          ]);
          if (cancelled) return;

          setEvent(evt);
          setMembers(mems);
          setGuests(guestList);
          setParticipatingSocietyIds([]);
          setJointParticipatingSocieties([]);

          const existing = evt?.playerIds ?? [];
          setSelectedPlayerIds(new Set(existing.map(String)));
          if (__DEV__) {
            console.log("[players] attendee confirmation restore:", {
              eventId,
              societyId,
              isJointEvent: false,
              persistedFromEventPlayerIds: existing.length,
            });
          }
        }
      } catch (e: any) {
        console.error("[players] load FAILED", e);
        if (!cancelled) {
          setError(e?.message ?? "Failed to load players");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [bootstrapLoading, societyId, eventId]);

  useEffect(() => {
    if (!__DEV__ || !eventId || !societyId || members.length === 0) return;
    const sample = members.slice(0, 5).map((m) => ({
      memberId: String(m.id),
      renderedTick: selectedPlayerIds.has(String(m.id)),
    }));
    console.log("[players] tick status sample:", { eventId, societyId, memberCount: members.length, selectedCount: selectedPlayerIds.size, sample });
  }, [eventId, societyId, members.length, selectedPlayerIds.size]);

  function togglePlayer(id: string) {
    const effectiveId =
      event?.is_joint_event === true
        ? representativeMemberIdForJoint(id, members, jointSocietyIdToName)
        : id;
    setSelectedPlayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(effectiveId)) {
        next.delete(effectiveId);
      } else {
        next.add(effectiveId);
      }
      return next;
    });
  }

  async function save() {
    if (!event?.id) return;
    try {
      setSaving(true);

      const ids = Array.from(selectedPlayerIds);
      console.log("[players] saving", {
        eventId: event.id,
        isJointEvent: event.is_joint_event === true,
        playerIds: ids.length,
      });

      if (event.is_joint_event === true && participatingSocietyIds.length >= 2) {
        await syncJointEventEntries(event.id, ids, participatingSocietyIds);
        console.log("[players] joint save OK, synced entries");
      } else {
        await updateEvent(event.id, { playerIds: ids });
        console.log("[players] save OK, refetching to confirm...");
        const refreshed = await getEvent(event.id);
        if (refreshed) {
          const reloaded = refreshed.playerIds ?? [];
          console.log("[players] confirmed playerIds:", reloaded.length);
        }
      }

      goBack(router, "/(app)/(tabs)/events");
    } catch (e: any) {
      console.error("[players] save FAILED", e);
      Alert.alert("Save failed", e?.message ?? JSON.stringify(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleAddGuest() {
    const name = guestName.trim();
    if (!name) {
      Alert.alert("Name required", "Please enter the guest's name.");
      return;
    }
    if (!event?.id || !societyId) return;

    setAddingGuest(true);
    try {
      const handicap = guestHandicap.trim() ? parseFloat(guestHandicap) : null;
      await addEventGuest({
        eventId: event.id,
        societyId,
        name,
        sex: guestSex,
        handicapIndex: handicap != null && !isNaN(handicap) ? handicap : null,
      });
      await loadGuests();
      setShowAddGuest(false);
      setGuestName("");
      setGuestSex("male");
      setGuestHandicap("");
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Could not add guest.");
    } finally {
      setAddingGuest(false);
    }
  }

  async function handleDeleteGuest(g: EventGuest) {
    Alert.alert(
      "Remove Guest",
      `Remove ${g.name} from this event?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteEventGuest(g.id);
              await loadGuests();
            } catch (e: any) {
              Alert.alert("Failed", e?.message ?? "Could not remove guest.");
            }
          },
        },
      ]
    );
  }

  if (bootstrapLoading || loading) {
    return (
      <Screen>
        <LoadingState message="Loading players..." />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <EmptyState
          title="Error"
          message={error}
          action={{ label: "Go Back", onPress: () => router.replace({ pathname: "/(app)/event/[id]", params: { id: eventId, refresh: Date.now().toString() } }) }}
        />
      </Screen>
    );
  }

  if (!event) {
    return (
      <Screen>
        <EmptyState
          title="Not found"
          message="Event not found."
          action={{ label: "Go Back", onPress: () => router.replace({ pathname: "/(app)/event/[id]", params: { id: eventId, refresh: Date.now().toString() } }) }}
        />
      </Screen>
    );
  }

  const selectedCount = selectedPlayerIds.size;

  return (
    <Screen>
      <View style={styles.header}>
        <SecondaryButton onPress={() => goBack(router, "/(app)/(tabs)/events")} size="sm">
          <Feather name="arrow-left" size={16} color={colors.text} />
          {" Back"}
        </SecondaryButton>

        <View style={{ flex: 1 }} />

        <PrimaryButton
          onPress={save}
          disabled={saving || !permissions?.canEditEvents}
          size="sm"
        >
          {saving ? "Saving..." : "Save"}
        </PrimaryButton>
      </View>

      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <AppText variant="h2">Players</AppText>
          <AppText variant="caption" color="secondary">
            {selectedCount} members selected · {guests.length} guest{guests.length !== 1 ? "s" : ""}
          </AppText>
        </View>
      </View>

      {event.is_joint_event === true && (
        <AppCard
          style={{
            marginBottom: spacing.md,
            padding: spacing.md,
            borderWidth: 1,
            borderColor: colors.info + "50",
            backgroundColor: colors.info + "0C",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.sm }}>
            <Feather name="link" size={20} color={colors.info} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText variant="captionBold" style={{ color: colors.info }}>
                {JOINT_EVENT_CHIP_LONG}
              </AppText>
              <AppText variant="small" color="secondary" style={{ marginTop: 4 }}>
                {jointParticipatingSocieties.length > 0
                  ? jointParticipatingSocieties
                      .map((s) => s.society_name?.trim() || s.society_id)
                      .filter(Boolean)
                      .join(" · ")
                  : "Multiple societies — attendance is shared."}
              </AppText>
            </View>
          </View>
        </AppCard>
      )}

      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }}>
        {/* Members */}
        <AppText variant="captionBold" color="secondary" style={{ marginBottom: spacing.sm }}>
          Society Members
        </AppText>
        {members.length === 0 ? (
          <EmptyState
            title="No members"
            message="Add members first, then you can select players."
            action={{ label: "Go Back", onPress: () => router.replace({ pathname: "/(app)/event/[id]", params: { id: eventId, refresh: Date.now().toString() } }) }}
          />
        ) : (
          <View style={{ gap: spacing.md, marginBottom: spacing.xl }}>
            {event.is_joint_event === true
              ? dedupedJointMembers.map((d) => {
                  const id = String(d.representative.id);
                  const selected = selectedPlayerIds.has(id);
                  const handicap =
                    d.representative.handicapIndex ?? (d.representative as any).handicap_index;
                  const societyLine =
                    d.mergedMemberIds.length > 1
                      ? d.societyLabelMerged
                      : societyLabelFromMember(d.representative, jointSocietyIdToName) ??
                        d.representative.society_id;
                  return (
                    <Pressable key={d.key} onPress={() => togglePlayer(id)}>
                      <AppCard style={selected ? { ...styles.row, ...styles.rowSelected } : styles.row}>
                        <View style={{ flex: 1 }}>
                          <AppText style={styles.name}>
                            {resolveAttendeeDisplayName(d.representative, { memberId: d.representative.id }).name}
                          </AppText>
                          <AppText variant="caption" color="secondary" style={{ marginTop: 4 }}>
                            {societyLine}
                            {d.mergedMemberIds.length > 1 ? " · Dual membership" : ""}
                          </AppText>

                          {handicap != null && (
                            <AppText style={styles.subtle}>
                              HCP: {handicap}
                            </AppText>
                          )}
                        </View>

                        <Feather
                          name={selected ? "check-circle" : "circle"}
                          size={22}
                          color={selected ? colors.primary : colors.textTertiary}
                        />
                      </AppCard>
                    </Pressable>
                  );
                })
              : members.map((m) => {
                  const id = String(m.id);
                  const selected = selectedPlayerIds.has(id);
                  const handicap = m.handicapIndex ?? (m as any).handicap_index;

                  return (
                    <Pressable key={id} onPress={() => togglePlayer(id)}>
                      <AppCard style={selected ? { ...styles.row, ...styles.rowSelected } : styles.row}>
                        <View style={{ flex: 1 }}>
                          <AppText style={styles.name}>
                            {resolveAttendeeDisplayName(m, { memberId: m.id }).name}
                          </AppText>

                          {handicap != null && (
                            <AppText style={styles.subtle}>
                              HCP: {handicap}
                            </AppText>
                          )}
                        </View>

                        <Feather
                          name={selected ? "check-circle" : "circle"}
                          size={22}
                          color={selected ? colors.primary : colors.textTertiary}
                        />
                      </AppCard>
                    </Pressable>
                  );
                })}
          </View>
        )}

        {/* Guest Players */}
        <AppText variant="captionBold" color="secondary" style={{ marginBottom: spacing.sm }}>
          Guest Players
        </AppText>
        <AppText variant="small" color="tertiary" style={{ marginBottom: spacing.sm }}>
          Add guests to include them in the tee sheet. They will appear alongside members.
        </AppText>
        {permissions?.canEditEvents && (
          <SecondaryButton
            onPress={() => setShowAddGuest(true)}
            size="sm"
            style={{ marginBottom: spacing.md }}
          >
            <Feather name="user-plus" size={14} color={colors.primary} />
            <AppText style={{ color: colors.primary, marginLeft: spacing.xs }}>Add Guest</AppText>
          </SecondaryButton>
        )}
        {guests.length === 0 ? (
          <AppCard style={styles.row}>
            <AppText variant="small" color="tertiary">No guests added yet</AppText>
          </AppCard>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {guests.map((g) => (
              <AppCard key={g.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <AppText style={styles.name}>{g.name}</AppText>
                  <AppText style={styles.subtle}>
                    {g.sex === "male" ? "Male" : "Female"}
                    {g.handicap_index != null ? ` · HI ${g.handicap_index}` : ""}
                  </AppText>
                </View>
                {permissions?.canEditEvents && (
                  <Pressable onPress={() => handleDeleteGuest(g)} hitSlop={8}>
                    <Feather name="trash-2" size={18} color={colors.error} />
                  </Pressable>
                )}
              </AppCard>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Add Guest Modal */}
      <Modal visible={showAddGuest} transparent animationType="fade">
        <Pressable
          style={styles.modalOverlay}
          onPress={() => !addingGuest && setShowAddGuest(false)}
        >
          <Pressable style={[styles.modalContent, { backgroundColor: colors.surface }]} onPress={(e) => e.stopPropagation()}>
            <AppText variant="h2" style={{ marginBottom: spacing.md }}>Add Guest</AppText>
            <View style={styles.formField}>
              <AppText variant="caption" style={styles.label}>Name</AppText>
              <AppInput
                placeholder="Guest name"
                value={guestName}
                onChangeText={setGuestName}
                autoCapitalize="words"
              />
            </View>
            <View style={styles.formField}>
              <AppText variant="caption" style={styles.label}>Sex</AppText>
              <View style={styles.sexRow}>
                <Pressable
                  onPress={() => setGuestSex("male")}
                  style={[
                    styles.sexOption,
                    { borderColor: guestSex === "male" ? colors.primary : colors.border },
                    guestSex === "male" && { backgroundColor: colors.primary + "14" },
                  ]}
                >
                  <AppText style={guestSex === "male" ? { color: colors.primary, fontWeight: "600" } : {}}>Male</AppText>
                </Pressable>
                <Pressable
                  onPress={() => setGuestSex("female")}
                  style={[
                    styles.sexOption,
                    { borderColor: guestSex === "female" ? colors.primary : colors.border },
                    guestSex === "female" && { backgroundColor: colors.primary + "14" },
                  ]}
                >
                  <AppText style={guestSex === "female" ? { color: colors.primary, fontWeight: "600" } : {}}>Female</AppText>
                </Pressable>
              </View>
            </View>
            <View style={styles.formField}>
              <AppText variant="caption" style={styles.label}>Handicap Index</AppText>
              <AppInput
                placeholder="e.g. 18.5"
                value={guestHandicap}
                onChangeText={setGuestHandicap}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
              <SecondaryButton onPress={() => setShowAddGuest(false)} disabled={addingGuest} style={{ flex: 1 }}>
                Cancel
              </SecondaryButton>
              <PrimaryButton onPress={handleAddGuest} loading={addingGuest} style={{ flex: 1 }}>
                Add
              </PrimaryButton>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  row: {
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.lg,
  },
  rowSelected: {
    borderWidth: 1,
    borderColor: "#0A7C4A",
  },
  name: {
    fontSize: typography.body.fontSize,
    fontWeight: "600",
  },
  subtle: {
    marginTop: 4,
    opacity: 0.7,
    fontSize: typography.body.fontSize,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  modalContent: {
    width: "100%",
    maxWidth: 360,
    padding: spacing.lg,
    borderRadius: radius.lg,
  },
  formField: {
    marginBottom: spacing.base,
  },
  label: {
    marginBottom: spacing.xs,
  },
  sexRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  sexOption: {
    flex: 1,
    padding: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: "center",
  },
});
