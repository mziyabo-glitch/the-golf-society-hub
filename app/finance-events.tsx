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
import {
  canViewFinance,
  normalizeMemberRoles,
  normalizeSessionRole,
} from "@/lib/permissions";

import {
  subscribeMembersBySociety,
  updateMemberDoc,
  type MemberDoc,
} from "@/lib/db/memberRepo";
import { subscribeEventsBySociety, type EventDoc } from "@/lib/db/eventRepo";
import {
  subscribeSocietyDoc,
  updateSocietyDoc,
  type SocietyDoc,
} from "@/lib/db/societyRepo";
import { subscribeEventExpenses } from "@/lib/db/expenseRepo";

import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

type ExpenseTotalsByEvent = Record<string, number>;

export default function FinanceScreen() {
  const colors = getColors();
  const { user, societyId } = useBootstrap();

  const [hasAccess, setHasAccess] = useState<boolean>(false);

  const [society, setSociety] = useState<SocietyDoc | null>(null);
  const [members, setMembers] = useState<MemberDoc[]>([]);
  const [events, setEvents] = useState<EventDoc[]>([]);

  const [annualFeeInput, setAnnualFeeInput] = useState<string>("");

  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState<string>("");
  const [editPaidDate, setEditPaidDate] = useState<string>("");

  const [loadingMembers, setLoadingMembers] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingSociety, setLoadingSociety] = useState(true);

  // For Season P&L
  const [expenseTotalsByEvent, setExpenseTotalsByEvent] =
    useState<ExpenseTotalsByEvent>({});

  const currentMember = useMemo(() => {
    return members.find((m) => m.id === user?.activeMemberId) || null;
  }, [members, user?.activeMemberId]);

  // ACCESS CONTROL (✅ FIXED)
  useEffect(() => {
    // ✅ Wait until members are loaded, otherwise currentMember is null initially
    if (loadingMembers) return;

    // ✅ If still no currentMember after members loaded, activeMemberId is missing/mismatched
    if (!currentMember) {
      setHasAccess(false);
      Alert.alert(
        "Profile not linked",
        "Your user record is missing an active member. Please re-join the society or use Settings → Reset Society and join again.",
        [{ text: "OK", onPress: () => router.push("/settings") }]
      );
      return;
    }

    const sessionRole = normalizeSessionRole("member");
    const roles = normalizeMemberRoles(currentMember.roles);
    const access = canViewFinance(sessionRole, roles);

    setHasAccess(access);

    if (!access) {
      Alert.alert(
        "Access Denied",
        "Only Treasurer, Captain, or Admin can access Finance",
        [{ text: "OK", onPress: () => router.back() }]
      );
    }
  }, [loadingMembers, currentMember?.id, currentMember?.roles]);

  // SUBSCRIBE SOCIETY
  useEffect(() => {
    if (!societyId) return;
    setLoadingSociety(true);

    const unsub = subscribeSocietyDoc(societyId, (doc) => {
      setSociety(doc);
      setAnnualFeeInput(doc?.annualFee ? String(doc.annualFee) : "");
      setLoadingSociety(false);
    });

    return () => unsub?.();
  }, [societyId]);

  // SUBSCRIBE MEMBERS
  useEffect(() => {
    if (!societyId) return;
    setLoadingMembers(true);

    const unsub = subscribeMembersBySociety(societyId, (docs) => {
      setMembers(docs);
      setLoadingMembers(false);
    });

    return () => unsub?.();
  }, [societyId]);

  // SUBSCRIBE EVENTS
  useEffect(() => {
    if (!societyId) return;
    setLoadingEvents(true);

    const unsub = subscribeEventsBySociety(societyId, (docs) => {
      setEvents(docs);
      setLoadingEvents(false);
    });

    return () => unsub?.();
  }, [societyId]);

  // SUBSCRIBE EXPENSE TOTALS PER EVENT
  useEffect(() => {
    if (!societyId) return;
    if (!events.length) {
      setExpenseTotalsByEvent({});
      return;
    }

    const unsubs = events.map((evt) => {
      return subscribeEventExpenses(societyId, evt.id, (expenses) => {
        const total = expenses.reduce(
          (sum, x) => sum + Number(x.amount || 0),
          0
        );
        setExpenseTotalsByEvent((prev) => ({ ...prev, [evt.id]: total }));
      });
    });

    return () => {
      unsubs.forEach((u) => u?.());
    };
  }, [societyId, events]);

  const annualFee = useMemo(() => {
    const n = Number(annualFeeInput);
    return isNaN(n) ? 0 : n;
  }, [annualFeeInput]);

  const membershipReceived = useMemo(() => {
    return members.reduce((sum, m) => sum + Number(m.amountPaid || 0), 0);
  }, [members]);

  const eventSummaries = useMemo(() => {
    return events.map((evt) => {
      const fee = Number(evt.eventFee || 0);
      const payments = evt.payments || {};
      const paidCount = Object.values(payments).filter(
        (p: any) => p?.paid
      ).length;

      const feesReceived = paidCount * fee;
      const expenses = Number(expenseTotalsByEvent[evt.id] || 0);
      const net = feesReceived - expenses;

      return {
        id: evt.id,
        title: evt.title || "Event",
        date: evt.date || "",
        eventFee: fee,
        paidCount,
        memberCount: members.length,
        feesReceived,
        expenses,
        net,
      };
    });
  }, [events, members.length, expenseTotalsByEvent]);

  const seasonNet = useMemo(() => {
    const eventsNet = eventSummaries.reduce((sum, e) => sum + e.net, 0);
    return membershipReceived + eventsNet;
  }, [membershipReceived, eventSummaries]);

  const handleSaveAnnualFee = async () => {
    if (!societyId) return;
    try {
      await updateSocietyDoc(societyId, { annualFee });
      Alert.alert("Saved", "Annual fee updated.");
    } catch (e: any) {
      console.error(e);
      Alert.alert("Error", e?.message ?? "Failed to update annual fee.");
    }
  };

  const startEditMember = (m: MemberDoc) => {
    setEditingMemberId(m.id);
    setEditAmount(m.amountPaid ? String(m.amountPaid) : "");
    setEditPaidDate(m.paidDate ? String(m.paidDate) : "");
  };

  const cancelEdit = () => {
    setEditingMemberId(null);
    setEditAmount("");
    setEditPaidDate("");
  };

  const saveEditMember = async () => {
    if (!societyId || !editingMemberId) return;

    const amount = Number(editAmount);
    if (isNaN(amount) || amount < 0) {
      Alert.alert("Invalid", "Amount paid must be a valid number.");
      return;
    }

    try {
      await updateMemberDoc(societyId, editingMemberId, {
        paid: amount > 0,
        amountPaid: amount,
        paidDate: editPaidDate ? editPaidDate : null,
      });
      cancelEdit();
    } catch (e: any) {
      console.error(e);
      Alert.alert("Error", e?.message ?? "Failed to update member payment.");
    }
  };

  const openEventPnL = (eventId: string) => {
    router.push(`/finance-events/${eventId}`);
  };

  const exportSeasonReport = async () => {
    try {
      const html = `
        <html>
          <head>
            <meta charset="utf-8" />
            <style>
              body { font-family: Arial, sans-serif; padding: 16px; }
              h1 { margin-bottom: 8px; }
              table { width: 100%; border-collapse: collapse; margin-top: 12px; }
              th, td { border: 1px solid #ddd; padding: 8px; font-size: 12px; }
              th { background: #f5f5f5; text-align: left; }
              .kpi { margin-top: 8px; }
            </style>
          </head>
          <body>
            <h1>Season Finance Report</h1>
            <div class="kpi"><b>Society:</b> ${society?.name ?? ""}</div>
            <div class="kpi"><b>Membership Received:</b> £${membershipReceived.toFixed(
              0
            )}</div>
            <div class="kpi"><b>Season Net:</b> £${seasonNet.toFixed(0)}</div>

            <h2>Events</h2>
            <table>
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Date</th>
                  <th>Fee</th>
                  <th>Paid</th>
                  <th>Fees Received</th>
                  <th>Expenses</th>
                  <th>Net</th>
                </tr>
              </thead>
              <tbody>
                ${eventSummaries
                  .map(
                    (e) => `
                  <tr>
                    <td>${e.title}</td>
                    <td>${e.date}</td>
                    <td>£${e.eventFee.toFixed(0)}</td>
                    <td>${e.paidCount}/${e.memberCount}</td>
                    <td>£${e.feesReceived.toFixed(0)}</td>
                    <td>£${e.expenses.toFixed(0)}</td>
                    <td>£${e.net.toFixed(0)}</td>
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
      await Sharing.shareAsync(uri);
    } catch (e: any) {
      console.error(e);
      Alert.alert("Export Failed", e?.message ?? "Could not export report.");
    }
  };

  if (!societyId) {
    return (
      <Screen>
        <SectionHeader title="Finance" />
        <AppCard>
          <AppText>No active society selected.</AppText>
        </AppCard>
      </Screen>
    );
  }

  if (!hasAccess) {
    return (
      <Screen>
        <SectionHeader title="Finance" subtitle="Captain/Treasurer only" />
        <AppCard>
          <AppText style={{ marginBottom: 12 }}>
            Checking your access…
          </AppText>
          <LoadingState />
        </AppCard>
      </Screen>
    );
  }

  const isLoading = loadingSociety || loadingMembers || loadingEvents;

  return (
    <Screen>
      <SectionHeader title="Finance" subtitle="Treasurer MVP + Season P&L" />

      {isLoading ? (
        <LoadingState />
      ) : (
        <>
          <AppCard style={{ marginBottom: spacing.md }}>
            <AppText style={styles.h2}>Season Summary</AppText>

            <View style={styles.kpiRow}>
              <View style={styles.kpiItem}>
                <AppText style={styles.kpiLabel}>Membership Received</AppText>
                <AppText style={styles.kpiValue}>
                  £{membershipReceived.toFixed(0)}
                </AppText>
              </View>
              <View style={styles.kpiItem}>
                <AppText style={styles.kpiLabel}>Season Net</AppText>
                <AppText style={styles.kpiValue}>£{seasonNet.toFixed(0)}</AppText>
              </View>
            </View>

            <View style={{ marginTop: spacing.sm }}>
              <PrimaryButton
                label="Export Season Report"
                onPress={exportSeasonReport}
                icon={<Feather name="share-2" size={16} />}
              />
            </View>
          </AppCard>

          <AppCard style={{ marginBottom: spacing.md }}>
            <AppText style={styles.h2}>Annual Membership Fee</AppText>
            <View style={styles.row}>
              <AppInput
                value={annualFeeInput}
                onChangeText={setAnnualFeeInput}
                placeholder="0"
                keyboardType={Platform.OS === "ios" ? "number-pad" : "numeric"}
                style={{ flex: 1 }}
              />
              <PrimaryButton label="Save" onPress={handleSaveAnnualFee} />
            </View>
          </AppCard>

          <AppCard style={{ marginBottom: spacing.md }}>
            <AppText style={styles.h2}>Member Payments</AppText>

            {members.map((m) => {
              const paid = Boolean(m.paid);
              const isEditing = editingMemberId === m.id;

              return (
                <View key={m.id} style={styles.memberRow}>
                  <View style={{ flex: 1 }}>
                    <AppText style={styles.memberName}>
                      {m.displayName || m.name || "Member"}
                    </AppText>

                    <View style={styles.badgeRow}>
                      <Badge label={paid ? "Paid" : "Unpaid"} />
                      <AppText style={styles.muted}>
                        £{Number(m.amountPaid || 0).toFixed(0)}
                      </AppText>
                    </View>
                  </View>

                  <SecondaryButton
                    label={isEditing ? "Cancel" : "Edit"}
                    onPress={() => (isEditing ? cancelEdit() : startEditMember(m))}
                  />
                </View>
              );
            })}

            {editingMemberId ? (
              <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
                <AppInput
                  label="Amount Paid"
                  value={editAmount}
                  onChangeText={setEditAmount}
                  placeholder="0"
                  keyboardType={
                    Platform.OS === "ios" ? "decimal-pad" : "numeric"
                  }
                />
                <AppInput
                  label="Paid Date (optional)"
                  value={editPaidDate}
                  onChangeText={setEditPaidDate}
                  placeholder="YYYY-MM-DD"
                />
                <PrimaryButton label="Save Payment" onPress={saveEditMember} />
              </View>
            ) : null}
          </AppCard>

          <AppCard style={{ marginBottom: spacing.md }}>
            <AppText style={styles.h2}>Event P&L</AppText>

            {eventSummaries.map((e) => (
              <View key={e.id} style={styles.eventRow}>
                <View style={{ flex: 1 }}>
                  <AppText style={styles.eventTitle}>{e.title}</AppText>
                  <AppText style={styles.muted}>
                    {e.date ? `${e.date} · ` : ""}
                    Paid {e.paidCount}/{e.memberCount} · Net £{e.net.toFixed(0)}
                  </AppText>
                </View>
                <SecondaryButton
                  label="Open"
                  onPress={() => openEventPnL(e.id)}
                />
              </View>
            ))}
          </AppCard>

          <SecondaryButton label="Back" onPress={() => router.back()} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  h2: {
    fontSize: typography.lg,
    fontWeight: "800",
    marginBottom: spacing.sm,
  },
  kpiRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  kpiItem: {
    flex: 1,
  },
  kpiLabel: {
    opacity: 0.7,
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: "800",
  },
  row: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
  },
  memberRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.12)",
  },
  memberName: {
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 2,
  },
  badgeRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
  },
  muted: {
    opacity: 0.7,
  },
  eventRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.12)",
  },
  eventTitle: {
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 2,
  },
});
