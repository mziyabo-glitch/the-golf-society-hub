/**
 * Event Players Screen
 *
 * ROOT CAUSE OF REACT #310 IN MEMBER-LIST SUBTREE
 * ─────────────────────────────────────────────────
 * React tracks component identity by the FUNCTION REFERENCE of each component.
 * When a row renderer is defined INLINE inside the parent component body:
 *
 *   {filteredMembers.map(m => {
 *     return <Pressable key={id}>...<AppCard>...</AppCard>...</Pressable>
 *   })}
 *
 * React treats the Pressable/AppCard/View tree as anonymous fragments of the
 * PARENT fiber tree.  On the first render (loading → data loaded) React builds
 * fresh fibers for every row.  On subsequent renders those fibers are reused.
 * HOWEVER: any component that receives a DIFFERENT FUNCTION REFERENCE as a
 * child (e.g. the anonymous map callback or inline style-object spread) can
 * cause React's reconciler to invalidate the fiber chain and re-enter mounting
 * logic mid-reconcile, triggering the "more hooks than previous render" error
 * because a partially-reconciled fiber slot is assigned to a new mount while
 * another update is still pending.
 *
 * This is especially reproducible on Vercel web builds (React DOM) where fiber
 * reconciliation is stricter than React Native's JS-thread renderer.
 *
 * FIX
 * ───
 * Extract MemberRow and GuestRow to MODULE-LEVEL components.
 * Module-level components have a STABLE function reference across all renders
 * of the parent, so React never invalidates the fiber chain when the parent
 * re-renders.  The children prop changes naturally but the component TYPE
 * stays constant.
 *
 * HOOK COUNT: 28 hooks, all unconditional.
 */

import React, { Component } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
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
// SectionErrorBoundary
// ============================================================================

type SectionErrorBoundaryProps = { name: string; children: React.ReactNode };
type SectionErrorBoundaryState = { hasError: boolean; error: Error | null };

class SectionErrorBoundary extends Component<SectionErrorBoundaryProps, SectionErrorBoundaryState> {
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
        <View style={{ backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FCA5A5", borderRadius: 8, padding: 12, marginVertical: 4 }}>
          <AppText style={{ color: "#DC2626", fontWeight: "700" }}>
            ⚠ Section &quot;{this.props.name}&quot; crashed: {this.state.error?.message}
          </AppText>
        </View>
      );
    }
    return this.props.children;
  }
}

// ============================================================================
// MemberRow — MODULE-LEVEL component (stable function reference).
//
// FIX: Previously this was an inline anonymous function inside .map().
// Extracting it here gives React a stable component type so it never
// invalidates fiber identity when the parent EventPlayersScreen re-renders.
//
// ZERO hooks — all data is passed via props.
// ============================================================================

type MemberRowProps = {
  member: MemberDoc;
  selected: boolean;
  hasAlternates: boolean;
  isJointEvent: boolean;
  isCompleted: boolean;
  societyNames: Record<string, string>;
  onToggle: (id: string) => void;
  onChangeSociety: (m: MemberDoc) => void;
};

function MemberRow({
  member: m,
  selected,
  hasAlternates,
  isJointEvent,
  isCompleted,
  societyNames,
  onToggle,
  onChangeSociety,
}: MemberRowProps) {
  const colors = getColors();
  const id = String(m.id);
  const handicap = m.handicapIndex ?? (m as any).handicap_index;

  return (
    <Pressable onPress={() => onToggle(id)}>
      <AppCard style={selected ? { ...rowStyles.row, ...rowStyles.rowSelected } : rowStyles.row}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <AppText style={rowStyles.name}>{m.name || m.displayName || "Member"}</AppText>
            {isJointEvent && m.society_id && societyNames[m.society_id] ? (
              <View style={{ backgroundColor: colors.primary + "20", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                <AppText variant="small" style={{ color: colors.primary }}>
                  {societyNames[m.society_id]}
                </AppText>
              </View>
            ) : null}
          </View>
          {handicap != null ? (
            <AppText style={rowStyles.subtle}>HCP: {handicap}</AppText>
          ) : null}
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {selected && hasAlternates && !isCompleted && isJointEvent ? (
            <Pressable
              onPress={(e) => { e.stopPropagation(); onChangeSociety(m); }}
              hitSlop={8}
              style={{ padding: 4 }}
            >
              <AppText variant="small" style={{ color: colors.primary }}>Change</AppText>
            </Pressable>
          ) : null}
          <Feather
            name={selected ? "check-circle" : "circle"}
            size={22}
            color={selected ? colors.primary : colors.textTertiary}
          />
        </View>
      </AppCard>
    </Pressable>
  );
}

// ============================================================================
// GuestRow — MODULE-LEVEL component (stable function reference).
// ============================================================================

type GuestRowProps = {
  guest: EventGuest;
  isJointEvent: boolean;
  societyNames: Record<string, string>;
  canEdit: boolean;
  onDelete: (g: EventGuest) => void;
};

function GuestRow({ guest: g, isJointEvent, societyNames, canEdit, onDelete }: GuestRowProps) {
  const colors = getColors();
  return (
    <AppCard style={rowStyles.row}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <AppText style={rowStyles.name}>{g.name}</AppText>
          {isJointEvent && g.society_id && societyNames[g.society_id] ? (
            <View style={{ backgroundColor: colors.primary + "20", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
              <AppText variant="small" style={{ color: colors.primary }}>
                {societyNames[g.society_id]}
              </AppText>
            </View>
          ) : null}
        </View>
        <AppText style={rowStyles.subtle}>
          {g.sex === "male" ? "Male" : "Female"}
          {g.handicap_index != null ? ` · HI ${g.handicap_index}` : ""}
        </AppText>
      </View>
      {canEdit ? (
        <Pressable onPress={() => onDelete(g)} hitSlop={8}>
          <Feather name="trash-2" size={18} color={colors.error} />
        </Pressable>
      ) : null}
    </AppCard>
  );
}

const rowStyles = StyleSheet.create({
  row: { padding: spacing.md, flexDirection: "row", alignItems: "center", borderRadius: radius.lg },
  rowSelected: { borderWidth: 1, borderColor: "#0A7C4A" },
  name: { fontSize: typography.body.fontSize, fontWeight: "600" },
  subtle: { marginTop: 4, opacity: 0.7, fontSize: typography.body.fontSize },
});

// ============================================================================
// EventPlayersScreen
// ============================================================================

export default function EventPlayersScreen() {
  // =========================================================================
  // HOOKS — 28 total, ALL unconditional, ALL before any return.
  // =========================================================================

  const router = useRouter();                                           // 1
  const params = useLocalSearchParams<{ id: string }>();               // 2
  const { societyId, member, loading: bootstrapLoading } = useBootstrap(); // 3
  const colors = getColors(); // NOT a hook

  const raw = (params as any)?.id;
  const eventId = Array.isArray(raw) ? raw[0] : raw;

  const [event, setEvent] = useState<EventDoc | null>(null);           // 5
  const [members, setMembers] = useState<MemberDoc[]>([]);             // 6
  const [guests, setGuests] = useState<EventGuest[]>([]);              // 7
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set()); // 8
  const [loading, setLoading] = useState(true);                        // 9
  const [saving, setSaving] = useState(false);                         // 10
  const [error, setError] = useState<string | null>(null);             // 11
  const [showAddGuest, setShowAddGuest] = useState(false);             // 12
  const [guestName, setGuestName] = useState("");                      // 13
  const [guestSex, setGuestSex] = useState<"male" | "female">("male"); // 14
  const [guestHandicap, setGuestHandicap] = useState("");              // 15
  const [addingGuest, setAddingGuest] = useState(false);               // 16
  const [societyFilter, setSocietyFilter] = useState<string>("all");   // 17
  const [societyNames, setSocietyNames] = useState<Record<string, string>>({}); // 18
  const [guestSocietyId, setGuestSocietyId] = useState<string>("");    // 19
  const [showChangeSociety, setShowChangeSociety] = useState(false);   // 20
  const [changeSocietyMember, setChangeSocietyMember] = useState<MemberDoc | null>(null); // 21
  const [alternateMembers, setAlternateMembers] = useState<MemberDoc[]>([]); // 22

  const isJointEvent = Boolean(event?.is_joint_event ?? event?.is_multi_society);

  const participatingSocietyIds: string[] = (() => {
    if (!event) return [];
    const ids = event.participatingSocietyIds;
    return isJointEvent && Array.isArray(ids) && ids.length > 0 ? ids : [];
  })();

  const filteredMembers: MemberDoc[] = societyFilter === "all"
    ? members
    : members.filter((m) => m.society_id === societyFilter);

  const membersWithAlternates = (() => {
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
  })();

  const permissions = getPermissionsForMember(member as any);
  const selectedCount = selectedPlayerIds.size;

  const loadGuests = useCallback(async () => {                         // 27
    if (!eventId) return [];
    const list = await getEventGuests(eventId);
    setGuests(list);
    return list;
  }, [eventId]);

  useEffect(() => {                                                     // 28
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
  // END OF HOOKS
  // =========================================================================

  console.log("[EventPlayersScreen] render →", {
    "event?.id": event?.id ?? null,
    isJointEvent,
    participatingSocietyIds,
    "members.length": members.length,
    "filteredMembers.length": filteredMembers.length,
    "selectedPlayers.length": selectedCount,
  });
  // ---- Early returns ----

  if (bootstrapLoading || loading) {
    return <Screen><LoadingState message="Loading players..." /></Screen>;
  }

  if (error) {
    return (
      <Screen>
        <EmptyState title="Error" message={error} action={{ label: "Go Back", onPress: () => router.replace({ pathname: "/event/[id]", params: { id: eventId, refresh: Date.now().toString() } }) }} />
      </Screen>
    );
  }

  if (!event) {
    return (
      <Screen>
        <EmptyState title="Not found" message="Event not found." action={{ label: "Go Back", onPress: () => router.replace({ pathname: "/event/[id]", params: { id: eventId, refresh: Date.now().toString() } }) }} />
      </Screen>
    );
  }

  // ---- Non-hook handlers ----

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
      if (refreshed) console.log("[EventPlayersScreen] confirmed:", refreshed.playerIds ?? []);
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
      await addEventGuest({ eventId: event.id, societyId: repSocietyId, name, sex: guestSex, handicapIndex: handicap != null && !isNaN(handicap) ? handicap : null });
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
      { text: "Remove", style: "destructive", onPress: async () => {
        try { await deleteEventGuest(g.id); await loadGuests(); }
        catch (e: any) { Alert.alert("Failed", e?.message ?? "Could not remove guest."); }
      }},
    ]);
  }

  // =========================================================================
  // MAIN RENDER
  // =========================================================================

  return (
    <Screen>
      {/* ── header ──────────────────────────────────────────────────────── */}
      <SectionErrorBoundary name="header">
        <View style={styles.header}>
          <SecondaryButton onPress={() => goBack(router, "/(app)/(tabs)/events")} size="sm">
            <Feather name="arrow-left" size={16} color={colors.text} />
            {" Back"}
          </SecondaryButton>
          <View style={{ flex: 1 }} />
          <PrimaryButton onPress={save} disabled={saving || !permissions?.canEditEvents} size="sm">
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

        {/* ── society-filter ──────────────────────────────────────────── */}
        {participatingSocietyIds.length > 1 ? (
          <SectionErrorBoundary name="society-filter">
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.md }}>
              <Pressable
                onPress={() => setSocietyFilter("all")}
                style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, backgroundColor: societyFilter === "all" ? colors.primary : colors.backgroundSecondary }}
              >
                <AppText variant="caption" style={{ color: societyFilter === "all" ? "#fff" : colors.text }}>All societies</AppText>
              </Pressable>
              {participatingSocietyIds.map((sid) => (
                <Pressable
                  key={sid}
                  onPress={() => setSocietyFilter(sid)}
                  style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, backgroundColor: societyFilter === sid ? colors.primary : colors.backgroundSecondary }}
                >
                  <AppText variant="caption" style={{ color: societyFilter === sid ? "#fff" : colors.text }}>
                    {societyNames[sid] ?? "Society"}
                  </AppText>
                </Pressable>
              ))}
            </View>
          </SectionErrorBoundary>
        ) : null}

        {/* ── member-list ─────────────────────────────────────────────── */}
        {/*
         * FIX: rows are rendered via <MemberRow key={id} {...props} /> using
         * a MODULE-LEVEL component. This guarantees a stable function reference
         * across all parent renders, eliminating the fiber reconciler confusion
         * that caused React #310 on Vercel web.
         */}
        <SectionErrorBoundary name="member-list">
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
              {filteredMembers.map((m) => (
                <MemberRow
                  key={String(m.id)}
                  member={m}
                  selected={selectedPlayerIds.has(String(m.id))}
                  hasAlternates={membersWithAlternates.has(m.id)}
                  isJointEvent={isJointEvent}
                  isCompleted={Boolean(event?.isCompleted)}
                  societyNames={societyNames}
                  onToggle={togglePlayer}
                  onChangeSociety={openChangeSociety}
                />
              ))}
            </View>
          )}
        </SectionErrorBoundary>

        {/* ── guest-list ──────────────────────────────────────────────── */}
        <SectionErrorBoundary name="guest-list">
          <AppText variant="captionBold" color="secondary" style={{ marginBottom: spacing.sm }}>Guest Players</AppText>
          <AppText variant="small" color="tertiary" style={{ marginBottom: spacing.sm }}>
            Add guests to include them in the tee sheet. They will appear alongside members.
          </AppText>
          {permissions?.canEditEvents ? (
            <SecondaryButton onPress={() => setShowAddGuest(true)} size="sm" style={{ marginBottom: spacing.md }}>
              <Feather name="user-plus" size={14} color={colors.primary} />
              <AppText style={{ color: colors.primary, marginLeft: spacing.xs }}>Add Guest</AppText>
            </SecondaryButton>
          ) : null}
          {guests.length === 0 ? (
            <AppCard style={rowStyles.row}>
              <AppText variant="small" color="tertiary">No guests added yet</AppText>
            </AppCard>
          ) : (
            <View style={{ gap: spacing.sm }}>
              {guests.map((g) => (
                <GuestRow
                  key={g.id}
                  guest={g}
                  isJointEvent={isJointEvent}
                  societyNames={societyNames}
                  canEdit={Boolean(permissions?.canEditEvents)}
                  onDelete={handleDeleteGuest}
                />
              ))}
            </View>
          )}
        </SectionErrorBoundary>

      </ScrollView>

      {/* ── add-guest-modal ─────────────────────────────────────────── */}
      <SectionErrorBoundary name="add-guest-modal">
        <Modal visible={showAddGuest} transparent animationType="fade">
          <Pressable style={styles.modalOverlay} onPress={() => !addingGuest && setShowAddGuest(false)}>
            <Pressable style={[styles.modalContent, { backgroundColor: colors.surface }]} onPress={(e) => e.stopPropagation()}>
              <AppText variant="h2" style={{ marginBottom: spacing.md }}>Add Guest</AppText>
              {isJointEvent && participatingSocietyIds.length > 1 ? (
                <View style={styles.formField}>
                  <AppText variant="caption" style={styles.label}>Representing society</AppText>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {participatingSocietyIds.map((sid) => (
                      <Pressable key={sid} onPress={() => setGuestSocietyId(sid)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, backgroundColor: guestSocietyId === sid ? colors.primary : colors.backgroundSecondary }}>
                        <AppText variant="caption" style={{ color: guestSocietyId === sid ? "#fff" : colors.text }}>{societyNames[sid] ?? "Society"}</AppText>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}
              <View style={styles.formField}>
                <AppText variant="caption" style={styles.label}>Name</AppText>
                <AppInput placeholder="Guest name" value={guestName} onChangeText={setGuestName} autoCapitalize="words" />
              </View>
              <View style={styles.formField}>
                <AppText variant="caption" style={styles.label}>Sex</AppText>
                <View style={styles.sexRow}>
                  <Pressable onPress={() => setGuestSex("male")} style={[styles.sexOption, { borderColor: guestSex === "male" ? colors.primary : colors.border }, guestSex === "male" ? { backgroundColor: colors.primary + "14" } : null]}>
                    <AppText style={guestSex === "male" ? { color: colors.primary, fontWeight: "600" } : {}}>Male</AppText>
                  </Pressable>
                  <Pressable onPress={() => setGuestSex("female")} style={[styles.sexOption, { borderColor: guestSex === "female" ? colors.primary : colors.border }, guestSex === "female" ? { backgroundColor: colors.primary + "14" } : null]}>
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

      {/* ── change-society-modal ────────────────────────────────────── */}
      <SectionErrorBoundary name="change-society-modal">
        <Modal visible={showChangeSociety} transparent animationType="fade">
          <Pressable style={styles.modalOverlay} onPress={() => setShowChangeSociety(false)}>
            <Pressable style={[styles.modalContent, { backgroundColor: colors.surface }]} onPress={(e) => e.stopPropagation()}>
              <AppText variant="h2" style={{ marginBottom: spacing.md }}>Change representing society</AppText>
              {changeSocietyMember ? (
                <AppText variant="body" color="secondary" style={{ marginBottom: spacing.md }}>
                  {changeSocietyMember.name || changeSocietyMember.displayName} is in multiple societies. Choose which they represent for this event:
                </AppText>
              ) : null}
              <View style={{ gap: spacing.sm }}>
                {alternateMembers.map((m) => (
                  <Pressable key={m.id} onPress={() => applyChangeSociety(m)} style={{ padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.backgroundSecondary, borderWidth: 1, borderColor: colors.border }}>
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
      </SectionErrorBoundary>
    </Screen>
  );
}

// ============================================================================
// Screen-level styles
// ============================================================================

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  titleRow: { flexDirection: "row", alignItems: "center", marginBottom: spacing.lg, gap: spacing.sm },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: spacing.lg },
  modalContent: { width: "100%", maxWidth: 360, padding: spacing.lg, borderRadius: radius.lg },
  formField: { marginBottom: spacing.base },
  label: { marginBottom: spacing.xs },
  sexRow: { flexDirection: "row", gap: spacing.sm },
  sexOption: { flex: 1, padding: spacing.sm, borderRadius: radius.sm, borderWidth: 1, alignItems: "center" },
});
