import { useEffect, useState } from "react";
import { StyleSheet, View, Pressable, Alert } from "react-native";
import { Feather } from "@expo/vector-icons";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { PrimaryButton, SecondaryButton, DestructiveButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { useBootstrap } from "@/lib/useBootstrap";
import {
  subscribeMembersBySociety,
  createMember,
  updateMemberDoc,
  deleteMember,
  type MemberDoc,
} from "@/lib/db/memberRepo";
import { getPermissionsForMember } from "@/lib/rbac";
import { getColors, spacing, radius } from "@/lib/ui/theme";

type ModalMode = "none" | "add" | "edit";

export default function MembersScreen() {
  const { societyId, member: currentMember, loading: bootstrapLoading } = useBootstrap();
  const colors = getColors();

  const [members, setMembers] = useState<MemberDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<ModalMode>("none");
  const [editingMember, setEditingMember] = useState<MemberDoc | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Get permissions for current member
  const permissions = getPermissionsForMember(currentMember as any);

  useEffect(() => {
    if (!societyId) {
      setLoading(false);
      return;
    }

    const unsub = subscribeMembersBySociety(
      societyId,
      (docs) => {
        setMembers(docs);
        setLoading(false);
      },
      (err) => {
        console.error("Members subscription error:", err);
        setLoading(false);
      }
    );

    return unsub;
  }, [societyId]);

  const openAddModal = () => {
    setFormName("");
    setFormEmail("");
    setEditingMember(null);
    setModalMode("add");
  };

  const openEditModal = (member: MemberDoc) => {
    setFormName(member.displayName || member.name || "");
    setFormEmail(member.email || "");
    setEditingMember(member);
    setModalMode("edit");
  };

  const closeModal = () => {
    setModalMode("none");
    setEditingMember(null);
    setFormName("");
    setFormEmail("");
  };

  const handleAddMember = async () => {
    if (!formName.trim()) {
      Alert.alert("Missing Name", "Please enter the member's name.");
      return;
    }
    if (!societyId) return;

    setSubmitting(true);
    try {
      await createMember(societyId, {
        displayName: formName.trim(),
        name: formName.trim(),
        email: formEmail.trim() || undefined,
        roles: ["member"],
      });
      closeModal();
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to add member.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateMember = async () => {
    if (!formName.trim()) {
      Alert.alert("Missing Name", "Please enter the member's name.");
      return;
    }
    if (!societyId || !editingMember) return;

    setSubmitting(true);
    try {
      await updateMemberDoc(societyId, editingMember.id, {
        displayName: formName.trim(),
        name: formName.trim(),
        email: formEmail.trim() || undefined,
      });
      closeModal();
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to update member.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteMember = (member: MemberDoc) => {
    if (member.id === currentMember?.id) {
      Alert.alert("Cannot Delete", "You cannot delete your own account. Use 'Leave Society' in Settings instead.");
      return;
    }

    Alert.alert(
      "Delete Member",
      `Are you sure you want to remove ${member.displayName || member.name || "this member"} from the society?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteMember(member.id);
            } catch (e: any) {
              Alert.alert("Error", e?.message || "Failed to delete member.");
            }
          },
        },
      ]
    );
  };

  const handleTogglePaid = async (member: MemberDoc) => {
    if (!societyId) return;
    try {
      await updateMemberDoc(societyId, member.id, {
        paid: !member.paid,
        paidDate: !member.paid ? new Date().toISOString() : null,
      });
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Failed to update payment status.");
    }
  };

  const getRoleBadges = (member: MemberDoc) => {
    const roles = member.roles || [];
    const badges: string[] = [];

    if (roles.some((r) => r.toLowerCase() === "captain")) badges.push("Captain");
    if (roles.some((r) => r.toLowerCase() === "treasurer")) badges.push("Treasurer");
    if (roles.some((r) => r.toLowerCase() === "secretary")) badges.push("Secretary");
    if (roles.some((r) => r.toLowerCase() === "handicapper")) badges.push("Handicapper");

    return badges;
  };

  if (bootstrapLoading || loading) {
    return (
      <Screen scrollable={false}>
        <View style={styles.centered}>
          <LoadingState message="Loading members..." />
        </View>
      </Screen>
    );
  }

  // Modal for add/edit
  if (modalMode !== "none") {
    return (
      <Screen>
        <View style={styles.modalHeader}>
          <SecondaryButton onPress={closeModal} size="sm">
            Cancel
          </SecondaryButton>
          <AppText variant="h2">{modalMode === "add" ? "Add Member" : "Edit Member"}</AppText>
          <View style={{ width: 60 }} />
        </View>

        <AppCard>
          <View style={styles.formField}>
            <AppText variant="captionBold" style={styles.label}>Name</AppText>
            <AppInput
              placeholder="e.g. John Smith"
              value={formName}
              onChangeText={setFormName}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.formField}>
            <AppText variant="captionBold" style={styles.label}>Email (optional)</AppText>
            <AppInput
              placeholder="e.g. john@example.com"
              value={formEmail}
              onChangeText={setFormEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <PrimaryButton
            onPress={modalMode === "add" ? handleAddMember : handleUpdateMember}
            loading={submitting}
            style={{ marginTop: spacing.sm }}
          >
            {modalMode === "add" ? "Add Member" : "Save Changes"}
          </PrimaryButton>

          {modalMode === "edit" && editingMember && permissions.canDeleteMembers && (
            <DestructiveButton
              onPress={() => handleDeleteMember(editingMember)}
              style={{ marginTop: spacing.sm }}
            >
              Delete Member
            </DestructiveButton>
          )}
        </AppCard>
      </Screen>
    );
  }

  return (
    <Screen>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <AppText variant="title">Members</AppText>
          <AppText variant="caption" color="secondary">{members.length} member{members.length !== 1 ? "s" : ""}</AppText>
        </View>
        {permissions.canCreateMembers && (
          <PrimaryButton onPress={openAddModal} size="sm">
            Add Member
          </PrimaryButton>
        )}
      </View>

      {/* Members List */}
      {members.length === 0 ? (
        <EmptyState
          icon={<Feather name="users" size={24} color={colors.textTertiary} />}
          title="No Members Yet"
          message="Add members to your society to get started."
          action={permissions.canCreateMembers ? { label: "Add Member", onPress: openAddModal } : undefined}
        />
      ) : (
        <View style={styles.list}>
          {members.map((member) => {
            const roleBadges = getRoleBadges(member);
            const isCurrentUser = member.id === currentMember?.id;

            return (
              <Pressable
                key={member.id}
                onPress={permissions.canEditMembers ? () => openEditModal(member) : undefined}
              >
                <AppCard style={styles.memberCard}>
                  <View style={styles.memberRow}>
                    {/* Avatar */}
                    <View style={[styles.avatar, { backgroundColor: colors.backgroundTertiary }]}>
                      <AppText variant="bodyBold" color="primary">
                        {(member.displayName || member.name || "?").charAt(0).toUpperCase()}
                      </AppText>
                    </View>

                    {/* Info */}
                    <View style={styles.memberInfo}>
                      <View style={styles.nameRow}>
                        <AppText variant="bodyBold">
                          {member.displayName || member.name || "Unknown"}
                        </AppText>
                        {isCurrentUser && (
                          <View style={[styles.badge, { backgroundColor: colors.primary + "20" }]}>
                            <AppText variant="small" color="primary">You</AppText>
                          </View>
                        )}
                      </View>

                      {roleBadges.length > 0 && (
                        <View style={styles.rolesRow}>
                          {roleBadges.map((role) => (
                            <View key={role} style={[styles.badge, { backgroundColor: colors.backgroundTertiary }]}>
                              <AppText variant="small" color="secondary">{role}</AppText>
                            </View>
                          ))}
                        </View>
                      )}

                      {member.email && (
                        <AppText variant="caption" color="tertiary">{member.email}</AppText>
                      )}
                    </View>

                    {/* Payment Status */}
                    {permissions.canManageMembershipFees ? (
                      <Pressable
                        onPress={() => handleTogglePaid(member)}
                        style={[
                          styles.paidBadge,
                          { backgroundColor: member.paid ? colors.success + "20" : colors.backgroundTertiary },
                        ]}
                      >
                        <Feather
                          name={member.paid ? "check-circle" : "circle"}
                          size={16}
                          color={member.paid ? colors.success : colors.textTertiary}
                        />
                        <AppText
                          variant="small"
                          style={{ color: member.paid ? colors.success : colors.textTertiary }}
                        >
                          {member.paid ? "Paid" : "Unpaid"}
                        </AppText>
                      </Pressable>
                    ) : (
                      <View
                        style={[
                          styles.paidBadge,
                          { backgroundColor: member.paid ? colors.success + "20" : colors.backgroundTertiary },
                        ]}
                      >
                        <Feather
                          name={member.paid ? "check-circle" : "circle"}
                          size={16}
                          color={member.paid ? colors.success : colors.textTertiary}
                        />
                      </View>
                    )}
                  </View>
                </AppCard>
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  list: {
    gap: spacing.xs,
  },
  memberCard: {
    marginBottom: 0,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  memberInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  rolesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  paidBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  formField: {
    marginBottom: spacing.base,
  },
  label: {
    marginBottom: spacing.xs,
  },
});
