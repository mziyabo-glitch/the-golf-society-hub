/**
 * HOW TO TEST:
 * - Navigate to Handicaps screen (should only be visible to Handicapper/Captain/Admin)
 * - Verify access denied alert if user doesn't have permission
 * - Add handicap management features as needed
 */

import { canManageCompetition, normalizeMemberRoles, normalizeSessionRole } from "@/lib/permissions";
import { getCurrentUserRoles } from "@/lib/roles";
import { getSession } from "@/lib/session";
import { STORAGE_KEYS } from "@/lib/storage";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

const MEMBERS_KEY = STORAGE_KEYS.MEMBERS;

type MemberData = {
  id: string;
  name: string;
  handicap?: number;
  roles?: string[];
};

export default function HandicapsScreen() {
  const [hasAccess, setHasAccess] = useState(false);
  const [members, setMembers] = useState<MemberData[]>([]);
  const [isBulkEdit, setIsBulkEdit] = useState(false);
  const [editedHandicaps, setEditedHandicaps] = useState<{ [memberId: string]: string }>({});
  const [searchQuery, setSearchQuery] = useState("");

  useFocusEffect(
    useCallback(() => {
      checkAccess();
      loadMembers();
    }, [])
  );

  const checkAccess = async () => {
    const session = await getSession();
    const sessionRole = normalizeSessionRole(session.role);
    const roles = normalizeMemberRoles(await getCurrentUserRoles());
    const access = canManageCompetition(sessionRole, roles);
    setHasAccess(access);
    if (!access) {
      Alert.alert("Access Denied", "Only Handicapper, Captain, Secretary, or Admin can manage handicaps", [
        { text: "OK", onPress: () => router.back() },
      ]);
    }
  };

  const loadMembers = async () => {
    try {
      const membersData = await AsyncStorage.getItem(MEMBERS_KEY);
      if (membersData) {
        const loaded = JSON.parse(membersData);
        setMembers(loaded);
        // Initialize edited handicaps
        const initial: { [memberId: string]: string } = {};
        loaded.forEach((m: MemberData) => {
          initial[m.id] = m.handicap?.toString() || "";
        });
        setEditedHandicaps(initial);
      }
    } catch (error) {
      console.error("Error loading members:", error);
    }
  };

  const handleHandicapChange = (memberId: string, value: string) => {
    setEditedHandicaps((prev) => ({
      ...prev,
      [memberId]: value,
    }));
  };

  const handleSaveBulk = async () => {
    try {
      const updatedMembers = members.map((member) => {
        const newValue = editedHandicaps[member.id];
        if (newValue === undefined || newValue === member.handicap?.toString()) {
          return member;
        }
        const handicap = newValue.trim() === "" ? undefined : parseFloat(newValue);
        if (handicap !== undefined && (isNaN(handicap) || handicap < 0 || handicap > 54)) {
          return member; // Invalid, skip
        }
        return {
          ...member,
          handicap,
        };
      });

      await AsyncStorage.setItem(MEMBERS_KEY, JSON.stringify(updatedMembers));
      setMembers(updatedMembers);
      setIsBulkEdit(false);
      Alert.alert("Success", "Handicaps updated");
    } catch (error) {
      console.error("Error saving handicaps:", error);
      Alert.alert("Error", "Failed to save handicaps");
    }
  };

  const filteredMembers = members.filter((member) =>
    member.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!hasAccess) {
    return null;
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Handicaps</Text>
        <Text style={styles.subtitle}>Manage member handicaps</Text>
        
        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <Text style={styles.infoText}>
            All members are expected to be registered with England Golf.
          </Text>
        </View>
        
        {/* Search */}
        {members.length > 0 && (
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search members..."
            style={styles.searchInput}
          />
        )}
        
        {/* Bulk Edit Toggle */}
        {members.length > 0 && (
          <Pressable
            onPress={() => setIsBulkEdit(!isBulkEdit)}
            style={styles.bulkEditButton}
          >
            <Text style={styles.bulkEditButtonText}>
              {isBulkEdit ? "Cancel Bulk Edit" : "Bulk Update"}
            </Text>
          </Pressable>
        )}
        
        {filteredMembers.length === 0 ? (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>
              {searchQuery ? "No members found" : "No members found"}
            </Text>
          </View>
        ) : (
          <View style={styles.membersList}>
            {filteredMembers.map((member) => (
              <View key={member.id} style={styles.memberCard}>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{member.name}</Text>
                  {!isBulkEdit && (
                    <Text style={styles.memberHandicap}>
                      HCP: {member.handicap !== undefined ? member.handicap : "Not set"}
                    </Text>
                  )}
                </View>
                {isBulkEdit && (
                  <View style={styles.handicapInput}>
                    <Text style={styles.handicapLabel}>Handicap (0-54)</Text>
                    <TextInput
                      value={editedHandicaps[member.id] || ""}
                      onChangeText={(value) => handleHandicapChange(member.id, value)}
                      placeholder="Enter handicap"
                      keyboardType="numeric"
                      style={styles.input}
                    />
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {isBulkEdit && filteredMembers.length > 0 && (
          <Pressable onPress={handleSaveBulk} style={styles.saveButton}>
            <Text style={styles.saveButtonText}>Save All Changes</Text>
          </Pressable>
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
  infoBanner: {
    backgroundColor: "#eff6ff",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#3b82f6",
  },
  infoText: {
    fontSize: 14,
    color: "#1e40af",
    fontStyle: "italic",
  },
  searchInput: {
    backgroundColor: "#f3f4f6",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    fontSize: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  bulkEditButton: {
    backgroundColor: "#0B6E4F",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 16,
  },
  bulkEditButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  memberCard: {
    backgroundColor: "#f3f4f6",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  memberInfo: {
    marginBottom: 8,
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
  handicapInput: {
    marginTop: 8,
  },
  handicapLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 6,
    color: "#111827",
  },
  input: {
    backgroundColor: "#fff",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  saveButton: {
    backgroundColor: "#0B6E4F",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 16,
    marginBottom: 12,
  },
  saveButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "700",
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



