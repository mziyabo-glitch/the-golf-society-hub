import React from "react";
import { View, Text, Pressable, Alert, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";

import { db } from "@/lib/firebase";
import { useBootstrap } from "@/lib/useBootstrap";

export default function HomeTab() {
  const router = useRouter();
  const { userId, activeSocietyId } = useBootstrap();

  const handleResetSociety = () => {
    if (!userId) return;

    Alert.alert(
      "Reset Society",
      "This will remove your active society and return you to the join screen.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            await updateDoc(doc(db, "users", userId), {
              activeSocietyId: null,
              updatedAt: serverTimestamp(),
            });

            router.replace("/join");
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Golf Society Hub</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Active Society</Text>
        <Text style={styles.value}>
          {activeSocietyId ?? "None"}
        </Text>
      </View>

      <Pressable style={styles.resetButton} onPress={handleResetSociety}>
        <Text style={styles.resetText}>Reset Society</Text>
      </Pressable>
    </View>
  );
}

/* ---------------- Styles ---------------- */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
    marginBottom: 24,
  },
  card: {
    backgroundColor: "#f4f4f4",
    padding: 16,
    borderRadius: 10,
    marginBottom: 32,
  },
  label: {
    fontSize: 14,
    color: "#666",
    marginBottom: 6,
  },
  value: {
    fontSize: 16,
    fontWeight: "500",
  },
  resetButton: {
    backgroundColor: "#d32f2f",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  resetText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
