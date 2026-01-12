import { useState } from "react";
import { View, TextInput, Alert, StyleSheet, Platform } from "react-native";
import { router } from "expo-router";
import { addDoc, collection, doc, serverTimestamp, setDoc } from "firebase/firestore";

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

      // Ensure signed in (anonymous ok)
      const user = await ensureSignedIn();
      const uid = user.uid;

      // 1) Create society
      const societyRef = await addDoc(collection(db, "societies"), {
        name: name.trim(),
        homeCourse: homeCourse.trim() || null,
        country: country.trim() || "UK",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: uid,
      });

      const societyId = societyRef.id;

      // 2) Create first member = YOU as Captain/Admin
      await setDoc(doc(db, "societies", societyId, "members", uid), {
        userId: uid,
        name: user.displayName || "Captain",
        sex: "male", // editable later
        handicapIndex: 18, // placeholder; editable later
        roles: ["captain", "admin"], // LOWERCASE roles to match RBAC checks
        status: "active",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // 3) Persist active society ONLINE (users/{uid}.activeSocietyId)
      await setActiveSocietyId(societyId);

      // 4) Go to members list
      router.replace("/members");
    } catch (e) {
      console.error("[create-society] error", e);
      Alert.alert("Error", "Could not create society. Check Firebase config + try again.");
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
