import { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Alert } from "react-native";
import { router } from "expo-router";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";

import { db, setActiveSocietyId } from "@/lib/firebase";

export default function CreateSocietyScreen() {
  const [name, setName] = useState("");
  const [homeCourse, setHomeCourse] = useState("");
  const [country, setCountry] = useState("United Kingdom");
  const [scoringMode, setScoringMode] = useState<"stableford" | "strokeplay" | "both">(
    "stableford"
  );
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert("Validation error", "Society name is required.");
      return;
    }

    try {
      setSubmitting(true);

      // 1️⃣ Create society in Firestore
      const docRef = await addDoc(collection(db, "societies"), {
        name: name.trim(),
        homeCourse: homeCourse.trim() || null,
        country,
        scoringMode,
        createdAt: serverTimestamp(),
      });

      // 2️⃣ CRITICAL FIX — set active society immediately
      setActiveSocietyId(docRef.id);

      // 3️⃣ Redirect into society context
      router.replace("/members");
    } catch (err) {
      console.error("[CreateSociety] Failed:", err);
      Alert.alert("Error", "Failed to create society. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20 }}>
      <Text style={{ fontSize: 28, fontWeight: "700", marginBottom: 8 }}>
        Create a Society
      </Text>

      <Text style={{ opacity: 0.6, marginBottom: 20 }}>
        Set up your society in under a minute.
      </Text>

      <Text style={{ fontWeight: "600", marginBottom: 6 }}>Society Name *</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Society name"
        style={{
          borderWidth: 1,
          borderColor: "#ddd",
          borderRadius: 10,
          padding: 12,
          marginBottom: 16,
        }}
      />

      <Text style={{ fontWeight: "600", marginBottom: 6 }}>Home Course</Text>
      <TextInput
        value={homeCourse}
        onChangeText={setHomeCourse}
        placeholder="Enter home course (optional)"
        style={{
          borderWidth: 1,
          borderColor: "#ddd",
          borderRadius: 10,
          padding: 12,
          marginBottom: 16,
        }}
      />

      <Text style={{ fontWeight: "600", marginBottom: 6 }}>Country</Text>
      <TextInput
        value={country}
        onChangeText={setCountry}
        style={{
          borderWidth: 1,
          borderColor: "#ddd",
          borderRadius: 10,
          padding: 12,
          marginBottom: 16,
        }}
      />

      <Text style={{ fontWeight: "600", marginBottom: 10 }}>Scoring Mode</Text>

      {(["stableford", "strokeplay", "both"] as const).map((mode) => (
        <Pressable
          key={mode}
          onPress={() => setScoringMode(mode)}
          style={{
            padding: 12,
            borderRadius: 10,
            marginBottom: 8,
            backgroundColor: scoringMode === mode ? "#0B6E4F" : "#f3f4f6",
          }}
        >
          <Text
            style={{
              color: scoringMode === mode ? "white" : "#111",
              fontWeight: "600",
              textAlign: "center",
            }}
          >
            {mode === "stableford"
              ? "Stableford"
              : mode === "strokeplay"
              ? "Strokeplay"
              : "Both"}
          </Text>
        </Pressable>
      ))}

      <Pressable
        disabled={submitting}
        onPress={handleCreate}
        style={{
          marginTop: 24,
          backgroundColor: "#0B6E4F",
          padding: 14,
          borderRadius: 12,
          opacity: submitting ? 0.6 : 1,
        }}
      >
        <Text style={{ color: "white", fontWeight: "700", textAlign: "center" }}>
          {submitting ? "Creating…" : "Create Society"}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => router.back()}
        style={{
          marginTop: 12,
          padding: 14,
          borderRadius: 12,
          backgroundColor: "#e5e7eb",
        }}
      >
        <Text style={{ textAlign: "center", fontWeight: "600" }}>Go Back</Text>
      </Pressable>
    </ScrollView>
  );
}
