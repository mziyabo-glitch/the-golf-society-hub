// app/(app)/licences.tsx
// Captain-only screen: Assign / remove licence seats for society members.

import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View, Pressable, FlatList } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { Toast } from "@/components/ui/Toast";

import { useBootstrap } from "@/lib/useBootstrap";
import { isCaptain } from "@/lib/rbac";
import { supabase } from "@/lib/supabase";
import { getMembersBySocietyId, type MemberDoc } from "@/lib/db_supabase/memberRepo";
import { getColors, spacing, radius } from "@/lib/ui/theme";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SeatInfo = {
  seats_total: number;
  seats_used: number;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LicencesScreen() {
  const router = useRouter();
  const { society, member, loading: bootstrapLoading } = useBootstrap();
  const colors = getColors();

  const [members, setMembers] = useState<MemberDoc[]>([]);
  const [seatInfo, setSeatInfo] = useState<SeatInfo>({ seats_total: 0, seats_used: 0 });
  const [loadingData, setLoadingData] = useState(true);
  const [mutatingId, setMutatingId] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: "success" | "error" | "info" }>({
    visible: false,
    message: "",
    type: "success",
  });

  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ visible: true, message, type });
  };

  const captain = isCaptain(member as any);

  // ----------------------------------------------------------
  // Fetch members + seat info
  // ----------------------------------------------------------

  const fetchData = useCallback(async () => {
    if (!society?.id) return;
    setLoadingData(true);
    try {
      const [memberList, seatResult] = await Promise.all([
        getMembersBySocietyId(society.id),
        supabase
          .from("societies")
          .select("seats_total, seats_used")
          .eq("id", society.id)
          .maybeSingle(),
      ]);

      // Sort: licensed first, then alphabetical
      memberList.sort((a, b) => {
        const aHas = a.hasSeat ? 1 : 0;
        const bHas = b.hasSeat ? 1 : 0;
        if (aHas !== bHas) return bHas - aHas;
        return (a.name || "").localeCompare(b.name || "");
      });

      setMembers(memberList);

      if (seatResult.error) {
        console.error("[Licences] fetchSeatInfo error:", seatResult.error.message);
      }
      setSeatInfo(seatResult.data ?? { seats_total: 0, seats_used: 0 });
    } catch (e: any) {
      console.error("[Licences] fetchData error:", e?.message);
      showToast("Failed to load data.", "error");
    } finally {
      setLoadingData(false);
    }
  }, [society?.id]);

  useEffect(() => {
    if (!bootstrapLoading && society?.id) {
      fetchData();
    }
  }, [bootstrapLoading, society?.id, fetchData]);

  // ----------------------------------------------------------
  // Assign / Remove handlers
  // ----------------------------------------------------------

  const handleAssign = async (memberId: string, memberName: string) => {
    if (!society?.id || mutatingId) return;
    setMutatingId(memberId);
    try {
      const { error } = await supabase.rpc("assign_society_seat", {
        p_society_id: society.id,
        p_member_id: memberId,
      });

      if (error) {
        console.error("[Licences] assign error:", error);
        showToast(error.message || "Failed to assign licence.", "error");
        return;
      }

      showToast(`Licence assigned to ${memberName}.`, "success");
      await fetchData();
    } catch (e: any) {
      showToast(e?.message || "Something went wrong.", "error");
    } finally {
      setMutatingId(null);
    }
  };

  const handleRemove = async (memberId: string, memberName: string) => {
    if (!society?.id || mutatingId) return;
    setMutatingId(memberId);
    try {
      const { error } = await supabase.rpc("remove_society_seat", {
        p_society_id: society.id,
        p_member_id: memberId,
      });

      if (error) {
        console.error("[Licences] remove error:", error);
        showToast(error.message || "Failed to remove licence.", "error");
        return;
      }

      showToast(`Licence removed from ${memberName}.`, "success");
      await fetchData();
    } catch (e: any) {
      showToast(e?.message || "Something went wrong.", "error");
    } finally {
      setMutatingId(null);
    }
  };

  // ----------------------------------------------------------
  // Loading / not-Captain guards
  // ----------------------------------------------------------

  if (bootstrapLoading) {
    return (
      <Screen scrollable={false}>
        <View style={styles.centered}>
          <LoadingState message="Loading..." />
        </View>
      </Screen>
    );
  }

  if (!captain) {
    return (
      <Screen>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Feather name="arrow-left" size={24} color={colors.text} />
          </Pressable>
          <AppText variant="title" style={styles.headerTitle}>Assign Licences</AppText>
          <View style={{ width: 24 }} />
        </View>

        <View style={[styles.centered, { marginTop: spacing["3xl"] }]}>
          <View style={[styles.lockIcon, { backgroundColor: colors.backgroundTertiary }]}>
            <Feather name="lock" size={32} color={colors.textTertiary} />
          </View>
          <AppText variant="h2" style={{ marginTop: spacing.lg, textAlign: "center" }}>
            Captain Only
          </AppText>
          <AppText variant="body" color="secondary" style={{ marginTop: spacing.sm, textAlign: "center" }}>
            Only the society Captain can assign licences.
          </AppText>
          <SecondaryButton onPress={() => router.back()} style={{ marginTop: spacing.xl }}>
            Go Back
          </SecondaryButton>
        </View>
      </Screen>
    );
  }

  // ----------------------------------------------------------
  // Derived values
  // ----------------------------------------------------------

  const seatsTotal = seatInfo.seats_total;
  const seatsUsed = seatInfo.seats_used;
  const seatsAvailable = Math.max(0, seatsTotal - seatsUsed);

  // ----------------------------------------------------------
  // Render member row
  // ----------------------------------------------------------

  const renderMember = ({ item }: { item: MemberDoc }) => {
    const name = item.name || item.displayName || "Unknown";
    const hasLicence = item.hasSeat === true;
    const isMutating = mutatingId === item.id;
    const canAssign = !hasLicence && seatsAvailable > 0;
    const noSeatsLeft = !hasLicence && seatsAvailable === 0;

    return (
      <View style={[styles.memberRow, { borderBottomColor: colors.borderLight }]}>
        {/* Avatar */}
        <View style={[styles.avatar, { backgroundColor: hasLicence ? colors.primary + "14" : colors.backgroundTertiary }]}>
          <AppText
            variant="bodyBold"
            style={{ color: hasLicence ? colors.primary : colors.textTertiary }}
          >
            {name.charAt(0).toUpperCase()}
          </AppText>
        </View>

        {/* Name + badge */}
        <View style={styles.memberInfo}>
          <AppText variant="body" numberOfLines={1}>{name}</AppText>
          {hasLicence ? (
            <View style={[styles.badge, { backgroundColor: colors.success + "18" }]}>
              <Feather name="check-circle" size={12} color={colors.success} />
              <AppText variant="small" style={{ color: colors.success, marginLeft: 4 }}>
                Licensed
              </AppText>
            </View>
          ) : (
            <View style={[styles.badge, { backgroundColor: colors.backgroundTertiary }]}>
              <Feather name="minus-circle" size={12} color={colors.textTertiary} />
              <AppText variant="small" color="tertiary" style={{ marginLeft: 4 }}>
                No seat
              </AppText>
            </View>
          )}
        </View>

        {/* Action button */}
        {hasLicence ? (
          <SecondaryButton
            onPress={() => handleRemove(item.id, name)}
            size="sm"
            loading={isMutating}
            disabled={!!mutatingId}
          >
            Remove
          </SecondaryButton>
        ) : canAssign ? (
          <PrimaryButton
            onPress={() => handleAssign(item.id, name)}
            size="sm"
            loading={isMutating}
            disabled={!!mutatingId}
          >
            Assign
          </PrimaryButton>
        ) : noSeatsLeft ? (
          <View style={[styles.disabledBtn, { backgroundColor: colors.surfaceDisabled, borderRadius: radius.md }]}>
            <AppText variant="small" color="tertiary">No seats</AppText>
          </View>
        ) : null}
      </View>
    );
  };

  // ----------------------------------------------------------
  // Render
  // ----------------------------------------------------------

  return (
    <Screen scrollable={false}>
      {/* Toast */}
      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast((t) => ({ ...t, visible: false }))}
      />

      {/* Header */}
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Feather name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <AppText variant="title" style={styles.headerTitle}>Assign Licences</AppText>
        <View style={{ width: 24 }} />
      </View>

      {/* Seat Summary */}
      <View style={{ paddingHorizontal: spacing.lg }}>
        <AppCard>
          <View style={styles.seatGrid}>
            <SeatStat
              label="Purchased"
              value={seatsTotal}
              icon="shopping-bag"
              color={colors.primary}
              bgColor={colors.primary + "14"}
            />
            <SeatStat
              label="Assigned"
              value={seatsUsed}
              icon="user-check"
              color={colors.info}
              bgColor={colors.info + "14"}
            />
            <SeatStat
              label="Available"
              value={seatsAvailable}
              icon="unlock"
              color={seatsAvailable > 0 ? colors.success : colors.warning}
              bgColor={(seatsAvailable > 0 ? colors.success : colors.warning) + "14"}
            />
          </View>
        </AppCard>

        {seatsTotal === 0 && (
          <AppCard>
            <View style={styles.emptyNotice}>
              <Feather name="info" size={18} color={colors.info} />
              <AppText variant="body" color="secondary" style={{ flex: 1, marginLeft: spacing.sm }}>
                No licences purchased yet. Go to Billing & Licences to buy seats.
              </AppText>
            </View>
          </AppCard>
        )}
      </View>

      {/* Members list header */}
      <View style={styles.listHeader}>
        <AppText variant="h2">Members</AppText>
        <AppText variant="caption" color="secondary">
          {members.length} member{members.length !== 1 ? "s" : ""}
        </AppText>
      </View>

      {/* Member list */}
      {loadingData ? (
        <View style={styles.centered}>
          <LoadingState message="Loading members..." />
        </View>
      ) : (
        <FlatList
          data={members}
          keyExtractor={(item) => item.id}
          renderItem={renderMember}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyList}>
              <AppText variant="body" color="secondary" style={{ textAlign: "center" }}>
                No members in this society yet.
              </AppText>
            </View>
          }
        />
      )}
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Seat stat sub-component (reuses pattern from billing.tsx)
// ---------------------------------------------------------------------------

function SeatStat({
  label,
  value,
  icon,
  color,
  bgColor,
}: {
  label: string;
  value: number;
  icon: keyof typeof Feather.glyphMap;
  color: string;
  bgColor: string;
}) {
  return (
    <View style={seatStatStyles.stat}>
      <View style={[seatStatStyles.iconCircle, { backgroundColor: bgColor }]}>
        <Feather name={icon} size={18} color={color} />
      </View>
      <AppText variant="h1" style={{ marginTop: spacing.xs }}>{value}</AppText>
      <AppText variant="small" color="secondary">{label}</AppText>
    </View>
  );
}

const seatStatStyles = StyleSheet.create({
  stat: {
    flex: 1,
    alignItems: "center",
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
  },
  lockIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  seatGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: spacing.sm,
  },
  emptyNotice: {
    flexDirection: "row",
    alignItems: "center",
  },
  listHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingHorizontal: spacing.lg,
    marginTop: spacing.base,
    marginBottom: spacing.sm,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing["2xl"],
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  memberInfo: {
    flex: 1,
    gap: 2,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  disabledBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyList: {
    paddingVertical: spacing["3xl"],
  },
});
