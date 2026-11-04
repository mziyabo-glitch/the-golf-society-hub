import { useEffect, useState } from "react";
import { Linking, Platform, View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";

import { AppText } from "@/components/ui/AppText";
import { PrimaryButton } from "@/components/ui/Button";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { getColors, spacing, iconSize } from "@/lib/ui/theme";
import {
  shouldShowOnlinePayNow,
  type SocietyPaymentConfig,
} from "@/lib/payments/eventPricing";
import { fetchStagingPlatformChargeEnabled, startMemberEventCheckout } from "@/lib/payments/eventPaymentCheckout";
import { formatGbpFromPence, quoteCheckoutCharge } from "@/lib/payments/processingFee";

type Props = {
  eventId: string;
  societyId: string;
  society: SocietyPaymentConfig | null | undefined;
  amountPence: number | null;
  playing: boolean;
  paid: boolean;
  bankTransferInstructions?: string | null;
};

export function MemberEventPaymentSection({
  eventId,
  societyId,
  society,
  amountPence,
  playing,
  paid,
  bankTransferInstructions,
}: Props) {
  const colors = getColors();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stagingPlatformCharge, setStagingPlatformCharge] = useState(false);
  const connectReady = Boolean(society?.stripe_connect_charges_enabled && society?.stripe_connect_account_id?.trim());

  useEffect(() => {
    if (connectReady || !society?.online_payments_enabled || !playing || paid) return;
    let cancelled = false;
    void fetchStagingPlatformChargeEnabled().then((enabled) => {
      if (!cancelled) setStagingPlatformCharge(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, [connectReady, society?.online_payments_enabled, playing, paid]);

  const showPayNow = shouldShowOnlinePayNow({
    society,
    event: {},
    amountPence,
    alreadyPaid: paid,
    playing,
    stagingPlatformCharge,
  });

  const bankCopy = bankTransferInstructions?.trim() || society?.event_bank_transfer_instructions?.trim();
  const quote = amountPence != null && amountPence > 0 ? quoteCheckoutCharge(amountPence, society?.processing_fee_mode) : null;

  const onPayNow = async () => {
    setError(null);
    setBusy(true);
    try {
      const { url } = await startMemberEventCheckout({ eventId, societyId });
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.location.href = url;
      } else {
        await Linking.openURL(url);
      }
    } catch (e) {
      setError((e as Error).message || "Payment could not be started");
    } finally {
      setBusy(false);
    }
  };

  if (!playing || paid) return null;
  if (!showPayNow && !bankCopy) return null;

  return (
    <View style={[styles.wrap, { borderColor: colors.borderLight, backgroundColor: colors.backgroundSecondary }]}>
      <View style={styles.titleRow}>
        <Feather name="credit-card" size={iconSize.sm} color={colors.primary} />
        <AppText variant="bodyBold" style={{ marginLeft: spacing.sm, flex: 1 }}>
          Event fee
        </AppText>
        {quote ? <AppText variant="bodyBold">{formatGbpFromPence(quote.intendedPence)}</AppText> : null}
      </View>
      {quote?.mode === "player_pays" ? (
        <View style={{ marginTop: spacing.xs }}>
          <AppText variant="small" color="secondary">
            Processing fee {formatGbpFromPence(quote.estimatedProcessingFeePence)}
          </AppText>
          <AppText variant="bodyBold" style={{ marginTop: 2 }}>
            Total {formatGbpFromPence(quote.grossPence)}
          </AppText>
        </View>
      ) : null}

      {showPayNow ? (
        <PrimaryButton onPress={() => void onPayNow()} disabled={busy} style={{ marginTop: spacing.sm }}>
          {busy ? "Opening checkout…" : "Pay now"}
        </PrimaryButton>
      ) : null}

      {bankCopy ? (
        <View style={{ marginTop: spacing.sm }}>
          <AppText variant="captionBold" color="muted">
            Bank transfer
          </AppText>
          <AppText variant="small" color="secondary" style={{ marginTop: 4 }}>
            {bankCopy}
          </AppText>
          {!showPayNow ? (
            <AppText variant="caption" color="muted" style={{ marginTop: spacing.xs }}>
              Your Treasurer will mark you paid once transfer is received.
            </AppText>
          ) : null}
        </View>
      ) : null}

      {error ? <InlineNotice variant="error" message={error} style={{ marginTop: spacing.sm }} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
});
