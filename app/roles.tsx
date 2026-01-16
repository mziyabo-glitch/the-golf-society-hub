/**
 * HOW TO TEST:
 * - Navigate to Roles screen from Settings (Captain/Admin only)
 * - Verify PIN prompt appears
 * - Select a member and toggle roles
 * - Save and verify roles persist
 * - Check that member's roles appear correctly in other screens
 */

import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { MemberRole } from "@/lib/roles";
import { canAssignRoles, normalizeMemberRoles, normalizeSessionRole } from "@/lib/permissions";
import { useBootstrap } from "@/lib/useBootstrap";
import { subscribeMembersBySociety, updateMemberDoc, type MemberDoc } from "@/lib/db/memberRepo";
import { subscribeSocietyDoc } from "@/lib/db/societyRepo";
import { subscribeMemberDoc } from "@/lib/db/memberRepo";

export default function RolesScreen() {
  const { user } = useBootstrap();
  const [members, setMembers] = useState<MemberDoc[]>([]);
  const [pinVerified, setPinVerified] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);
  const [adminPin, setAdminPin] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.activeSocietyId) {
      setMembers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubscribe = subscribeMembersBySociety(user.activeSocietyId, (items) => {
      setMembers(items);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user?.activeSocietyId]);

  useEffect(() => {
    if (!user?.activeSocietyId) return;
    const unsubscribe = subscribeSocietyDoc(user.activeSocietyId, (doc) => {
      setAdminPin(doc?.adminPin ?? null);
    });
    return () => unsubscribe();
  }, [user?.activeSocietyId]);

  useEffect(() => {
    if (!user?.activeMemberId) return;
    const unsubscribe = subscribeMemberDoc(user.activeMemberId, (member) => {
      const sessionRole = normalizeSessionRole("member");
      const roles = normalizeMemberRoles(member?.roles);
      const canAssignRolesFlag = canAssignRoles(sessionRole, roles);
      if (!canAssignRolesFlag) {
        Alert.alert("Access Denied", "Only Captain can assign roles", [
          { text: "OK", onPress: () => router.back() },
        ]);
      }
    });
    return () => unsubscribe();
  }, [router, user?.activeMemberId]);
  
  const handleCreateAdminMember = async () => {
    try {
      Alert.alert("Info", "Create a member from the Members screen, then assign roles here.");
    } catch (error) {
      console.error("Error creating admin member:", error);
      Alert.alert("Error", "Failed to create admin member");
    }
  };

  const verifyPin = async () => {
    try {
      if (!adminPin) {
        Alert.alert("Error", "Admin PIN not set. Please set it in Settings first.");
        return;
      }

      if (pinInput !== adminPin) {
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
        const captainCount = members.filter((m) => 
          m.id !== memberId && m.roles && (m.roles.includes("captain") || m.roles.includes("admin"))
        ).length;
        
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
    try {
      console.log("Saving roles for members:", members.map(m => ({ name: m.name, roles: m.roles })));
      
      // Check if there's at least one captain/admin
      const captainCount = members.filter((m) => 
        m.roles && (m.roles.includes("captain") || m.roles.includes("admin"))
      ).length;
      
      if (captainCount === 0) {
        Alert.alert("Cannot Save", "There must be at least one Captain or Admin in the society");
        return;
      }

      // Ensure all members have roles array
      const membersToSave = members.map(m => ({
        ...m,
        roles: m.roles && m.roles.length > 0 ? m.roles : ["member"]
      }));

      const updates = membersToSave.map((member) =>
        updateMemberDoc(member.id, {
          roles: member.roles && member.roles.length > 0 ? member.roles : ["member"],
        })
      );
      await Promise.all(updates);
      setHasChanges(false);
      
      Alert.alert("Success", "Roles updated successfully");
    } catch (error) {
      console.error("Error saving roles:", error);
      Alert.alert("Error", "Failed to save roles");
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!pinVerified) {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Assign Roles</Text>
          <Text style={styles.subtitle}>Enter Admin PIN to continue</Text>

          <View style={styles.pinSection}>
            <Text style={styles.pinLabel}>Admin PIN</Text>
            <TextInput
              value={pinInput}
              onChangeText={setPinInput}
              placeholder="4-digit PIN"
              keyboardType="numeric"
              secureTextEntry
              maxLength={4}
              style={styles.pinInput}
            />
            <Pressable onPress={verifyPin} style={styles.verifyButton}>
              <Text style={styles.verifyButtonText}>Verify</Text>
            </Pressable>
          </View>

          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Assign Roles</Text>
        <Text style={styles.subtitle}>Assign roles to members</Text>

        {members.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No members found</Text>
            <Text style={styles.emptySubtext}>
              Go to Members and add first member, or create admin member below
            </Text>
            <Pressable
              onPress={handleCreateAdminMember}
              style={styles.createAdminButton}
            >
              <Text style={styles.createAdminButtonText}>Create Admin Member</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/members" as any)}
              style={styles.goToMembersButton}
            >
              <Text style={styles.goToMembersButtonText}>Go to Members</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={styles.instructionText}>
              Tap checkboxes to assign roles. Member role is always included and cannot be removed.
            </Text>
            <View style={styles.membersList}>
              {members.map((member) => {
                const memberRoles = member.roles && member.roles.length > 0 ? member.roles : ["member"];
                return (
                  <View key={member.id} style={styles.memberCard}>
                    <Text style={styles.memberName}>{member.name}</Text>
                    <Text style={styles.currentRolesText}>
                      Current roles: {memberRoles.filter(r => r !== "member").join(", ") || "None (Member only)"}
                    </Text>
                    <View style={styles.rolesRow}>
                      {(["captain", "treasurer", "secretary", "handicapper"] as MemberRole[]).map(
                        (role, index) => {
                          const isChecked = memberRoles.includes(role);
                          return (
                            <Pressable
                              key={role}
                              onPress={() => {
                                console.log(`Toggling role ${role} for member ${member.id} (${member.name})`);
                                toggleRole(member.id, role);
                              }}
                              style={[
                                styles.roleCheckbox,
                                isChecked && styles.roleCheckboxChecked,
                                index > 0 && { marginLeft: 8 },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.roleCheckboxText,
                                  isChecked && styles.roleCheckboxTextChecked,
                                ]}
                              >
                                {role.charAt(0).toUpperCase() + role.slice(1)} {isChecked ? "✓" : ""}
                              </Text>
                            </Pressable>
                          );
                        }
                      )}
                      {/* Member role is always included, show as read-only */}
                      <View
                        style={[
                          styles.roleCheckbox,
                          styles.roleCheckboxDisabled,
                          { marginLeft: 8 },
                        ]}
                      >
                        <Text style={[styles.roleCheckboxText, styles.roleCheckboxTextDisabled]}>
                          Member ✓
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
            {hasChanges && (
              <Pressable onPress={handleSaveAll} style={styles.saveButton}>
                <Text style={styles.saveButtonText}>Save All Changes</Text>
              </Pressable>
            )}
          </>
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
  pinSection: {
    marginBottom: 24,
  },
  pinLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 8,
  },
  pinInput: {
    backgroundColor: "#f9fafb",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 12,
  },
  verifyButton: {
    backgroundColor: "#0B6E4F",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  verifyButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: "#6b7280",
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#9ca3af",
    textAlign: "center",
    marginBottom: 16,
  },
  createAdminButton: {
    backgroundColor: "#0B6E4F",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 12,
  },
  createAdminButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  goToMembersButton: {
    backgroundColor: "#f3f4f6",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    alignItems: "center",
  },
  goToMembersButtonText: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "600",
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
  currentRolesText: {
    fontSize: 12,
    color: "#6b7280",
    fontStyle: "italic",
    marginBottom: 8,
  },
  memberRoles: {
    fontSize: 14,
    color: "#6b7280",
  },
  instructionText: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 16,
    fontStyle: "italic",
  },
  rolesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 12,
  },
  roleCheckbox: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  roleCheckboxChecked: {
    borderColor: "#0B6E4F",
    backgroundColor: "#f0fdf4",
  },
  roleCheckboxText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
  },
  roleCheckboxTextChecked: {
    color: "#0B6E4F",
  },
  roleCheckboxDisabled: {
    opacity: 0.6,
    backgroundColor: "#f3f4f6",
  },
  roleCheckboxTextDisabled: {
    color: "#9ca3af",
  },
  rolesSection: {
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  rolesTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 16,
  },
  roleOption: {
    backgroundColor: "#fff",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: "transparent",
  },
  roleOptionSelected: {
    borderColor: "#0B6E4F",
    backgroundColor: "#f0fdf4",
  },
  roleOptionText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  roleOptionTextSelected: {
    color: "#0B6E4F",
  },
  saveButton: {
    backgroundColor: "#0B6E4F",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 16,
  },
  saveButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  backButton: {
    paddingVertical: 14,
    alignItems: "center",
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6b7280",
  },
  centerContent: {
    justifyContent: "center",
    alignItems: "center",
    flex: 1,
  },
  loadingText: {
    fontSize: 16,
    color: "#6b7280",
  },
});

