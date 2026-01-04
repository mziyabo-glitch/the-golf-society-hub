/**
 * HOW TO TEST:
 * - Navigate to Handicaps screen (should only be visible to Handicapper/Captain/Admin)
 * - Verify access denied alert if user doesn't have permission
 * - Add handicap management features as needed
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { canEditHandicaps } from "@/lib/roles";

const MEMBERS_KEY = "GSOCIETY_MEMBERS";

type MemberData = {
  id: string;
  name: string;
  handicap?: number;
  roles?: string[];
};

export default function HandicapsScreen() {
  const [hasAccess, setHasAccess] = useState(false);
  const [members, setMembers] = useState<MemberData[]>([]);

  useFocusEffect(
    useCallback(() => {
      checkAccess();
      loadMembers();
    }, [])
  );

  const checkAccess = async () => {
    const access = await canEditHandicaps();
    setHasAccess(access);
    if (!access) {
      Alert.alert("Access Denied", "Only Handicapper, Captain, or Admin can manage handicaps", [
        { text: "OK", onPress: () => router.back() },
      ]);
    }
  };

  const loadMembers = async () => {
    try {
      const membersData = await AsyncStorage.getItem(MEMBERS_KEY);
      if (membersData) {
        setMembers(JSON.parse(membersData));
      }
    } catch (error) {
      console.error("Error loading members:", error);
    }
  };

  if (!hasAccess) {
    return null;
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Handicaps</Text>
        <Text style={styles.subtitle}>Manage member handicaps</Text>
        
        {members.length === 0 ? (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>No members found</Text>
          </View>
        ) : (
          <View style={styles.membersList}>
            {members.map((member) => (
              <View key={member.id} style={styles.memberCard}>
                <Text style={styles.memberName}>{member.name}</Text>
                <Text style={styles.memberHandicap}>
                  HCP: {member.handicap !== undefined ? member.handicap : "Not set"}
                </Text>
              </View>
            ))}
          </View>
        )}

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
  membersList: {
    marginBottom: 24,
  },
  memberCard: {
    backgroundColor: "#f3f4f6",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  memberName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  memberHandicap: {
    fontSize: 14,
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



