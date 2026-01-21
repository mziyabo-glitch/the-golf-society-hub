import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";

import { ensureSignedIn } from "@/lib/firebase";
import { createMember } from "@/lib/db/memberRepo";
import { getSocietyDoc } from "@/lib/db/societyRepo";
import { setActiveSocietyAndMember } from "@/lib/db/userRepo";

export default function JoinSocietyScreen() {
  const router = useRouter();

  const [societyId, setSocietyId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);

  const canSubmit = useMemo(() => {
    return societyId.trim().length >= 6 && displayName.trim().length >= 2 && !busy;
  }, [societyId, displayName, busy]);

  const handleJoin = async () => {
    if (!canSubmit) return;

    try {
      setBusy(true);

      const uid = await ensureSignedIn();
      const id = societyId.trim();

      const society = await getSocietyDoc(id);
      if (!society) {
        Alert.alert("Not found", "That Society ID does not exist.");
        return;
      }

      const member = await createMember({
        societyId: id,
        name: displayName.trim(),
        handicap: null,
        roles: ["member"],
        status: "active",
        paid: false,
      });

      await setActiveSocietyAndMember(uid, id, member.id);

      // ✅ IMPORTANT: route into the authenticated stack
      router.replace("/(tabs)");
    } catch (e: any) {
      console.error("join-society failed:", e);
      Alert.alert("Error", e?.message ?? "Could not join society");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 30 }}>
      <Text style={{ fontSize: 28, fontWeight: "800", marginBottom: 6 }}>
        Join a Society
      </Text>
      <Text style={{ opacity: 0.7, marginBottom: 18 }}>
        Enter the Society ID given by your Captain.
      </Text>

      <Text style={{ fontWeight: "700", marginBottom: 8 }}>Society ID</Text>
      <TextInput
        value={societyId}
        onChangeText={setSocietyId}
        placeholder="e.g. AbC123XyZ"
        autoCapitalize="none"
        style={{
          borderWidth: 1,
          borderColor: "rgba(0,0,0,0.15)",
          borderRadius: 12,
          padding: 12,
          marginBottom: 14,
        }}
      />

      <Text style={{ fontWeight: "700", marginBottom: 8 }}>Your Name</Text>
      <TextInput
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="e.g. Brian Dube"
        autoCapitalize="words"
        style={{
          borderWidth: 1,
          borderColor: "rgba(0,0,0,0.15)",
          borderRadius: 12,
          padding: 12,
          marginBottom: 18,
        }}
      />

      <Pressable
        onPress={handleJoin}
        disabled={!canSubmit}
        style={{
          backgroundColor: canSubmit ? "#2F6F62" : "rgba(47,111,98,0.35)",
          paddingVertical: 14,
          borderRadius: 14,
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>
          {busy ? "Joining..." : "Join Society"}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => router.back()}
        style={{
          backgroundColor: "#0F172A",
          paddingVertical: 14,
          borderRadius: 14,
          alignItems: "center",
        }}
      >
        <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>
          Back
        </Text>
      </Pressable>
    </ScrollView>
  );
}
