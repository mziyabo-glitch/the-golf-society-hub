import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Alert,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { addDoc, collection, doc, serverTimestamp, setDoc } from "firebase/firestore";

import { db, ensureSignedIn, setActiveSocietyId } from "@/lib/firebase";

export default function CreateSocietyScreen() {
  const [name, setName] = useState("");
  const [homeCourse, setHomeCourse] = useState("");
  const [country, setCountry] = useState("UK");
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

      // 0) Ensure we have a signed-in user (anonymous is OK)
      const user = await ensureSignedIn();
      const uid = user.uid;

      // 1) Create society in Firestore
      const societyRef = await addDoc(collection(db, "societies"), {
        name: name.trim(),
        homeCourse: homeCourse.trim() || null,
        country,
        scoringMode,
        createdAt: serverTimestamp(),
        createdBy: uid,
        updatedAt: serverTimestamp(),
      });

      const societyId = societyRef.id;

      // 2) Create the FIRST member (the creator) as Captain/Admin
      // Use uid as the memberId so RBAC and ownership are stable
      await setDoc(doc(db, "societies", societyId, "members", uid), {
        name: user.displayName || "Admin",
        sex: "male", // can be edited later in profile
        handicapIndex: 18, // placeholder; user can update later
        roles: ["captain", "admin"], // IMPORTANT: lowercase roles
        status: "active",
        userId: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // 3) Persist active society ONLINE (Firestore users/{uid}.activeSocietyId)
      await setActiveSocietyId(societyId);

      // 4) Go to members screen (do NOT bounce back)
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
        autoCapitalize="words"
        style={{
          borderWidth: 1,
          borderColor: "rgba(0,0,0,0.15)",
          borderRadius: 12,
          padding: 12,
          marginBottom: 14,
        }}
      />

      <Text style={{ fontWeight: "600", marginBottom: 6 }}>Home Course (optional)</Text>
      <TextInput
        value={homeCourse}
        onChangeText={setHomeCourse}
        placeholder="e.g. Wrag Barn"
        autoCapitalize="words"
        style={{
          borderWidth: 1,
          borderColor: "rgba(0,0,0,0.15)",
          borderRadius: 12,
          padding: 12,
          marginBottom: 14,
        }}
      />

      <Text style={{ fontWeight: "600", marginBottom: 6 }}>Country</Text>
      <TextInput
        value={country}
        onChangeText={setCountry}
        placeholder="UK"
        autoCapitalize="characters"
        style={{
          borderWidth: 1,
          borderColor: "rgba(0,0,0,0.15)",
          borderRadius: 12,
          padding: 12,
          marginBottom: 14,
        }}
      />

      <Text style={{ fontWeight: "600", marginBottom: 6 }}>Scoring Mode</Text>
      <TextInput
        value={scoringMode}
        onChangeText={(v) => {
          const lower = (v || "").toLowerCase();
          if (lower === "stableford" || lower === "strokeplay" || lower === "both") {
            setScoringMode(lower as any);
          } else {
            setScoringMode("stableford");
          }
        }}
        placeholder="stableford | strokeplay | both"
        autoCapitalize="none"
        style={{
          borderWidth: 1,
          borderColor: "rgba(0,0,0,0.15)",
          borderRadius: 12,
          padding: 12,
          marginBottom: 20,
        }}
      />

      <Pressable
        onPress={handleCreate}
        disabled={submitting}
        style={{
          backgroundColor: submitting ? "rgba(0,0,0,0.2)" : "#111",
          padding: 14,
          borderRadius: 14,
          alignItems: "center",
        }}
      >
        {submitting ? (
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <ActivityIndicator color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "700" }}>Creating…</Text>
          </View>
        ) : (
          <Text style={{ color: "#fff", fontWeight: "700" }}>Create Society</Text>
        )}
      </Pressable>

      <Text style={{ marginTop: 14, opacity: 0.6, fontSize: 12 }}>
        This creates your society online and makes you Captain/Admin.
      </Text>
    </ScrollView>
  );
}
