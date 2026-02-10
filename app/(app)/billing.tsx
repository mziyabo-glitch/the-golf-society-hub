// app/(app)/billing.tsx
// Captain-only screen: Billing & Licences
// Purchase society member licences and view seat totals.

import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View, Pressable, Linking } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { Toast } from "@/components/ui/Toast";

import { useBootstrap } from "@/lib/useBootstrap";
import { isCaptain } from "@/lib/rbac";
import { supabase } from "@/lib/supabase";
import { purchaseService } from "@/lib/billing/purchaseService";
import { getColors, spacing, radius, typography, shadows } from "@/lib/ui/theme";
import { showAlert } from "@/lib/ui/alert";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SeatInfo = {
  seats_total: number;
  seats_used: number;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRICE_PER_SEAT_GBP = 10;
const MIN_QTY = 1;
const MAX_QTY = 100;

const TERMS_URL = "https://thegolfsocietyhub.com/terms";
const PRIVACY_URL = "https://thegolfsocietyhub.com/privacy";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BillingScreen() {
  const router = useRouter();
  const { society, member, loading: bootstrapLoading, refresh } = useBootstrap();
  const colors = getColors();

  // Seat data
  const [seatInfo, setSeatInfo] = useState<SeatInfo | null>(null);
  const [loadingSeats, setLoadingSeats] = useState(true);

  // Purchase flow
  const [quantity, setQuantity] = useState(1);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

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
  // Fetch seat info
  // ----------------------------------------------------------

  const fetchSeatInfo = useCallback(async () => {
    if (!society?.id) return;
    setLoadingSeats(true);
    try {
      const { data, error } = await supabase
        .from("societies")
        .select("seats_total, seats_used")
        .eq("id", society.id)
        .maybeSingle();

      if (error) throw new Error(error.message);
      setSeatInfo(data ?? { seats_total: 0, seats_used: 0 });
    } catch (e: any) {
      console.error("[Billing] fetchSeatInfo error:", e?.message);
      setSeatInfo({ seats_total: 0, seats_used: 0 });
    } finally {
      setLoadingSeats(false);
    }
  }, [society?.id]);

  useEffect(() => {
    if (!bootstrapLoading && society?.id) {
      fetchSeatInfo();
    }
  }, [bootstrapLoading, society?.id, fetchSeatInfo]);

  // ----------------------------------------------------------
  // Quantity stepper
  // ----------------------------------------------------------

  const increment = () => setQuantity((q) => Math.min(q + 1, MAX_QTY));
  const decrement = () => setQuantity((q) => Math.max(q - 1, MIN_QTY));

  // ----------------------------------------------------------
  // Purchase handler
  // ----------------------------------------------------------

  const handlePurchase = async () => {
    if (!society?.id || purchasing) return;

    setPurchasing(true);
    try {
      // 1. Process IAP
      const result = await purchaseService.purchaseSocietyLicences(quantity);

      if (!result.success) {
        showToast(result.error || "Purchase failed. Please try again.", "error");
        return;
      }

      // 2. Update Supabase seats_total via secure RPC
      const { error: rpcError } = await supabase.rpc("increment_society_seats", {
        p_society_id: society.id,
        p_delta: quantity,
      });

      if (rpcError) {
        console.error("[Billing] increment_society_seats error:", rpcError);
        // The IAP succeeded but DB update failed – inform user
        showAlert(
          "Purchase Recorded",
          `Your payment was successful (${quantity} licence${quantity > 1 ? "s" : ""}), but we couldn't update your seat count. Please contact support or try "Restore Purchases".`
        );
        return;
      }

      // 3. Refresh seat data
      await fetchSeatInfo();
      refresh();

      showToast(`${quantity} licence${quantity > 1 ? "s" : ""} purchased successfully!`, "success");
      setQuantity(1);
    } catch (e: any) {
      console.error("[Billing] handlePurchase error:", e);
      showToast(e?.message || "Something went wrong. Please try again.", "error");
    } finally {
      setPurchasing(false);
    }
  };

  // ----------------------------------------------------------
  // Restore handler
  // ----------------------------------------------------------

  const handleRestore = async () => {
    if (restoring) return;
    setRestoring(true);
    try {
      const result = await purchaseService.restorePurchases();
      if (!result.success) {
        showToast(result.error || "Restore failed.", "error");
        return;
      }
      await fetchSeatInfo();
      showToast("Purchases restored.", "info");
    } catch (e: any) {
      showToast(e?.message || "Restore failed.", "error");
    } finally {
      setRestoring(false);
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
          <AppText variant="title" style={styles.headerTitle}>Billing & Licences</AppText>
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
            Only the society Captain can manage billing and licences.
          </AppText>
          <SecondaryButton onPress={() => router.back()} style={{ marginTop: spacing.xl }}>
            Go Back
          </SecondaryButton>
        </View>
      </Screen>
    );
  }

  // ----------------------------------------------------------
  // Derived seat values
  // ----------------------------------------------------------

  const seatsTotal = seatInfo?.seats_total ?? 0;
  const seatsUsed = seatInfo?.seats_used ?? 0;
  const seatsAvailable = Math.max(0, seatsTotal - seatsUsed);
  const purchaseTotal = quantity * PRICE_PER_SEAT_GBP;

  // ----------------------------------------------------------
  // Render
  // ----------------------------------------------------------

  return (
    <Screen>
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
        <AppText variant="title" style={styles.headerTitle}>Billing & Licences</AppText>
        <View style={{ width: 24 }} />
      </View>

      {/* Product Card */}
      <AppCard style={[styles.productCard, { borderColor: colors.primary + "30" }]}>
        <View style={[styles.productBadge, { backgroundColor: colors.primary + "14" }]}>
          <Feather name="shield" size={16} color={colors.primary} />
          <AppText variant="captionBold" style={{ color: colors.primary, marginLeft: spacing.xs }}>
            Premium
          </AppText>
        </View>

        <AppText variant="h1" style={styles.productTitle}>
          Golf Society Hub Access
        </AppText>
        <AppText variant="body" color="secondary" style={styles.productDesc}>
          Full access for your society members. Each licence grants one member access to the app.
        </AppText>

        <View style={styles.priceRow}>
          <AppText variant="title" style={{ color: colors.primary }}>
            {"\u00A3"}{PRICE_PER_SEAT_GBP}
          </AppText>
          <AppText variant="caption" color="secondary" style={{ marginLeft: spacing.xs }}>
            per member / year
          </AppText>
        </View>
      </AppCard>

      {/* Seat Summary */}
      <AppText variant="h2" style={styles.sectionTitle}>Your Licences</AppText>

      {loadingSeats ? (
        <AppCard>
          <LoadingState message="Loading seat data..." />
        </AppCard>
      ) : (
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
      )}

      {/* Manage Licences Button */}
      {!loadingSeats && (
        <Pressable
          style={({ pressed }) => [
            styles.manageLicencesRow,
            { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={() => router.push("/(app)/licences")}
        >
          <View style={[styles.manageLicencesIcon, { backgroundColor: colors.info + "14" }]}>
            <Feather name="users" size={18} color={colors.info} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="bodyBold">Manage Licences</AppText>
            <AppText variant="small" color="secondary">Assign or remove seats for members</AppText>
          </View>
          <Feather name="chevron-right" size={18} color={colors.textTertiary} />
        </Pressable>
      )}

      {/* Licence Requests Button */}
      {!loadingSeats && (
        <Pressable
          style={({ pressed }) => [
            styles.manageLicencesRow,
            { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={() => router.push("/(app)/licence-requests")}
        >
          <View style={[styles.manageLicencesIcon, { backgroundColor: colors.warning + "18" }]}>
            <Feather name="inbox" size={18} color={colors.warning} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="bodyBold">Licence Requests</AppText>
            <AppText variant="small" color="secondary">Review access requests from members</AppText>
          </View>
          <Feather name="chevron-right" size={18} color={colors.textTertiary} />
        </Pressable>
      )}

      {/* Purchase Section */}
      <AppText variant="h2" style={styles.sectionTitle}>Buy More Licences</AppText>
      <AppCard>
        {/* Quantity Stepper */}
        <AppText variant="caption" color="secondary" style={{ marginBottom: spacing.sm }}>
          Number of licences
        </AppText>
        <View style={styles.stepperRow}>
          <Pressable
            onPress={decrement}
            disabled={quantity <= MIN_QTY}
            style={({ pressed }) => [
              styles.stepperBtn,
              {
                backgroundColor: quantity <= MIN_QTY ? colors.surfaceDisabled : colors.backgroundTertiary,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Feather name="minus" size={20} color={quantity <= MIN_QTY ? colors.textTertiary : colors.text} />
          </Pressable>

          <View style={[styles.stepperValue, { borderColor: colors.border }]}>
            <AppText variant="h1">{quantity}</AppText>
          </View>

          <Pressable
            onPress={increment}
            disabled={quantity >= MAX_QTY}
            style={({ pressed }) => [
              styles.stepperBtn,
              {
                backgroundColor: quantity >= MAX_QTY ? colors.surfaceDisabled : colors.backgroundTertiary,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Feather name="plus" size={20} color={quantity >= MAX_QTY ? colors.textTertiary : colors.text} />
          </Pressable>
        </View>

        {/* Live Total */}
        <View style={[styles.totalRow, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
          <AppText variant="body" color="secondary">Total</AppText>
          <View style={styles.totalRight}>
            <AppText variant="h1" style={{ color: colors.primary }}>
              {"\u00A3"}{purchaseTotal}
            </AppText>
            <AppText variant="small" color="secondary"> / year</AppText>
          </View>
        </View>

        {/* Confirm Purchase */}
        <PrimaryButton
          onPress={handlePurchase}
          loading={purchasing}
          disabled={purchasing || restoring}
          style={{ marginTop: spacing.lg }}
          size="lg"
        >
          Confirm Purchase
        </PrimaryButton>

        {/* Dev mode notice */}
        {__DEV__ && (
          <InlineNotice
            variant="info"
            message="Dev Mode"
            detail="Purchases are simulated in development. No real charges."
            style={{ marginTop: spacing.base }}
          />
        )}
      </AppCard>

      {/* Restore + Legal */}
      <AppCard>
        <SecondaryButton
          onPress={handleRestore}
          loading={restoring}
          disabled={purchasing || restoring}
          icon={<Feather name="refresh-cw" size={16} color={colors.primary} />}
        >
          Restore Purchases
        </SecondaryButton>

        <View style={styles.legalRow}>
          <Pressable onPress={() => Linking.openURL(TERMS_URL)}>
            <AppText variant="small" color="secondary" style={styles.legalLink}>
              Terms of Service
            </AppText>
          </Pressable>
          <AppText variant="small" color="tertiary"> | </AppText>
          <Pressable onPress={() => Linking.openURL(PRIVACY_URL)}>
            <AppText variant="small" color="secondary" style={styles.legalLink}>
              Privacy Policy
            </AppText>
          </Pressable>
        </View>
      </AppCard>

      {/* Bottom spacer */}
      <View style={{ height: spacing["2xl"] }} />
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Seat stat sub-component
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
    <View style={seatStyles.stat}>
      <View style={[seatStyles.iconCircle, { backgroundColor: bgColor }]}>
        <Feather name={icon} size={18} color={color} />
      </View>
      <AppText variant="h1" style={{ marginTop: spacing.xs }}>{value}</AppText>
      <AppText variant="small" color="secondary">{label}</AppText>
    </View>
  );
}

const seatStyles = StyleSheet.create({
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
    marginBottom: spacing.lg,
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
  productCard: {
    borderWidth: 1,
  },
  productBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
    borderRadius: radius.sm,
    marginBottom: spacing.sm,
  },
  productTitle: {
    marginBottom: spacing.xs,
  },
  productDesc: {
    marginBottom: spacing.base,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  sectionTitle: {
    marginBottom: spacing.sm,
    marginTop: spacing.base,
  },
  seatGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: spacing.sm,
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.base,
    marginBottom: spacing.lg,
  },
  stepperBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperValue: {
    minWidth: 64,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.base,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  totalRight: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  legalRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: spacing.base,
  },
  legalLink: {
    textDecorationLine: "underline",
  },
  manageLicencesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.base,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.base,
  },
  manageLicencesIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});
