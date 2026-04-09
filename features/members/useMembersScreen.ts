import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";

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
import { getOrderOfMeritTotals, type OrderOfMeritEntry } from "@/lib/db_supabase/resultsRepo";
import { getPermissionsForMember } from "@/lib/rbac";
import { getColors, spacing } from "@/lib/ui/theme";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { confirmDestructive, showAlert } from "@/lib/ui/alert";
import { guard } from "@/lib/guards";
import { getCache, invalidateCachePrefix, setCache } from "@/lib/cache/clientCache";
import { invalidatePersonRelatedCaches } from "@/lib/personCaches";
import { measureAsync } from "@/lib/perf/perf";

import { sortMembersByRoleThenName } from "./membersDomain";
import { toMemberListRowVm, type MemberListRowVm } from "./membersViewModel";

export type MembersModalMode = "none" | "add" | "edit";

export type MembersPermissionsVm = {
  canCreateMembers: boolean;
  canEditMembers: boolean;
  canManageHandicaps: boolean;
  canDeleteMembers: boolean;
  canManageMembershipFees: boolean;
};

export function useMembersScreen() {
  const { societyId, activeSocietyId, member: currentMember, loading: bootstrapLoading } = useBootstrap();
  const router = useRouter();
  const colors = getColors();
  const reduceMotion = useReducedMotion();
  const tabBarHeight = useBottomTabBarHeight();
  const tabContentStyle = { paddingTop: spacing.lg, paddingBottom: tabBarHeight + spacing.lg };

  const [members, setMembers] = useState<MemberDoc[]>([]);
  const [oomStandings, setOomStandings] = useState<Map<string, OrderOfMeritEntry>>(new Map());
  const [loading, setLoading] = useState(true);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [modalMode, setModalMode] = useState<MembersModalMode>("none");
  const [editingMember, setEditingMember] = useState<MemberDoc | null>(null);

  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formWhsNumber, setFormWhsNumber] = useState("");
  const [formHandicapIndex, setFormHandicapIndex] = useState("");
  const [formLockHI, setFormLockHI] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const permissions = getPermissionsForMember(currentMember);
  const permissionsVm: MembersPermissionsVm = {
    canCreateMembers: permissions.canCreateMembers,
    canEditMembers: permissions.canEditMembers,
    canManageHandicaps: permissions.canManageHandicaps,
    canDeleteMembers: permissions.canDeleteMembers,
    canManageMembershipFees: permissions.canManageMembershipFees,
  };

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

      const [membersData, oomData] = await measureAsync("members.load", () =>
        Promise.all([
          getMembersBySocietyId(societyId),
          getOrderOfMeritTotals(societyId).catch((err) => {
            console.warn("[members] Failed to fetch OOM standings:", err);
            return [] as OrderOfMeritEntry[];
          }),
        ]),
      );

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
          "You don't have permission to view members for this society. Please contact the Captain.",
        );
      } else {
        setLoadError(errorMessage || "Failed to load members. Please try again.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

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

  useFocusEffect(
    useCallback(() => {
      if (societyId) {
        loadMembers({ silent: true });
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [societyId]),
  );

  const memberRows: MemberListRowVm[] = useMemo(
    () =>
      members.map((m) =>
        toMemberListRowVm(m, oomStandings.get(m.id), currentMember?.id),
      ),
    [members, oomStandings, currentMember?.id],
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
        "member",
      );
      console.log("[members] Member added successfully, id:", newMember.id);
      closeModal();
      await invalidatePersonRelatedCaches({ activeSocietyId: societyId });
      loadMembers();
    } catch (e: any) {
      console.error("[members] Add member RPC error:", e?.message);

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

    if (formHandicapIndex.trim()) {
      const hcap = parseFloat(formHandicapIndex.trim());
      if (isNaN(hcap) || hcap < -10 || hcap > 54) {
        showAlert("Invalid Handicap", "Handicap index must be between -10 and 54.");
        return;
      }
    }

    setSubmitting(true);
    try {
      await updateMemberDoc(societyId, editingMember.id, {
        displayName: formName.trim(),
        name: formName.trim(),
        email: formEmail.trim() || undefined,
      });

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
      await invalidatePersonRelatedCaches({ activeSocietyId: societyId });
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
          await invalidatePersonRelatedCaches({ activeSocietyId: societyId });
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

  const handleTogglePaidById = (memberId: string) => {
    const member = members.find((m) => m.id === memberId);
    if (member) void handleTogglePaid(member);
  };

  const onPressMemberRow = useCallback(
    (memberId: string) => {
      router.push({ pathname: "/(app)/members/[id]", params: { id: memberId } });
    },
    [router],
  );

  return {
    tabContentStyle,
    colors,
    reduceMotion,
    bootstrapLoading,
    loading,
    refreshing,
    permissionError,
    loadError,
    modalMode,
    editingMember,
    formName,
    setFormName,
    formEmail,
    setFormEmail,
    formWhsNumber,
    setFormWhsNumber,
    formHandicapIndex,
    setFormHandicapIndex,
    formLockHI,
    setFormLockHI,
    submitting,
    permissions: permissionsVm,
    memberRows,
    openAddModal,
    closeModal,
    handleAddMember,
    handleUpdateMember,
    handleDeleteMember,
    handleTogglePaidById,
    onPressMemberRow,
    currentMemberId: currentMember?.id,
  };
}
