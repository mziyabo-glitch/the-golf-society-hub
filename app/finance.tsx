/**
 * Finance Screen - Treasurer MVP
 * - Society annual fee setting
 * - Per-member payment status (paid/unpaid, amount paid, paid date)
 * - Totals: expected, received, outstanding
 * - Simple export/share (CSV or PDF)
 */

import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet, View, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Screen } from "@/components/ui/Screen";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { canViewFinance, normalizeMemberRoles, normalizeSessionRole } from "@/lib/permissions";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { Badge } from "@/components/ui/Badge";
import { LoadingState } from "@/components/ui/LoadingState";
import { getColors, spacing, typography } from "@/lib/ui/theme";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useBootstrap } from "@/lib/useBootstrap";
import { subscribeMembersBySociety, updateMemberDoc, type MemberDoc } from "@/lib/db/memberRepo";
import { subscribeEventsBySociety, type EventDoc } from "@/lib/db/eventRepo";
import { subscribeSocietyDoc, updateSocietyDoc, type SocietyDoc } from "@/lib/db/societyRepo";

type MemberData = MemberDoc;
type SocietyData = SocietyDoc;

export default function FinanceScreen() {
  const { user } = useBootstrap();
  const [hasAccess, setHasAccess] = useState(false);
  const [members, setMembers] = useState<MemberData[]>([]);
  const [society, setSociety] = useState<SocietyData | null>(null);
  const [annualFee, setAnnualFee] = useState<string>("");
  const [editingFee, setEditingFee] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState<string>("");
  const [editPaidDate, setEditPaidDate] = useState<string>("");
  const [events, setEvents] = useState<EventDoc[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingSociety, setLoadingSociety] = useState(true);

  const currentMember = useMemo(
    () => members.find((m) => m.id === user?.activeMemberId) || null,
    [members, user?.activeMemberId]
  );

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

  useEffect(() => {
    if (!user?.activeSocietyId) {
      setSociety(null);
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

  const saveAnnualFee = async () => {
    if (!society) return;
    try {
      const fee = parseFloat(annualFee);
      if (isNaN(fee) || fee < 0) {
        Alert.alert("Error", "Please enter a valid annual fee");
        return;
      }
      await updateSocietyDoc(society.id, { annualFee: fee });
      setEditingFee(false);
      Alert.alert("Success", "Annual fee updated");
    } catch (error) {
      console.error("Error saving annual fee:", error);
      Alert.alert("Error", "Failed to save annual fee");
    }
  };

  const saveMemberPayment = async (memberId: string) => {
    try {
      const amount = parseFloat(editAmount);
      if (isNaN(amount) || amount < 0) {
        Alert.alert("Error", "Please enter a valid amount");
        return;
      }

      await updateMemberDoc(memberId, {
        paid: amount > 0,
        amountPaid: amount,
        paidDate: editPaidDate || new Date().toISOString().split("T")[0],
      });
      setEditingMemberId(null);
      setEditAmount("");
      setEditPaidDate("");
      Alert.alert("Success", "Payment updated");
    } catch (error) {
      console.error("Error saving payment:", error);
      Alert.alert("Error", "Failed to save payment");
    }
  };

  const activeMembers = members.filter((m) => m.id); // All members are active for now
  const expected = (society?.annualFee || 0) * activeMembers.length;
  const received = members.reduce((sum, m) => sum + (m.amountPaid || 0), 0);
  const outstanding = expected - received;

  // Calculate event fees summary
  const now = new Date();
  const upcomingEvents = events.filter((e) => {
    const eventDate = new Date(e.date);
    return eventDate >= now && !e.isCompleted && e.eventFee && e.eventFee > 0;
  });

  const eventFeesExpected = upcomingEvents.reduce((sum, event) => {
    const participants = event.playerIds?.length || members.length; // Use playerIds if available, otherwise all members
    return sum + (event.eventFee || 0) * participants;
  }, 0);

  const eventFeesReceived = upcomingEvents.reduce((sum, event) => {
    if (!event.payments) return sum;
    return sum + Object.values(event.payments).reduce((eventSum, payment) => {
      return eventSum + (payment.paid ? (event.eventFee || 0) : 0);
    }, 0);
  }, 0);

  const eventFeesOutstanding = eventFeesExpected - eventFeesReceived;

  const handleExport = async () => {
    try {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; font-size: 12px; padding: 20px; }
            h1 { margin: 0 0 10px 0; font-size: 20px; }
            h2 { margin: 20px 0 10px 0; font-size: 16px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #000; padding: 8px; text-align: left; }
            th { background-color: #f0f0f0; font-weight: bold; }
            .totals { margin-top: 20px; padding: 10px; background-color: #f9f9f9; }
            .totals p { margin: 5px 0; font-weight: bold; }
          </style>
        </head>
        <body>
          <h1>${society?.name || "Society"} - Finance Report</h1>
          <p>Generated: ${new Date().toLocaleDateString()}</p>
          
          <div class="totals">
            <h2>Summary</h2>
            <p>Annual Fee: £${society?.annualFee || 0}</p>
            <p>Expected: £${expected.toFixed(2)}</p>
            <p>Received: £${received.toFixed(2)}</p>
            <p>Outstanding: £${outstanding.toFixed(2)}</p>
          </div>

          <h2>Member Payments</h2>
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Amount Paid</th>
                <th>Paid Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${members
                .map(
                  (m) => `
                <tr>
                  <td>${m.name}</td>
                  <td>£${(m.amountPaid || 0).toFixed(2)}</td>
                  <td>${m.paidDate || "-"}</td>
                  <td>${m.paid ? "Paid" : "Unpaid"}</td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        </body>
        </html>
      `;

      if (Platform.OS === "web") {
        const printWindow = window.open("", "_blank");
        if (printWindow) {
          printWindow.document.write(html);
          printWindow.document.close();
          printWindow.focus();
          setTimeout(() => {
            printWindow.print();
          }, 250);
        }
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        const sharingAvailable = await Sharing.isAvailableAsync();
        if (sharingAvailable) {
          await Sharing.shareAsync(uri);
        } else {
          Alert.alert("Success", `PDF saved to: ${uri}`);
        }
      }
    } catch (error) {
      console.error("Error exporting finance report:", error);
      Alert.alert("Error", "Failed to export report");
    }
  };

  const colors = getColors();
  const loading = loadingMembers || loadingEvents || loadingSociety;

  if (loading) {
    return (
      <Screen scrollable={false}>
        <LoadingState message="Loading finance data..." />
      </Screen>
    );
  }

  if (!hasAccess) {
    return null;
  }

  return (
    <Screen>
      <SectionHeader title="Finance" />
      <AppText variant="caption" color="secondary" style={styles.subtitle}>
        Treasurer tools and financial management
      </AppText>

      <AppCard style={styles.eventManagerCard}>
        <View style={styles.eventManagerRow}>
          <View style={styles.eventManagerText}>
            <AppText variant="h2">Event Manager</AppText>
            <AppText variant="caption" color="secondary">
              Track event P&amp;L and expenses
            </AppText>
          </View>
          <PrimaryButton
            onPress={() => router.push("/finance-events" as any)}
            size="sm"
            icon={<Feather name="arrow-right" size={16} color={colors.textInverse} />}
          >
            Open
          </PrimaryButton>
        </View>
      </AppCard>

        {/* Annual Fee */}
        <AppCard style={styles.section}>
          <AppText variant="h2" style={styles.sectionTitle}>
            Annual Fee
          </AppText>
          {editingFee ? (
            <View style={styles.editRow}>
              <AppInput
                value={annualFee}
                onChangeText={setAnnualFee}
                keyboardType="numeric"
                placeholder="0.00"
                style={styles.input}
              />
              <PrimaryButton
                onPress={saveAnnualFee}
                size="sm"
                style={styles.saveButton}
                icon={<Feather name="save" size={16} color={colors.textInverse} />}
              >
                Save
              </PrimaryButton>
              <SecondaryButton
                onPress={() => {
                  setEditingFee(false);
                  setAnnualFee(society?.annualFee?.toString() || "");
                }}
                size="sm"
                style={styles.cancelButton}
              >
                Cancel
              </SecondaryButton>
            </View>
          ) : (
            <View style={styles.displayRow}>
              <AppText variant="body" style={styles.feeDisplay}>
                £{society?.annualFee?.toFixed(2) || "0.00"}
              </AppText>
              <SecondaryButton
                onPress={() => setEditingFee(true)}
                size="sm"
                icon={<Feather name="edit-2" size={16} color={colors.primary} />}
              >
                Edit
              </SecondaryButton>
            </View>
          )}
        </AppCard>

        {/* Totals */}
        <AppCard style={styles.section}>
          <AppText variant="h2" style={styles.sectionTitle}>
            Summary
          </AppText>
          <View style={styles.totalsGrid}>
            <View style={styles.totalItem}>
              <AppText variant="caption" color="secondary">
                Expected
              </AppText>
              <AppText variant="h2" style={styles.totalValue}>
                £{expected.toFixed(2)}
              </AppText>
            </View>
            <View style={styles.totalItem}>
              <AppText variant="caption" color="secondary">
                Received
              </AppText>
              <AppText 
                variant="h2" 
                style={StyleSheet.flatten([styles.totalValue, { color: colors.success }])}
              >
                £{received.toFixed(2)}
              </AppText>
            </View>
            <View style={styles.totalItem}>
              <AppText variant="caption" color="secondary">
                Outstanding
              </AppText>
              <AppText 
                variant="h2" 
                style={StyleSheet.flatten([styles.totalValue, { color: outstanding > 0 ? colors.error : colors.success }])}
              >
                £{outstanding.toFixed(2)}
              </AppText>
            </View>
          </View>
        </AppCard>

        {/* Event Fees Summary */}
        {upcomingEvents.length > 0 && (
          <AppCard style={styles.section}>
            <AppText variant="h2" style={styles.sectionTitle}>
              Event Fees Summary
            </AppText>
            <View style={styles.totalsGrid}>
              <View style={styles.totalItem}>
                <AppText variant="caption" color="secondary">
                  Expected
                </AppText>
                <AppText variant="h2" style={styles.totalValue}>
                  £{eventFeesExpected.toFixed(2)}
                </AppText>
              </View>
              <View style={styles.totalItem}>
                <AppText variant="caption" color="secondary">
                  Received
                </AppText>
                <AppText 
                  variant="h2" 
                  style={StyleSheet.flatten([styles.totalValue, { color: colors.success }])}
                >
                  £{eventFeesReceived.toFixed(2)}
                </AppText>
              </View>
              <View style={styles.totalItem}>
                <AppText variant="caption" color="secondary">
                  Outstanding
                </AppText>
                <AppText 
                  variant="h2" 
                  style={StyleSheet.flatten([styles.totalValue, { color: eventFeesOutstanding > 0 ? colors.error : colors.success }])}
                >
                  £{eventFeesOutstanding.toFixed(2)}
                </AppText>
              </View>
            </View>
            <View style={styles.eventsList}>
              {upcomingEvents.map((event) => {
                const eventParticipants = event.playerIds?.length || members.length;
                const eventExpected = (event.eventFee || 0) * eventParticipants;
                const eventReceived = event.payments
                  ? Object.values(event.payments).reduce((sum, payment) => sum + (payment.paid ? (event.eventFee || 0) : 0), 0)
                  : 0;
                const eventOutstanding = eventExpected - eventReceived;
                return (
                  <View key={event.id} style={[styles.eventRow, { borderBottomColor: colors.border }]}>
                    <View style={styles.eventInfo}>
                      <AppText variant="bodyBold">{event.name}</AppText>
                      <AppText variant="caption" color="secondary">
                        {new Date(event.date).toLocaleDateString()} • £{(event.eventFee || 0).toFixed(2)} per person
                      </AppText>
                    </View>
                    <View style={styles.eventAmounts}>
                      <AppText variant="caption" color="secondary">
                        Expected: £{eventExpected.toFixed(2)}
                      </AppText>
                      <AppText variant="caption" color="secondary">
                        Received: £{eventReceived.toFixed(2)}
                      </AppText>
                      <AppText 
                        variant="caption" 
                        style={{ color: eventOutstanding > 0 ? colors.error : colors.success }}
                      >
                        Outstanding: £{eventOutstanding.toFixed(2)}
                      </AppText>
                    </View>
                  </View>
                );
              })}
            </View>
          </AppCard>
        )}

        {/* Member Payments */}
        <AppCard style={styles.section}>
          <View style={styles.sectionHeader}>
            <AppText variant="h2" style={styles.sectionTitle}>
              Member Payments
            </AppText>
            <PrimaryButton
              onPress={handleExport}
              size="sm"
              icon={<Feather name="download" size={16} color={colors.textInverse} />}
            >
              Export
            </PrimaryButton>
          </View>
          {members.length === 0 ? (
            <AppText variant="body" color="secondary" style={styles.emptyText}>
              No members found
            </AppText>
          ) : (
            <View style={styles.membersList}>
              {members.map((member) => (
                <View key={member.id} style={[styles.memberRow, { borderBottomColor: colors.border }]}>
                  {editingMemberId === member.id ? (
                    <View style={styles.editPaymentRow}>
                      <View style={styles.editInputs}>
                        <AppInput
                          value={editAmount}
                          onChangeText={setEditAmount}
                          keyboardType="numeric"
                          placeholder="Amount"
                          style={styles.smallInput}
                          size="sm"
                        />
                        <AppInput
                          value={editPaidDate}
                          onChangeText={setEditPaidDate}
                          placeholder="YYYY-MM-DD"
                          style={styles.smallInput}
                          size="sm"
                        />
                      </View>
                      <View style={styles.editActions}>
                        <PrimaryButton
                          onPress={() => saveMemberPayment(member.id)}
                          size="sm"
                          icon={<Feather name="save" size={16} color={colors.textInverse} />}
                        >
                          Save
                        </PrimaryButton>
                        <SecondaryButton
                          onPress={() => {
                            setEditingMemberId(null);
                            setEditAmount("");
                            setEditPaidDate("");
                          }}
                          size="sm"
                        >
                          Cancel
                        </SecondaryButton>
                      </View>
                    </View>
                  ) : (
                    <>
                      <View style={styles.memberInfo}>
                        <AppText variant="bodyBold">{member.name}</AppText>
                        <AppText variant="caption" color="secondary">
                          £{(member.amountPaid || 0).toFixed(2)} {member.paidDate ? `• ${member.paidDate}` : ""}
                        </AppText>
                      </View>
                      <View style={styles.memberStatus}>
                        <Badge variant={member.paid ? "paid" : "unpaid"} label={member.paid ? "Paid" : "Unpaid"} />
                        <SecondaryButton
                          onPress={() => {
                            setEditingMemberId(member.id);
                            setEditAmount(member.amountPaid?.toString() || "");
                            setEditPaidDate(member.paidDate || "");
                          }}
                          size="sm"
                          icon={<Feather name="edit-2" size={16} color={colors.primary} />}
                        >
                          Edit
                        </SecondaryButton>
                      </View>
                    </>
                  )}
                </View>
              ))}
            </View>
          )}
        </AppCard>

        <SecondaryButton onPress={() => router.back()}>
          Back
        </SecondaryButton>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    marginBottom: spacing.xs,
  },
  subtitle: {
    marginBottom: spacing.xl,
  },
  eventManagerCard: {
    marginBottom: spacing.base,
  },
  eventManagerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
  },
  eventManagerText: {
    flex: 1,
  },
  section: {
    marginBottom: spacing.base,
  },
  sectionTitle: {
    marginBottom: spacing.base,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.base,
  },
  editRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  displayRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  feeDisplay: {
    fontSize: 24,
    fontWeight: "700",
  },
  input: {
    flex: 1,
  },
  smallInput: {
    flex: 1,
    marginRight: spacing.xs,
  },
  saveButton: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  saveButtonText: {
    ...typography.button,
  },
  cancelButton: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  cancelButtonText: {
    ...typography.body,
  },
  editButton: {
    borderWidth: 1,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  editButtonText: {
    ...typography.button,
  },
  totalsGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: spacing.base,
  },
  totalItem: {
    alignItems: "center",
  },
  totalValue: {
    marginTop: spacing.xs,
  },
  exportButton: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  exportButtonText: {
    ...typography.button,
  },
  membersList: {
    marginTop: spacing.base,
  },
  memberRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.base,
    borderBottomWidth: 1,
  },
  memberInfo: {
    flex: 1,
  },
  memberStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 12,
  },
  statusText: {
    ...typography.captionBold,
    fontSize: 12,
  },
  editLink: {
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 6,
  },
  editLinkText: {
    ...typography.captionBold,
  },
  editPaymentRow: {
    width: "100%",
  },
  editInputs: {
    flexDirection: "row",
    marginBottom: spacing.sm,
  },
  editActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  smallButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 6,
  },
  smallButtonText: {
    ...typography.captionBold,
  },
  emptyText: {
    textAlign: "center",
    padding: spacing.xl,
  },
  eventsList: {
    marginTop: spacing.base,
  },
  eventRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: spacing.base,
    borderBottomWidth: 1,
  },
  eventInfo: {
    flex: 1,
    marginRight: spacing.base,
  },
  eventAmounts: {
    alignItems: "flex-end",
  },
  backButton: {
    paddingVertical: spacing.base,
    alignItems: "center",
    marginTop: spacing.xl,
  },
});
