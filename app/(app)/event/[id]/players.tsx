/**
 * Event Players Screen
 *
 * HOOK ORDER AUDIT (complete, as of this revision):
 * ─────────────────────────────────────────────────
 * All 28 hooks are called unconditionally at the top of EventPlayersScreen
 * before any return statement. Hook count is identical on every render.
 *
 * Child components rendered by this screen:
 *   Screen        – 1 hook (useContext), unconditional ✓
 *   LoadingState  – 0 hooks ✓
 *   EmptyState    – 0 hooks ✓
 *   AppText       – 0 hooks ✓
 *   AppCard       – 0 hooks ✓
 *   AppInput      – 0 hooks ✓
 *   PrimaryButton – 0 hooks ✓
 *   SecondaryButton – 0 hooks ✓
 *   Feather       – 0 hooks ✓
 *   View/ScrollView/Modal/Pressable – RN primitives ✓
 *
 * If React #310 still occurs after this revision, the crash is
 * coming from a BACKGROUND SCREEN in the navigation stack
 * (home tab, events tab, or event detail) that re-renders while
 * the players page is visible.  The SectionErrorBoundary blocks
 * below will not catch that; instead clear the Metro bundler cache:
 *   npx expo start --clear
 * then run again.
 */

import React, { Component } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View, Text } from "react-native";
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
import {
  getMembersBySocietyId,
  getMembersBySocietyIds,
  getMemberRowsByUserIdForSocieties,
  type MemberDoc,
} from "@/lib/db_supabase/memberRepo";
import {
  getEventGuests,
  addEventGuest,
  deleteEventGuest,
  type EventGuest,
} from "@/lib/db_supabase/eventGuestRepo";
import { getPermissionsForMember } from "@/lib/rbac";
import { getSocietyDoc } from "@/lib/db_supabase/societyRepo";
import { getColors, spacing, radius, typography } from "@/lib/ui/theme";

// ============================================================================
// SectionErrorBoundary — isolates crashes to specific render sections.
// Wrap each major JSX section so the first crashing subtree is identified
// without blanking the entire screen.
// ============================================================================

type SectionErrorBoundaryProps = {
  name: string;
  children: React.ReactNode;
};

type SectionErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

class SectionErrorBoundary extends Component<
  SectionErrorBoundaryProps,
  SectionErrorBoundaryState
> {
  constructor(props: SectionErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): SectionErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(
      `[SectionErrorBoundary] section="${this.props.name}" crashed`,
      "\nerror:", error?.message,
      "\ncomponentStack:", info?.componentStack,
    );
  }

  render() {
    if (this.state.hasError) {
      return (
        <View
          style={{
            backgroundColor: "#FEF2F2",
            borderWidth: 1,
            borderColor: "#FCA5A5",
            borderRadius: 8,
            padding: 12,
            marginVertical: 4,
          }}
        >
          <Text style={{ color: "#DC2626", fontWeight: "700", marginBottom: 4 }}>
            ⚠ Section &quot;{this.props.name}&quot; crashed
          </Text>
          <Text style={{ color: "#DC2626", fontSize: 12 }}>
            {this.state.error?.message ?? "Unknown error"}
          </Text>
          <Text style={{ color: "#6B7280", fontSize: 11, marginTop: 4 }}>
            Check console for full componentStack.
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

// ============================================================================
// Main Component
// ============================================================================

export default function EventPlayersScreen() {
  // =========================================================================
  // HOOKS — ALL 28 declared unconditionally before any return.
  // ─────────────────────────────────────────────────────────
  // Hook index  Name
  //   1         useRouter
  //   2         useLocalSearchParams
  //   3         useBootstrap  (→ useContext internally)
  //   4         useMemo       eventId
  //   5-22      useState ×18
  //   23        useMemo       isJointEvent
  //   24        useMemo       participatingSocietyIds
  //   25        useMemo       filteredMembers
  //   26        useMemo       membersWithAlternates
  //   27        useCallback   loadGuests
  //   28        useEffect     data load
  // =========================================================================

  const router = useRouter();                                           // hook 1
  const params = useLocalSearchParams<{ id: string }>();               // hook 2
  const { societyId, member, loading: bootstrapLoading } = useBootstrap(); // hook 3
  const colors = getColors(); // NOT a hook — reads module-level var

  const eventId = useMemo(() => {                                       // hook 4
    const raw = (params as any)?.id;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [params]);

  const [event, setEvent] = useState<EventDoc | null>(null);           // hook 5
  const [members, setMembers] = useState<MemberDoc[]>([]);             // hook 6
  const [guests, setGuests] = useState<EventGuest[]>([]);              // hook 7
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set()); // hook 8
  const [loading, setLoading] = useState(true);                        // hook 9
  const [saving, setSaving] = useState(false);                         // hook 10
  const [error, setError] = useState<string | null>(null);             // hook 11
  const [showAddGuest, setShowAddGuest] = useState(false);             // hook 12
  const [guestName, setGuestName] = useState("");                      // hook 13
  const [guestSex, setGuestSex] = useState<"male" | "female">("male"); // hook 14
  const [guestHandicap, setGuestHandicap] = useState("");              // hook 15
  const [addingGuest, setAddingGuest] = useState(false);               // hook 16
  const [societyFilter, setSocietyFilter] = useState<string>("all");   // hook 17
  const [societyNames, setSocietyNames] = useState<Record<string, string>>({}); // hook 18
  const [guestSocietyId, setGuestSocietyId] = useState<string>("");    // hook 19
  const [showChangeSociety, setShowChangeSociety] = useState(false);   // hook 20
  const [changeSocietyMember, setChangeSocietyMember] = useState<MemberDoc | null>(null); // hook 21
  const [alternateMembers, setAlternateMembers] = useState<MemberDoc[]>([]); // hook 22

  const isJointEvent = useMemo(                                        // hook 23
    () => Boolean(event?.is_joint_event ?? event?.is_multi_society),
    [event],
  );

  const participatingSocietyIds = useMemo<string[]>(() => {            // hook 24
    if (!event) return [];
    const ids = event.participatingSocietyIds;
    return isJointEvent && Array.isArray(ids) && ids.length > 0 ? ids : [];
  }, [event, isJointEvent]);

  const filteredMembers = useMemo<MemberDoc[]>(() => {                 // hook 25
    if (societyFilter === "all") return members;
    return members.filter((m) => m.society_id === societyFilter);
  }, [members, societyFilter]);

  const membersWithAlternates = useMemo<Set<string>>(() => {           // hook 26
    if (!event || participatingSocietyIds.length < 2) return new Set<string>();
    const byUser = new Map<string, MemberDoc[]>();
    for (const m of members) {
      if (!m.user_id) continue;
      const list = byUser.get(m.user_id) ?? [];
      list.push(m);
      byUser.set(m.user_id, list);
    }
    const result = new Set<string>();
    for (const [, list] of byUser) {
      if (list.length > 1) for (const m of list) result.add(m.id);
    }
    return result;
  }, [members, event, participatingSocietyIds.length]);

  // Non-hook aliases
  const permissions = getPermissionsForMember(member as any);
  const selectedCount = selectedPlayerIds.size;

  const loadGuests = useCallback(async () => {                         // hook 27
    if (!eventId) return [];
    const list = await getEventGuests(eventId);
    setGuests(list);
    return list;
  }, [eventId]);

  useEffect(() => {                                                     // hook 28
    let cancelled = false;
    async function load() {
      if (bootstrapLoading) return;
      if (!societyId) { setError("Missing society"); setLoading(false); return; }
      if (!eventId) { setError("Missing event ID"); setLoading(false); return; }
      setLoading(true);
      setError(null);
      try {
        console.log("[EventPlayersScreen] loading", { eventId, societyId });
        const evt = await getEvent(eventId);
        if (cancelled) return;
        const societyIds =
          (evt?.is_joint_event ?? evt?.is_multi_society) && evt?.participatingSocietyIds?.length
            ? evt.participatingSocietyIds
            : [evt?.society_id ?? societyId].filter(Boolean);
        const mems = societyIds.length > 0
          ? await getMembersBySocietyIds(societyIds)
          : await getMembersBySocietyId(societyId);
        const guestList = await getEventGuests(eventId);
        if (cancelled) return;
        setEvent(evt);
        setMembers(mems);
        setGuests(guestList);
        if ((evt?.is_joint_event ?? evt?.is_multi_society) && societyIds.length > 0) {
          const names: Record<string, string> = {};
          await Promise.all(societyIds.map(async (sid) => {
            const s = await getSocietyDoc(sid);
            if (s) names[sid] = s.name ?? "Society";
          }));
          setSocietyNames(names);
          setGuestSocietyId(evt.society_id ?? societyIds[0]);
        }
        const existing = evt?.playerIds ?? [];
        setSelectedPlayerIds(new Set(existing.map(String)));
      } catch (e: any) {
        console.error("[EventPlayersScreen] load FAILED", e);
        if (!cancelled) setError(e?.message ?? "Failed to load players");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [bootstrapLoading, societyId, eventId]);

  // =========================================================================
  // END OF HOOKS — nothing below this line may call a hook.
  // =========================================================================

  // Temporary diagnostic log — printed on every render, before any branch
  console.log("[EventPlayersScreen] render →", {
    component: "EventPlayersScreen",
    "event?.id": event?.id ?? null,
    isJointEvent,
    participatingSocietyIds,
    "eligibleMembers.length": members.length,
    "selectedPlayers.length": selectedCount,
    bootstrapLoading,
    loading,
    error,
  });

  // ---- Early returns: all hooks already called above ----

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
          action={{
            label: "Go Back",
            onPress: () => router.replace({
              pathname: "/event/[id]",
              params: { id: eventId, refresh: Date.now().toString() },
            }),
          }}
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
          action={{
            label: "Go Back",
            onPress: () => router.replace({
              pathname: "/event/[id]",
              params: { id: eventId, refresh: Date.now().toString() },
            }),
          }}
        />
      </Screen>
    );
  }

  // ---- Non-hook helpers (event is guaranteed non-null here) ----

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
    setSaving(true);
    try {
      const ids = Array.from(selectedPlayerIds);
      await updateEvent(event!.id, { playerIds: ids });
      const refreshed = await getEvent(event!.id);
      if (refreshed) console.log("[EventPlayersScreen] confirmed playerIds:", refreshed.playerIds ?? []);
      goBack(router, "/(app)/(tabs)/events");
    } catch (e: any) {
      Alert.alert("Save failed", e?.message ?? JSON.stringify(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleAddGuest() {
    const name = guestName.trim();
    if (!name) { Alert.alert("Name required", "Please enter the guest's name."); return; }
    const repSocietyId = isJointEvent && participatingSocietyIds.length
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
    Alert.alert("Remove Guest", `Remove ${g.name} from this event?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try { await deleteEventGuest(g.id); await loadGuests(); }
          catch (e: any) { Alert.alert("Failed", e?.message ?? "Could not remove guest."); }
        },
      },
    ]);
  }

  // =========================================================================
  // MAIN RENDER
  // Each section is wrapped in a SectionErrorBoundary so the first crashing
  // subtree is identified without blanking the full screen.
  // =========================================================================

  return (
    <Screen>
      {/* ── SECTION: header ─────────────────────────────────────────────── */}
      <SectionErrorBoundary name="header">
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
      </SectionErrorBoundary>

      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }}>

        {/* ── SECTION: society-filter ─────────────────────────────────── */}
        {participatingSocietyIds.length > 1 && (
          <SectionErrorBoundary name="society-filter">
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
          </SectionErrorBoundary>
        )}

        {/* ── SECTION: member-list ────────────────────────────────────── */}
        <SectionErrorBoundary name="member-list">
          <AppText variant="captionBold" color="secondary" style={{ marginBottom: spacing.sm }}>
            Society Members
          </AppText>
          {filteredMembers.length === 0 ? (
            <EmptyState
              title="No members"
              message="Add members first, then you can select players."
              action={{
                label: "Go Back",
                onPress: () => router.replace({
                  pathname: "/event/[id]",
                  params: { id: eventId, refresh: Date.now().toString() },
                }),
              }}
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
                          <AppText style={styles.name}>{m.name || m.displayName || "Member"}</AppText>
                          {isJointEvent && m.society_id && societyNames[m.society_id] && (
                            <View style={{ backgroundColor: colors.primary + "20", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                              <AppText variant="small" style={{ color: colors.primary }}>
                                {societyNames[m.society_id]}
                              </AppText>
                            </View>
                          )}
                        </View>
                        {handicap != null && (
                          <AppText style={styles.subtle}>HCP: {handicap}</AppText>
                        )}
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        {selected && hasAlternates && !event?.isCompleted && isJointEvent && (
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
        </SectionErrorBoundary>

        {/* ── SECTION: guest-list ─────────────────────────────────────── */}
        <SectionErrorBoundary name="guest-list">
          <AppText variant="captionBold" color="secondary" style={{ marginBottom: spacing.sm }}>
            Guest Players
          </AppText>
          <AppText variant="small" color="tertiary" style={{ marginBottom: spacing.sm }}>
            Add guests to include them in the tee sheet. They will appear alongside members.
          </AppText>
          {permissions?.canEditEvents && (
            <SecondaryButton onPress={() => setShowAddGuest(true)} size="sm" style={{ marginBottom: spacing.md }}>
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
                      {isJointEvent && g.society_id && societyNames[g.society_id] && (
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
        </SectionErrorBoundary>

      </ScrollView>

      {/* ── SECTION: add-guest-modal ─────────────────────────────────── */}
      <SectionErrorBoundary name="add-guest-modal">
        <Modal visible={showAddGuest} transparent animationType="fade">
          <Pressable style={styles.modalOverlay} onPress={() => !addingGuest && setShowAddGuest(false)}>
            <Pressable style={[styles.modalContent, { backgroundColor: colors.surface }]} onPress={(e) => e.stopPropagation()}>
              <AppText variant="h2" style={{ marginBottom: spacing.md }}>Add Guest</AppText>

              {isJointEvent && participatingSocietyIds.length > 1 && (
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
                <AppInput placeholder="Guest name" value={guestName} onChangeText={setGuestName} autoCapitalize="words" />
              </View>

              <View style={styles.formField}>
                <AppText variant="caption" style={styles.label}>Sex</AppText>
                <View style={styles.sexRow}>
                  <Pressable
                    onPress={() => setGuestSex("male")}
                    style={[styles.sexOption, { borderColor: guestSex === "male" ? colors.primary : colors.border }, guestSex === "male" && { backgroundColor: colors.primary + "14" }]}
                  >
                    <AppText style={guestSex === "male" ? { color: colors.primary, fontWeight: "600" } : {}}>Male</AppText>
                  </Pressable>
                  <Pressable
                    onPress={() => setGuestSex("female")}
                    style={[styles.sexOption, { borderColor: guestSex === "female" ? colors.primary : colors.border }, guestSex === "female" && { backgroundColor: colors.primary + "14" }]}
                  >
                    <AppText style={guestSex === "female" ? { color: colors.primary, fontWeight: "600" } : {}}>Female</AppText>
                  </Pressable>
                </View>
              </View>

              <View style={styles.formField}>
                <AppText variant="caption" style={styles.label}>Handicap Index</AppText>
                <AppInput placeholder="e.g. 18.5" value={guestHandicap} onChangeText={setGuestHandicap} keyboardType="decimal-pad" />
              </View>

              <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
                <SecondaryButton onPress={() => setShowAddGuest(false)} disabled={addingGuest} style={{ flex: 1 }}>Cancel</SecondaryButton>
                <PrimaryButton onPress={handleAddGuest} loading={addingGuest} style={{ flex: 1 }}>Add</PrimaryButton>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </SectionErrorBoundary>

      {/* ── SECTION: change-society-modal ───────────────────────────── */}
      <SectionErrorBoundary name="change-society-modal">
        <Modal visible={showChangeSociety} transparent animationType="fade">
          <Pressable style={styles.modalOverlay} onPress={() => setShowChangeSociety(false)}>
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
                    style={{ padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.backgroundSecondary, borderWidth: 1, borderColor: colors.border }}
                  >
                    <AppText variant="bodyBold">{societyNames[m.society_id] ?? "Society"}</AppText>
                  </Pressable>
                ))}
              </View>
              <SecondaryButton
                onPress={() => { setShowChangeSociety(false); setChangeSocietyMember(null); setAlternateMembers([]); }}
                style={{ marginTop: spacing.md }}
              >
                Cancel
              </SecondaryButton>
            </Pressable>
          </Pressable>
        </Modal>
      </SectionErrorBoundary>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  titleRow: { flexDirection: "row", alignItems: "center", marginBottom: spacing.lg, gap: spacing.sm },
  row: { padding: spacing.md, flexDirection: "row", alignItems: "center", borderRadius: radius.lg },
  rowSelected: { borderWidth: 1, borderColor: "#0A7C4A" },
  name: { fontSize: typography.body.fontSize, fontWeight: "600" },
  subtle: { marginTop: 4, opacity: 0.7, fontSize: typography.body.fontSize },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: spacing.lg },
  modalContent: { width: "100%", maxWidth: 360, padding: spacing.lg, borderRadius: radius.lg },
  formField: { marginBottom: spacing.base },
  label: { marginBottom: spacing.xs },
  sexRow: { flexDirection: "row", gap: spacing.sm },
  sexOption: { flex: 1, padding: spacing.sm, borderRadius: radius.sm, borderWidth: 1, alignItems: "center" },
});
