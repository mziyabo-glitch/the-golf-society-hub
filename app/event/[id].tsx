import React, { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";

import { db } from "@/lib/firebase";
import { useBootstrap } from "@/lib/useBootstrap";

/**
 * Event screen – RESULTS + RSVP + PAYMENTS
 * No scoring entry (by design)
 */

type Member = {
  id: string;
  name: string;
};

type EventDoc = {
  id: string;
  societyId: string;
  title: string;
  rsvps?: Record<string, boolean>;
  payments?: Record<string, { paid: boolean }>;
};

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, activeSocietyId } = useBootstrap();

  const [event, setEvent] = useState<EventDoc | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  /* -----------------------------
   * Subscribe to EVENT
   * ----------------------------- */
  useEffect(() => {
    if (!id) return;

    return onSnapshot(doc(db, "events", id), (snap) => {
      if (!snap.exists()) {
        setEvent(null);
        return;
      }

      setEvent({
        id: snap.id,
        ...(snap.data() as any),
      });
    });
  }, [id]);

  /* -----------------------------
   * Subscribe to MEMBERS (by society)
   * ----------------------------- */
  useEffect(() => {
    if (!activeSocietyId) return;

    return onSnapshot(
      doc(db, "societies", activeSocietyId),
      async (socSnap) => {
        const memberIds: string[] = socSnap.data()?.memberIds || [];
        if (!memberIds.length) {
          setMembers([]);
          setLoading(false);
          return;
        }

        const resolved: Member[] = [];
        for (const memberId of memberIds) {
          const mSnap = await import("firebase/firestore").then(({ getDoc }) =>
            getDoc(doc(db, "members", memberId))
          );

          if (mSnap.exists()) {
            resolved.push({
              id: mSnap.id,
              name: mSnap.data().name,
            });
          }
        }

        setMembers(resolved);
        setLoading(false);
      }
    );
  }, [activeSocietyId]);

  /* -----------------------------
   * Toggle RSVP
   * ----------------------------- */
  const toggleRSVP = async (memberId: string) => {
    if (!event) return;

    const next = !(event.rsvps?.[memberId] ?? false);

    await updateDoc(doc(db, "events", event.id), {
      [`rsvps.${memberId}`]: next,
    });
  };

  /* -----------------------------
   * Toggle Payment (auto-RSVP)
   * ----------------------------- */
  const togglePayment = async (memberId: string) => {
    if (!event) return;

    const paid = !(event.payments?.[memberId]?.paid ?? false);

    await updateDoc(doc(db, "events", event.id), {
      [`payments.${memberId}`]: { paid },
      [`rsvps.${memberId}`]: true, // auto RSVP
    });
  };

  if (loading || !event) {
    return (
      <View style={styles.center}>
        <Text>Loading event…</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{event.title}</Text>

      {members.map((m) => {
        const rsvp = event.rsvps?.[m.id] ?? false;
        const paid = event.payments?.[m.id]?.paid ?? false;

        return (
          <View key={m.id} style={styles.row}>
            <Text style={styles.name}>{m.name}</Text>

            <Pressable
              style={[styles.badge, rsvp && styles.badgeActive]}
              onPress={() => toggleRSVP(m.id)}
            >
              <Text style={styles.badgeText}>
                {rsvp ? "RSVP ✓" : "RSVP"}
              </Text>
            </Pressable>

            <Pressable
              style={[styles.badge, paid && styles.badgePaid]}
              onPress={() => togglePayment(m.id)}
            >
              <Text style={styles.badgeText}>
                {paid ? "Paid £✓" : "Mark Paid"}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
}

/* -----------------------------
 * Styles
 * ----------------------------- */
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
