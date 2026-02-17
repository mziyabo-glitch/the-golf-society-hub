// app/(app)/licence-requests.tsx
// Captain-only screen: View and resolve pending licence requests from members.

import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View, Pressable, FlatList } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { Toast } from "@/components/ui/Toast";

import { useBootstrap } from "@/lib/useBootstrap";
import { isCaptain } from "@/lib/rbac";
import { supabase } from "@/lib/supabase";
import { getColors, spacing, radius } from "@/lib/ui/theme";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LicenceRequest = {
  id: string;
  society_id: string;
  requester_member_id: string;
  requester_user_id: string;
  requester_name: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  resolved_at: string | null;
};

type SeatInfo = {
  seats_total: number;
  seats_used: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LicenceRequestsScreen() {
  const router = useRouter();
  const { society, member, loading: bootstrapLoading } = useBootstrap();
  const colors = getColors();

  const [pendingRequests, setPendingRequests] = useState<LicenceRequest[]>([]);
  const [resolvedRequests, setResolvedRequests] = useState<LicenceRequest[]>([]);
  const [seatInfo, setSeatInfo] = useState<SeatInfo>({ seats_total: 0, seats_used: 0 });
  const [loadingData, setLoadingData] = useState(true);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);

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
  // Fetch requests + seat info
  // ----------------------------------------------------------

  const fetchData = useCallback(async () => {
    if (!society?.id) return;
    setLoadingData(true);
    try {
      const [reqResult, seatResult] = await Promise.all([
        supabase
          .from("licence_requests")
          .select("*")
          .eq("society_id", society.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("societies")
          .select("seats_total, seats_used")
          .eq("id", society.id)
          .maybeSingle(),
      ]);

      if (reqResult.error) {
        console.error("[LicenceRequests] fetch error:", reqResult.error.message);
      }

      const allRequests = (reqResult.data ?? []) as LicenceRequest[];
      setPendingRequests(allRequests.filter((r) => r.status === "pending"));
      setResolvedRequests(allRequests.filter((r) => r.status !== "pending"));

      if (seatResult.error) {
        console.error("[LicenceRequests] seats error:", seatResult.error.message);
      }
      setSeatInfo(seatResult.data ?? { seats_total: 0, seats_used: 0 });
    } catch (e: any) {
      console.error("[LicenceRequests] fetchData error:", e?.message);
      showToast("Failed to load requests.", "error");
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
  // Approve / Reject handlers
  // ----------------------------------------------------------

  const handleResolve = async (requestId: string, action: "approve" | "reject", name: string) => {
    if (mutatingId) return;
    setMutatingId(requestId);
    try {
      const { error } = await supabase.rpc("resolve_licence_request", {
        p_request_id: requestId,
        p_action: action,
      });

      if (error) {
        console.error("[LicenceRequests] resolve error:", error);
        showToast(error.message || `Failed to ${action} request.`, "error");
        return;
      }

      const label = action === "approve" ? "approved and assigned a licence" : "rejected";
      showToast(`${name || "Request"} ${label}.`, action === "approve" ? "success" : "info");
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
          <AppText variant="title" style={styles.headerTitle}>Licence Requests</AppText>
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
            Only the society Captain can manage licence requests.
          </AppText>
          <SecondaryButton onPress={() => router.back()} style={{ marginTop: spacing.xl }}>
            Go Back
          </SecondaryButton>
        </View>
      </Screen>
    );
  }

  // ----------------------------------------------------------
  // Derived
  // ----------------------------------------------------------

  const seatsAvailable = Math.max(0, seatInfo.seats_total - seatInfo.seats_used);

  // ----------------------------------------------------------
  // Render helpers
  // ----------------------------------------------------------

  const renderPendingRequest = ({ item }: { item: LicenceRequest }) => {
    const name = item.requester_name || "Unknown member";
    const isMutating = mutatingId === item.id;
    const canApprove = seatsAvailable > 0;

    return (
      <View style={[styles.requestRow, { borderBottomColor: colors.borderLight }]}>
        {/* Avatar */}
        <View style={[styles.avatar, { backgroundColor: colors.warning + "18" }]}>
          <AppText variant="bodyBold" style={{ color: colors.warning }}>
            {name.charAt(0).toUpperCase()}
          </AppText>
        </View>

        {/* Info */}
        <View style={styles.requestInfo}>
          <AppText variant="body" numberOfLines={1}>{name}</AppText>
          <AppText variant="small" color="secondary">
            Requested {formatDate(item.created_at)}
          </AppText>
        </View>

        {/* Actions */}
        <View style={styles.requestActions}>
          <PrimaryButton
            onPress={() => handleResolve(item.id, "approve", name)}
            size="sm"
            loading={isMutating && mutatingId === item.id}
            disabled={!!mutatingId || !canApprove}
          >
            {canApprove ? "Approve" : "No seats"}
          </PrimaryButton>
          <Pressable
            onPress={() => handleResolve(item.id, "reject", name)}
            disabled={!!mutatingId}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <AppText variant="small" color="secondary" style={{ textDecorationLine: "underline" }}>
              Reject
            </AppText>
          </Pressable>
        </View>
      </View>
    );
  };

  const renderResolvedRequest = ({ item }: { item: LicenceRequest }) => {
    const name = item.requester_name || "Unknown member";
    const isApproved = item.status === "approved";

    return (
      <View style={[styles.requestRow, { borderBottomColor: colors.borderLight }]}>
        <View style={[styles.avatar, { backgroundColor: isApproved ? colors.success + "14" : colors.backgroundTertiary }]}>
          <Feather
            name={isApproved ? "check" : "x"}
            size={16}
            color={isApproved ? colors.success : colors.textTertiary}
          />
        </View>
        <View style={styles.requestInfo}>
          <AppText variant="body" numberOfLines={1}>{name}</AppText>
          <AppText variant="small" color="secondary">
            {isApproved ? "Approved" : "Rejected"} {item.resolved_at ? formatDate(item.resolved_at) : ""}
          </AppText>
        </View>
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
        <AppText variant="title" style={styles.headerTitle}>Licence Requests</AppText>
        <View style={{ width: 24 }} />
      </View>

      {/* Seat availability notice */}
      <View style={{ paddingHorizontal: spacing.lg }}>
        <View style={[styles.seatNotice, { backgroundColor: seatsAvailable > 0 ? colors.success + "12" : colors.warning + "12", borderColor: seatsAvailable > 0 ? colors.success + "30" : colors.warning + "30" }]}>
          <Feather
            name={seatsAvailable > 0 ? "check-circle" : "alert-triangle"}
            size={16}
            color={seatsAvailable > 0 ? colors.success : colors.warning}
          />
          <AppText variant="bodyBold" style={{ flex: 1, marginLeft: spacing.sm }}>
            {seatsAvailable > 0
              ? `${seatsAvailable} licence${seatsAvailable !== 1 ? "s" : ""} available`
              : "No licences available"}
          </AppText>
          {seatsAvailable === 0 && (
            <Pressable onPress={() => router.push("/(app)/billing")}>
              <AppText variant="small" color="primary" style={{ textDecorationLine: "underline" }}>
                Buy more
              </AppText>
            </Pressable>
          )}
        </View>
      </View>

      {/* Pending section header */}
      <View style={styles.sectionHeader}>
        <AppText variant="h2">Pending</AppText>
        <View style={[styles.countBadge, { backgroundColor: pendingRequests.length > 0 ? colors.warning + "20" : colors.backgroundTertiary }]}>
          <AppText
            variant="captionBold"
            style={{ color: pendingRequests.length > 0 ? colors.warning : colors.textTertiary }}
          >
            {pendingRequests.length}
          </AppText>
        </View>
      </View>

      {/* Pending list */}
      {loadingData ? (
        <View style={styles.centered}>
          <LoadingState message="Loading requests..." />
        </View>
      ) : (
        <FlatList
          data={pendingRequests}
          keyExtractor={(item) => item.id}
          renderItem={renderPendingRequest}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyList}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.backgroundTertiary }]}>
                <Feather name="inbox" size={24} color={colors.textTertiary} />
              </View>
              <AppText variant="body" color="secondary" style={{ textAlign: "center" }}>
                No pending requests
              </AppText>
            </View>
          }
          ListFooterComponent={
            resolvedRequests.length > 0 ? (
              <View>
                {/* Resolved section header */}
                <Pressable
                  onPress={() => setShowResolved(!showResolved)}
                  style={styles.resolvedToggle}
                >
                  <AppText variant="h2" color="secondary">Resolved</AppText>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
                    <AppText variant="caption" color="tertiary">{resolvedRequests.length}</AppText>
                    <Feather
                      name={showResolved ? "chevron-up" : "chevron-down"}
                      size={18}
                      color={colors.textTertiary}
                    />
                  </View>
                </Pressable>

                {showResolved && resolvedRequests.map((req) => (
                  <View key={req.id}>
                    {renderResolvedRequest({ item: req })}
                  </View>
                ))}
              </View>
            ) : null
          }
        />
      )}
    </Screen>
  );
}

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
  seatNotice: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.base,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  countBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing["2xl"],
  },
  requestRow: {
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
  requestInfo: {
    flex: 1,
    gap: 2,
  },
  requestActions: {
    alignItems: "center",
    gap: spacing.xs,
  },
  resolvedToggle: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.base,
    marginTop: spacing.sm,
  },
  emptyList: {
    alignItems: "center",
    paddingVertical: spacing["3xl"],
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
});
