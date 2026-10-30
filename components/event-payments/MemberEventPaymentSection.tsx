import { useState } from "react";
import { Linking, Platform, View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";

import { AppText } from "@/components/ui/AppText";
import { PrimaryButton } from "@/components/ui/Button";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { getColors, spacing, iconSize } from "@/lib/ui/theme";
import {
  formatPenceGbpShort,
  shouldShowOnlinePayNow,
  type SocietyPaymentConfig,
} from "@/lib/payments/eventPricing";
import { startMemberEventCheckout } from "@/lib/payments/eventPaymentCheckout";

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

  const showPayNow = shouldShowOnlinePayNow({
    society,
    event: {},
    amountPence,
    alreadyPaid: paid,
    playing,
  });

  const bankCopy = bankTransferInstructions?.trim() || society?.event_bank_transfer_instructions?.trim();

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
        {amountPence != null && amountPence > 0 ? (
          <AppText variant="bodyBold">{formatPenceGbpShort(amountPence)}</AppText>
        ) : null}
      </View>

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
