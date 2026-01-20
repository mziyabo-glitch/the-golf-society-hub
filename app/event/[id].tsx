import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { EmptyState } from "@/components/ui/EmptyState";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { Screen } from "@/components/ui/Screen";
import { SectionHeader } from "@/components/ui/SectionHeader";

import { subscribeEventDoc, updateEventDoc, type EventDoc } from "@/lib/db/eventRepo";
import { subscribeMembersBySociety, type MemberDoc } from "@/lib/db/memberRepo";
import { normalizeMemberRoles } from "@/lib/permissions";
import { spacing } from "@/lib/ui/theme";
import { useBootstrap } from "@/lib/useBootstrap";

type RSVP = "going" | "maybe" | "notGoing";

export default function EventDetailScreen() {
  const { id: eventId } = useLocalSearchParams<{ id: string }>();
  const { user } = useBootstrap();

  const [event, setEvent] = useState<EventDoc | null>(null);
  const [members, setMembers] = useState<MemberDoc[]>([]);
  const [loadingEvent, setLoadingEvent] = useState(true);
  const [loadingMembers, setLoadingMembers] = useState(true);

  useEffect(() => {
    if (!eventId) return;
    setLoadingEvent(true);
    const unsub = subscribeEventDoc(eventId, (doc) => {
      setEvent(doc);
      setLoadingEvent(false);
    });
    return () => unsub();
  }, [eventId]);

  useEffect(() => {
    if (!user?.activeSocietyId) {
      setMembers([]);
      setLoadingMembers(false);
      return;
    }
    setLoadingMembers(true);
    const unsub = subscribeMembersBySociety(user.activeSocietyId, (items) => {
      setMembers(items);
      setLoadingMembers(false);
    });
    return () => unsub();
  }, [user?.activeSocietyId]);

  const currentMember = useMemo(
    () => members.find((m) => m.id === user?.activeMemberId) || null,
    [members, user?.activeMemberId]
  );

  const roles = useMemo(() => normalizeMemberRoles(currentMember?.roles), [currentMember?.roles]);

  const canManagePayments = roles.includes("captain") || roles.includes("treasurer");
  const canManageEvent = roles.includes("captain") || roles.includes("secretary") || roles.includes("handicapper");

  const playerIds = useMemo(() => {
    if (!event) return [];
    if (Array.isArray(event.playerIds) && event.playerIds.length) return event.playerIds;
    return [];
  }, [event]);

  const players = useMemo(() => {
    if (!event) return [];
    if (!playerIds.length) return [];
    return members.filter((m) => playerIds.includes(m.id));
  }, [members, playerIds, event]);

  const myRsvp: RSVP | null = useMemo(() => {
    if (!event || !user?.activeMemberId) return null;
    return (event.rsvps?.[user.activeMemberId] as RSVP) ?? null;
  }, [event, user?.activeMemberId]);

  const setMyRsvp = async (status: RSVP) => {
    if (!event || !user?.activeMemberId) return;
    try {
      const next = { ...(event.rsvps || {}) };
      next[user.activeMemberId] = status;
      await updateEventDoc(event.id, { rsvps: next });
    } catch (e) {
      console.error("RSVP update failed", e);
      Alert.alert("Error", "Failed to update RSVP");
    }
  };

  // ✅ Key function: async + auto-RSVP when marked paid
  const handleToggleEventPayment = async (memberId: string) => {
    if (!event) return;

    try {
      const current = event.payments?.[memberId];
      const newPaidStatus = !(current?.paid ?? false);
      const nowISO = new Date().toISOString();

      const nextPayments = {
        ...(event.payments || {}),
        [memberId]: {
          paid: newPaidStatus,
          paidAtISO: newPaidStatus ? nowISO : undefined,
          method: current?.method ?? "other",
        },
      };

      // Auto-RSVP: if paid, set RSVP going
      const nextRsvps = { ...(event.rsvps || {}) };
      if (newPaidStatus) {
        nextRsvps[memberId] = "going";
      }

      await updateEventDoc(event.id, {
        payments: nextPayments,
        rsvps: nextRsvps,
      });
    } catch (error) {
      console.error("Error toggling payment:", error);
      Alert.alert("Error", "Failed to update payment");
    }
  };

  const handleSetRsvpForMember = async (memberId: string, status: RSVP) => {
    if (!event) return;
    try {
      const next = { ...(event.rsvps || {}) };
      next[memberId] = status;
      await updateEventDoc(event.id, { rsvps: next });
    } catch (e) {
      console.error("RSVP set for member failed", e);
      Alert.alert("Error", "Failed to update RSVP");
    }
  };

  const goToResults = () => router.push(`/event/${eventId}/results` as any);

  if (loadingEvent || loadingMembers) {
    return (
      <Screen>
        <View style={[styles.container, styles.center]}>
          <ActivityIndicator />
          <Text style={{ marginTop: 10 }}>Loading event…</Text>
        </View>
      </Screen>
    );
  }

  if (!event) {
    return (
      <Screen>
        <EmptyState title="Event not found" description="This event may have been deleted." />
        <View style={{ padding: 16 }}>
          <SecondaryButton title="Back" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <SectionHeader title={event.name ?? "Event"} subtitle={event.date ?? ""} />

        <AppCard style={styles.card}>
          <AppText style={styles.rowLabel}>Venue</AppText>
          <AppText>{event.venueName ?? event.courseName ?? "—"}</AppText>

          <View style={{ height: spacing.md }} />

          <AppText style={styles.rowLabel}>Status</AppText>
          <AppText>{event.status ?? "scheduled"}</AppText>
        </AppCard>

        {/* ✅ RSVP for member */}
        <AppCard style={styles.card}>
          <AppText style={styles.sectionTitle}>RSVP</AppText>

          {!user?.activeMemberId ? (
            <AppText>You are not linked to a member profile.</AppText>
          ) : (
            <View style={styles.rsvpRow}>
              <Pressable
                onPress={() => setMyRsvp("going")}
                style={[styles.rsvpBtn, myRsvp === "going" && styles.rsvpActive]}
              >
                <Text style={[styles.rsvpText, myRsvp === "going" && styles.rsvpTextActive]}>Going</Text>
              </Pressable>

              <Pressable
                onPress={() => setMyRsvp("maybe")}
                style={[styles.rsvpBtn, myRsvp === "maybe" && styles.rsvpActive]}
              >
                <Text style={[styles.rsvpText, myRsvp === "maybe" && styles.rsvpTextActive]}>Maybe</Text>
              </Pressable>

              <Pressable
                onPress={() => setMyRsvp("notGoing")}
                style={[styles.rsvpBtn, myRsvp === "notGoing" && styles.rsvpActive]}
              >
                <Text style={[styles.rsvpText, myRsvp === "notGoing" && styles.rsvpTextActive]}>Not Going</Text>
              </Pressable>
            </View>
          )}
        </AppCard>

        {/* ✅ Players + payments */}
        <AppCard style={styles.card}>
          <AppText style={styles.sectionTitle}>Players</AppText>

          {players.length === 0 ? (
            <AppText style={{ opacity: 0.7 }}>
              No players selected yet.
            </AppText>
          ) : (
            players.map((p) => {
              const paid = !!event.payments?.[p.id]?.paid;
              const rsvp = (event.rsvps?.[p.id] as RSVP) ?? null;

              return (
                <View key={p.id} style={styles.playerRow}>
                  <View style={{ flex: 1 }}>
                    <AppText style={{ fontWeight: "700" }}>{p.name}</AppText>
                    <AppText style={{ opacity: 0.7, marginTop: 2 }}>
                      RSVP: {rsvp ?? "—"} • Paid: {paid ? "Yes" : "No"}
                    </AppText>
                  </View>

                  {canManagePayments && (
                    <Pressable
                      onPress={() => handleToggleEventPayment(p.id)}
                      style={[styles.payBtn, paid ? styles.payBtnPaid : styles.payBtnUnpaid]}
                    >
                      <Text style={styles.payBtnText}>{paid ? "Paid" : "Mark Paid"}</Text>
                    </Pressable>
                  )}

                  {(canManagePayments || canManageEvent) && (
                    <Pressable
                      onPress={() =>
                        Alert.alert(
                          "Set RSVP",
                          `Set RSVP for ${p.name}`,
                          [
                            { text: "Cancel", style: "cancel" },
                            { text: "Going", onPress: () => handleSetRsvpForMember(p.id, "going") },
                            { text: "Maybe", onPress: () => handleSetRsvpForMember(p.id, "maybe") },
                            { text: "Not Going", onPress: () => handleSetRsvpForMember(p.id, "notGoing") },
                          ]
                        )
                      }
                      style={styles.rsvpManageBtn}
                    >
                      <Text style={styles.rsvpManageText}>RSVP</Text>
                    </Pressable>
                  )}
                </View>
              );
            })
          )}
        </AppCard>

        {/* ✅ Results (no score entry) */}
        <View style={{ paddingHorizontal: 16, marginTop: spacing.md }}>
          <PrimaryButton title="Enter Results & Publish" onPress={goToResults} disabled={!canManageEvent} />
          <View style={{ height: spacing.sm }} />
          <SecondaryButton title="Back" onPress={() => router.back()} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  card: { marginHorizontal: 16, marginTop: 12, padding: 16 },
  rowLabel: { fontWeight: "700", opacity: 0.7, marginBottom: 4 },
  sectionTitle: { fontSize: 16, fontWeight: "800", marginBottom: 10 },

  rsvpRow: { flexDirection: "row", gap: 10 },
  rsvpBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  rsvpActive: { backgroundColor: "#111827", borderColor: "#111827" },
  rsvpText: { fontWeight: "800", color: "#111827" },
  rsvpTextActive: { color: "#fff" },

  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  payBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  payBtnPaid: { backgroundColor: "#0B6B4F" },
  payBtnUnpaid: { backgroundColor: "#111827" },
  payBtnText: { color: "#fff", fontWeight: "800" },

  rsvpManageBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  rsvpManageText: { fontWeight: "800" },
});
