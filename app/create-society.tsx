import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { STORAGE_KEYS } from "@/lib/storage";

const DRAFT_KEY = STORAGE_KEYS.SOCIETY_DRAFT;
const ACTIVE_KEY = STORAGE_KEYS.SOCIETY_ACTIVE;

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

  const hasLoadedDraft = useRef(false);

  // Load draft on mount
  useEffect(() => {
    const loadDraft = async () => {
      try {
        const draftData = await AsyncStorage.getItem(DRAFT_KEY);
        if (draftData) {
          const draft: SocietyData = JSON.parse(draftData);
          setSocietyName(draft.name || "");
          setHomeCourse(draft.homeCourse || "");
          setCountry(draft.country || "United Kingdom");
          setScoringMode(draft.scoringMode || "Stableford");
          setHandicapRule(draft.handicapRule || "Allow WHS");
        }
      } catch (error) {
        console.error("Error loading draft:", error);
      } finally {
        hasLoadedDraft.current = true;
      }
    };
    loadDraft();
  }, []);

  // Save draft whenever form values change (but not on initial load)
  const saveDraft = useCallback(async () => {
    if (!hasLoadedDraft.current) return;
    
    try {
      const draftData: SocietyData = {
        name: societyName,
        homeCourse,
        country,
        scoringMode,
        handicapRule,
      };
      await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draftData));
    } catch (error) {
      console.error("Error saving draft:", error);
    }
  }, [societyName, homeCourse, country, scoringMode, handicapRule]);

  useEffect(() => {
    if (hasLoadedDraft.current) {
      saveDraft();
    }
  }, [saveDraft]);

  // Save draft on unmount to ensure data is persisted
  useEffect(() => {
    return () => {
      if (hasLoadedDraft.current) {
        saveDraft();
      }
    };
  }, [saveDraft]);

  const clearDraft = async () => {
    try {
      await AsyncStorage.removeItem(DRAFT_KEY);
      setSocietyName("");
      setHomeCourse("");
      setCountry("United Kingdom");
      setScoringMode("Stableford");
      setHandicapRule("Allow WHS");
    } catch (error) {
      console.error("Error clearing draft:", error);
    }
  };

  const handleNameChange = (text: string) => {
    setSocietyName(text);
    if (hasLoadedDraft.current) {
      saveDraftWithValues({ name: text });
    }
  };

  const handleHomeCourseChange = (text: string) => {
    setHomeCourse(text);
    if (hasLoadedDraft.current) {
      saveDraftWithValues({ homeCourse: text });
    }
  };

  const handleCountryChange = (text: string) => {
    setCountry(text);
    if (hasLoadedDraft.current) {
      saveDraftWithValues({ country: text });
    }
  };

  const handleScoringModeChange = (mode: "Stableford" | "Strokeplay" | "Both") => {
    setScoringMode(mode);
    if (hasLoadedDraft.current) {
      saveDraftWithValues({ scoringMode: mode });
    }
  };

  const handleHandicapRuleChange = (rule: "Allow WHS" | "Fixed HCP" | "No HCP") => {
    setHandicapRule(rule);
    if (hasLoadedDraft.current) {
      saveDraftWithValues({ handicapRule: rule });
    }
  };

  // Helper function to save draft with updated values immediately
  const saveDraftWithValues = async (updates: Partial<SocietyData>) => {
    try {
      const draftData: SocietyData = {
        name: updates.name ?? societyName,
        homeCourse: updates.homeCourse ?? homeCourse,
        country: updates.country ?? country,
        scoringMode: updates.scoringMode ?? scoringMode,
        handicapRule: updates.handicapRule ?? handicapRule,
      };
      await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draftData));
    } catch (error) {
      console.error("Error saving draft:", error);
    }
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
      // Save active society
      await AsyncStorage.setItem(ACTIVE_KEY, JSON.stringify(societyData));
      // Clear draft after successful save
      await AsyncStorage.removeItem(DRAFT_KEY);
      
      // Create first member (creator) automatically
      const { ensureValidCurrentMember } = await import("@/lib/storage");
      await ensureValidCurrentMember();
      
      // Set session role to admin for initial setup
      const { setRole } = await import("@/lib/session");
      await setRole("admin");
      
      // Navigate to dashboard
      router.replace("/society");
    } catch (error) {
      console.error("Error saving society:", error);
      // Show error to user (you can add an Alert here if needed)
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
