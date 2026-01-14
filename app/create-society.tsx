import { useState } from "react";
import { View, TextInput, Alert, StyleSheet, Platform } from "react-native";
import { router } from "expo-router";
import { 
  writeBatch, 
  collection, 
  doc, 
  serverTimestamp 
} from "firebase/firestore";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { getColors, spacing } from "@/lib/ui/theme";

import { db, ensureSignedIn, setActiveSocietyId } from "@/lib/firebase";

export default function CreateSocietyScreen() {
  const colors = getColors();

  const [name, setName] = useState("");
  const [homeCourse, setHomeCourse] = useState("");
  const [country, setCountry] = useState("UK");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert("Missing info", "Please enter a society name.");
      return;
    }

    try {
      console.log("Starting creation...");
      setCreating(true);

      const user = await ensureSignedIn();
      const uid = user.uid;
      console.log("User authenticated:", uid);

      // --- 1. PREPARE BATCH (Atomic Write) ---
      const batch = writeBatch(db);
      
      const societyRef = doc(collection(db, "societies"));
      const societyId = societyRef.id;

      // Rule Check: request.resource.data.createdBy == request.auth.uid
      batch.set(societyRef, {
        name: name.trim(),
        homeCourse: homeCourse.trim() || null,
        country: country.trim() || "UK",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: uid, 
      });

      // Rule Check: isOwner(memberId)
      const memberRef = doc(db, "societies", societyId, "members", uid);
      batch.set(memberRef, {
        userId: uid,
        name: user.displayName || "Captain",
        sex: "male", 
        handicapIndex: 18, 
        roles: ["captain", "admin"], 
        status: "active",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Update User Profile
      const userRef = doc(db, `users/${uid}`);
      batch.set(userRef, { 
        activeSocietyId: societyId,
        updatedAt: serverTimestamp() 
      }, { merge: true });

      // --- 2. COMMIT ---
      console.log("Committing batch...");
      await batch.commit();
      console.log("Batch success!");

      // --- 3. UPDATE LOCAL STATE ---
      await setActiveSocietyId(societyId);

      // --- 4. NAVIGATE ---
      // We do NOT setCreating(false) here because we are leaving the screen.
      // This prevents the React #418 "Update on unmount" crash.
      router.replace("/members");

    } catch (e: any) {
      console.error("CREATE FAILED:", e);
      setCreating(false); // Only enable button again if we failed
      
      // On Web, standard alerts are safer than native ones during crashes
      if (Platform.OS === 'web') {
        window.alert("Error: " + (e.message || "Create failed"));
      } else {
        Alert.alert("Error", e.message || "Create failed");
      }
    }
  };

  return (
    <Screen>
      <View style={{ padding: spacing.lg }}>
        <AppText variant="title" style={{ marginBottom: spacing.xs }}>
          Create Society
        </AppText>
        <AppText variant="subtle" style={{ marginBottom: spacing.lg }}>
          This creates your society online and makes you Captain/Admin.
        </AppText>

        <AppCard style={{ padding: spacing.lg }}>
          <AppText style={{ marginBottom: spacing.xs }}>Society name *</AppText>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. M4 Fairways"
            placeholderTextColor={colors.mutedText}
            autoCapitalize="words"
            style={[
              styles.input,
              {
                borderColor: colors.border,
                backgroundColor: colors.card,
                color: colors.text,
              },
            ]}
          />

          <AppText style={{ marginTop: spacing.md, marginBottom: spacing.xs }}>
            Home course (optional)
          </AppText>
          <TextInput
            value={homeCourse}
            onChangeText={setHomeCourse}
            placeholder="e.g. Wrag Barn"
            placeholderTextColor={colors.mutedText}
            autoCapitalize="words"
            style={[
              styles.input,
              {
                borderColor: colors.border,
                backgroundColor: colors.card,
                color: colors.text,
              },
            ]}
          />

          <AppText style={{ marginTop: spacing.md, marginBottom: spacing.xs }}>
            Country
          </AppText>
          <TextInput
            value={country}
            onChangeText={setCountry}
            placeholder="UK"
            placeholderTextColor={colors.mutedText}
            autoCapitalize="characters"
            style={[
              styles.input,
              {
                borderColor: colors.border,
                backgroundColor: colors.card,
                color: colors.text,
              },
            ]}
          />

          <View style={{ marginTop: spacing.lg }}>
            <PrimaryButton
              title={creating ? "Creating..." : "Create Society"}
              onPress={handleCreate}
              disabled={creating}
            />
            <View style={{ height: spacing.sm }} />
            <SecondaryButton title="Back" onPress={() => router.back()} />
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
