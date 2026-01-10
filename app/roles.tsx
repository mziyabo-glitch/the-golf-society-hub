/**
 * HOW TO TEST:
 * - Navigate to Roles screen from Settings (Captain/Admin only)
 * - Verify PIN prompt appears
 * - Select a member and toggle roles
 * - Save and verify roles persist
 * - Check that member's roles appear correctly in other screens
 * 
 * FIRESTORE-ONLY: All member data comes from Firestore
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View, ActivityIndicator } from "react-native";
import { MemberRole, getAllMembers, isAdminLike, MemberData } from "@/lib/roles";
import { STORAGE_KEYS } from "@/lib/storage";
import { canAssignRoles, normalizeMemberRoles, normalizeSessionRole } from "@/lib/permissions";
import { getCurrentUserRoles } from "@/lib/roles";
import { getSession } from "@/lib/session";
import { upsertMember } from "@/lib/firestore/members";
import { getActiveSocietyId } from "@/lib/firebase";

const ADMIN_PIN_KEY = STORAGE_KEYS.ADMIN_PIN;

export default function RolesScreen() {
  const [members, setMembers] = useState<MemberData[]>([]);
  const [pinVerified, setPinVerified] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [societyId, setSocietyId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      const activeSocietyId = getActiveSocietyId();
      setSocietyId(activeSocietyId);
      checkAccess();
      loadMembers();
    }, [])
  );

  const checkAccess = async () => {
    try {
      const session = await getSession();
      const sessionRole = normalizeSessionRole(session.role);
      const roles = normalizeMemberRoles(await getCurrentUserRoles());
      const canAssign = canAssignRoles(sessionRole, roles);
      if (!canAssign) {
        Alert.alert("Access Denied", "Only Captain can assign roles", [
          { text: "OK", onPress: () => router.back() },
        ]);
        return false;
      }
      return true;
    } catch (error) {
      console.error("Error checking access:", error);
      Alert.alert("Error", "Failed to check permissions", [
        { text: "OK", onPress: () => router.back() },
      ]);
      return false;
    }
  };

  const loadMembers = async () => {
    try {
      // Load members from Firestore via getAllMembers helper
      const allMembers = await getAllMembers();
      setMembers(allMembers);
    } catch (error) {
      console.error("[Roles] Error loading members:", error);
      Alert.alert("Error", "Failed to load members");
    } finally {
      setLoading(false);
    }
  };

  const verifyPin = async () => {
    try {
      const storedPin = await AsyncStorage.getItem(ADMIN_PIN_KEY);
      if (!storedPin) {
        Alert.alert("Error", "Admin PIN not set. Please set it in Settings first.");
        return;
      }

      if (pinInput !== storedPin) {
        Alert.alert("Error", "Incorrect PIN");
        setPinInput("");
        return;
      }

      setPinVerified(true);
      setPinInput("");
    } catch (error) {
      console.error("Error verifying PIN:", error);
      Alert.alert("Error", "Failed to verify PIN");
    }
  };

  const toggleRole = (memberId: string, role: MemberRole) => {
    console.log(`toggleRole called: memberId=${memberId}, role=${role}`);
    
    // Don't allow toggling member role - it's always included
    if (role === "member") {
      return;
    }

    const updatedMembers = members.map((member) => {
      if (member.id !== memberId) return member;

      const currentRoles = member.roles && member.roles.length > 0 ? member.roles : ["member"];
      const rolesSet = new Set(currentRoles);

      console.log(`Current roles for ${member.name}:`, Array.from(rolesSet));

      // Prevent removing captain if it's the last one
      if (role === "captain" && rolesSet.has("captain")) {
        const captainCount = members.filter((m) => {
          const memberRoles = m.roles ?? [];
          return m.id !== memberId && (memberRoles.includes("captain") || memberRoles.includes("admin"));
        }).length;
        
        if (captainCount === 0) {
          Alert.alert("Cannot Remove", "There must be at least one Captain or Admin");
          return member;
        }
      }

      // Toggle role
      if (rolesSet.has(role)) {
        rolesSet.delete(role);
        console.log(`Removed role ${role}`);
      } else {
        rolesSet.add(role);
        console.log(`Added role ${role}`);
      }

      // Ensure member role is always included
      if (!rolesSet.has("member")) {
        rolesSet.add("member");
      }

      const newRoles = Array.from(rolesSet);
      console.log(`New roles for ${member.name}:`, newRoles);

      return {
        ...member,
        roles: newRoles,
      };
    });

    setMembers(updatedMembers);
    setHasChanges(true);
    console.log("Members updated, hasChanges set to true");
  };

  const handleSaveAll = async () => {
    if (!societyId) {
      Alert.alert("Error", "No society selected");
      return;
    }

    try {
      setSaving(true);
      console.log("Saving roles for members:", members.map(m => ({ name: m.name, roles: m.roles })));
      
      // Check if there's at least one captain/admin
      const captainCount = members.filter((m) => {
        const memberRoles = m.roles ?? [];
        return memberRoles.includes("captain") || memberRoles.includes("admin");
      }).length;
      
      if (captainCount === 0) {
        Alert.alert("Cannot Save", "There must be at least one Captain or Admin in the society");
        return;
      }

      // Save each member to Firestore
      let hasErrors = false;
      for (const member of members) {
        const memberToSave = {
          ...member,
          roles: member.roles && member.roles.length > 0 ? member.roles : ["member"]
        };

        const result = await upsertMember(memberToSave, societyId);
        
        if (!result.success) {
          console.error("[Roles] Failed to save member:", member.id, result.error);
          hasErrors = true;
        }
      }

      if (hasErrors) {
        Alert.alert("Warning", "Some roles may not have been saved. Please try again.");
      } else {
        console.log("[Roles] Roles saved successfully to Firestore");
        setHasChanges(false);
        Alert.alert("Success", "Roles updated successfully");
      }

      // Reload members to ensure sync
      await loadMembers();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("[Roles] Error saving roles:", error);
      Alert.alert("Error", `Failed to save roles: ${errorMessage}`);
    } finally {
      setSaving(false);
    }
  };

  const getRoleLabel = (role: MemberRole): string => {
    const labels: Record<MemberRole, string> = {
      captain: "Captain",
      treasurer: "Treasurer",
      secretary: "Secretary",
      handicapper: "Handicapper",
      member: "Member",
      admin: "Admin",
    };
    return labels[role] || role;
  };

  const getRoleDescription = (role: MemberRole): string => {
    const descriptions: Record<MemberRole, string> = {
      captain: "Full access: create events, manage members, assign roles",
      treasurer: "Manage finances, mark fees as paid",
      secretary: "Edit venue notes and event details",
      handicapper: "Manage handicaps and enter results",
      member: "Basic member (always included)",
      admin: "Legacy admin role (same as Captain)",
    };
    return descriptions[role] || "";
  };

  const roles: MemberRole[] = ["captain", "treasurer", "secretary", "handicapper"];

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#0B6E4F" />
        <Text style={styles.loadingText}>Loading members...</Text>
      </View>
    );
  }

  if (!pinVerified) {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Roles & Permissions</Text>
          <Text style={styles.subtitle}>Enter your Admin PIN to continue</Text>
        </View>

        <View style={styles.pinContainer}>
          <TextInput
            value={pinInput}
            onChangeText={setPinInput}
            placeholder="Enter PIN"
            keyboardType="number-pad"
            secureTextEntry
            style={styles.pinInput}
          />
          <Pressable onPress={verifyPin} style={styles.verifyButton}>
            <Text style={styles.verifyButtonText}>Verify</Text>
          </Pressable>
        </View>

        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (members.length === 0) {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Roles & Permissions</Text>
          <Text style={styles.subtitle}>No members found</Text>
        </View>
        <Text style={styles.noMembersText}>
          Add members to your society before assigning roles.
        </Text>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Roles & Permissions</Text>
        <Text style={styles.subtitle}>Assign roles to society members</Text>
      </View>

      {members.map((member) => (
        <View key={member.id} style={styles.memberCard}>
          <View style={styles.memberHeader}>
            <Text style={styles.memberName}>{member.name}</Text>
            {isAdminLike(member) && (
              <View style={styles.adminBadge}>
                <Text style={styles.adminBadgeText}>Admin</Text>
              </View>
            )}
          </View>

          <View style={styles.rolesContainer}>
            {roles.map((role) => {
              const hasThisRole = member.roles?.some(r => r.toLowerCase() === role.toLowerCase()) ?? false;
              
              return (
                <Pressable
                  key={role}
                  onPress={() => toggleRole(member.id, role)}
                  style={[
                    styles.roleToggle,
                    hasThisRole && styles.roleToggleActive,
                  ]}
                >
                  <Text style={[
                    styles.roleToggleText,
                    hasThisRole && styles.roleToggleTextActive,
                  ]}>
                    {getRoleLabel(role)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          
          <Text style={styles.currentRoles}>
            Current: {member.roles?.join(", ") || "member"}
          </Text>
        </View>
      ))}

      <View style={styles.legendContainer}>
        <Text style={styles.legendTitle}>Role Descriptions</Text>
        {roles.map((role) => (
          <View key={role} style={styles.legendItem}>
            <Text style={styles.legendRole}>{getRoleLabel(role)}</Text>
            <Text style={styles.legendDescription}>{getRoleDescription(role)}</Text>
          </View>
        ))}
      </View>

      {hasChanges && (
        <Pressable 
          onPress={handleSaveAll} 
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Save All Changes</Text>
          )}
        </Pressable>
      )}

      <Pressable onPress={() => router.back()} style={styles.backButton}>
        <Text style={styles.backButtonText}>Back</Text>
      </Pressable>
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
  header: {
    padding: 24,
    paddingBottom: 16,
  },
  title: {
    fontSize: 34,
    fontWeight: "800",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.75,
  },
  pinContainer: {
    padding: 24,
    paddingTop: 0,
  },
  pinInput: {
    backgroundColor: "#f3f4f6",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    fontSize: 18,
    textAlign: "center",
    marginBottom: 16,
  },
  verifyButton: {
    backgroundColor: "#0B6E4F",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  verifyButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  noMembersText: {
    padding: 24,
    fontSize: 16,
    color: "#6b7280",
    textAlign: "center",
  },
  memberCard: {
    marginHorizontal: 24,
    marginBottom: 16,
    padding: 16,
    backgroundColor: "#f9fafb",
    borderRadius: 14,
  },
  memberHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  memberName: {
    fontSize: 18,
    fontWeight: "700",
  },
  adminBadge: {
    backgroundColor: "#0B6E4F",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  adminBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  rolesContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  roleToggle: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#e5e7eb",
  },
  roleToggleActive: {
    backgroundColor: "#0B6E4F",
  },
  roleToggleText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  roleToggleTextActive: {
    color: "#fff",
  },
  currentRoles: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 8,
  },
  legendContainer: {
    margin: 24,
    marginTop: 16,
    padding: 16,
    backgroundColor: "#f3f4f6",
    borderRadius: 14,
  },
  legendTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
  },
  legendItem: {
    marginBottom: 8,
  },
  legendRole: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0B6E4F",
  },
  legendDescription: {
    fontSize: 13,
    color: "#6b7280",
  },
  saveButton: {
    marginHorizontal: 24,
    marginBottom: 12,
    backgroundColor: "#0B6E4F",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
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
    marginHorizontal: 24,
    marginBottom: 24,
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
