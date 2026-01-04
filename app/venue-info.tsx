/**
 * HOW TO TEST:
 * - Navigate to Venue Info screen (should only be visible to Secretary/Captain/Admin)
 * - Verify access denied alert if user doesn't have permission
 * - Add venue management features as needed
 */

import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { canEditVenueInfo } from "@/lib/roles";

export default function VenueInfoScreen() {
  const [hasAccess, setHasAccess] = useState(false);

  useFocusEffect(
    useCallback(() => {
      checkAccess();
    }, [])
  );

  const checkAccess = async () => {
    const access = await canEditVenueInfo();
    setHasAccess(access);
    if (!access) {
      Alert.alert("Access Denied", "Only Secretary, Captain, or Admin can edit venue info", [
        { text: "OK", onPress: () => router.back() },
      ]);
    }
  };

  if (!hasAccess) {
    return null;
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Venue Info</Text>
        <Text style={styles.subtitle}>Manage venue information and special notes</Text>
        
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>Venue management features coming soon</Text>
        </View>

        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  content: {
    flex: 1,
    padding: 24,
  },
  title: {
    fontSize: 34,
    fontWeight: "800",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.75,
    marginBottom: 24,
  },
  placeholder: {
    padding: 40,
    alignItems: "center",
  },
  placeholderText: {
    fontSize: 16,
    color: "#6b7280",
  },
  backButton: {
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 24,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6b7280",
  },
});



