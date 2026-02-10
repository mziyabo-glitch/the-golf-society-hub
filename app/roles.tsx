/**
 * Roles screen (Captain only) + PIN gate
 *
 * FIX:
 * - Normalize loaded roles to lowercase so checkboxes reflect reality
 * - Save ONLY lowercase roles to Firestore so RBAC is stable everywhere
 */

import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { canAssignRoles as canAssignRolesPure, normalizeMemberRoles, normalizeSessionRole } from "@/lib/permissions";
import { normalizeRolesArray, type MemberRole } from "@/lib/roles";
import { useBootstrap } from "@/lib/useBootstrap";
import { subscribeMembersBySociety, updateMemberDoc, type MemberDoc, subscribeMemberDoc } from "@/lib/db/memberRepo";
import { subscribeSocietyDoc } from "@/lib/db/societyRepo";

const ROLE_OPTIONS: MemberRole[] = ["captain", "treasurer", "secretary", "handicapper"];

function labelize(role: MemberRole): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

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
      // ✅ normalize roles immediately for UI correctness
      const normalized = items.map((m) => ({
        ...m,
        roles: normalizeRolesArray(m.roles),
      }));
      setMembers(normalized);
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
      // NOTE: sessionRole is not stored; treat as MEMBER and rely on roles
      const sessionRole = normalizeSessionRole("member");
      const rolesForPermissions = normalizeMemberRoles(member?.roles); // TitleCase-compatible
      const ok = canAssignRolesPure(sessionRole, rolesForPermissions);
      if (!ok) {
        Alert.alert("Access Denied", "Only Captain can assign roles", [
          { text: "OK", onPress: () => router.back() },
        ]);
      }
    });
    return () => unsubscribe();
  }, [user?.activeMemberId]);

  const verifyPin = async () => {
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
  };

  const captainLikeCount = useMemo(() => {
    return members.filter((m) => {
      const roles = normalizeRolesArray(m.roles);
      return roles.includes("captain") || roles.includes("admin");
    }).length;
  }, [members]);

  const toggleRole = (memberId: string, role: MemberRole) => {
    if (role === "member") return;

    setMembers((prev) => {
      const next = prev.map((m) => {
        if (m.id !== memberId) return m;

        const roles = new Set<MemberRole>(normalizeRolesArray(m.roles));

        // prevent removing last captain/admin
        if (role === "captain" && roles.has("captain")) {
          const otherCaptainCount = prev.filter((x) => x.id !== memberId).filter((x) => {
            const r = normalizeRolesArray(x.roles);
            return r.includes("captain") || r.includes("admin");
          }).length;

          if (otherCaptainCount === 0) {
            Alert.alert("Cannot Remove", "There must be at least one Captain (or Admin) in the society.");
            return m;
          }
        }

        if (roles.has(role)) roles.delete(role);
        else roles.add(role);

        roles.add("member"); // always keep member
        return { ...m, roles: Array.from(roles) };
      });

      return next;
    });

    setHasChanges(true);
  };

  const handleSaveAll = async () => {
    // must keep at least one captain/admin
    if (captainLikeCount === 0) {
      Alert.alert("Cannot Save", "There must be at least one Captain (or Admin) in the society.");
      return;
    }

    const societyId = user?.activeSocietyId;
    if (!societyId) return;
    try {
      const updates = members.map((m) => {
        const roles = normalizeRolesArray(m.roles); // ✅ force lowercase canonical
        return updateMemberDoc(societyId, m.id, { roles });
      });

      await Promise.all(updates);
      setHasChanges(false);
      Alert.alert("Success", "Roles updated successfully");
    } catch (error) {
      console.error("Error saving roles:", error);
      Alert.alert("Error", "Failed to save roles. Check Firestore rules / auth.");
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
          </View>
        ) : (
          <>
            <Text style={styles.instructionText}>
              Tap roles to assign them. Member is always included.
            </Text>

            <View style={styles.membersList}>
              {members.map((member) => {
                const roles = normalizeRolesArray(member.roles);
                const readable = roles.filter((r) => r !== "member").join(", ") || "None (Member only)";
                return (
                  <View key={member.id} style={styles.memberCard}>
                    <Text style={styles.memberName}>{member.name}</Text>
                    <Text style={styles.currentRolesText}>Current roles: {readable}</Text>

                    <View style={styles.rolesRow}>
                      {ROLE_OPTIONS.map((role, index) => {
                        const isChecked = roles.includes(role);
                        return (
                          <Pressable
                            key={role}
                            onPress={() => toggleRole(member.id, role)}
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
                              {labelize(role)} {isChecked ? "✓" : ""}
                            </Text>
                          </Pressable>
                        );
                      })}

                      <View style={[styles.roleCheckbox, styles.roleCheckboxDisabled, { marginLeft: 8 }]}>
                        <Text style={[styles.roleCheckboxText, styles.roleCheckboxTextDisabled]}>Member ✓</Text>
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
  container: { flex: 1, backgroundColor: "#fff" },
  content: { flex: 1, padding: 24 },
  centerContent: { justifyContent: "center", alignItems: "center" },

  title: { fontSize: 34, fontWeight: "800", marginBottom: 6 },
  subtitle: { fontSize: 16, opacity: 0.75, marginBottom: 24 },
  loadingText: { fontSize: 16, color: "#111827" },

  pinSection: { marginBottom: 24 },
  pinLabel: { fontSize: 14, fontWeight: "600", color: "#111827", marginBottom: 8 },
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
  verifyButton: { backgroundColor: "#0B6E4F", paddingVertical: 14, borderRadius: 10, alignItems: "center" },
  verifyButtonText: { color: "white", fontSize: 16, fontWeight: "600" },

  emptyState: { alignItems: "center", paddingVertical: 40 },
  emptyText: { fontSize: 16, color: "#6b7280", marginBottom: 8 },

  instructionText: { fontSize: 14, color: "#6b7280", marginBottom: 16, fontStyle: "italic" },
  membersList: { marginBottom: 24 },

  memberCard: { backgroundColor: "#f3f4f6", borderRadius: 12, padding: 16, marginBottom: 12 },
  memberName: { fontSize: 18, fontWeight: "600", color: "#111827", marginBottom: 4 },
  currentRolesText: { fontSize: 12, color: "#6b7280", fontStyle: "italic", marginBottom: 8 },

  rolesRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 12 },
  roleCheckbox: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  roleCheckboxChecked: { borderColor: "#0B6E4F", backgroundColor: "#f0fdf4" },
  roleCheckboxText: { fontSize: 12, fontWeight: "600", color: "#6b7280" },
  roleCheckboxTextChecked: { color: "#0B6E4F" },
  roleCheckboxDisabled: { opacity: 0.6, backgroundColor: "#f3f4f6" },
  roleCheckboxTextDisabled: { color: "#9ca3af" },

  saveButton: { backgroundColor: "#0B6E4F", paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 16 },
  saveButtonText: { color: "white", fontSize: 16, fontWeight: "700" },

  backButton: { marginTop: 16, paddingVertical: 14, borderRadius: 10, backgroundColor: "#f3f4f6", alignItems: "center" },
  backButtonText: { color: "#111827", fontSize: 16, fontWeight: "700" },
});
