import { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { SecondaryButton } from "@/components/ui/Button";
import { InlineNotice } from "@/components/ui/InlineNotice";
import type { EventPrizePoolEntryRow } from "@/lib/event-prize-pools-types";
import { upsertMyPrizePoolOptIn } from "@/lib/db_supabase/eventPrizePoolRepo";
import { getColors, radius, spacing } from "@/lib/ui/theme";

type Props = {
  eventId: string;
  myMemberId: string;
  managerName: string | null;
  paymentInstructions: string | null | undefined;
  entry: EventPrizePoolEntryRow | null;
  loading: boolean;
  onChanged: () => void;
};

export function DashboardPrizePoolHomeCard({
  eventId,
  myMemberId,
  managerName,
  paymentInstructions,
  entry,
  loading,
  onChanged,
}: Props) {
  const colors = getColors();
  const optedIn = entry?.opted_in === true;
  const [busy, setBusy] = useState(false);

  const setOptIn = async (yes: boolean) => {
    if (!eventId || busy) return;
    setBusy(true);
    try {
      await upsertMyPrizePoolOptIn(eventId, myMemberId, yes);
      onChanged();
    } catch (e: unknown) {
      console.error("[DashboardPrizePoolHomeCard]", e);
      Alert.alert("Could not save", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppCard style={[styles.card, { borderColor: `${colors.primary}30`, backgroundColor: `${colors.primary}06` }]}>
      <View style={styles.headerRow}>
        <View style={[styles.iconWrap, { backgroundColor: `${colors.primary}18` }]}>
          <Feather name="award" size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="captionBold" color="primary">
            Prize Pool
          </AppText>
          <AppText variant="bodyBold" style={{ marginTop: 2 }}>
            Enter the Prize Pool?
          </AppText>
        </View>
      </View>

      {loading ? (
        <AppText variant="small" color="secondary" style={{ marginTop: spacing.sm }}>
          Loading…
        </AppText>
      ) : (
        <>
          <AppText variant="small" color="secondary" style={{ marginTop: spacing.sm }}>
            Optional — this is a request to the Pot Master. Your place in the pool is only confirmed once they
            confirm you (separate from your main event fee and attendance).
          </AppText>

          <View style={styles.row}>
            <AppText variant="caption" color="secondary">
              Pot Master
            </AppText>
            <AppText variant="captionBold">{managerName ?? "—"}</AppText>
          </View>

          {optedIn && entry?.confirmed_by_pot_master === false ? (
            <InlineNotice
              variant="info"
              message="Your request is in. The Pot Master still needs to confirm you before you count in any pool calculation."
              style={{ marginTop: spacing.sm }}
            />
          ) : null}

          {optedIn && entry?.confirmed_by_pot_master === true ? (
            <InlineNotice
              variant="info"
              message="You are confirmed for the prize pool (subject to official results and pool rules)."
              style={{ marginTop: spacing.sm }}
            />
          ) : null}

          {paymentInstructions ? (
            <View style={{ marginTop: spacing.sm }}>
              <AppText variant="captionBold" color="secondary">
                Notes from Pot Master
              </AppText>
              <AppText variant="small" style={{ marginTop: 4 }}>
                {paymentInstructions}
              </AppText>
            </View>
          ) : optedIn ? (
            <InlineNotice
              variant="info"
              message="When your Pot Master adds notes (e.g. how to pay into the pot), they will appear here."
              style={{ marginTop: spacing.sm }}
            />
          ) : null}

          <View style={styles.actions}>
            <SecondaryButton
              size="sm"
              loading={busy}
              disabled={busy}
              onPress={() => void setOptIn(true)}
              style={optedIn ? { borderWidth: 2, borderColor: colors.primary } : undefined}
            >
              Yes
            </SecondaryButton>
            <SecondaryButton
              size="sm"
              loading={busy}
              disabled={busy}
              onPress={() => void setOptIn(false)}
              style={entry && !entry.opted_in ? { borderWidth: 2, borderColor: colors.primary } : undefined}
            >
              No
            </SecondaryButton>
          </View>
        </>
      )}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.base,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
});
