import { useState } from "react";
import { View, TextInput, Alert, StyleSheet, Platform, ActivityIndicator } from "react-native";
import { router } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { getColors, spacing } from "@/lib/ui/theme";

// Import the helper function from your updated lib/firebase.ts
import { createSociety, ensureSignedIn } from "@/lib/firebase";

export default function CreateSocietyScreen() {
  const colors = getColors();

  const [name, setName] = useState("");
  const [homeCourse, setHomeCourse] = useState("");
  const [country, setCountry] = useState("UK");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    console.log("Button Pressed!"); // Debug 1: prove button works

    // 1. Validation
    if (!name.trim()) {
      alertUser("Missing Info", "Please enter a society name.");
      return;
    }

    try {
      setCreating(true);
      console.log("Starting creation flow..."); // Debug 2

      // 2. Ensure Auth is ready before trying to write
      await ensureSignedIn();
      console.log("Auth verified."); // Debug 3

      // 3. Call the library function (Handles Batch & Permissions)
      const newSocietyId = await createSociety(name.trim());
      
      console.log("Success! New ID:", newSocietyId); // Debug 4

      // 4. Navigate
      // We wait a tick to ensure the state update doesn't conflict with unmount
      setTimeout(() => {
        router.replace("/members");
      }, 100);

    } catch (e: any) {
      console.error("CREATE FAILED:", e);
      setCreating(false); // Reset button so you can try again
      alertUser("Error", e.message || "Failed to create society.");
    }
  };

  // Helper to handle alerts on Web vs Native
  const alertUser = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
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
              // If creating is true, button shows "Creating..." and is disabled
              title={creating ? "Creating..." : "Create Society"}
              onPress={handleCreate}
              disabled={creating}
            />
            
            {/* Debug Indicator: If spinner shows, we know state updated */}
            {creating && <ActivityIndicator style={{ marginTop: 10 }} color={colors.primary} />}

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
