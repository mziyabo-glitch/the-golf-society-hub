import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { getSession, setCurrentUserId } from "@/lib/session";
import { canManageMembers, normalizeMemberRoles, normalizeSessionRole } from "@/lib/permissions";
import { ensureValidCurrentMember } from "@/lib/storage";
import { Screen } from "@/components/ui/Screen";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { Badge } from "@/components/ui/Badge";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Row } from "@/components/ui/Row";
import { getColors, spacing } from "@/lib/ui/theme";

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

  const colors = getColors();

  if (loading) {
    return (
      <Screen scrollable={false}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  const getRoleBadges = (roles?: string[]) => {
    if (!roles || roles.length === 0) return null;
    const roleMap: Record<string, string> = {
      captain: "Captain",
      treasurer: "Treasurer",
      secretary: "Secretary",
      handicapper: "Handicapper",
      member: "Member",
    };
    return roles
      .filter((r) => r !== "member")
      .map((r) => {
        const label = roleMap[r.toLowerCase()] || r;
        return <Badge key={r} label={label} variant="role" style={styles.roleBadge} />;
      });
  };

  return (
    <Screen>
      <SectionHeader
        title="Members"
        rightAction={
          canManageMembersFlag
            ? {
                label: "Add Member",
                onPress: () => router.push("/add-member" as any),
              }
            : undefined
        }
      />

      {members.length === 0 ? (
        <EmptyState
          title="No members yet"
          message={
            canManageMembersFlag
              ? "Add your first member to get started"
              : "Ask your Captain or Secretary to add the first member"
          }
          action={
            canManageMembersFlag
              ? {
                  label: "Add First Member",
                  onPress: () => router.push("/add-member" as any),
                }
              : undefined
          }
        />
      ) : (
        <>
          {members.map((member) => (
            <AppCard key={member.id} style={currentUserId === member.id && styles.activeCard}>
              <Pressable onPress={() => handleMemberPress(member.id)}>
                <Row gap="sm" alignItems="flex-start">
                  <View style={styles.memberInfo}>
                    <Row gap="sm" alignItems="center" style={styles.memberHeader}>
                      <AppText variant="bodyBold">{member.name}</AppText>
                      {currentUserId === member.id && <Badge label="My Profile" variant="status" />}
                    </Row>
                    <Row gap="sm" alignItems="center" style={styles.memberMeta}>
                      {member.handicap !== undefined && (
                        <AppText variant="small" color="secondary">
                          HCP: {member.handicap}
                        </AppText>
                      )}
                      {getRoleBadges(member.roles)}
                    </Row>
                  </View>
                </Row>
              </Pressable>
              {selectedMemberId === member.id && (
                <View style={styles.memberActions}>
                  <SecondaryButton
                    onPress={() => {
                      setSelectedMemberId(null);
                      router.push("/profile" as any);
                    }}
                    style={styles.actionButton}
                  >
                    {currentUserId === member.id ? "View / Edit" : "View"}
                  </SecondaryButton>
                  <PrimaryButton
                    onPress={() => handleSetAsProfile(member.id)}
                    style={styles.actionButton}
                  >
                    Set as My Profile
                  </PrimaryButton>
                </View>
              )}
            </AppCard>
          ))}

          {canManageMembersFlag && (
            <PrimaryButton
              onPress={() => router.push("/add-member" as any)}
              style={styles.addButton}
            >
              Add Member
            </PrimaryButton>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  activeCard: {
    borderWidth: 2,
    borderColor: "#0B6E4F",
    backgroundColor: "#f0fdf4",
  },
  memberInfo: {
    flex: 1,
  },
  memberHeader: {
    marginBottom: spacing.xs,
  },
  memberMeta: {
    flexWrap: "wrap",
  },
  roleBadge: {
    marginRight: spacing.xs,
  },
  memberActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionButton: {
    flex: 1,
  },
  addButton: {
    marginTop: spacing.lg,
  },
});


