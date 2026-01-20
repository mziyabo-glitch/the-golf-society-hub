import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { ensureSignedIn } from "@/lib/firebase";
import { createMember } from "@/lib/db/memberRepo";
import { createSociety } from "@/lib/db/societyRepo";
import { setActiveSocietyAndMember } from "@/lib/db/userRepo";

export default function CreateSocietyScreen() {
  const router = useRouter();

  const [societyName, setSocietyName] = useState("");
  const [country, setCountry] = useState("United Kingdom");

  const clearDraft = async () => {
    setSocietyName("");
    setCountry("United Kingdom");
  };

  const isFormValid = societyName.trim().length > 0;

  const handleSubmit = async () => {
    if (!isFormValid) return;

    try {
      const uid = await ensureSignedIn();

      const createdSociety = await createSociety({
        name: societyName.trim(),
        country: country.trim() || "United Kingdom",
        createdBy: uid,

        // ✅ enforced defaults per your spec
        homeCourse: "",
        scoringMode: "Both",
        handicapRule: "Allow WHS",
      });

      const creator = await createMember({
        societyId: createdSociety.id,
        name: "Admin",
        roles: ["captain", "admin"],
        status: "active",
      });

      await setActiveSocietyAndMember(uid, createdSociety.id, creator.id);
      router.replace("/society");
    } catch (error) {
      console.error("Error saving society:", error);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#fff" }}>
      <View style={{ flex: 1, padding: 24 }}>
        <Text style={{ fontSize: 34, fontWeight: "800", marginBottom: 6 }}>
          Create a Society
        </Text>
        <Text style={{ fontSize: 16, opacity: 0.75, marginBottom: 28 }}>
          Set up your society in under a minute.
        </Text>

        {/* Clear Draft */}
        <Pressable
          onPress={clearDraft}
          style={{
            alignSelf: "flex-end",
            paddingVertical: 8,
            paddingHorizontal: 12,
            marginBottom: 8,
          }}
        >
          <Text style={{ fontSize: 14, color: "#6b7280", fontWeight: "600" }}>
            Clear draft
          </Text>
        </Pressable>

        {/* Society Name */}
        <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8, marginTop: 8 }}>
          Society Name <Text style={{ color: "#ef4444" }}>*</Text>
        </Text>
        <TextInput
          value={societyName}
          onChangeText={setSocietyName}
          placeholder="Enter society name"
          style={{
            backgroundColor: "#f3f4f6",
            paddingVertical: 14,
            paddingHorizontal: 16,
            borderRadius: 14,
            fontSize: 16,
            marginBottom: 20,
          }}
        />

        {/* Country */}
        <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8 }}>
          Country
        </Text>
        <TextInput
          value={country}
          onChangeText={setCountry}
          placeholder="Enter country"
          style={{
            backgroundColor: "#f3f4f6",
            paddingVertical: 14,
            paddingHorizontal: 16,
            borderRadius: 14,
            fontSize: 16,
            marginBottom: 20,
          }}
        />

        {/* Info (fixed rules) */}
        <View
          style={{
            backgroundColor: "#f9fafb",
            borderRadius: 14,
            padding: 14,
            marginBottom: 20,
            borderWidth: 1,
            borderColor: "#e5e7eb",
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: "700", marginBottom: 6, color: "#111827" }}>
            Defaults for this society
          </Text>
          <Text style={{ fontSize: 13, color: "#6b7280", lineHeight: 18 }}>
            • Scoring: Both (Stableford + Strokeplay){"\n"}
            • Handicaps: WHS only
          </Text>
        </View>

        {/* Create Society */}
        <Pressable
          onPress={handleSubmit}
          disabled={!isFormValid}
          style={{
            backgroundColor: isFormValid ? "#0B6E4F" : "#9ca3af",
            paddingVertical: 14,
            borderRadius: 14,
            alignItems: "center",
            marginBottom: 12,
            marginTop: 8,
          }}
        >
          <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>
            Create Society
          </Text>
        </Pressable>

        {/* Back */}
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
          <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>
            Back
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
