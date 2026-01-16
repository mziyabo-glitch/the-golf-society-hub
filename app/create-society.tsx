import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { ensureSignedIn } from "@/lib/firebase";
import { createMember } from "@/lib/db/memberRepo";
import { createSociety } from "@/lib/db/societyRepo";
import { setActiveSocietyAndMember } from "@/lib/db/userRepo";

type SocietyData = {
  name: string;
  homeCourse: string;
  country: string;
  scoringMode: "Stableford" | "Strokeplay" | "Both";
  handicapRule: "Allow WHS" | "Fixed HCP" | "No HCP";
  logoUrl?: string | null;
};

export default function CreateSocietyScreen() {
  const router = useRouter();
  const [societyName, setSocietyName] = useState("");
  const [homeCourse, setHomeCourse] = useState("");
  const [country, setCountry] = useState("United Kingdom");
  const [scoringMode, setScoringMode] = useState<"Stableford" | "Strokeplay" | "Both">("Stableford");
  const [handicapRule, setHandicapRule] = useState<"Allow WHS" | "Fixed HCP" | "No HCP">("Allow WHS");

  const clearDraft = async () => {
    setSocietyName("");
    setHomeCourse("");
    setCountry("United Kingdom");
    setScoringMode("Stableford");
    setHandicapRule("Allow WHS");
  };

  const handleNameChange = (text: string) => {
    setSocietyName(text);
  };

  const handleHomeCourseChange = (text: string) => {
    setHomeCourse(text);
  };

  const handleCountryChange = (text: string) => {
    setCountry(text);
  };

  const handleScoringModeChange = (mode: "Stableford" | "Strokeplay" | "Both") => {
    setScoringMode(mode);
  };

  const handleHandicapRuleChange = (rule: "Allow WHS" | "Fixed HCP" | "No HCP") => {
    setHandicapRule(rule);
  };

  const isFormValid = societyName.trim().length > 0;

  const handleSubmit = async () => {
    if (!isFormValid) return;

    const societyData: SocietyData = {
      name: societyName.trim(),
      homeCourse: homeCourse.trim(),
      country: country.trim(),
      scoringMode,
      handicapRule,
    };

    try {
      const uid = await ensureSignedIn();
      const createdSociety = await createSociety({
        name: societyData.name,
        country: societyData.country,
        createdBy: uid,
        homeCourse: societyData.homeCourse,
        scoringMode: societyData.scoringMode,
        handicapRule: societyData.handicapRule,
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

        {/* Clear Draft Button */}
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
          onChangeText={handleNameChange}
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

        {/* Home Course */}
        <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8 }}>
          Home Course
        </Text>
        <TextInput
          value={homeCourse}
          onChangeText={handleHomeCourseChange}
          placeholder="Enter home course (optional)"
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
          onChangeText={handleCountryChange}
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

        {/* Scoring Mode */}
        <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8 }}>
          Scoring Mode
        </Text>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
          {(["Stableford", "Strokeplay", "Both"] as const).map((mode) => (
            <Pressable
              key={mode}
              onPress={() => handleScoringModeChange(mode)}
              style={{
                flex: 1,
                backgroundColor: scoringMode === mode ? "#0B6E4F" : "#f3f4f6",
                paddingVertical: 12,
                borderRadius: 14,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  color: scoringMode === mode ? "white" : "#111827",
                  fontSize: 14,
                  fontWeight: "600",
                }}
              >
                {mode}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Handicap Rule */}
        <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8 }}>
          Handicap Rule
        </Text>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {(["Allow WHS", "Fixed HCP", "No HCP"] as const).map((rule) => (
            <Pressable
              key={rule}
              onPress={() => handleHandicapRuleChange(rule)}
              style={{
                flex: 1,
                minWidth: "30%",
                backgroundColor: handicapRule === rule ? "#0B6E4F" : "#f3f4f6",
                paddingVertical: 12,
                borderRadius: 14,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  color: handicapRule === rule ? "white" : "#111827",
                  fontSize: 14,
                  fontWeight: "600",
                }}
              >
                {rule}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Create Society Button */}
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

        {/* Back Button */}
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
