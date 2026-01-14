import { useState } from "react";
import { View, TextInput, Alert, StyleSheet, Platform, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { getColors, spacing } from "@/lib/ui/theme";
import { db, getActiveSocietyId } from "@/lib/firebase";

export default function AddMemberScreen() {
  const colors = getColors();
  
  // Form State
  const [name, setName] = useState("");
  const [handicap, setHandicap] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddMember = async () => {
    // 1. Validation
    if (!name.trim()) {
      Alert.alert("Required", "Please enter a member name.");
      return;
    }

    try {
      setIsSubmitting(true);

      // 2. Get Context
      const societyId = getActiveSocietyId();
      if (!societyId) {
        Alert.alert("Error", "No active society found. Please go back.");
        return;
      }

      // 3. Write to Firestore (Random ID)
      // This works because the Firestore Rule "isSocietyAdmin(societyId)" allows it.
      await addDoc(collection(db, "societies", societyId, "members"), {
        name: name.trim(),
        handicapIndex: handicap ? parseFloat(handicap) : 0,
        roles: ["member"], // Default role is just member
        joinedAt: serverTimestamp(),
        // Note: We don't link this to a 'userId' yet because 
        // this might be a placeholder member who hasn't downloaded the app yet.
        status: "active", 
      });

      // 4. Success & Navigate
      if (Platform.OS === 'web') {
        window.alert("Member added successfully!");
      } else {
        Alert.alert("Success", "Member added!");
      }
      
      router.back();

    } catch (e: any) {
      console.error("ADD MEMBER ERROR:", e);
      
      // Permission Error Handling
      if (e.code === 'permission-denied') {
        Alert.alert("Access Denied", "You must be a Captain or Admin to add members.");
      } else {
        Alert.alert("Error", "Could not add member. See console for details.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen>
      <View style={{ padding: spacing.lg }}>
        <AppText variant="title" style={{ marginBottom: spacing.md }}>
          Add Member
        </AppText>
        <AppText variant="subtle" style={{ marginBottom: spacing.lg }}>
          Manually add a player to your society roster.
        </AppText>

        <AppCard style={{ padding: spacing.lg }}>
          
          {/* Name Input */}
          <AppText style={{ marginBottom: spacing.xs }}>Player Name *</AppText>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Tiger Woods"
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

          {/* Handicap Input */}
          <AppText style={{ marginTop: spacing.md, marginBottom: spacing.xs }}>
            Handicap Index (Optional)
          </AppText>
          <TextInput
            value={handicap}
            onChangeText={setHandicap}
            placeholder="e.g. 5.4"
            keyboardType="numeric"
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

          {/* Action Buttons */}
          <View style={{ marginTop: spacing.xl }}>
            <PrimaryButton 
              title={isSubmitting ? "Adding..." : "Add Member"} 
              onPress={handleAddMember} 
              disabled={isSubmitting}
            />
            
            {isSubmitting && <ActivityIndicator style={{ marginTop: 10 }} color={colors.primary} />}

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
