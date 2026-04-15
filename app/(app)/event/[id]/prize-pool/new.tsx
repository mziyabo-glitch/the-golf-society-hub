import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { goBack } from "@/lib/navigation";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppInput } from "@/components/ui/AppInput";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { useBootstrap } from "@/lib/useBootstrap";
import { canManageEventPaymentsForSociety } from "@/lib/rbac";
import { getSession } from "@/lib/auth_supabase";
import { createEventPrizePool, listEventDivisions } from "@/lib/db_supabase/eventPrizePoolRepo";
import { PRIZE_POOL_PAYOUT_TEMPLATES } from "@/lib/event-prize-pools-types";
import { validateRuleBasisPointsTotal } from "@/lib/event-prize-pools-calc";
import { getColors, spacing, iconSize } from "@/lib/ui/theme";

function parseGbpToPence(raw: string): number | null {
  const t = raw.replace(/[£,\s]/g, "").trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

function percentsToRules(percents: number[], places: number): { position: number; percentage_basis_points: number }[] {
  const slice = percents.slice(0, places);
  while (slice.length < places) slice.push(0);
  return slice.map((p, i) => ({
    position: i + 1,
    percentage_basis_points: Math.round(p * 100),
  }));
}

export default function NewPrizePoolScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const eventId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { societyId, memberships } = useBootstrap();
  const colors = getColors();

  const canManage = useMemo(
    () => canManageEventPaymentsForSociety(memberships, societyId),
    [memberships, societyId],
  );

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [totalGbp, setTotalGbp] = useState("50");
  const [payoutMode, setPayoutMode] = useState<"overall" | "division">("overall");
  const [placesPaid, setPlacesPaid] = useState(3);
  const [percents, setPercents] = useState<number[]>([50, 30, 20]);
  const [busy, setBusy] = useState(false);

  const applyTemplate = (n: number) => {
    const t = PRIZE_POOL_PAYOUT_TEMPLATES[n];
    if (!t) return;
    setPlacesPaid(n);
    setPercents(t.map((x) => x));
  };

  const setPercentAt = (idx: number, raw: string) => {
    const v = Number(raw.replace(/,/g, ""));
    const next = [...percents];
    next[idx] = Number.isFinite(v) ? v : 0;
    setPercents(next);
  };

  const save = async () => {
    if (!eventId || !canManage) return;
    const pence = parseGbpToPence(totalGbp);
    if (!name.trim()) {
      Alert.alert("Name required", "Enter a pool name.");
      return;
    }
    if (pence == null) {
      Alert.alert("Amount", "Enter a valid total amount in GBP.");
      return;
    }

    if (payoutMode === "division") {
      const divs = await listEventDivisions(eventId);
      if (divs.length === 0) {
        Alert.alert(
          "Divisions required",
          "This pool requires event divisions, but none were found. Add divisions from the prize pools list first.",
        );
        return;
      }
    }

    const rules = percentsToRules(percents, placesPaid);
    const v = validateRuleBasisPointsTotal(rules);
    if (!v.ok) {
      Alert.alert("Payout rules", "Payout percentages must total 100%.");
      return;
    }

    setBusy(true);
    try {
      const session = await getSession();
      const createdBy = session?.user?.id ?? null;
      const pool = await createEventPrizePool(
        {
          eventId,
          hostSocietyId: societyId ?? null,
          name: name.trim(),
          description: description.trim() || null,
          totalAmountPence: pence,
          payoutMode,
          divisionSource: payoutMode === "division" ? "event" : "none",
          placesPaid,
          includeGuests: false,
          requirePaid: false,
          requireConfirmed: false,
          notes: notes.trim() || null,
          rules,
        },
        createdBy,
      );
      router.replace({
        pathname: "/(app)/event/[id]/prize-pool/[poolId]" as any,
        params: { id: eventId, poolId: pool.id },
      });
    } catch (e: unknown) {
      Alert.alert("Could not create pool", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  };

  if (!canManage) {
    return (
      <Screen>
        <InlineNotice variant="info" message="Only event managers can create prize pools." />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Pressable onPress={() => goBack(router, "/(app)/(tabs)/events")} hitSlop={12} style={styles.backBtn}>
          <Feather name="arrow-left" size={iconSize.md} color={colors.text} />
        </Pressable>
        <AppText variant="h2" style={{ flex: 1 }}>
          Add prize pool
        </AppText>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl, gap: spacing.md }}>
        {payoutMode === "division" ? (
          <InlineNotice
            variant="info"
            message="Division pools split the total prize amount evenly across active divisions, then apply the chosen payout percentages within each division."
          />
        ) : null}

        <AppText variant="caption" color="secondary">
          Pool name
        </AppText>
        <AppInput value={name} onChangeText={setName} placeholder="e.g. Main event pool" />

        <AppText variant="caption" color="secondary">
          Description (optional)
        </AppText>
        <AppInput value={description} onChangeText={setDescription} placeholder="Shown to prize managers" />

        <AppText variant="caption" color="secondary">
          Total amount (£)
        </AppText>
        <AppInput value={totalGbp} onChangeText={setTotalGbp} keyboardType="decimal-pad" placeholder="50.00" />

        <AppText variant="subheading" style={{ marginTop: spacing.sm }}>
          Payout mode
        </AppText>
        <View style={styles.modeRow}>
          <SecondaryButton
            size="sm"
            onPress={() => setPayoutMode("overall")}
            style={payoutMode === "overall" ? { borderWidth: 2, borderColor: colors.primary } : undefined}
          >
            Overall
          </SecondaryButton>
          <SecondaryButton
            size="sm"
            onPress={() => setPayoutMode("division")}
            style={payoutMode === "division" ? { borderWidth: 2, borderColor: colors.primary } : undefined}
          >
            Division
          </SecondaryButton>
        </View>

        <AppText variant="caption" color="secondary">
          Places paid (1–10)
        </AppText>
        <AppInput
          value={String(placesPaid)}
          onChangeText={(t) => {
            const n = parseInt(t, 10);
            if (!Number.isNaN(n) && n >= 1 && n <= 10) {
              setPlacesPaid(n);
              setPercents((prev) => {
                const next = prev.slice(0, n);
                while (next.length < n) next.push(0);
                return next;
              });
            }
          }}
          keyboardType="number-pad"
        />

        <AppText variant="subheading">Payout rules (%)</AppText>
        <View style={styles.tplRow}>
          {([1, 2, 3, 4, 5] as const).map((n) => (
            <SecondaryButton key={n} size="sm" onPress={() => applyTemplate(n)}>
              {n} place{n > 1 ? "s" : ""}
            </SecondaryButton>
          ))}
        </View>
        {Array.from({ length: placesPaid }).map((_, i) => (
          <View key={i} style={{ marginBottom: spacing.xs }}>
            <AppText variant="caption" color="secondary">
              Position {i + 1}
            </AppText>
            <AppInput
              value={String(percents[i] ?? 0)}
              onChangeText={(t) => setPercentAt(i, t)}
              keyboardType="decimal-pad"
            />
          </View>
        ))}

        <InlineNotice
          variant="info"
          message="Who counts in a pool is set on the prize pools list (Pot Master–confirmed entrants with official results). New pools no longer use paid/confirmed attendance toggles."
        />

        <AppText variant="caption" color="secondary">
          Notes (optional)
        </AppText>
        <AppInput value={notes} onChangeText={setNotes} placeholder="Internal notes for prize managers" />

        <PrimaryButton loading={busy} onPress={() => void save()} style={{ marginTop: spacing.md }}>
          Save prize pool
        </PrimaryButton>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  backBtn: { padding: spacing.xs },
  modeRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  tplRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginBottom: spacing.sm },
});
