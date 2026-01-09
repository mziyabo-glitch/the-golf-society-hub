/**
 * HOW TO TEST:
 * - Navigate to Handicaps screen (should only be visible to Handicapper/Captain/Admin)
 * - Verify access denied alert if user doesn't have permission
 * - Add handicap management features as needed
 * 
 * FIRESTORE-ONLY: Member data comes from Firestore
 */

import { canManageCompetition, normalizeMemberRoles, normalizeSessionRole } from "@/lib/permissions";
import { getCurrentUserRoles } from "@/lib/roles";
import { getSession } from "@/lib/session";
import { getActiveSocietyId } from "@/lib/firebase";
import { listMembers, upsertMember } from "@/lib/firestore/members";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View, ActivityIndicator } from "react-native";
import type { MemberData } from "@/lib/models";

export default function HandicapsScreen() {
  const [hasAccess, setHasAccess] = useState(false);
  const [members, setMembers] = useState<MemberData[]>([]);
  const [isBulkEdit, setIsBulkEdit] = useState(false);
  const [editedHandicaps, setEditedHandicaps] = useState<{ [memberId: string]: string }>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [societyId, setSocietyId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      const activeSocietyId = getActiveSocietyId();
      setSocietyId(activeSocietyId);
      checkAccess();
      loadMembers(activeSocietyId);
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

  const loadMembers = async (activeSocietyId: string | null) => {
    try {
      setLoading(true);
      const loaded = await listMembers(activeSocietyId || undefined);
      setMembers(loaded);
      
      // Initialize edited handicaps
      const initial: { [memberId: string]: string } = {};
      loaded.forEach((m) => {
        initial[m.id] = m.handicap?.toString() || "";
      });
      setEditedHandicaps(initial);
    } catch (error) {
      console.error("[Handicaps] Error loading members:", error);
      Alert.alert("Error", "Failed to load members");
    } finally {
      setLoading(false);
    }
  };

  const handleHandicapChange = (memberId: string, value: string) => {
    setEditedHandicaps((prev) => ({
      ...prev,
      [memberId]: value,
    }));
  };

  const handleSaveBulk = async () => {
    if (!societyId) {
      Alert.alert("Error", "No society selected");
      return;
    }

    try {
      setSaving(true);
      let hasErrors = false;

      for (const member of members) {
        const newValue = editedHandicaps[member.id];
        if (newValue === undefined || newValue === member.handicap?.toString()) {
          continue; // No change
        }
        
        const handicap = newValue.trim() === "" ? undefined : parseFloat(newValue);
        if (handicap !== undefined && (isNaN(handicap) || handicap < 0 || handicap > 54)) {
          continue; // Invalid, skip
        }

        const updatedMember = {
          ...member,
          handicap,
        };

        const result = await upsertMember(updatedMember, societyId);
        
        if (!result.success) {
          console.error("[Handicaps] Failed to save handicap for:", member.id, result.error);
          hasErrors = true;
        }
      }

      if (hasErrors) {
        Alert.alert("Warning", "Some handicaps may not have been saved. Please try again.");
      } else {
        Alert.alert("Success", "Handicaps updated");
      }

      // Reload to ensure sync
      await loadMembers(societyId);
      setIsBulkEdit(false);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("[Handicaps] Error saving handicaps:", error);
      Alert.alert("Error", `Failed to save handicaps: ${errorMessage}`);
    } finally {
      setSaving(false);
    }
  };

  const filteredMembers = members.filter((member) =>
    member.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!hasAccess) {
    return null;
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#0B6E4F" />
        <Text style={styles.loadingText}>Loading members...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Handicaps</Text>
        <Text style={styles.subtitle}>Manage member handicaps</Text>
        
        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <Text style={styles.infoText}>
            Handicaps should be updated regularly based on official WHS calculations.
            This screen allows bulk editing of handicap indexes.
          </Text>
        </View>

        {/* Search */}
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search members..."
          style={styles.searchInput}
        />

        {/* Bulk Edit Toggle */}
        <Pressable
          onPress={() => setIsBulkEdit(!isBulkEdit)}
          style={[styles.toggleButton, isBulkEdit && styles.toggleButtonActive]}
        >
          <Text style={[styles.toggleButtonText, isBulkEdit && styles.toggleButtonTextActive]}>
            {isBulkEdit ? "Cancel Edit" : "Bulk Edit Handicaps"}
          </Text>
        </Pressable>

        {/* Members List */}
        {filteredMembers.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No members found</Text>
          </View>
        ) : (
          filteredMembers.map((member) => (
            <View key={member.id} style={styles.memberCard}>
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{member.name}</Text>
                {member.sex && (
                  <Text style={styles.memberSex}>{member.sex === "male" ? "♂" : "♀"}</Text>
                )}
              </View>
              
              {isBulkEdit ? (
                <TextInput
                  value={editedHandicaps[member.id] || ""}
                  onChangeText={(value) => handleHandicapChange(member.id, value)}
                  placeholder="HI"
                  keyboardType="decimal-pad"
                  style={styles.handicapInput}
                />
              ) : (
                <View style={styles.handicapDisplay}>
                  <Text style={styles.handicapLabel}>HI</Text>
                  <Text style={styles.handicapValue}>
                    {member.handicap !== undefined ? member.handicap.toFixed(1) : "-"}
                  </Text>
                </View>
              )}
            </View>
          ))
        )}

        {/* Save Button (when editing) */}
        {isBulkEdit && (
          <Pressable 
            onPress={handleSaveBulk} 
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>Save All Handicaps</Text>
            )}
          </Pressable>
        )}

        {/* Back Button */}
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
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#6b7280",
  },
  content: {
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
    marginBottom: 20,
  },
  infoBanner: {
    backgroundColor: "#f0fdf4",
    padding: 16,
    borderRadius: 14,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: "#0B6E4F",
  },
  infoText: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
  },
  searchInput: {
    backgroundColor: "#f3f4f6",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    fontSize: 16,
    marginBottom: 16,
  },
  toggleButton: {
    backgroundColor: "#f3f4f6",
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 20,
  },
  toggleButtonActive: {
    backgroundColor: "#ef4444",
  },
  toggleButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  toggleButtonTextActive: {
    color: "#fff",
  },
  emptyState: {
    padding: 40,
    alignItems: "center",
  },
  emptyStateText: {
    fontSize: 16,
    color: "#6b7280",
  },
  memberCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#f9fafb",
    borderRadius: 14,
    marginBottom: 12,
  },
  memberInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  memberName: {
    fontSize: 16,
    fontWeight: "600",
  },
  memberSex: {
    fontSize: 14,
    color: "#6b7280",
  },
  handicapInput: {
    backgroundColor: "#fff",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    fontSize: 16,
    textAlign: "center",
    width: 80,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  handicapDisplay: {
    alignItems: "center",
    minWidth: 60,
  },
  handicapLabel: {
    fontSize: 12,
    color: "#6b7280",
  },
  handicapValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0B6E4F",
  },
  saveButton: {
    backgroundColor: "#0B6E4F",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 12,
    marginTop: 8,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  backButton: {
    backgroundColor: "#111827",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  backButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
});
