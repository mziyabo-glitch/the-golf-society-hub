/**
 * Member Detail/Edit Screen
 * - View member info (all users)
 * - Edit member fields:
 *   - Captain/Handicapper can edit any member
 *   - User can edit their own profile (name, email, gender)
 * - Gender and Handicap Index editing for WHS calculations
 */

import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { useBootstrap } from "@/lib/useBootstrap";
import {
  getMember,
  updateMember,
  updateMemberRole,
  type MemberDoc,
  type Gender,
} from "@/lib/db_supabase/memberRepo";
import { getPermissionsForMember } from "@/lib/rbac";
import { getColors, spacing, radius } from "@/lib/ui/theme";
import { guard } from "@/lib/guards";

type RoleValue = "member" | "treasurer" | "secretary" | "handicapper" | "captain";

const ROLE_OPTIONS: Array<{ value: RoleValue; label: string }> = [
  { value: "member", label: "Member" },
  { value: "treasurer", label: "Treasurer" },
  { value: "secretary", label: "Secretary" },
  { value: "handicapper", label: "Handicapper" },
];

const normalizeRole = (role?: string | null): RoleValue => {
  const lower = role?.toLowerCase().trim();
  if (lower === "captain") return "captain";
  if (lower === "treasurer") return "treasurer";
  if (lower === "secretary") return "secretary";
  if (lower === "handicapper") return "handicapper";
  return "member";
};

// Gender option component
function GenderOption({
  value,
  label,
  selected,
  onPress,
  colors,
}: {
  value: Gender;
  label: string;
  selected: boolean;
  onPress: () => void;
  colors: ReturnType<typeof getColors>;
}) {
  const bgColor = selected
    ? value === "female"
      ? colors.error + "20"
      : colors.info + "20"
    : colors.backgroundSecondary;
  const textColor = selected
    ? value === "female"
      ? colors.error
      : colors.info
    : colors.text;
  const borderColor = selected
    ? value === "female"
      ? colors.error
      : colors.info
    : colors.border;

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.genderOption,
        { backgroundColor: bgColor, borderColor },
      ]}
    >
      <AppText variant="body" style={{ color: textColor }}>
        {label}
      </AppText>
    </Pressable>
  );
}

function RoleOption({
  label,
  selected,
  disabled,
  onPress,
  colors,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  colors: ReturnType<typeof getColors>;
}) {
  const bgColor = selected ? colors.primary + "20" : colors.backgroundSecondary;
  const textColor = selected ? colors.primary : colors.text;
  const borderColor = selected ? colors.primary : colors.border;

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={[
        styles.roleOption,
        { backgroundColor: bgColor, borderColor, opacity: disabled ? 0.5 : 1 },
      ]}
    >
      <AppText variant="body" style={{ color: textColor }}>
        {label}
      </AppText>
    </Pressable>
  );
}

export default function MemberDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const { member: currentMember, loading: bootstrapLoading } = useBootstrap();
  const colors = getColors();

  const memberId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [member, setMember] = useState<MemberDoc | null>(null);
  const [selectedRole, setSelectedRole] = useState<RoleValue>("member");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [roleSaving, setRoleSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formWhsNumber, setFormWhsNumber] = useState("");
  const [formHandicapIndex, setFormHandicapIndex] = useState("");
  const [formGender, setFormGender] = useState<Gender>(null);

  // Permissions
  const permissions = getPermissionsForMember(currentMember as any);
  const canManageRoles = permissions.canManageRoles;
  const isOwnProfile = currentMember?.id === memberId;
  const canEditBasic = isOwnProfile || permissions.canEditMembers;
  const canEditHandicap = permissions.canManageHandicaps;
  const canEdit = canEditBasic || canEditHandicap;

  const currentRole = normalizeRole(member?.role);
  const roleLocked = currentRole === "captain";
  const roleChanged = selectedRole !== currentRole;

  const loadMember = useCallback(async () => {
    if (!memberId) {
      setError("Missing member ID");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log("[MemberDetail] Loading member:", memberId);
      const data = await getMember(memberId);

      if (data) {
        console.log("[MemberDetail] Member loaded:", data.displayName || data.name);
        setMember(data);

        // Initialize form with current values
        setFormName(data.displayName || data.name || "");
        setFormEmail(data.email || "");
        setFormWhsNumber(data.whsNumber || data.whs_number || "");
        setFormHandicapIndex(
          data.handicapIndex != null
            ? String(data.handicapIndex)
            : data.handicap_index != null
            ? String(data.handicap_index)
            : ""
        );
        setFormGender(data.gender ?? null);
      } else {
        setError("Member not found");
      }
    } catch (err: any) {
      console.error("[MemberDetail] Load error:", err);
      setError(err?.message || "Failed to load member");
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => {
    loadMember();
  }, [loadMember]);

  useEffect(() => {
    setSelectedRole(normalizeRole(member?.role));
  }, [member?.role]);

  // Refetch on focus
  useFocusEffect(
    useCallback(() => {
      if (memberId && !isEditing) {
        loadMember();
      }
    }, [memberId, isEditing, loadMember])
  );

  const handleSave = async () => {
    if (!member) return;

    // Validate name
    if (!formName.trim()) {
      Alert.alert("Missing Name", "Please enter the member's name.");
      return;
    }

    // Validate handicap index if provided
    if (formHandicapIndex.trim()) {
      const hcap = parseFloat(formHandicapIndex.trim());
      if (isNaN(hcap) || hcap < -10 || hcap > 54) {
        Alert.alert("Invalid Handicap", "Handicap index must be between -10 and 54.");
        return;
      }
    }

    setSaving(true);
    try {
      console.log("[MemberDetail] Saving member:", member.id);

      const patch: Parameters<typeof updateMember>[1] = {};

      // Basic fields (anyone can edit their own, or Captain/Treasurer can edit any)
      if (canEditBasic) {
        patch.name = formName.trim();
        patch.gender = formGender;
      }

      // Handicap fields (Captain/Handicapper only)
      if (canEditHandicap) {
        patch.whsNumber = formWhsNumber.trim() || null;
        patch.handicapIndex = formHandicapIndex.trim()
          ? parseFloat(formHandicapIndex.trim())
          : null;
        // Also allow gender to be set by handicapper
        patch.gender = formGender;
      }

      const updated = await updateMember(member.id, patch);

      console.log("[MemberDetail] Save success");
      setMember(updated);
      setIsEditing(false);
      Alert.alert("Saved", "Member updated successfully.");
    } catch (err: any) {
      console.error("[MemberDetail] Save error:", err);
      Alert.alert("Error", err?.message || "Failed to save member.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    // Reset form to current values
    if (member) {
      setFormName(member.displayName || member.name || "");
      setFormEmail(member.email || "");
      setFormWhsNumber(member.whsNumber || member.whs_number || "");
      setFormHandicapIndex(
        member.handicapIndex != null
          ? String(member.handicapIndex)
          : member.handicap_index != null
          ? String(member.handicap_index)
          : ""
      );
      setFormGender(member.gender ?? null);
    }
    setIsEditing(false);
  };

  const handleUpdateRole = async () => {
    if (!guard(canManageRoles, "Only the Captain can change roles.")) return;
    if (!member) return;
    if (roleLocked) {
      Alert.alert("Not allowed", "Captain role cannot be changed here.");
      return;
    }
    if (!roleChanged) {
      Alert.alert("No changes", "Select a different role to update.");
      return;
    }

    setRoleSaving(true);
    try {
      const updated = await updateMemberRole(member.id, selectedRole);
      setMember(updated);
      setSelectedRole(normalizeRole(updated.role));
      Alert.alert("Updated", "Role updated.");
    } catch (err: any) {
      console.error("[members/[id]] update role error:", err);
      Alert.alert("Error", err?.message || "Failed to update role.");
    } finally {
      setRoleSaving(false);
    }
  };

  if (bootstrapLoading || loading) {
    return (
      <Screen scrollable={false}>
        <View style={styles.centered}>
          <LoadingState message="Loading member..." />
        </View>
      </Screen>
    );
  }

  if (error || !member) {
    return (
      <Screen>
        <EmptyState
          icon={<Feather name="alert-circle" size={24} color={colors.error} />}
          title="Error"
          message={error || "Member not found"}
          action={{ label: "Go Back", onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  // Format role for display
  const formatRole = (role: string | undefined): string => {
    if (!role) return "Member";
    const lower = role.toLowerCase();
    const roleNames: Record<string, string> = {
      captain: "Captain",
      treasurer: "Treasurer",
      secretary: "Secretary",
      handicapper: "Handicapper",
      member: "Member",
    };
    return roleNames[lower] || role.charAt(0).toUpperCase() + role.slice(1);
  };

  // Format gender for display
  const formatGender = (gender: Gender): string => {
    if (gender === "male") return "Male";
    if (gender === "female") return "Female";
    return "Not set";
  };

  return (
    <Screen>
      {/* Header */}
      <View style={styles.header}>
        <SecondaryButton onPress={() => router.back()} size="sm">
          <Feather name="arrow-left" size={16} color={colors.text} />
          {" Back"}
        </SecondaryButton>

        <View style={{ flex: 1 }} />

        {canEdit && !isEditing && (
          <PrimaryButton onPress={() => setIsEditing(true)} size="sm">
            Edit
          </PrimaryButton>
        )}
      </View>

      {/* Member Avatar & Name */}
      <View style={styles.profileHeader}>
        <View style={[styles.avatar, { backgroundColor: colors.backgroundTertiary }]}>
          <AppText variant="h1" color="primary">
            {(member.displayName || member.name || "?").charAt(0).toUpperCase()}
          </AppText>
        </View>
        {!isEditing && (
          <>
            <AppText variant="h2" style={{ marginTop: spacing.sm }}>
              {member.displayName || member.name || "Unknown"}
            </AppText>
            <View style={styles.badgeRow}>
              <View style={[styles.roleBadge, { backgroundColor: colors.backgroundTertiary }]}>
                <AppText variant="caption" color="secondary">
                  {formatRole(member.role)}
                </AppText>
              </View>
              {member.gender && (
                <View
                  style={[
                    styles.roleBadge,
                    {
                      backgroundColor:
                        member.gender === "female" ? colors.error + "20" : colors.info + "20",
                    },
                  ]}
                >
                  <AppText
                    variant="caption"
                    style={{ color: member.gender === "female" ? colors.error : colors.info }}
                  >
                    {member.gender === "female" ? "Female" : "Male"}
                  </AppText>
                </View>
              )}
            </View>
          </>
        )}
      </View>

      {/* Edit Mode */}
      {isEditing ? (
        <AppCard>
          <View style={styles.formField}>
            <AppText variant="captionBold" style={styles.label}>
              Name
            </AppText>
            <AppInput
              placeholder="e.g. John Smith"
              value={formName}
              onChangeText={setFormName}
              autoCapitalize="words"
              editable={canEditBasic}
            />
          </View>

          <View style={styles.formField}>
            <AppText variant="captionBold" style={styles.label}>
              Email (optional)
            </AppText>
            <AppInput
              placeholder="e.g. john@example.com"
              value={formEmail}
              onChangeText={setFormEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={canEditBasic}
            />
          </View>

          {/* Gender Selection */}
          <View style={styles.formField}>
            <AppText variant="captionBold" style={styles.label}>
              Gender
            </AppText>
            <AppText variant="small" color="tertiary" style={{ marginBottom: spacing.xs }}>
              Required for WHS handicap calculations with different tees
            </AppText>
            <View style={styles.genderRow}>
              <GenderOption
                value="male"
                label="Male"
                selected={formGender === "male"}
                onPress={() => setFormGender("male")}
                colors={colors}
              />
              <GenderOption
                value="female"
                label="Female"
                selected={formGender === "female"}
                onPress={() => setFormGender("female")}
                colors={colors}
              />
              <Pressable
                onPress={() => setFormGender(null)}
                style={[
                  styles.genderClear,
                  { opacity: formGender ? 1 : 0.5 },
                ]}
              >
                <Feather name="x" size={16} color={colors.textTertiary} />
              </Pressable>
            </View>
          </View>

          {canEditHandicap ? (
            <>
              <View style={styles.formField}>
                <AppText variant="captionBold" style={styles.label}>
                  WHS Number (optional)
                </AppText>
                <AppInput
                  placeholder="e.g. 1234567"
                  value={formWhsNumber}
                  onChangeText={setFormWhsNumber}
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.formField}>
                <AppText variant="captionBold" style={styles.label}>
                  Handicap Index
                </AppText>
                <AppInput
                  placeholder="e.g. 12.4"
                  value={formHandicapIndex}
                  onChangeText={setFormHandicapIndex}
                  keyboardType="decimal-pad"
                />
                <AppText variant="small" color="tertiary" style={{ marginTop: 4 }}>
                  Valid range: -10 to 54
                </AppText>
              </View>
            </>
          ) : (
            <AppCard style={{ backgroundColor: colors.backgroundTertiary, marginTop: spacing.sm }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <Feather name="info" size={16} color={colors.textTertiary} />
                <AppText variant="caption" color="tertiary">
                  Only Captain or Handicapper can edit WHS and Handicap fields.
                </AppText>
              </View>
            </AppCard>
          )}

          <View style={styles.buttonRow}>
            <SecondaryButton onPress={handleCancel} style={{ flex: 1 }}>
              Cancel
            </SecondaryButton>
            <PrimaryButton onPress={handleSave} loading={saving} style={{ flex: 1 }}>
              Save
            </PrimaryButton>
          </View>
        </AppCard>
      ) : (
        /* View Mode */
        <AppCard>
          {/* Email */}
          <View style={styles.infoRow}>
            <View style={[styles.infoIcon, { backgroundColor: colors.backgroundTertiary }]}>
              <Feather name="mail" size={16} color={colors.textSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="caption" color="tertiary">
                Email
              </AppText>
              <AppText variant="body">{member.email || "Not set"}</AppText>
            </View>
          </View>

          {/* Gender */}
          <View style={styles.infoRow}>
            <View style={[styles.infoIcon, { backgroundColor: colors.backgroundTertiary }]}>
              <Feather name="user" size={16} color={colors.textSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="caption" color="tertiary">
                Gender
              </AppText>
              <AppText variant="body">{formatGender(member.gender ?? null)}</AppText>
            </View>
          </View>

          {/* WHS Number */}
          <View style={styles.infoRow}>
            <View style={[styles.infoIcon, { backgroundColor: colors.backgroundTertiary }]}>
              <Feather name="hash" size={16} color={colors.textSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="caption" color="tertiary">
                WHS Number
              </AppText>
              <AppText variant="body">
                {member.whsNumber || member.whs_number || "Not set"}
              </AppText>
            </View>
          </View>

          {/* Handicap Index */}
          <View style={styles.infoRow}>
            <View style={[styles.infoIcon, { backgroundColor: colors.backgroundTertiary }]}>
              <Feather name="trending-down" size={16} color={colors.textSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="caption" color="tertiary">
                Handicap Index
              </AppText>
              <AppText variant="body">
                {member.handicapIndex != null
                  ? Number(member.handicapIndex).toFixed(1)
                  : member.handicap_index != null
                  ? Number(member.handicap_index).toFixed(1)
                  : "Not set"}
              </AppText>
            </View>
          </View>

          {/* Payment Status */}
          <View style={styles.infoRow}>
            <View style={[styles.infoIcon, { backgroundColor: colors.backgroundTertiary }]}>
              <Feather name="credit-card" size={16} color={colors.textSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="caption" color="tertiary">
                Membership Fee
              </AppText>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
                <Feather
                  name={member.paid ? "check-circle" : "circle"}
                  size={14}
                  color={member.paid ? colors.success : colors.textTertiary}
                />
                <AppText
                  variant="body"
                  style={{ color: member.paid ? colors.success : colors.text }}
                >
                  {member.paid ? "Paid" : "Unpaid"}
                </AppText>
              </View>
            </View>
          </View>

          {/* No Edit Access Message */}
          {!canEdit && (
            <AppCard style={{ backgroundColor: colors.backgroundTertiary, marginTop: spacing.base }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <Feather name="lock" size={16} color={colors.textTertiary} />
                <AppText variant="caption" color="tertiary">
                  Only Captain or Handicapper can edit member details.
                </AppText>
              </View>
            </AppCard>
          )}
        </AppCard>
      )}

      {canManageRoles && (
        <AppCard style={{ marginTop: spacing.base }}>
          <AppText variant="captionBold" style={styles.label}>
            Role (Captain only)
          </AppText>
          <AppText variant="small" color="tertiary" style={{ marginBottom: spacing.sm }}>
            Assign Treasurer, Secretary, or Handicapper for this member.
          </AppText>

          <View style={{ marginBottom: spacing.sm }}>
            <AppText variant="caption" color="tertiary">
              Current role
            </AppText>
            <AppText variant="body">{formatRole(member.role)}</AppText>
          </View>

          {roleLocked ? (
            <AppCard style={{ backgroundColor: colors.backgroundTertiary }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <Feather name="info" size={16} color={colors.textTertiary} />
                <AppText variant="caption" color="tertiary">
                  Captain role cannot be changed here.
                </AppText>
              </View>
            </AppCard>
          ) : (
            <>
              <View style={styles.roleRow}>
                {ROLE_OPTIONS.map((option) => (
                  <RoleOption
                    key={option.value}
                    label={option.label}
                    selected={selectedRole === option.value}
                    onPress={() => setSelectedRole(option.value)}
                    colors={colors}
                  />
                ))}
              </View>
              <View style={styles.roleActions}>
                <PrimaryButton
                  onPress={handleUpdateRole}
                  loading={roleSaving}
                  disabled={!roleChanged || roleSaving}
                >
                  Save Role
                </PrimaryButton>
              </View>
            </>
          )}
        </AppCard>
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
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  profileHeader: {
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  roleBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  formField: {
    marginBottom: spacing.base,
  },
  label: {
    marginBottom: spacing.xs,
  },
  genderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  genderOption: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: "center",
  },
  genderClear: {
    padding: spacing.sm,
  },
  buttonRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.base,
  },
  roleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  roleOption: {
    minWidth: 120,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: "center",
    flexGrow: 1,
  },
  roleActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: spacing.sm,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
});
