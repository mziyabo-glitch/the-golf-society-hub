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
      setCreating(true);

      // 1. Ensure signed in
      const user = await ensureSignedIn();
      const uid = user.uid;

      // 2. Prepare the Write Batch (Prevents "Partial Creation" errors)
      const batch = writeBatch(db);

      // A) Create Society Reference
      const societyRef = doc(collection(db, "societies"));
      const societyId = societyRef.id;

      // B) Queue Society Data
      // CRITICAL: 'createdBy' must match auth.uid for Security Rules to pass
      batch.set(societyRef, {
        name: name.trim(),
        homeCourse: homeCourse.trim() || null,
        country: country.trim() || "UK",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: uid, 
      });

      // C) Queue Member Data (You are the Captain)
      const memberRef = doc(db, "societies", societyId, "members", uid);
      batch.set(memberRef, {
        userId: uid,
        name: user.displayName || "Captain",
        sex: "male", 
        handicapIndex: 18, 
        roles: ["captain", "admin"], // Grant admin permissions immediately
        status: "active",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // 3. Commit the Batch (Atomic write)
      // If this fails, neither the society nor the member is created.
      await batch.commit();

      // 4. Update Local User State (Cache + Firestore Profile)
      // We do this AFTER the batch to ensure your local 'activeSocietyIdCache' is updated
      await setActiveSocietyId(societyId);

      // 5. Navigate to Members List
      // Now safe because data exists and permissions are set
      router.replace("/members");

    } catch (e: any) {
      console.error("[create-society] error", e);
      // Show the actual error message if available for easier debugging
      Alert.alert("Error", e.message || "Could not create society.");
    } finally {
      setCreating(false);
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
