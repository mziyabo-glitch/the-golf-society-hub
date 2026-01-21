import React, { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";

import { db } from "@/lib/firebase";
import { useBootstrap } from "@/lib/useBootstrap";
import { subscribeMembersBySociety, type MemberDoc } from "@/lib/db/memberRepo";

type EventDocLite = {
  id: string;
  societyId: string;
  name: string; // ✅ repo uses "name" not "title"
  rsvps?: Record<string, boolean>;
  payments?: Record<string, { paid: boolean }>;
};

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useBootstrap();

  const [event, setEvent] = useState<EventDocLite | null>(null);
  const [eventLoading, setEventLoading] = useState(true);

  const [members, setMembers] = useState<MemberDoc[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);

  const canToggle = !!user?.uid;

  /* -----------------------------
   * Subscribe to EVENT
   * ----------------------------- */
  useEffect(() => {
    if (!id) return;

    setEventLoading(true);

    return onSnapshot(doc(db, "events", id), (snap) => {
      if (!snap.exists()) {
        setEvent(null);
        setEventLoading(false);
        return;
      }

      const data = snap.data() as any;

      setEvent({
        id: snap.id,
        societyId: data.societyId,
        name: data.name ?? data.title ?? "Event", // ✅ safe fallback
        rsvps: data.rsvps ?? {},
        payments: data.payments ?? {},
      });

      setEventLoading(false);
    });
  }, [id]);

  /* -----------------------------
   * Subscribe to MEMBERS by societyId
   * ✅ Uses event.societyId (best) or user.activeSocietyId fallback
   * ----------------------------- */
  const societyIdForMembers = useMemo(() => {
    return event?.societyId ?? user?.activeSocietyId ?? null;
  }, [event?.societyId, user?.activeSocietyId]);

  useEffect(() => {
    if (!societyIdForMembers) {
      // We don't have a society id yet; keep waiting
      setMembers([]);
      setMembersLoading(true);
      return;
    }

    setMembersLoading(true);

    return subscribeMembersBySociety(
      societyIdForMembers,
      (items) => {
        setMembers(items);
        setMembersLoading(false);
      },
      (err) => {
        console.error("subscribeMembersBySociety error:", err);
        setMembers([]);
        setMembersLoading(false);
      }
    );
  }, [societyIdForMembers]);

  /* -----------------------------
   * Toggle RSVP
   * ----------------------------- */
  const toggleRSVP = async (memberId: string) => {
    if (!event || !canToggle) return;
    const next = !(event.rsvps?.[memberId] ?? false);

    await updateDoc(doc(db, "events", event.id), {
      [`rsvps.${memberId}`]: next,
    });
  };

  /* -----------------------------
   * Toggle Payment (auto-RSVP)
   * ----------------------------- */
  const togglePayment = async (memberId: string) => {
    if (!event || !canToggle) return;

    const paid = !(event.payments?.[memberId]?.paid ?? false);

    await updateDoc(doc(db, "events", event.id), {
      [`payments.${memberId}`]: { paid },
      [`rsvps.${memberId}`]: true,
    });
  };

  const loading = eventLoading || membersLoading;

  if (loading) {
    return (
      <View style={styles.center}>
        <Text>Loading event…</Text>
      </View>
    );
  }

  if (!event) {
    return (
      <View style={styles.center}>
        <Text style={{ fontWeight: "700" }}>Event not found</Text>
        <Text style={{ opacity: 0.7, marginTop: 6 }}>
          It may have been deleted or you don’t have access.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{event.name}</Text>

      {members.length === 0 ? (
        <Text style={{ opacity: 0.7 }}>No members found for this society.</Text>
      ) : (
        members.map((m) => {
          const rsvp = event.rsvps?.[m.id] ?? false;
          const paid = event.payments?.[m.id]?.paid ?? false;

          return (
            <View key={m.id} style={styles.row}>
              <Text style={styles.name}>{m.name}</Text>

              <Pressable
                style={[styles.badge, rsvp && styles.badgeActive]}
                onPress={() => toggleRSVP(m.id)}
                disabled={!canToggle}
              >
                <Text style={styles.badgeText}>{rsvp ? "RSVP ✓" : "RSVP"}</Text>
              </Pressable>

              <Pressable
                style={[styles.badge, paid && styles.badgePaid]}
                onPress={() => togglePayment(m.id)}
                disabled={!canToggle}
              >
                <Text style={styles.badgeText}>{paid ? "Paid ✓" : "Mark Paid"}</Text>
              </Pressable>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  name: {
    flex: 1,
    fontSize: 16,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#ddd",
    marginLeft: 8,
  },
  badgeActive: {
    backgroundColor: "#4caf50",
  },
  badgePaid: {
    backgroundColor: "#2196f3",
  },
  badgeText: {
    color: "#000",
    fontSize: 12,
  },
});
