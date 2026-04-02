import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { PrimaryButton, SecondaryButton, DestructiveButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { useBootstrap } from "@/lib/useBootstrap";
import {
  getMembersBySocietyId,
  addMemberAsCaptain,
  updateMemberDoc,
  updateMemberHandicap,
  updateHandicap,
  deleteMember,
  type MemberDoc,
} from "@/lib/db_supabase/memberRepo";
// updateMemberRole removed: role updates handled via roles screen
import { getOrderOfMeritTotals, type OrderOfMeritEntry } from "@/lib/db_supabase/resultsRepo";
import { getPermissionsForMember } from "@/lib/rbac";
import { getColors, spacing, radius, iconSize } from "@/lib/ui/theme";
import { confirmDestructive, showAlert } from "@/lib/ui/alert";
import { guard } from "@/lib/guards";
import { getCache, invalidateCachePrefix, setCache } from "@/lib/cache/clientCache";
/**
 * Format OOM points for display (handles decimals from tie averaging)
 */
function formatPoints(pts: number): string {
  if (pts === Math.floor(pts)) {
    return pts.toString();
  }
  return pts.toFixed(2).replace(/\.?0+$/, "");
}

type ModalMode = "none" | "add" | "edit";

// Role priority for sorting (lower number = higher priority)
const ROLE_PRIORITY: Record<string, number> = {
  captain: 1,
  treasurer: 2,
  secretary: 3,
  handicapper: 4,
  member: 5,
};

/**
 * Get the priority number for a member's role
 */
function getRolePriority(member: MemberDoc): number {
  const role = member.role?.toLowerCase() || "member";
  return ROLE_PRIORITY[role] ?? 99;
}

/**
 * Sort members by role priority, then by name alphabetically
 */
function sortMembersByRoleThenName(members: MemberDoc[]): MemberDoc[] {
  return [...members].sort((a, b) => {
    const priorityA = getRolePriority(a);
    const priorityB = getRolePriority(b);

    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    // Same priority - sort by name ASC
    const nameA = (a.displayName || a.name || "").toLowerCase();
    const nameB = (b.displayName || b.name || "").toLowerCase();
    return nameA.localeCompare(nameB);
  });
}

export default function MembersScreen() {
  const { societyId, activeSocietyId, member: currentMember, loading: bootstrapLoading } = useBootstrap();
  const router = useRouter();
  const colors = getColors();
  const tabBarHeight = useBottomTabBarHeight();
  const tabContentStyle = { paddingTop: spacing.lg, paddingBottom: tabBarHeight + spacing.lg };

  const [members, setMembers] = useState<MemberDoc[]>([]);
  const [oomStandings, setOomStandings] = useState<Map<string, OrderOfMeritEntry>>(new Map());
  const [loading, setLoading] = useState(true);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("none");
  const [editingMember, setEditingMember] = useState<MemberDoc | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formWhsNumber, setFormWhsNumber] = useState("");
  const [formHandicapIndex, setFormHandicapIndex] = useState("");
  const [formLockHI, setFormLockHI] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Get permissions for current member
  const permissions = getPermissionsForMember(currentMember);

  

  const membersCacheKey = societyId ? `society:${societyId}:members` : null;
  const lastLoadRef = useRef(0);

  const loadMembers = async (opts?: { silent?: boolean }) => {
    if (!societyId) {
      console.log("[members] No societyId, skipping load");
      setLoading(false);
      return;
    }

    if (Date.now() - lastLoadRef.current < 5000) return;
    lastLoadRef.current = Date.now();
    if (opts?.silent) setRefreshing(true);
    else setLoading(true);
    setPermissionError(null);
    setLoadError(null);

    try {
      console.log("[members] Fetching members for society:", societyId);

      // Fetch members and OOM standings in parallel
      const [membersData, oomData] = await Promise.all([
        getMembersBySocietyId(societyId),
        getOrderOfMeritTotals(societyId).catch((err) => {
          console.warn("[members] Failed to fetch OOM standings:", err);
          return [] as OrderOfMeritEntry[];
        }),
      ]);

      // Sort members by role priority, then name
      const sorted = sortMembersByRoleThenName(membersData);
      setMembers(sorted);
      if (__DEV__) {
        const david = sorted.find((m) =>
          String(m.name || m.displayName || m.display_name || "")
            .trim()
            .toLowerCase() === "david nyoni",
        );
        if (david) {
          console.log("[membership-restore-debug]", {
            memberId: david.id,
            profileId: david.user_id ?? null,
            societyId,
            restoredLinkage: david.user_id != null ? "member_row_linked_to_profile" : "member_row_present_user_link_missing",
          });
        } else {
          console.log("[membership-restore-debug]", {
            memberId: null,
            profileId: null,
            societyId,
            restoredLinkage: "member_row_missing_in_scope",
          });
        }
      }

      // Create OOM lookup map by memberId
      const oomMap = new Map<string, OrderOfMeritEntry>();
      for (const entry of oomData) {
        oomMap.set(entry.memberId, entry);
      }
      setOomStandings(oomMap);
      if (membersCacheKey) {
        await setCache(membersCacheKey, {
          members: sorted,
          oom: oomData,
        }, { ttlMs: 1000 * 60 * 5 });
      }

      console.log("[members] Query success, members:", sorted.length, "OOM entries:", oomData.length);
    } catch (err: any) {
      console.error("[members] select error:", err);

      // Handle 403 / permission errors
      const errorCode = err?.code || err?.statusCode;
      const errorMessage = err?.message || "";
      const is403 =
        errorCode === "403" ||
        errorCode === 403 ||
        errorCode === "42501" ||
        errorMessage.includes("permission") ||
        errorMessage.includes("row-level security");

      if (is403) {
        setPermissionError(
          "You don't have permission to view members for this society. Please contact the Captain."
        );
      } else {
        // Surface error in the UI so it's always visible
        setLoadError(errorMessage || "Failed to load members. Please try again.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Redirect to onboarding if no active society
  useEffect(() => {
    if (!bootstrapLoading && !activeSocietyId && !societyId) {
      console.log("[members] No active society, redirecting to onboarding");
      router.replace("/onboarding");
    }
  }, [bootstrapLoading, activeSocietyId, societyId, router]);

  useEffect(() => {
    void (async () => {
      if (!membersCacheKey) return;
      const cached = await getCache<{ members: MemberDoc[]; oom: OrderOfMeritEntry[] }>(membersCacheKey, {
        maxAgeMs: 1000 * 60 * 60,
      });
      if (cached) {
        setMembers(cached.value.members ?? []);
        const map = new Map<string, OrderOfMeritEntry>();
        for (const entry of cached.value.oom ?? []) map.set(entry.memberId, entry);
        setOomStandings(map);
        setLoading(false);
      }
      void loadMembers({ silent: !!cached });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [societyId, membersCacheKey]);

  // Refetch on focus to pick up changes from detail screen
  useFocusEffect(
    useCallback(() => {
      if (societyId) {
        loadMembers({ silent: true });
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [societyId])
  );

  const openAddModal = () => {
    setFormName("");
    setFormEmail("");
    setFormWhsNumber("");
    setFormHandicapIndex("");
    setEditingMember(null);
    setModalMode("add");
  };

  const closeModal = () => {
    setModalMode("none");
    setEditingMember(null);
    setFormName("");
    setFormEmail("");
    setFormWhsNumber("");
    setFormHandicapIndex("");
  };

  const handleAddMember = async () => {
    if (!guard(permissions.canCreateMembers, "Only authorized ManCo roles can add members.")) return;
    if (!formName.trim()) {
      showAlert("Missing Name", "Please enter the member's name.");
      return;
    }
    if (!societyId) return;

    setSubmitting(true);
    console.log("[members] Adding member via RPC...");

    try {
      const newMember = await addMemberAsCaptain(
        societyId,
        formName.trim(),
        formEmail.trim() || null,
        "member"
      );
      console.log("[members] Member added successfully, id:", newMember.id);
      closeModal();
      await invalidateCachePrefix(`society:${societyId}:`);
      loadMembers();
    } catch (e: any) {
      console.error("[members] Add member RPC error:", e?.message);

      // Show user-friendly error
      const errorMsg = e?.message || "Failed to add member.";
      if (errorMsg.includes("Permission denied") || errorMsg.includes("Only")) {
        showAlert("Permission Denied", "Only ManCo (captain, treasurer, secretary, or handicapper) can add members.");
      } else {
        showAlert("Error", errorMsg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateMember = async () => {
    if (!guard(permissions.canEditMembers || permissions.canManageHandicaps, "You don't have permission to edit this member.")) return;
    if (!formName.trim()) {
      showAlert("Missing Name", "Please enter the member's name.");
      return;
    }
    if (!societyId || !editingMember) return;

    // Validate handicap index if provided
    if (formHandicapIndex.trim()) {
      const hcap = parseFloat(formHandicapIndex.trim());
      if (isNaN(hcap) || hcap < -10 || hcap > 54) {
        showAlert("Invalid Handicap", "Handicap index must be between -10 and 54.");
        return;
      }
    }

    setSubmitting(true);
    try {
      // Update basic member info
      await updateMemberDoc(societyId, editingMember.id, {
        displayName: formName.trim(),
        name: formName.trim(),
        email: formEmail.trim() || undefined,
      });

      // Update handicap if Captain/Handicapper and values changed
      if (permissions.canManageHandicaps) {
        const oldWhs = editingMember.whsNumber || editingMember.whs_number || "";
        const oldHcap = editingMember.handicapIndex ?? editingMember.handicap_index ?? null;
        const oldLock = editingMember.handicapLock ?? editingMember.handicap_lock ?? false;
        const newWhs = formWhsNumber.trim() || null;
        const newHcap = formHandicapIndex.trim() ? parseFloat(formHandicapIndex.trim()) : null;

        const whsChanged = (newWhs || "") !== oldWhs;
        const hcapChanged = newHcap !== oldHcap;
        const lockChanged = formLockHI !== oldLock;

        if (hcapChanged || lockChanged) {
          await updateHandicap(editingMember.id, newHcap, lockChanged ? formLockHI : undefined);
        }
        if (whsChanged) {
          await updateMemberHandicap(editingMember.id, newWhs, null);
        }
      }

      closeModal();
      await invalidateCachePrefix(`society:${societyId}:`);
      loadMembers();
    } catch (e: any) {
      showAlert("Error", e?.message || "Failed to update member.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteMember = (member: MemberDoc) => {
    if (submitting) return;
    if (member.id === currentMember?.id) {
      showAlert("Cannot Delete", "You cannot delete your own account. Use 'Leave Society' in Settings instead.");
      return;
    }

    confirmDestructive(
      "Delete Member",
      `Are you sure you want to remove ${member.displayName || member.name || "this member"} from the society?`,
      "Delete",
      async () => {
        setSubmitting(true);
        try {
          await deleteMember(member.id);
          closeModal();
          await invalidateCachePrefix(`society:${societyId}:`);
          await loadMembers();
        } catch (e: any) {
          showAlert("Error", e?.message || "Failed to delete member.");
        } finally {
          setSubmitting(false);
        }
      },
    );
  };

  const handleTogglePaid = async (member: MemberDoc) => {
    if (!societyId) return;
    try {
      await updateMemberDoc(societyId, member.id, {
        paid: !member.paid,
        paid_at: !member.paid ? new Date().toISOString() : null,
      });
      await invalidateCachePrefix(`society:${societyId}:`);
      loadMembers();
    } catch (e: any) {
      showAlert("Error", e?.message || "Failed to update payment status.");
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

  if (bootstrapLoading && loading) {
    return (
      <Screen scrollable={false}>
        <View style={styles.centered}>
          <LoadingState message="Loading members..." />
        </View>
      </Screen>
    );
  }

  // Show permission error (403)
  if (permissionError) {
    return (
      <Screen contentStyle={tabContentStyle}>
        <View style={styles.header}>
          <AppText variant="title">Members</AppText>
        </View>
        <EmptyState
          icon={<Feather name="lock" size={24} color={colors.textTertiary} />}
          title="Access Denied"
          message={permissionError}
        />
      </Screen>
    );
  }

  // Modal for add/edit
  if (modalMode !== "none") {
    return (
      <Screen contentStyle={tabContentStyle}>
        <View style={styles.modalHeader}>
          <SecondaryButton onPress={closeModal} size="sm">
            Cancel
          </SecondaryButton>
          <AppText variant="heading">{modalMode === "add" ? "Add member (pre-app)" : "Edit Member"}</AppText>
          <View style={{ width: 60 }} />
        </View>

        <AppCard>
          {modalMode === "add" && (
            <AppText variant="small" color="secondary" style={{ marginBottom: spacing.base }}>
              Add someone who has paid or needs to appear on events before they install the app. They appear in lists, tee sheets, and results. When they join with the society code, use the same name or email so their account links to this record — no duplicate.
            </AppText>
          )}
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

          {/* Handicap fields - only shown in edit mode for Captain/Handicapper */}
          {modalMode === "edit" && permissions.canManageHandicaps && (
            <>
              <View style={[styles.formField, { marginTop: spacing.sm }]}>
                <AppText variant="captionBold" style={styles.label}>WHS Number (optional)</AppText>
                <AppInput
                  placeholder="e.g. 1234567"
                  value={formWhsNumber}
                  onChangeText={setFormWhsNumber}
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.formField}>
                <AppText variant="captionBold" style={styles.label}>Handicap Index (optional)</AppText>
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

              {/* Lock toggle */}
              <Pressable
                onPress={() => setFormLockHI((v) => !v)}
                style={[styles.lockToggle, { borderColor: colors.borderLight }]}
              >
                <Feather name={formLockHI ? "lock" : "unlock"} size={iconSize.sm} color={formLockHI ? colors.error : colors.success} />
                <View style={{ flex: 1 }}>
                  <AppText variant="body">{formLockHI ? "Self-edit locked" : "Self-edit allowed"}</AppText>
                  <AppText variant="small" color="secondary">
                    {formLockHI ? "Member cannot change their own HI" : "Member can change their own HI"}
                  </AppText>
                </View>
                <View style={[styles.lockPill, { backgroundColor: formLockHI ? colors.error + "14" : colors.success + "14" }]}>
                  <AppText variant="captionBold" color={formLockHI ? "danger" : "success"}>
                    {formLockHI ? "Locked" : "Open"}
                  </AppText>
                </View>
              </Pressable>
            </>
          )}

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
              loading={submitting}
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
    <Screen contentStyle={tabContentStyle}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <AppText variant="title">Members</AppText>
          <AppText variant="subheading" color="muted" style={{ marginTop: spacing.xs }}>
            {members.length} member{members.length !== 1 ? "s" : ""}
          </AppText>
        </View>
        {permissions.canCreateMembers && (
          <PrimaryButton onPress={openAddModal} size="sm">
            Add Member
          </PrimaryButton>
        )}
      </View>

      {/* Load error */}
      {refreshing && (
        <AppText variant="small" color="muted" style={{ marginBottom: spacing.xs }}>
          Refreshing...
        </AppText>
      )}
      {loadError && (
        <InlineNotice
          variant="error"
          message={loadError}
          style={{ marginBottom: spacing.sm }}
        />
      )}

      {/* Members List */}
      {members.length === 0 && !loadError ? (
        <EmptyState
          icon={<Feather name="users" size={iconSize.lg} color={colors.textTertiary} />}
          title="No Members Yet"
          message="Add members to your society to get started."
          action={permissions.canCreateMembers ? { label: "Add Member", onPress: openAddModal } : undefined}
        />
      ) : (
        <View style={styles.list}>
          {members.map((member) => {
            const roleBadges = getRoleBadges(member);
            const isCurrentUser = member.id === currentMember?.id;
            const oomEntry = oomStandings.get(member.id);
            const hiVal = member.handicapIndex ?? member.handicap_index ?? null;
            const hiNum = hiVal != null ? Number(hiVal) : null;
            const hiText = (hiNum != null && Number.isFinite(hiNum)) ? `HI ${hiNum.toFixed(1)}` : null;
            return (
              <Pressable
                key={member.id}
                onPress={() => router.push({ pathname: "/(app)/members/[id]", params: { id: member.id } })}
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
                        {isCurrentUser && <StatusBadge label="You" tone="primary" />}
                        {!member.user_id && <StatusBadge label="No app yet" tone="warning" />}
                      </View>

                      {roleBadges.length > 0 && (
                        <View style={styles.rolesRow}>
                          {roleBadges.map((role) => (
                            <StatusBadge key={role} label={role} tone="neutral" />
                          ))}
                        </View>
                      )}

                      {member.email && (
                        <AppText variant="caption" color="muted">{member.email}</AppText>
                      )}

                      {/* Handicap index */}
                      <AppText variant="caption" color={hiText ? "secondary" : "muted"} style={{ marginTop: 2 }}>
                        {hiText || "Awaiting assignment"}
                      </AppText>

                      {/* OOM Position + Points - only show if member has OOM points */}
                      {oomEntry && oomEntry.totalPoints > 0 && (
                        <View style={styles.oomRow}>
                          <View style={[styles.oomBadge, { backgroundColor: colors.warning + "15" }]}>
                            <Feather name="award" size={12} color={colors.warning} />
                            <AppText variant="small" style={{ color: colors.warning }}>
                              #{oomEntry.rank}
                            </AppText>
                          </View>
                          <AppText variant="caption" color="muted">
                            {formatPoints(oomEntry.totalPoints)} pts ({oomEntry.eventsPlayed} event{oomEntry.eventsPlayed !== 1 ? "s" : ""})
                          </AppText>
                        </View>
                      )}
                    </View>

                    {/* Payment Status */}
                    {permissions.canManageMembershipFees ? (
                      <Pressable
                        onPress={() => handleTogglePaid(member)}
                        style={styles.paidBadgePressable}
                        accessibilityRole="button"
                        accessibilityLabel={member.paid ? "Annual fee paid, tap to mark unpaid" : "Annual fee unpaid, tap to mark paid"}
                      >
                        <StatusBadge label={member.paid ? "Paid" : "Unpaid"} tone={member.paid ? "success" : "warning"} />
                      </Pressable>
                    ) : (
                      <StatusBadge label={member.paid ? "Paid" : "Unpaid"} tone={member.paid ? "success" : "warning"} />
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
    gap: spacing.sm,
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
  oomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: 4,
  },
  oomBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  paidBadgePressable: {
    alignSelf: "flex-start",
    paddingVertical: 2,
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
  lockToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.sm,
    marginBottom: spacing.base,
  },
  lockPill: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
});
