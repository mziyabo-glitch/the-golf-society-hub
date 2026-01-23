// app/finance-events/[id].tsx
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Feather } from "@expo/vector-icons";

import { Screen } from "@/components/ui/Screen";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";

import { useBootstrap } from "@/lib/useBootstrap";
import { getPermissionsForMember } from "@/lib/rbac";

import {
  getEvent,
  setEventFee,
  setEventPaymentStatus,
} from "@/lib/db/eventRepo";
import {
  createEventExpense,
  deleteEventExpense,
  listEventExpenses,
} from "@/lib/db/expenseRepo";
import { getMembersBySocietyId } from "@/lib/db/memberRepo";

type Expense = {
  id: string;
  description?: string;
  amount: number;
  createdAt?: any;
};

export default function EventPnlManager() {
  const params = useLocalSearchParams<{ id?: string }>();
  const eventId = typeof params?.id === "string" ? params.id : "";

  const { societyId, member } = useBootstrap();
  const perms = useMemo(() => getPermissionsForMember(member), [member]);

  const canManage = perms.canManageEventPayments || perms.canManageEventExpenses;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [eventTitle, setEventTitle] = useState<string>("Event");
  const [eventFee, setEventFeeLocal] = useState<string>("0");

  const [members, setMembers] = useState<any[]>([]);
  const [payments, setPayments] = useState<Record<string, any>>({});

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [newExpenseDesc, setNewExpenseDesc] = useState("");
  const [newExpenseAmount, setNewExpenseAmount] = useState<string>("");

  const load = async () => {
    setError(null);

    // Hard guards to prevent invalid Firestore paths (common blank-screen cause)
    if (!societyId) {
      setError("Missing societyId (not joined to a society yet).");
      setLoading(false);
      return;
    }
    if (!eventId) {
      setError("Missing event id in route.");
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [evt, mems, exp] = await Promise.all([
        getEvent(societyId, eventId),
        getMembersBySocietyId(societyId),
        listEventExpenses(societyId, eventId),
      ]);

      setEventTitle(evt?.name ?? "Event");
      setEventFeeLocal(String(Number(evt?.eventFee ?? 0)));

      setPayments(evt?.payments ?? {});
      setMembers(mems ?? []);

      const list: Expense[] = (exp ?? []).map((x: any) => ({
        id: x.id,
        description: x.description ?? x.name ?? "",
        amount: Number(x.amount ?? 0),
        createdAt: x.createdAt,
      }));

      setExpenses(list);
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Failed to load event P&L data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!perms.canAccessFinance) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [societyId, eventId, perms.canAccessFinance]);

  const paidCount = useMemo(() => {
    const p = payments ?? {};
    return Object.values(p).filter((x: any) => Boolean(x?.paid)).length;
  }, [payments]);

  const feesReceived = useMemo(() => {
    const fee = Number(eventFee || 0);
    return paidCount * fee;
  }, [paidCount, eventFee]);

  const expensesTotal = useMemo(() => {
    return (expenses ?? []).reduce((sum, e) => sum + Number(e.amount ?? 0), 0);
  }, [expenses]);

  const net = useMemo(() => feesReceived - expensesTotal, [
    feesReceived,
    expensesTotal,
  ]);

  const handleSaveEventFee = async () => {
    if (!societyId || !eventId) return;

    const fee = Number(eventFee);
    if (isNaN(fee) || fee < 0) {
      Alert.alert("Event Fee", "Please enter a valid fee.");
      return;
    }

    try {
      await setEventFee(societyId, eventId, fee);
      await load();
      Alert.alert("Saved", "Event fee updated.");
    } catch (e: any) {
      console.error(e);
      Alert.alert("Event Fee", e?.message ?? "Failed to save event fee.");
    }
  };

  const togglePaid = async (memberId: string, nextPaid: boolean) => {
    if (!societyId || !eventId) return;

    try {
      await setEventPaymentStatus(societyId, eventId, memberId, nextPaid);
      setPayments((prev) => ({
        ...(prev ?? {}),
        [memberId]: { ...(prev?.[memberId] ?? {}), paid: nextPaid },
      }));
    } catch (e: any) {
      console.error(e);
      Alert.alert("Payment", e?.message ?? "Failed to update payment status.");
    }
  };

  const handleAddExpense = async () => {
    if (!societyId || !eventId) return;

    const amount = Number(newExpenseAmount);
    if (!newExpenseDesc.trim()) {
      Alert.alert("Expense", "Please enter a description.");
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      Alert.alert("Expense", "Please enter a valid amount.");
      return;
    }

    try {
      await createEventExpense(societyId, eventId, {
        description: newExpenseDesc.trim(),
        amount,
      });
      setNewExpenseDesc("");
      setNewExpenseAmount("");
      await load();
    } catch (e: any) {
      console.error(e);
      Alert.alert("Expense", e?.message ?? "Failed to add expense.");
    }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    if (!societyId || !eventId) return;

    Alert.alert("Delete expense?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteEventExpense(societyId, eventId, expenseId);
            await load();
          } catch (e: any) {
            console.error(e);
            Alert.alert("Expense", e?.message ?? "Failed to delete expense.");
          }
        },
      },
    ]);
  };

  if (!perms.canAccessFinance) {
    return (
      <Screen>
        <SectionHeader title="Event P&L" />
        <AppCard>
          <AppText style={{ marginBottom: 12 }}>
            You don’t have access to Finance. (Captain/Treasurer only)
          </AppText>
          <SecondaryButton label="Back" onPress={() => router.back()} />
        </AppCard>
      </Screen>
    );
  }

  return (
    <Screen>
      <SectionHeader title={eventTitle} />

      {error ? (
        <AppCard style={{ marginBottom: 12 }}>
          <AppText style={styles.errTitle}>Something went wrong</AppText>
          <AppText style={styles.errMsg}>{error}</AppText>
          <SecondaryButton label="Try again" onPress={load} />
        </AppCard>
      ) : null}

      <AppCard style={{ marginBottom: 12 }}>
        <View style={styles.kpiRow}>
          <View style={styles.kpiItem}>
            <AppText style={styles.kpiLabel}>Fees Received</AppText>
            <AppText style={styles.kpiValue}>£{feesReceived.toFixed(0)}</AppText>
          </View>
          <View style={styles.kpiItem}>
            <AppText style={styles.kpiLabel}>Expenses</AppText>
            <AppText style={styles.kpiValue}>£{expensesTotal.toFixed(0)}</AppText>
          </View>
        </View>

        <View style={styles.kpiRow}>
          <View style={styles.kpiItem}>
            <AppText style={styles.kpiLabel}>Net</AppText>
            <AppText style={styles.kpiValue}>£{net.toFixed(0)}</AppText>
          </View>
          <View style={styles.kpiItem}>
            <AppText style={styles.kpiLabel}>Paid</AppText>
            <AppText style={styles.kpiValue}>
              {paidCount}/{members.length}
            </AppText>
          </View>
        </View>

        {loading ? <AppText style={styles.muted}>Loading…</AppText> : null}
      </AppCard>

      <AppCard style={{ marginBottom: 12 }}>
        <AppText style={styles.h2}>Event Fee</AppText>
        <View style={styles.formRow}>
          <TextInput
            value={eventFee}
            onChangeText={setEventFeeLocal}
            keyboardType={Platform.select({ ios: "number-pad", android: "numeric" })}
            placeholder="0"
            placeholderTextColor="rgba(255,255,255,0.35)"
            style={styles.input}
            editable={canManage}
          />
          <PrimaryButton
            label="Save"
            onPress={handleSaveEventFee}
            disabled={!canManage}
          />
        </View>
        {!canManage ? (
          <AppText style={styles.warn}>
            Only Captain/Treasurer can manage Event P&L.
          </AppText>
        ) : null}
      </AppCard>

      <AppCard style={{ marginBottom: 12 }}>
        <AppText style={styles.h2}>Payments</AppText>
        <ScrollView style={{ maxHeight: 320 }}>
          {members.map((m) => {
            const paid = Boolean(payments?.[m.id]?.paid);
            return (
              <View key={m.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <AppText style={styles.name}>
                    {m.displayName ?? m.name ?? "Member"}
                  </AppText>
                  <AppText style={styles.mutedSmall}>
                    {paid ? "Paid" : "Unpaid"}
                  </AppText>
                </View>
                <SecondaryButton
                  label={paid ? "Mark Unpaid" : "Mark Paid"}
                  onPress={() => togglePaid(m.id, !paid)}
                  disabled={!canManage}
                />
              </View>
            );
          })}
          {members.length === 0 && !loading ? (
            <AppText style={styles.muted}>No members found.</AppText>
          ) : null}
        </ScrollView>
      </AppCard>

      <AppCard style={{ marginBottom: 12 }}>
        <AppText style={styles.h2}>Expenses</AppText>

        <View style={{ gap: 10 }}>
          <TextInput
            value={newExpenseDesc}
            onChangeText={setNewExpenseDesc}
            placeholder="Description (e.g. Trophies)"
            placeholderTextColor="rgba(255,255,255,0.35)"
            style={styles.input}
            editable={canManage}
          />
          <TextInput
            value={newExpenseAmount}
            onChangeText={setNewExpenseAmount}
            placeholder="Amount (e.g. 50)"
            placeholderTextColor="rgba(255,255,255,0.35)"
            style={styles.input}
            keyboardType={Platform.select({ ios: "decimal-pad", android: "numeric" })}
            editable={canManage}
          />
          <PrimaryButton
            label="Add Expense"
            onPress={handleAddExpense}
            disabled={!canManage}
            icon={<Feather name="plus" size={16} />}
          />
        </View>

        <View style={{ marginTop: 10 }}>
          {expenses.map((e) => (
            <View key={e.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <AppText style={styles.name}>{e.description || "Expense"}</AppText>
                <AppText style={styles.mutedSmall}>
                  £{Number(e.amount || 0).toFixed(0)}
                </AppText>
              </View>
              <SecondaryButton
                label="Delete"
                onPress={() => handleDeleteExpense(e.id)}
                disabled={!canManage}
              />
            </View>
          ))}
          {expenses.length === 0 && !loading ? (
            <AppText style={styles.muted}>No expenses yet.</AppText>
          ) : null}
        </View>
      </AppCard>

      <SecondaryButton label="Back" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  kpiRow: { flexDirection: "row", gap: 12, marginBottom: 10 },
  kpiItem: { flex: 1 },
  kpiLabel: { opacity: 0.7, marginBottom: 2 },
  kpiValue: { fontSize: 20, fontWeight: "700" },

  h2: { fontSize: 18, fontWeight: "700", marginBottom: 10 },
  muted: { opacity: 0.7 },
  mutedSmall: { opacity: 0.7, fontSize: 12 },
  warn: { marginTop: 8, opacity: 0.75 },

  input: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "white",
    backgroundColor: "rgba(255,255,255,0.06)",
  },

  formRow: { flexDirection: "row", gap: 10, alignItems: "center" },

  row: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.12)",
  },

  name: { fontSize: 15, fontWeight: "700", marginBottom: 2 },

  errTitle: { fontSize: 16, fontWeight: "800", marginBottom: 6 },
  errMsg: { opacity: 0.85, marginBottom: 12 },
});
