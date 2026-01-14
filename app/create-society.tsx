import { useEffect, useState } from "react";
import { View, TextInput, Alert, StyleSheet, Platform, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { doc, getDoc } from "firebase/firestore";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { getColors, spacing } from "@/lib/ui/theme";
import { db, getActiveSocietyId, updateSocietyDetails } from "@/lib/firebase";

export default function EditSocietyScreen() {
  const colors = getColors();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Form State
  const [name, setName] = useState("");
  const [homeCourse, setHomeCourse] = useState("");
  const [societyId, setSocietyId] = useState<string | null>(null);

  // 1. Load current data on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const id = getActiveSocietyId();
        if (!id) {
          Alert.alert("Error", "No active society found.");
          router.back();
          return;
        }
        setSocietyId(id);

        const snap = await getDoc(doc(db, "societies", id));
        if (snap.exists()) {
          const data = snap.data();
          setName(data.name || "");
          setHomeCourse(data.homeCourse || "");
        } else {
          Alert.alert("Error", "Society not found.");
          router.back();
        }
      } catch (e) {
        console.error("Failed to load society:", e);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // 2. Handle Update
  const handleSave = async () => {
    if (!societyId || !name.trim()) {
      Alert.alert("Required", "Society name cannot be empty.");
      return;
    }

    try {
      setSaving(true);
      
      // Call the function we added to lib/firebase.ts
      await updateSocietyDetails(societyId, {
        name: name.trim(),
        homeCourse: homeCourse.trim()
      });
      
      // Success on Web needs a window alert or simple console log usually, 
      // but standard Alert works in React Native Web too.
      Alert.alert("Success", "Society details updated!");
      router.back(); 
      
    } catch (error: any) {
      console.error(error);
      // This catches the Permission Denied error if rules block it
      Alert.alert("Access Denied", "Only the Captain or Admin can edit society details.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ padding: spacing.lg }}>
        <AppText variant="title" style={{ marginBottom: spacing.md }}>
          Edit Society
        </AppText>
        
        <AppCard style={{ padding: spacing.lg }}>
          
          {/* Name Field */}
          <AppText style={{ marginBottom: spacing.xs }}>Society Name</AppText>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. M4 Fairways"
            placeholderTextColor={colors.mutedText}
            style={[
              styles.input,
              {
                borderColor: colors.border,
                backgroundColor: colors.card,
                color: colors.text,
              },
            ]}
          />

          {/* Home Course Field */}
          <AppText style={{ marginTop: spacing.md, marginBottom: spacing.xs }}>
            Home Course
          </AppText>
          <TextInput
            value={homeCourse}
            onChangeText={setHomeCourse}
            placeholder="e.g. Wrag Barn"
            placeholderTextColor={colors.mutedText}
            style={[
              styles.input,
              {
                borderColor: colors.border,
                backgroundColor: colors.card,
                color: colors.text,
              },
            ]}
          />

          {/* Buttons */}
          <View style={{ marginTop: spacing.xl }}>
            <PrimaryButton 
              title={saving ? "Saving..." : "Save Changes"} 
              onPress={handleSave} 
              disabled={saving}
            />
            <View style={{ height: spacing.sm }} />
            <SecondaryButton title="Cancel" onPress={() => router.back()} />
          </View>

        </AppCard>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "web" ? 12 : 10,
    fontSize: 16,
  },
});
