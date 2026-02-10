/**
 * Event Finance Screen
 *
 * Allows Captain/Treasurer to:
 * - View all events with income/costs/net
 * - Edit income and costs per event
 * - View overall totals
 */

import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View, Alert, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { useBootstrap } from "@/lib/useBootstrap";
import {
  getEventsFinanceSummary,
  updateEventFinance,
  type EventFinanceSummary,
} from "@/lib/db_supabase/eventRepo";
import { getPermissionsForMember } from "@/lib/rbac";
import { getColors, spacing } from "@/lib/ui/theme";
import { guard } from "@/lib/guards";

// Format pence to pounds string (e.g., 5000 -> "£50.00")
function formatPence(pence: number | null | undefined): string {
  if (pence == null) return "£0.00";
  const pounds = pence / 100;
  return `£${pounds.toFixed(2)}`;
}

// Format pence with sign for net values
function formatPenceWithSign(pence: number): string {
  const pounds = Math.abs(pence) / 100;
  return `${pence >= 0 ? "+" : "-"}£${pounds.toFixed(2)}`;
}

// Parse pounds string to pence (e.g., "50.00" -> 5000)
function parsePounds(str: string): number | null {
  const cleaned = str.replace(/[£,\s]/g, "");
  if (!cleaned) return null;
  const num = parseFloat(cleaned);
  if (Number.isNaN(num)) return null;
  return Math.round(num * 100);
}

type EditingEvent = {
  eventId: string;
  incomeInput: string;
  costsInput: string;
};

export default function EventFinanceScreen() {
  const router = useRouter();
  const { societyId, member, loading: bootstrapLoading } = useBootstrap();
  const colors = getColors();

  const [events, setEvents] = useState<EventFinanceSummary[]>([]);
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalCosts, setTotalCosts] = useState(0);
  const [totalNet, setTotalNet] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditingEvent | null>(null);
  const [saving, setSaving] = useState(false);

  const permissions = getPermissionsForMember(member as any);
  const canManageFinance = permissions.canAccessFinance;

  // Load events finance data
  const loadData = useCallback(async () => {
    if (!societyId) return;

    setLoading(true);
    try {
      const summary = await getEventsFinanceSummary(societyId);
      setEvents(summary.events);
      setTotalIncome(summary.totalIncomePence);
      setTotalCosts(summary.totalCostsPence);
      setTotalNet(summary.totalNetPence);
    } catch (err: any) {
      console.error("[EventFinance] loadData error:", err);
      Alert.alert("Error", err?.message || "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }, [societyId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Refresh on focus
  useFocusEffect(
    useCallback(() => {
      if (societyId) loadData();
    }, [societyId, loadData])
  );

  // Start editing an event
  const handleEdit = (event: EventFinanceSummary) => {
    setEditing({
      eventId: event.eventId,
      incomeInput: event.incomePence > 0 ? (event.incomePence / 100).toFixed(2) : "",
      costsInput: event.costsPence > 0 ? (event.costsPence / 100).toFixed(2) : "",
    });
  };

  // Cancel editing
  const handleCancel = () => {
    setEditing(null);
  };

  // Save event finance
  const handleSave = async () => {
    if (!guard(permissions.canAccessFinance, "Only the Captain or Treasurer can edit event finance.")) return;
    if (!editing) return;

    const incomePence = parsePounds(editing.incomeInput);
    const costsPence = parsePounds(editing.costsInput);

    // Validate
    if (editing.incomeInput.trim() && incomePence === null) {
      Alert.alert("Invalid Amount", "Please enter a valid income amount.");
      return;
    }
    if (editing.costsInput.trim() && costsPence === null) {
      Alert.alert("Invalid Amount", "Please enter a valid costs amount.");
      return;
    }

    setSaving(true);
    try {
      await updateEventFinance(editing.eventId, incomePence ?? 0, costsPence ?? 0);
      setEditing(null);
      await loadData();
    } catch (err: any) {
      console.error("[EventFinance] handleSave error:", err);
      Alert.alert("Error", err?.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  if (bootstrapLoading || loading) {
    return (
      <Screen scrollable={false}>
        <View style={styles.centered}>
          <LoadingState message="Loading event finances..." />
        </View>
      </Screen>
    );
  }

  if (!canManageFinance) {
    return (
      <Screen>
        <View style={styles.header}>
          <SecondaryButton onPress={() => router.back()} size="sm">
            <Feather name="arrow-left" size={16} color={colors.text} /> Back
          </SecondaryButton>
        </View>
        <EmptyState
          icon={<Feather name="lock" size={32} color={colors.textTertiary} />}
          title="Access Restricted"
          message="Only Captain or Treasurer can manage event finances."
        />
      </Screen>
    );
  }

  return (
    <Screen>
      {/* Header */}
      <View style={styles.header}>
        <SecondaryButton onPress={() => router.back()} size="sm">
          <Feather name="arrow-left" size={16} color={colors.text} /> Back
        </SecondaryButton>
      </View>

      <AppText variant="title" style={styles.title}>
        <Feather name="bar-chart-2" size={24} color={colors.primary} /> Event Finances
      </AppText>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Totals Summary */}
        <AppCard style={styles.summaryCard}>
          <AppText variant="h2" style={{ marginBottom: spacing.sm }}>
            Overall Summary
          </AppText>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryItem}>
              <AppText variant="caption" color="secondary">
                Total Income
              </AppText>
              <AppText variant="h1" style={{ color: colors.success }}>
                {formatPence(totalIncome)}
              </AppText>
            </View>
            <View style={styles.summaryItem}>
              <AppText variant="caption" color="secondary">
                Total Costs
              </AppText>
              <AppText variant="h1" style={{ color: colors.error }}>
                {formatPence(totalCosts)}
              </AppText>
            </View>
            <View style={styles.summaryItem}>
              <AppText variant="caption" color="secondary">
                Net
              </AppText>
              <AppText
                variant="h1"
                style={{ color: totalNet >= 0 ? colors.success : colors.error }}
              >
                {formatPenceWithSign(totalNet)}
              </AppText>
            </View>
          </View>
        </AppCard>

        {/* Events List */}
        <View style={styles.eventsHeader}>
          <AppText variant="h2">Events</AppText>
          <AppText variant="caption" color="secondary">
            {events.length} event{events.length !== 1 ? "s" : ""}
          </AppText>
        </View>

        {events.length === 0 ? (
          <AppCard>
            <AppText variant="body" color="secondary" style={{ textAlign: "center" }}>
              No events found.
            </AppText>
          </AppCard>
        ) : (
          events.map((event) => {
            const isEditing = editing?.eventId === event.eventId;
            const net = event.incomePence - event.costsPence;
            const hasFinance = event.incomePence > 0 || event.costsPence > 0;

            return (
              <AppCard key={event.eventId} style={styles.eventCard}>
                {/* Event Header */}
                <View style={styles.eventHeader}>
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyBold" numberOfLines={1}>
                      {event.eventName}
                    </AppText>
                    <AppText variant="caption" color="secondary">
                      {event.eventDate
                        ? new Date(event.eventDate).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : "Date TBC"}
                    </AppText>
                  </View>
                  {!isEditing && (
                    <SecondaryButton onPress={() => handleEdit(event)} size="sm">
                      <Feather name="edit-2" size={14} color={colors.text} />
                    </SecondaryButton>
                  )}
                </View>

                {isEditing ? (
                  <View style={styles.editForm}>
                    <View style={styles.inputRow}>
                      <View style={styles.inputGroup}>
                        <AppText variant="caption" color="secondary">
                          Income
                        </AppText>
                        <View style={styles.inputWrapper}>
                          <AppText variant="body" style={{ marginRight: spacing.xs }}>
                            £
                          </AppText>
                          <AppInput
                            placeholder="0.00"
                            value={editing.incomeInput}
                            onChangeText={(text) =>
                              setEditing({ ...editing, incomeInput: text })
                            }
                            keyboardType="decimal-pad"
                            style={{ flex: 1 }}
                          />
                        </View>
                      </View>

                      <View style={styles.inputGroup}>
                        <AppText variant="caption" color="secondary">
                          Costs
                        </AppText>
                        <View style={styles.inputWrapper}>
                          <AppText variant="body" style={{ marginRight: spacing.xs }}>
                            £
                          </AppText>
                          <AppInput
                            placeholder="0.00"
                            value={editing.costsInput}
                            onChangeText={(text) =>
                              setEditing({ ...editing, costsInput: text })
                            }
                            keyboardType="decimal-pad"
                            style={{ flex: 1 }}
                          />
                        </View>
                      </View>
                    </View>

                    <View style={styles.editActions}>
                      <SecondaryButton onPress={handleCancel} size="sm">
                        Cancel
                      </SecondaryButton>
                      <PrimaryButton
                        onPress={handleSave}
                        loading={saving}
                        size="sm"
                        disabled={!canManageFinance || saving}
                      >
                        Save
                      </PrimaryButton>
                    </View>
                  </View>
                ) : (
                  <View style={styles.financeRow}>
                    <View style={styles.financeItem}>
                      <AppText variant="small" color="secondary">
                        Income
                      </AppText>
                      <AppText variant="body" style={{ color: colors.success }}>
                        {hasFinance ? formatPence(event.incomePence) : "-"}
                      </AppText>
                    </View>

                    <View style={styles.financeItem}>
                      <AppText variant="small" color="secondary">
                        Costs
                      </AppText>
                      <AppText variant="body" style={{ color: colors.error }}>
                        {hasFinance ? formatPence(event.costsPence) : "-"}
                      </AppText>
                    </View>

                    <View style={styles.financeItem}>
                      <AppText variant="small" color="secondary">
                        Net
                      </AppText>
                      <AppText
                        variant="bodyBold"
                        style={{
                          color: hasFinance
                            ? net >= 0
                              ? colors.success
                              : colors.error
                            : colors.textTertiary,
                        }}
                      >
                        {hasFinance ? formatPenceWithSign(net) : "-"}
                      </AppText>
                    </View>
                  </View>
                )}
              </AppCard>
            );
          })
        )}

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  title: {
    marginBottom: spacing.base,
  },
  summaryCard: {
    marginBottom: spacing.base,
  },
  summaryGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
  },
  eventsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.base,
    marginBottom: spacing.sm,
  },
  eventCard: {
    marginBottom: spacing.sm,
  },
  eventHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: spacing.sm,
  },
  financeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  financeItem: {
    flex: 1,
    alignItems: "center",
  },
  editForm: {
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  inputRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  inputGroup: {
    flex: 1,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.xs,
  },
  editActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
