/**
 * HOW TO TEST:
 * - Navigate to Finance screen (should only be visible to Treasurer/Captain/Admin)
 * - Verify access denied alert if user doesn't have permission
 * - Add finance features as needed
 */

import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { canViewFinance } from "@/lib/roles";

export default function FinanceScreen() {
  const [hasAccess, setHasAccess] = useState(false);

  useFocusEffect(
    useCallback(() => {
      checkAccess();
    }, [])
  );

  const checkAccess = async () => {
    const access = await canViewFinance();
    setHasAccess(access);
    if (!access) {
      Alert.alert("Access Denied", "Only Treasurer, Captain, or Admin can access Finance", [
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
        <Text style={styles.title}>Finance</Text>
        <Text style={styles.subtitle}>Treasurer tools and financial management</Text>
        
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>Finance features coming soon</Text>
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



