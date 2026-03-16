/**
 * Event Players Screen
 * - Select players for the event
 * - Add guest players (name, sex, handicap index)
 * - Uses Supabase instead of Firebase
 * Note: Tee sheet generation moved to ManCo Tools
 */

import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { getMembersBySocietyId, getMembersBySocietyIds, getMemberRowsByUserIdForSocieties, type MemberDoc } from "@/lib/db_supabase/memberRepo";
import {
  getEventGuests,
  addEventGuest,
  deleteEventGuest,
  type EventGuest,
} from "@/lib/db_supabase/eventGuestRepo";
import { getPermissionsForMember } from "@/lib/rbac";
import { getSocietyDoc } from "@/lib/db_supabase/societyRepo";
import { getColors, spacing, radius, typography } from "@/lib/ui/theme";

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

  // Add guest modal
  const [showAddGuest, setShowAddGuest] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestSex, setGuestSex] = useState<"male" | "female">("male");
  const [guestHandicap, setGuestHandicap] = useState("");
  const [addingGuest, setAddingGuest] = useState(false);
  const [societyFilter, setSocietyFilter] = useState<string>("all");
  const [societyNames, setSocietyNames] = useState<Record<string, string>>({});
  const [showChangeSociety, setShowChangeSociety] = useState(false);
  const [changeSocietyMember, setChangeSocietyMember] = useState<MemberDoc | null>(null);
  const [alternateMembers, setAlternateMembers] = useState<MemberDoc[]>([]);
  const [guestSocietyId, setGuestSocietyId] = useState<string>("");

  const permissions = getPermissionsForMember(member as any);

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

        const evt = await getEvent(eventId);
        if (cancelled) return;

        const societyIds = evt?.is_multi_society && evt?.participatingSocietyIds?.length
          ? evt.participatingSocietyIds
          : [evt?.society_id ?? societyId].filter(Boolean);
        const mems = societyIds.length > 0
          ? await getMembersBySocietyIds(societyIds)
          : await getMembersBySocietyId(societyId);
        const guestList = await getEventGuests(eventId);

        if (cancelled) return;

        console.log("[players] loaded event:", {
          id: evt?.id,
          playerIds: evt?.playerIds,
          guests: guestList.length,
          societyIds,
        });

        setEvent(evt);
        setMembers(mems);
        setGuests(guestList);

        if (evt?.is_multi_society && societyIds.length > 0) {
          const names: Record<string, string> = {};
          await Promise.all(societyIds.map(async (sid) => {
            const s = await getSocietyDoc(sid);
            if (s) names[sid] = s.name ?? "Society";
          }));
          setSocietyNames(names);
          setGuestSocietyId(evt.society_id ?? societyIds[0]);
        }

        // Use playerIds (camelCase) as returned by mapEvent
        const existing = evt?.playerIds ?? [];
        console.log("[players] initializing selection from:", existing);
        setSelectedPlayerIds(new Set(existing.map(String)));
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

  function togglePlayer(id: string) {
    setSelectedPlayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  async function openChangeSociety(m: MemberDoc) {
    if (!event?.participatingSocietyIds?.length || !m.user_id) return;
    const all = await getMemberRowsByUserIdForSocieties(m.user_id, event.participatingSocietyIds);
    const others = all.filter((x) => x.id !== m.id);
    if (others.length === 0) return;
    setChangeSocietyMember(m);
    setAlternateMembers(others);
    setShowChangeSociety(true);
  }

  function applyChangeSociety(newMember: MemberDoc) {
    if (!changeSocietyMember) return;
    setSelectedPlayerIds((prev) => {
      const next = new Set(prev);
      next.delete(changeSocietyMember.id);
      next.add(newMember.id);
      return next;
    });
    setShowChangeSociety(false);
    setChangeSocietyMember(null);
    setAlternateMembers([]);
  }

  async function save() {
    try {
      setSaving(true);

      const ids = Array.from(selectedPlayerIds);
      console.log("[players] saving", {
        eventId: event?.id,
        societyId,
        playerIds: ids,
      });

      await updateEvent(event!.id, { playerIds: ids });

      console.log("[players] save OK, refetching to confirm...");

      // Refetch to confirm persistence
      const refreshed = await getEvent(event!.id);
      if (refreshed) {
        const reloaded = refreshed.playerIds ?? [];
        console.log("[players] confirmed playerIds:", reloaded);
      }

      // Navigate back - Event Detail will refetch via useFocusEffect
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
    const repSocietyId = event?.is_multi_society && participatingSocietyIds.length
      ? (guestSocietyId || participatingSocietyIds[0])
      : societyId;
    if (!event?.id || !repSocietyId) return;

    setAddingGuest(true);
    try {
      const handicap = guestHandicap.trim() ? parseFloat(guestHandicap) : null;
      await addEventGuest({
        eventId: event.id,
        societyId: repSocietyId,
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
          action={{ label: "Go Back", onPress: () => router.replace({ pathname: "/event/[id]", params: { id: eventId, refresh: Date.now().toString() } }) }}
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
          action={{ label: "Go Back", onPress: () => router.replace({ pathname: "/event/[id]", params: { id: eventId, refresh: Date.now().toString() } }) }}
        />
      </Screen>
    );
  }

  const selectedCount = selectedPlayerIds.size;
  const participatingSocietyIds = event?.is_multi_society && event?.participatingSocietyIds?.length
    ? event.participatingSocietyIds
    : [];
  const filteredMembers = useMemo(() => {
    if (societyFilter === "all") return members;
    return members.filter((m) => m.society_id === societyFilter);
  }, [members, societyFilter]);

  const membersWithAlternates = useMemo(() => {
    if (!event?.is_multi_society || participatingSocietyIds.length < 2) return new Set<string>();
    const byUser = new Map<string, MemberDoc[]>();
    for (const m of members) {
      if (!m.user_id) continue;
      const list = byUser.get(m.user_id) ?? [];
      list.push(m);
      byUser.set(m.user_id, list);
    }
    const hasAlternates = new Set<string>();
    for (const [, list] of byUser) {
      if (list.length > 1) for (const m of list) hasAlternates.add(m.id);
    }
    return hasAlternates;
  }, [members, event?.is_multi_society, participatingSocietyIds.length]);

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

      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }}>
        {/* Society filter (multi-society only) */}
        {participatingSocietyIds.length > 1 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.md }}>
            <Pressable
              onPress={() => setSocietyFilter("all")}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: radius.md,
                backgroundColor: societyFilter === "all" ? colors.primary : colors.backgroundSecondary,
              }}
            >
              <AppText variant="caption" style={{ color: societyFilter === "all" ? "#fff" : colors.text }}>
                All societies
              </AppText>
            </Pressable>
            {participatingSocietyIds.map((sid) => (
              <Pressable
                key={sid}
                onPress={() => setSocietyFilter(sid)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: radius.md,
                  backgroundColor: societyFilter === sid ? colors.primary : colors.backgroundSecondary,
                }}
              >
                <AppText variant="caption" style={{ color: societyFilter === sid ? "#fff" : colors.text }}>
                  {societyNames[sid] ?? "Society"}
                </AppText>
              </Pressable>
            ))}
          </View>
        )}

        {/* Members */}
        <AppText variant="captionBold" color="secondary" style={{ marginBottom: spacing.sm }}>
          Society Members
        </AppText>
        {filteredMembers.length === 0 ? (
          <EmptyState
            title="No members"
            message="Add members first, then you can select players."
            action={{ label: "Go Back", onPress: () => router.replace({ pathname: "/event/[id]", params: { id: eventId, refresh: Date.now().toString() } }) }}
          />
        ) : (
          <View style={{ gap: spacing.md, marginBottom: spacing.xl }}>
            {filteredMembers.map((m) => {
              const id = String(m.id);
              const selected = selectedPlayerIds.has(id);
              const handicap = m.handicapIndex ?? (m as any).handicap_index;

              const hasAlternates = membersWithAlternates.has(id);

              return (
                <Pressable key={id} onPress={() => togglePlayer(id)}>
                  <AppCard style={selected ? { ...styles.row, ...styles.rowSelected } : styles.row}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <AppText style={styles.name}>
                          {m.name || m.displayName || "Member"}
                        </AppText>
                        {event?.is_multi_society && m.society_id && societyNames[m.society_id] && (
                          <View style={{ backgroundColor: colors.primary + "20", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                            <AppText variant="small" style={{ color: colors.primary }}>
                              {societyNames[m.society_id]}
                            </AppText>
                          </View>
                        )}
                      </View>

                      {handicap != null && (
                        <AppText style={styles.subtle}>
                          HCP: {handicap}
                        </AppText>
                      )}
                    </View>

                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      {selected && hasAlternates && !event?.isCompleted && (
                        <Pressable
                          onPress={(e) => { e.stopPropagation(); openChangeSociety(m); }}
                          hitSlop={8}
                          style={{ padding: 4 }}
                        >
                          <AppText variant="small" style={{ color: colors.primary }}>Change</AppText>
                        </Pressable>
                      )}
                      <Feather
                        name={selected ? "check-circle" : "circle"}
                        size={22}
                        color={selected ? colors.primary : colors.textTertiary}
                      />
                    </View>
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
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <AppText style={styles.name}>{g.name}</AppText>
                    {event?.is_multi_society && g.society_id && societyNames[g.society_id] && (
                      <View style={{ backgroundColor: colors.primary + "20", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                        <AppText variant="small" style={{ color: colors.primary }}>
                          {societyNames[g.society_id]}
                        </AppText>
                      </View>
                    )}
                  </View>
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
            {event?.is_multi_society && participatingSocietyIds.length > 1 && (
              <View style={styles.formField}>
                <AppText variant="caption" style={styles.label}>Representing society</AppText>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {participatingSocietyIds.map((sid) => (
                    <Pressable
                      key={sid}
                      onPress={() => setGuestSocietyId(sid)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: radius.md,
                        backgroundColor: guestSocietyId === sid ? colors.primary : colors.backgroundSecondary,
                      }}
                    >
                      <AppText variant="caption" style={{ color: guestSocietyId === sid ? "#fff" : colors.text }}>
                        {societyNames[sid] ?? "Society"}
                      </AppText>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
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

      {/* Change Representing Society Modal */}
      <Modal visible={showChangeSociety} transparent animationType="fade">
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowChangeSociety(false)}
        >
          <Pressable style={[styles.modalContent, { backgroundColor: colors.surface }]} onPress={(e) => e.stopPropagation()}>
            <AppText variant="h2" style={{ marginBottom: spacing.md }}>Change representing society</AppText>
            {changeSocietyMember && (
              <AppText variant="body" color="secondary" style={{ marginBottom: spacing.md }}>
                {changeSocietyMember.name || changeSocietyMember.displayName} is in multiple societies. Choose which they represent for this event:
              </AppText>
            )}
            <View style={{ gap: spacing.sm }}>
              {alternateMembers.map((m) => (
                <Pressable
                  key={m.id}
                  onPress={() => applyChangeSociety(m)}
                  style={{
                    padding: spacing.md,
                    borderRadius: radius.md,
                    backgroundColor: colors.backgroundSecondary,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <AppText variant="bodyBold">{societyNames[m.society_id] ?? "Society"}</AppText>
                </Pressable>
              ))}
            </View>
            <SecondaryButton onPress={() => { setShowChangeSociety(false); setChangeSocietyMember(null); setAlternateMembers([]); }} style={{ marginTop: spacing.md }}>
              Cancel
            </SecondaryButton>
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
