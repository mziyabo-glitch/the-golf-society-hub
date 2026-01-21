import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { ensureSignedIn } from "@/lib/firebase";
import { createMember } from "@/lib/db/memberRepo";
import { createSociety } from "@/lib/db/societyRepo";
import { setActiveSocietyAndMember } from "@/lib/db/userRepo";

export default function CreateSocietyScreen() {
  const router = useRouter();

  const [societyName, setSocietyName] = useState("");
  const [country, setCountry] = useState("United Kingdom");
  const [busy, setBusy] = useState(false);

  const canSubmit = societyName.trim().length >= 2 && country.trim().length >= 2 && !busy;

  const handleCreate = async () => {
    if (!canSubmit) return;

    try {
      setBusy(true);

      const uid = await ensureSignedIn();

      const society = await createSociety({
        name: societyName.trim(),
        country: country.trim(),
        createdBy: uid,
      });

      const member = await createMember({
        societyId: society.id,
        name: "Captain",
        handicap: null,
        roles: ["captain", "admin"],
        status: "active",
        paid: false,
      });

      await setActiveSocietyAndMember(uid, society.id, member.id);

      // ✅ IMPORTANT: route into the authenticated stack
      router.replace("/(tabs)");
    } catch (e: any) {
      console.error("create-society failed:", e);
      Alert.alert("Error", e?.message ?? "Error creating society");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 30 }}>
      <Text style={{ fontSize: 28, fontWeight: "800", marginBottom: 6 }}>
        Create a Society
      </Text>
      <Text style={{ opacity: 0.7, marginBottom: 18 }}>
        Set up your society in under a minute.
      </Text>

      <Text style={{ fontWeight: "700", marginBottom: 8 }}>Society Name *</Text>
      <TextInput
        value={societyName}
        onChangeText={setSocietyName}
        placeholder="e.g. SAGA"
        autoCapitalize="words"
        style={{
          borderWidth: 1,
          borderColor: "rgba(0,0,0,0.15)",
          borderRadius: 12,
          padding: 12,
          marginBottom: 14,
        }}
      />

      <Text style={{ fontWeight: "700", marginBottom: 8 }}>Country</Text>
      <TextInput
        value={country}
        onChangeText={setCountry}
        placeholder="United Kingdom"
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
        onPress={handleCreate}
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
          {busy ? "Creating..." : "Create Society"}
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
