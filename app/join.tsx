import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";

import { ensureSignedIn } from "@/lib/firebase";
import { createMember } from "@/lib/db/memberRepo";
import { getSocietyDoc } from "@/lib/db/societyRepo";
import { setActiveSocietyAndMember } from "@/lib/db/userRepo";
import { useBootstrap } from "@/lib/useBootstrap";

export default function JoinSocietyScreen() {
  const router = useRouter();
  const { user, loading } = useBootstrap();
  const [societyId, setSocietyId] = useState("");
  const [memberName, setMemberName] = useState("");
  const [handicap, setHandicap] = useState("");
  const [sex, setSex] = useState<"male" | "female" | "">("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user?.activeSocietyId) {
      router.replace("/society");
    }
  }, [loading, router, user?.activeSocietyId]);

  const isFormValid =
    societyId.trim().length > 0 && memberName.trim().length > 0 && (sex === "male" || sex === "female");

  const handleJoin = async () => {
    if (!isFormValid) return;

    setIsSubmitting(true);
    try {
      const society = await getSocietyDoc(societyId.trim());
      if (!society) {
        Alert.alert("Society not found", "Check the Society ID and try again.");
        return;
      }

      const uid = await ensureSignedIn();
      const newMember = await createMember({
        societyId: society.id,
        name: memberName.trim(),
        handicap: handicap.trim() ? parseFloat(handicap.trim()) : undefined,
        sex: sex as "male" | "female",
        roles: ["member"],
        status: "active",
      });

      await setActiveSocietyAndMember(uid, society.id, newMember.id);
      router.replace("/society");
    } catch (error) {
      console.error("Error joining society:", error);
      Alert.alert("Error", "Failed to join society. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#fff" }}>
      <View style={{ flex: 1, padding: 24 }}>
        <Text style={{ fontSize: 34, fontWeight: "800", marginBottom: 6 }}>
          Join a Society
        </Text>
        <Text style={{ fontSize: 16, opacity: 0.75, marginBottom: 28 }}>
          Enter your Society ID to join.
        </Text>

        <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8, marginTop: 8 }}>
          Society ID <Text style={{ color: "#ef4444" }}>*</Text>
        </Text>
        <TextInput
          value={societyId}
          onChangeText={setSocietyId}
          placeholder="Enter society ID"
          autoCapitalize="none"
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
          value={memberName}
          onChangeText={setMemberName}
          placeholder="Enter your name"
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
          Handicap (optional)
        </Text>
        <TextInput
          value={handicap}
          onChangeText={setHandicap}
          placeholder="Enter handicap"
          keyboardType="numeric"
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
          Sex <Text style={{ color: "#ef4444" }}>*</Text>
        </Text>
        <View style={{ flexDirection: "row", gap: 12, marginBottom: 20 }}>
          <Pressable
            onPress={() => setSex("male")}
            style={{
              flex: 1,
              paddingVertical: 14,
              paddingHorizontal: 16,
              borderRadius: 14,
              backgroundColor: sex === "male" ? "#f0fdf4" : "#f3f4f6",
              alignItems: "center",
              borderWidth: 2,
              borderColor: sex === "male" ? "#0B6E4F" : "transparent",
            }}
          >
            <Text
              style={{
                fontSize: 16,
                fontWeight: "600",
                color: sex === "male" ? "#0B6E4F" : "#6b7280",
              }}
            >
              Male
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setSex("female")}
            style={{
              flex: 1,
              paddingVertical: 14,
              paddingHorizontal: 16,
              borderRadius: 14,
              backgroundColor: sex === "female" ? "#f0fdf4" : "#f3f4f6",
              alignItems: "center",
              borderWidth: 2,
              borderColor: sex === "female" ? "#0B6E4F" : "transparent",
            }}
          >
            <Text
              style={{
                fontSize: 16,
                fontWeight: "600",
                color: sex === "female" ? "#0B6E4F" : "#6b7280",
              }}
            >
              Female
            </Text>
          </Pressable>
        </View>

        <Pressable
          onPress={handleJoin}
          disabled={!isFormValid || isSubmitting}
          style={{
            backgroundColor: isFormValid && !isSubmitting ? "#0B6E4F" : "#9ca3af",
            paddingVertical: 14,
            borderRadius: 14,
            alignItems: "center",
            marginBottom: 12,
            marginTop: 8,
          }}
        >
          <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>
            {isSubmitting ? "Joining..." : "Join Society"}
          </Text>
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
          <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>
            Back
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
