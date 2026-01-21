/**
 * Finance Screen - Treasurer MVP + Season P&L Rollup
 *
 * PERSISTENCE (Firestore):
 * - society annual fee: societies/{societyId}.annualFee
 * - member payments: members/{memberId}.paid, amountPaid, paidDate
 * - event fee: events/{eventId}.eventFee
 * - event payments: events/{eventId}.payments.{memberId}.paid
 * - event expenses: events/{eventId}/expenses/{expenseId}.amount
 *
 * Season Net =
 *   MembershipReceived + SUM_over_events( EventFeesReceived - EventExpensesTotal )
 */

import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Platform, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { Screen } from "@/components/ui/Screen";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { Badge } from "@/components/ui/Badge";
import { LoadingState } from "@/components/ui/LoadingState";

import { useBootstrap } from "@/lib/useBootstrap";
import { getColors, spacing, typography } from "@/lib/ui/theme";
import { canViewFinance, normalizeMemberRoles, normalizeSessionRole } from "@/lib/permissions";

import { subscribeMembersBySociety, updateMemberDoc, type MemberDoc } from "@/lib/db/memberRepo";
import { subscribeEventsBySociety, type EventDoc } from "@/lib/db/eventRepo";
import { subscribeSocietyDoc, updateSocietyDoc, type SocietyDoc } from "@/lib/db/societyRepo";
import { subscribeExpensesByEvent } from "@/lib/db/eventExpenseRepo";

import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

const n = (v: any, fallback = 0) => {
  const num = typeof v === "number" ? v : Number(v);
  return Number.isFinite(num) ? num : fallback;
};

export default function FinanceScreen() {
  const { user } = useBootstrap();
  const colors = getColors();

  const [hasAccess, setHasAccess] = useState(false);

  const [members, setMembers] = useState<MemberDoc[]>([]);
  const [society, setSociety] = useState<SocietyDoc | null>(null);
  const [events, setEvents] = useState<EventDoc[]>([]);

  const [annualFee, setAnnualFee] = useState<string>("");
  const [editingFee, setEditingFee] = useState(false);

  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState<string>("");
  const [editPaidDate, setEditPaidDate] = useState<string>("");

  const [loadingMembers, setLoadingMembers] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingSociety, setLoadingSociety] = useState(true);

  // For Season P&L: total expenses per event
  const [expenseTotalsByEvent, setExpenseTotalsByEvent] = useState<Record<string, number>>({});

  const currentMember = useMemo(() => {
    return members.find((m) => m.id === user?.activeMemberId) || null;
  }, [members, user?.activeMemberId]);

  // ACCESS CONTROL
  useEffect(() => {
    const sessionRole = normalizeSessionRole("member");
    const roles = normalizeMemberRoles(currentMember?.roles);
    const access = canViewFinance(sessionRole, roles);

    setHasAccess(access);

    if (!access) {
      Alert.alert("Access Denied", "Only Treasurer, Captain, or Admin can access Finance", [
        { text: "OK", onPress: () => router.back() },
      ]);
    }
  }, [currentMember?.roles]);

  // SUBSCRIBE SOCIETY
  useEffect(() => {
    if (!user?.activeSocietyId) {
      setSociety(null);
      setAnnualFee("");
      setLoadingSociety(false);
      return;
    }

    setLoadingSociety(true);
    const unsubscribe = subscribeSocietyDoc(user.activeSocietyId, (doc) => {
      setSociety(doc);
      setAnnualFee(doc?.annualFee?.toString() || "");
      setLoadingSociety(false);
    });

    return () => unsubscribe();
  }, [user?.activeSocietyId]);

  // SUBSCRIBE MEMBERS
  useEffect(() => {
    if (!user?.activeSocietyId) {
      setMembers([]);
      setLoadingMembers(false);
      return;
    }

    setLoadingMembers(true);
    const unsubscribe = subscribeMembersBySociety(user.activeSocietyId, (items) => {
      setMembers(items);
      setLoadingMembers(false);
    });

    return () => unsubscribe();
  }, [user?.activeSocietyId]);

  // SUBSCRIBE EVENTS
  useEffect(() => {
    if (!user?.activeSocietyId) {
      setEvents([]);
      setLoadingEvents(false);
      return;
    }

    setLoadingEvents(true);
    const unsubscribe = subscribeEventsBySociety(user.activeSocietyId, (items) => {
      setEvents(items);
      setLoadingEvents(false);
    });

    return () => unsubscribe();
  }, [user?.activeSocietyId]);

  // SUBSCRIBE EXPENSE TOTALS PER EVENT (for Season P&L)
  useEffect(() => {
    const ids = events.map((e) => e.id);
    if (ids.length === 0) {
      setExpenseTotalsByEvent({});
      return;
    }

    const unsubs: (() => void)[] = [];

    ids.forEach((eventId) => {
      const unsub = subscribeExpensesByEvent(
        eventId,
        (items) => {
          const total = items.reduce((sum, x) => sum + n(x.amount, 0), 0);
          setExpenseTotalsByEvent((prev) => ({ ...prev, [eventId]: total }));
        },
        (err) => {
          console.error("subscribeExpensesByEvent error:", err);
        }
      );
      unsubs.push(unsub);
    });

    return () => unsubs.forEach((u) => u());
  }, [events]);

  const saveAnnualFee = async () => {
    if (!society) return;

    try {
      const fee = n(annualFee, NaN);
      if (!Number.isFinite(fee) || fee < 0) {
        Alert.alert("Invalid fee", "Please enter a valid number (0 or greater).");
        return;
      }
      await updateSocietyDoc(society.id, { annualFee: fee });
      setEditingFee(false);
      Alert.alert("Success", "Season fee updated");
    } catch (error) {
      console.error("saveAnnualFee error:", error);
      Alert.alert("Error", "Failed to update season fee");
    }
  };

  const startEditMember = (m: MemberDoc) => {
    setEditingMemberId(m.id);
    setEditAmount(String(n(m.amountPaid, 0)));
    setEditPaidDate(m.paidDate || "");
  };

  const cancelEditMember = () => {
    setEditingMemberId(null);
    setEditAmount("");
    setEditPaidDate("");
  };

  const saveMemberPayment = async (memberId: string) => {
    try {
      const amt = n(editAmount, NaN);
      if (!Number.isFinite(amt) || amt < 0) {
        Alert.alert("Invalid amount", "Please enter a valid amount (0 or greater).");
        return;
      }

      await updateMemberDoc(memberId, {
        paid: amt > 0,
        amountPaid: amt,
        paidDate: editPaidDate.trim(),
      });

      cancelEditMember();
      Alert.alert("Success", "Payment updated");
    } catch (error) {
      console.error("saveMemberPayment error:", error);
      Alert.alert("Error", "Failed to save payment");
    }
  };

  const activeMembers = members.filter((m) => m.id);

  // Membership totals
  const seasonFee = n(society?.annualFee, 0);
  const membershipExpected = seasonFee * activeMembers.length;

  const membershipReceived = members.reduce((sum, m) => {
    if (!m.paid) return sum;
    // If amountPaid missing, assume full season fee.
    const amt = typeof m.amountPaid === "number" ? m.amountPaid : seasonFee;
    return sum + n(amt, 0);
  }, 0);

  const membershipOutstanding = membershipExpected - membershipReceived;

  // Event fee totals (Expected/Received/Outstanding) + Event Net (after expenses)
  const eventFeesExpected = events.reduce((sum, e) => {
    const fee = n((e as any).eventFee, 0);
    const participants = (e.playerIds?.length ?? activeMembers.length);
    return sum + fee * participants;
  }, 0);

  const eventFeesReceived = events.reduce((sum, e) => {
    const fee = n((e as any).eventFee, 0);
    const paymentsObj = (e as any).payments;
    const paymentValues = paymentsObj ? Object.values(paymentsObj) : [];
    const received = paymentValues.reduce((s: number, p: any) => s + (p?.paid ? fee : 0), 0);
    return sum + received;
  }, 0);

  const eventFeesOutstanding = eventFeesExpected - eventFeesReceived;

  const eventsExpensesTotal = events.reduce((sum, e) => sum + n(expenseTotalsByEvent[e.id], 0), 0);
  const eventsNet = eventFeesReceived - eventsExpensesTotal;

  // ✅ Season P&L Net (persistent derived values)
  const seasonNet = membershipReceived + eventsNet;

  const loading = loadingSociety || loadingMembers || loadingEvents;

  const handleExport = async () => {
    try {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8" />
          <style>
            body { font-family: Arial, sans-serif; font-size: 12px; padding: 20px; }
            h1 { margin: 0 0 10px 0; font-size: 20px; }
            h2 { margin: 20px 0 10px 0; font-size: 16px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #ddd; padding: 8px; }
            th { background: #f5f5f5; text-align: left; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
            .card { border: 1px solid #ddd; padding: 10px; border-radius: 8px; }
            .row { display:flex; justify-content: space-between; margin: 4px 0; }
          </style>
        </head>
        <body>
          <h1>${society?.name || "Society"} — Finance Summary</h1>

          <div class="grid">
            <div class="card">
              <h2>Season P&L</h2>
              <div class="row"><div>Membership received</div><div>£${membershipReceived.toFixed(2)}</div></div>
              <div class="row"><div>Events net (fees - expenses)</div><div>£${eventsNet.toFixed(2)}</div></div>
              <div class="row"><strong>Season Net</strong><strong>£${seasonNet.toFixed(2)}</strong></div>
            </div>
            <div class="card">
              <h2>Membership</h2>
              <div class="row"><div>Season fee</div><div>£${seasonFee.toFixed(2)}</div></div>
              <div class="row"><div>Expected</div><div>£${membershipExpected.toFixed(2)}</div></div>
              <div class="row"><div>Received</div><div>£${membershipReceived.toFixed(2)}</div></div>
              <div class="row"><div>Outstanding</div><div>£${membershipOutstanding.toFixed(2)}</div></div>
            </div>
          </div>

          <div class="card" style="margin-top: 12px;">
            <h2>Events (Fees)</h2>
            <div class="row"><div>Expected</div><div>£${eventFeesExpected.toFixed(2)}</div></div>
            <div class="row"><div>Received</div><div>£${eventFeesReceived.toFixed(2)}</div></div>
            <div class="row"><div>Expenses total</div><div>£${eventsExpensesTotal.toFixed(2)}</div></div>
            <div class="row"><strong>Events net</strong><strong>£${eventsNet.toFixed(2)}</strong></div>
          </div>

          <h2>Member Payments</h2>
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Paid</th>
                <th>Amount</th>
                <th>Paid Date</th>
              </tr>
            </thead>
            <tbody>
              ${members
                .map(
                  (m) => `
                  <tr>
                    <td>${m.name || ""}</td>
                    <td>${m.paid ? "Yes" : "No"}</td>
                    <td>£${n(m.amountPaid, 0).toFixed(2)}</td>
                    <td>${m.paidDate || ""}</td>
                  </tr>
                `
                )
                .join("")}
            </tbody>
          </table>
        </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });

      if (Platform.OS === "web") {
        Alert.alert("Export created", "Export is available in the browser download.");
        return;
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      } else {
        Alert.alert("Sharing not available", uri);
      }
    } catch (e: any) {
      console.error("Export error:", e);
      Alert.alert("Error", e?.message ?? "Export failed");
    }
  };

  if (!hasAccess) {
    return (
      <Screen>
        <EmptyBlocked />
      </Screen>
    );
  }

  if (loading) {
    return <LoadingState title="Loading finance…" />;
  }

  return (
    <Screen title="Finance" subtitle="Season fees, member payments, and season P&L">
      {/* ✅ Season P&L Rollup */}
      <AppCard style={styles.card}>
        <SectionHeader title="Season P&L" icon={<Feather name="trending-up" size={18} color={colors.primary} />} />

        <View style={styles.totalsGrid}>
          <View style={styles.totalItem}>
            <AppText variant="caption" color="secondary">Membership received</AppText>
            <AppText variant="h3" style={styles.totalValue}>£{membershipReceived.toFixed(2)}</AppText>
          </View>

          <View style={styles.totalItem}>
            <AppText variant="caption" color="secondary">Events net</AppText>
            <AppText variant="h3" style={styles.totalValue}>£{eventsNet.toFixed(2)}</AppText>
          </View>

          <View style={styles.totalItem}>
            <AppText variant="caption" color="secondary">Season Net</AppText>
            <Badge
              label={`£${seasonNet.toFixed(2)}`}
              variant={seasonNet >= 0 ? "paid" : "unpaid"}
            />
          </View>
        </View>

        <View style={{ height: spacing.md }} />

        <PrimaryButton
          label="Open Event P&L Manager"
          onPress={() => router.push("/finance-events")}
          iconLeft={<Feather name="calendar" size={16} color="#fff" />}
        />
      </AppCard>

      {/* Membership Fee */}
      <AppCard style={styles.card}>
        <SectionHeader title="Season Fee" icon={<Feather name="credit-card" size={18} color={colors.primary} />} />

        {!editingFee ? (
          <View style={styles.rowBetween}>
            <AppText variant="bodyStrong">£{seasonFee.toFixed(2)}</AppText>
            <SecondaryButton label="Edit" onPress={() => setEditingFee(true)} />
          </View>
        ) : (
          <View style={{ gap: spacing.sm }}>
            <AppInput label="Season fee (£)" value={annualFee} onChangeText={setAnnualFee} keyboardType="numeric" />
            <View style={styles.rowBetween}>
              <SecondaryButton label="Cancel" onPress={() => setEditingFee(false)} />
              <PrimaryButton label="Save" onPress={saveAnnualFee} />
            </View>
          </View>
        )}

        <View style={styles.totalsGrid}>
          <View style={styles.totalItem}>
            <AppText variant="caption" color="secondary">Expected</AppText>
            <AppText variant="bodyStrong" style={styles.totalValue}>£{membershipExpected.toFixed(2)}</AppText>
          </View>
          <View style={styles.totalItem}>
            <AppText variant="caption" color="secondary">Received</AppText>
            <AppText variant="bodyStrong" style={styles.totalValue}>£{membershipReceived.toFixed(2)}</AppText>
          </View>
          <View style={styles.totalItem}>
            <AppText variant="caption" color="secondary">Outstanding</AppText>
            <AppText variant="bodyStrong" style={styles.totalValue}>£{membershipOutstanding.toFixed(2)}</AppText>
          </View>
        </View>
      </AppCard>

      {/* Event Fees Summary */}
      <AppCard style={styles.card}>
        <SectionHeader title="Event Fees (Summary)" icon={<Feather name="flag" size={18} color={colors.primary} />} />

        <View style={styles.totalsGrid}>
          <View style={styles.totalItem}>
            <AppText variant="caption" color="secondary">Expected</AppText>
            <AppText variant="bodyStrong" style={styles.totalValue}>£{eventFeesExpected.toFixed(2)}</AppText>
          </View>
          <View style={styles.totalItem}>
            <AppText variant="caption" color="secondary">Received</AppText>
            <AppText variant="bodyStrong" style={styles.totalValue}>£{eventFeesReceived.toFixed(2)}</AppText>
          </View>
          <View style={styles.totalItem}>
            <AppText variant="caption" color="secondary">Outstanding</AppText>
            <AppText variant="bodyStrong" style={styles.totalValue}>£{eventFeesOutstanding.toFixed(2)}</AppText>
          </View>
        </View>

        <View style={{ height: spacing.sm }} />

        <View style={styles.totalsGrid}>
          <View style={styles.totalItem}>
            <AppText variant="caption" color="secondary">Expenses total</AppText>
            <AppText variant="bodyStrong" style={styles.totalValue}>£{eventsExpensesTotal.toFixed(2)}</AppText>
          </View>
          <View style={styles.totalItem}>
            <AppText variant="caption" color="secondary">Events net</AppText>
            <Badge
              label={`£${eventsNet.toFixed(2)}`}
              variant={eventsNet >= 0 ? "paid" : "unpaid"}
            />
          </View>
        </View>
      </AppCard>

      {/* Member list */}
      <AppCard style={styles.card}>
        <SectionHeader title="Member Payments" icon={<Feather name="users" size={18} color={colors.primary} />} />

        {members.length === 0 ? (
          <AppText variant="body" color="secondary">No members found.</AppText>
        ) : (
          members.map((m) => {
            const isEditing = editingMemberId === m.id;
            const paid = !!m.paid;
            const amt = n(m.amountPaid, 0);

            return (
              <View key={m.id} style={styles.memberRow}>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong">{m.name}</AppText>
                  <AppText variant="caption" color="secondary">
                    {paid ? "Paid" : "Unpaid"} • £{amt.toFixed(2)} {m.paidDate ? `• ${m.paidDate}` : ""}
                  </AppText>
                </View>

                {!isEditing ? (
                  <View style={{ alignItems: "flex-end", gap: 8 }}>
                    <Badge label={paid ? "Paid" : "Unpaid"} variant={paid ? "paid" : "unpaid"} />
                    <SecondaryButton label="Edit" onPress={() => startEditMember(m)} />
                  </View>
                ) : (
                  <View style={{ width: 220, gap: spacing.sm }}>
                    <AppInput label="Amount paid (£)" value={editAmount} onChangeText={setEditAmount} keyboardType="numeric" />
                    <AppInput label="Paid date" value={editPaidDate} onChangeText={setEditPaidDate} placeholder="YYYY-MM-DD" />
                    <View style={styles.rowBetween}>
                      <SecondaryButton label="Cancel" onPress={cancelEditMember} />
                      <PrimaryButton label="Save" onPress={() => saveMemberPayment(m.id)} />
                    </View>
                  </View>
                )}
              </View>
            );
          })
        )}
      </AppCard>

      {/* Export */}
      <View style={styles.exportRow}>
        <PrimaryButton
          label="Export Finance Summary"
          onPress={handleExport}
          iconLeft={<Feather name="share-2" size={16} color="#fff" />}
        />
      </View>

      <SecondaryButton label="Back" onPress={() => router.back()} />
    </Screen>
  );
}

function EmptyBlocked() {
  return (
    <View style={{ padding: spacing.lg }}>
      <AppText variant="h2">Finance</AppText>
      <AppText variant="body" color="secondary" style={{ marginTop: spacing.sm }}>
        You don’t have permission to access this area.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.lg,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  totalsGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: spacing.base,
    gap: spacing.base,
    flexWrap: "wrap",
  },
  totalItem: {
    alignItems: "center",
    minWidth: 140,
  },
  totalValue: {
    marginTop: spacing.xs,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: spacing.base,
    borderTopWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    gap: spacing.base,
  },
  exportRow: {
    marginTop: spacing.base,
    marginBottom: spacing.lg,
  },
});
