import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { ensureSignedIn } from "@/lib/firebase";
import { getSocietyDoc } from "@/lib/db/societyRepo";
import { createMember } from "@/lib/db/memberRepo";
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
    const sid = societyId.trim();
    const name = displayName.trim();

    if (sid.length < 6) {
      Alert.alert("Invalid Society ID", "Please paste a valid society ID.");
      return;
    }
    if (name.length < 2) {
      Alert.alert("Your name", "Please enter your name.");
      return;
    }

    setBusy(true);
    try {
      const uid = await ensureSignedIn();

      // 1) confirm society exists
      const society = await getSocietyDoc(sid);
      if (!society) {
        Alert.alert("Not found", "No society found for that ID. Ask the Captain to share the correct ID.");
        return;
      }

      // 2) create member in that society
      const member = await createMember({
        societyId: sid,
        name,
        roles: ["member"],
        status: "active",
      });

      // 3) set active society/member for this user
      await setActiveSocietyAndMember(uid, sid, member.id);

      // 4) go to society home
      router.replace("/society");
    } catch (e: any) {
      console.error("Join society failed:", e);
      Alert.alert("Error", e?.message ? String(e.message) : "Failed to join society");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#fff" }}>
      <View style={{ flex: 1, padding: 24 }}>
        <Text style={{ fontSize: 34, fontWeight: "800", marginBottom: 6 }}>Join a Society</Text>
        <Text style={{ fontSize: 16, opacity: 0.75, marginBottom: 28 }}>
          Paste the society ID and enter your name.
        </Text>

        <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8 }}>
          Society ID <Text style={{ color: "#ef4444" }}>*</Text>
        </Text>
        <TextInput
          value={societyId}
          onChangeText={setSocietyId}
          placeholder="e.g. a1B2c3D4e5F6"
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            backgroundColor: "#f3f4f6",
            paddingVertical: 14,
            paddingHorizontal: 16,
            borderRadius: 14,
            fontSize: 16,
            marginBottom: 20,
          }}
        />

        <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8 }}>
          Your Name <Text style={{ color: "#ef4444" }}>*</Text>
        </Text>
        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="e.g. Ryan Dube"
          autoCapitalize="words"
          style={{
            backgroundColor: "#f3f4f6",
            paddingVertical: 14,
            paddingHorizontal: 16,
            borderRadius: 14,
            fontSize: 16,
            marginBottom: 22,
          }}
        />

        <View
          style={{
            backgroundColor: "#f9fafb",
            borderRadius: 14,
            padding: 14,
            marginBottom: 18,
            borderWidth: 1,
            borderColor: "#e5e7eb",
          }}
        >
          <Text style={{ fontSize: 13, color: "#6b7280", lineHeight: 18 }}>
            This society uses defaults:
            {"\n"}• Scoring: Both (Stableford + Strokeplay)
            {"\n"}• Handicaps: WHS
          </Text>
        </View>

        <Pressable
          onPress={handleJoin}
          disabled={!canSubmit}
          style={{
            backgroundColor: canSubmit ? "#0B6E4F" : "#9ca3af",
            paddingVertical: 14,
            borderRadius: 14,
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>Join Society</Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => router.back()}
          style={{
            backgroundColor: "#111827",
            paddingVertical: 14,
            borderRadius: 14,
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>Back</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
