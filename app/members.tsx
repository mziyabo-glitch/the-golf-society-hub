import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { getSession, setCurrentUserId } from "@/lib/session";
import { canManageMembers, normalizeMemberRoles, normalizeSessionRole } from "@/lib/permissions";
import { ensureValidCurrentMember } from "@/lib/storage";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { loadThemeFromStorage, spacing, radius } from "@/lib/ui/theme";

type MemberData = {
  id: string;
  name: string;
  handicap?: number;
  roles?: string[];
};

export default function MembersScreen() {
  const [members, setMembers] = useState<MemberData[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserIdState] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [canManageMembersFlag, setCanManageMembersFlag] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadMembers();
      loadThemeFromStorage();
    }, [])
  );

  const loadMembers = async () => {
    try {
      // Self-heal: ensure valid current member exists
      const { members: healedMembers, currentUserId: healedUserId } = await ensureValidCurrentMember();
      
      setMembers(healedMembers);

      // Load session (single source of truth)
      const session = await getSession();
      const effectiveUserId = healedUserId || session.currentUserId;
      setCurrentUserIdState(effectiveUserId);

      // Permissions should never block loading members; gate only editing UI/actions.
      const current = healedMembers.find((m) => m.id === effectiveUserId) || null;
      const sessionRole = normalizeSessionRole(session.role);
      const memberRoles = normalizeMemberRoles(current?.roles);

      // Dev-only unit-style check: ensure we didn't shadow the import again
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log("[Members] typeof canManageMembers:", typeof canManageMembers);
      }

      setCanManageMembersFlag(canManageMembers(sessionRole, memberRoles));
    } catch (error) {
      console.error("Error loading members:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSetAsProfile = async (memberId: string) => {
    try {
      await setCurrentUserId(memberId);
      setCurrentUserIdState(memberId);
      setSelectedMemberId(null);
      Alert.alert("Success", "Profile set successfully");
    } catch (error) {
      console.error("Error setting profile:", error);
      Alert.alert("Error", "Failed to set profile");
    }
  };

  const handleMemberPress = (memberId: string) => {
    if (selectedMemberId === memberId) {
      setSelectedMemberId(null);
    } else {
      setSelectedMemberId(memberId);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#0B6E4F" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Members</Text>

        {members.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No members yet</Text>
            {canManageMembersFlag ? (
              <>
                <Text style={styles.emptySubtext}>Add your first member to get started</Text>
                <Pressable
                  onPress={() => router.push("/add-member" as any)}
                  style={[styles.addButton, { marginTop: 16 }]}
                >
                  <Text style={styles.buttonText}>Add First Member</Text>
                </Pressable>
              </>
            ) : (
              <Text style={styles.emptySubtext}>
                Ask your Captain or Secretary to add the first member
              </Text>
            )}
          </View>
        ) : (
          members.map((member) => (
            <View key={member.id}>
              <Pressable
                onPress={() => handleMemberPress(member.id)}
                style={[
                  styles.memberCard,
                  selectedMemberId === member.id && styles.memberCardSelected,
                  currentUserId === member.id && styles.memberCardActive,
                ]}
              >
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{member.name}</Text>
                  {member.handicap !== undefined && (
                    <Text style={styles.memberHandicap}>HCP: {member.handicap}</Text>
                  )}
                  {currentUserId === member.id && (
                    <Text style={styles.activeBadge}>My Profile</Text>
                  )}
                </View>
              </Pressable>
              {selectedMemberId === member.id && (
                <View style={styles.memberActions}>
                  <Pressable
                    onPress={() => {
                      setSelectedMemberId(null);
                      router.push("/profile" as any);
                    }}
                    style={styles.actionButton}
                  >
                    <Text style={styles.actionButtonText}>
                      {currentUserId === member.id ? "View / Edit" : "View"}
                    </Text>
                  </Pressable>
                  {currentUserId !== member.id && canManageMembersFlag && (
                    <Pressable
                      onPress={() => {
                        Alert.alert("Access Denied", "Only Captain or Admin can edit other members' profiles");
                        setSelectedMemberId(null);
                      }}
                      style={styles.actionButton}
                    >
                      <Text style={styles.actionButtonText}>Edit (Captain only)</Text>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => handleSetAsProfile(member.id)}
                    style={[styles.actionButton, styles.actionButtonPrimary]}
                  >
                    <Text style={[styles.actionButtonText, styles.actionButtonTextPrimary]}>
                      Set as My Profile
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          ))
        )}

        {canManageMembersFlag && (
          <AppButton
            label={members.length === 0 ? "Add First Member" : "Add Member"}
            onPress={() => router.push("/add-member" as any)}
            variant="primary"
            size="lg"
            fullWidth
            style={styles.addButton}
          />
        )}

        <AppButton
          label="Back"
          onPress={() => router.back()}
          variant="ghost"
          size="md"
          style={styles.backButton}
        />
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
  centerContent: {
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 34,
    fontWeight: "800",
    marginBottom: 24,
  },
  emptyState: {
    alignItems: "center",
    marginTop: 40,
    marginBottom: 24,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    opacity: 0.6,
    color: "#111827",
  },
  memberCard: {
    backgroundColor: "#f3f4f6",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: "transparent",
  },
  memberCardSelected: {
    borderColor: "#0B6E4F",
  },
  memberCardActive: {
    backgroundColor: "#f0fdf4",
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  memberHandicap: {
    fontSize: 14,
    opacity: 0.7,
    color: "#111827",
    marginBottom: 4,
  },
  activeBadge: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0B6E4F",
    marginTop: 4,
  },
  memberActions: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "#f3f4f6",
  },
  actionButtonPrimary: {
    backgroundColor: "#0B6E4F",
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  actionButtonTextPrimary: {
    color: "white",
  },
  addButton: {
    backgroundColor: "#0B6E4F",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 12,
  },
  buttonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "700",
  },
  backButton: {
    paddingVertical: 12,
    alignItems: "center",
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6b7280",
  },
});

