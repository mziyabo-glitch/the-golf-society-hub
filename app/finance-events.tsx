import { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, TextInput, View } from "react-native";

import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { Badge } from "@/components/ui/Badge";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Screen } from "@/components/ui/Screen";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { subscribeEventsBySociety, type EventDoc } from "@/lib/db/eventRepo";
import {
  createEventExpense,
  deleteEventExpenseDoc,
  subscribeExpensesByEvent,
  type EventExpenseCategory,
  type EventExpenseDoc,
} from "@/lib/db/eventExpenseRepo";
import { subscribeMembersBySociety, type MemberDoc } from "@/lib/db/memberRepo";
import { getColors, radius, spacing } from "@/lib/ui/theme";
import { useBootstrap } from "@/lib/useBootstrap";
import { formatDateDDMMYYYY } from "@/utils/date";

type FilterMode = "upcoming" | "completed";

const CATEGORY_OPTIONS: { value: EventExpenseCategory; label: string }[] = [
  { value: "prizes", label: "Prizes" },
  { value: "trophies", label: "Trophies" },
  { value: "admin", label: "Admin" },
  { value: "food", label: "Food" },
  { value: "other", label: "Other" },
];

const getTodayISO = () => new Date().toISOString().split("T")[0];

const isEventCompleted = (event: EventDoc): boolean => {
  if (event.isCompleted) return true;
  if (event.completedAt) return true;
  if (event.results && Object.keys(event.results).length > 0) return true;
  return false;
};

export default function FinanceEventsScreen() {
  const { user } = useBootstrap();
  const colors = getColors();
  const [events, setEvents] = useState<EventDoc[]>([]);
  const [members, setMembers] = useState<MemberDoc[]>([]);
  const [filter, setFilter] = useState<FilterMode>("upcoming");
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [expensesByEvent, setExpensesByEvent] = useState<Record<string, EventExpenseDoc[]>>({});
  const [isExpenseModalVisible, setIsExpenseModalVisible] = useState(false);
  const [activeEvent, setActiveEvent] = useState<EventDoc | null>(null);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<EventExpenseCategory>("other");
  const [incurredDateISO, setIncurredDateISO] = useState(getTodayISO());

  useEffect(() => {
    if (!user?.activeSocietyId) {
      setEvents([]);
      return;
    }
    const unsubscribe = subscribeEventsBySociety(user.activeSocietyId, (items) => {
      setEvents(items);
    });
    return () => unsubscribe();
  }, [user?.activeSocietyId]);

  useEffect(() => {
    if (!user?.activeSocietyId) {
      setMembers([]);
      return;
    }
    const unsubscribe = subscribeMembersBySociety(user.activeSocietyId, (items) => {
      setMembers(items);
    });
    return () => unsubscribe();
  }, [user?.activeSocietyId]);

  useEffect(() => {
    if (!expandedEventId) return;
    const unsubscribe = subscribeExpensesByEvent(
      expandedEventId,
      (items) => {
        setExpensesByEvent((prev) => ({ ...prev, [expandedEventId]: items }));
      },
      (error) => {
        console.error("Error loading expenses:", error);
      }
    );
    return () => unsubscribe();
  }, [expandedEventId]);

  const eventsWithFees = useMemo(
    () => events.filter((event) => (event.eventFee ?? 0) > 0),
    [events]
  );

  const filteredEvents = useMemo(() => {
    const now = Date.now();
    const filtered = eventsWithFees.filter((event) => {
      if (filter === "completed") {
        return isEventCompleted(event);
      }
      const eventDate = event.date ? new Date(event.date).getTime() : now;
      return !isEventCompleted(event) && eventDate >= now;
    });

    return filtered.sort((a, b) => {
      const aDate = a.completedAt || a.date || "";
      const bDate = b.completedAt || b.date || "";
      const aTime = aDate ? new Date(aDate).getTime() : 0;
      const bTime = bDate ? new Date(bDate).getTime() : 0;
      return filter === "completed" ? bTime - aTime : aTime - bTime;
    });
  }, [eventsWithFees, filter]);

  const handleToggleEvent = (eventId: string) => {
    setExpandedEventId((prev) => (prev === eventId ? null : eventId));
  };

  const openExpenseModal = (event: EventDoc) => {
    setActiveEvent(event);
    setDescription("");
    setAmount("");
    setCategory("other");
    setIncurredDateISO(getTodayISO());
    setIsExpenseModalVisible(true);
  };

  const closeExpenseModal = () => {
    setIsExpenseModalVisible(false);
    setActiveEvent(null);
  };

  const handleSaveExpense = async () => {
    if (!activeEvent || !user?.activeSocietyId || !user?.id) {
      Alert.alert("Error", "Missing event or user context.");
      return;
    }
    if (!description.trim()) {
      Alert.alert("Missing description", "Please add a description.");
      return;
    }
    const amountValue = parseFloat(amount);
    if (isNaN(amountValue) || amountValue <= 0) {
      Alert.alert("Invalid amount", "Please enter a valid amount greater than 0.");
      return;
    }

    try {
      await createEventExpense({
        eventId: activeEvent.id,
        societyId: user.activeSocietyId,
        description: description.trim(),
        amount: amountValue,
        category,
        incurredDateISO: incurredDateISO.trim() || getTodayISO(),
        createdBy: user.id,
      });
      closeExpenseModal();
    } catch (error) {
      console.error("Error saving expense:", error);
      Alert.alert("Error", "Failed to save expense.");
    }
  };

  const handleDeleteExpense = (eventId: string, expenseId: string) => {
    Alert.alert("Delete expense", "Are you sure you want to delete this expense?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteEventExpenseDoc(eventId, expenseId);
          } catch (error) {
            console.error("Error deleting expense:", error);
            Alert.alert("Error", "Failed to delete expense.");
          }
        },
      },
    ]);
  };

  return (
    <Screen>
      <AppText variant="h1" style={styles.title}>
        Event Manager
      </AppText>
      <AppText variant="body" color="secondary" style={styles.subtitle}>
        Track event P&amp;L and manage expenses
      </AppText>

      <SegmentedTabs
        items={[
          { id: "upcoming", label: "Upcoming" },
          { id: "completed", label: "Completed" },
        ]}
        selectedId={filter}
        onSelect={setFilter}
      />

      {filteredEvents.length === 0 ? (
        <EmptyState
          title="No events to display"
          message="Create events with fees to see event P&amp;L."
          style={styles.emptyState}
        />
      ) : (
        filteredEvents.map((event) => {
          const fee = event.eventFee || 0;
          const participants = event.playerIds?.length ?? members.length;
          const expected = fee * participants;
          const received = event.payments
            ? Object.values(event.payments).reduce((sum, payment) => sum + (payment.paid ? fee : 0), 0)
            : 0;
          const outstanding = expected - received;
          const expenses = expensesByEvent[event.id] || [];
          const expensesTotal = expenses.reduce((sum, expense) => sum + (expense.amount || 0), 0);
          const net = received - expensesTotal;
          const expanded = expandedEventId === event.id;

          return (
            <AppCard key={event.id} style={styles.eventCard}>
              <View style={styles.eventHeader}>
                <View style={styles.eventHeaderText}>
                  <AppText variant="h2">{event.name}</AppText>
                  <AppText variant="small" color="secondary">
                    {formatDateDDMMYYYY(event.date)}
                  </AppText>
                </View>
                <Badge label={`£${fee.toFixed(2)}`} variant="status" />
              </View>

              <View style={styles.metricsRow}>
                <View style={styles.metricItem}>
                  <AppText variant="caption" color="secondary">
                    Participants
                  </AppText>
                  <AppText variant="bodyBold">{participants}</AppText>
                </View>
                <View style={styles.metricItem}>
                  <AppText variant="caption" color="secondary">
                    Expected
                  </AppText>
                  <AppText variant="bodyBold">£{expected.toFixed(2)}</AppText>
                </View>
                <View style={styles.metricItem}>
                  <AppText variant="caption" color="secondary">
                    Received
                  </AppText>
                  <AppText variant="bodyBold" style={{ color: colors.success }}>
                    £{received.toFixed(2)}
                  </AppText>
                </View>
              </View>

              <View style={styles.metricsRow}>
                <View style={styles.metricItem}>
                  <AppText variant="caption" color="secondary">
                    Outstanding
                  </AppText>
                  <AppText variant="bodyBold" style={{ color: outstanding > 0 ? colors.error : colors.success }}>
                    £{outstanding.toFixed(2)}
                  </AppText>
                </View>
                <View style={styles.metricItem}>
                  <AppText variant="caption" color="secondary">
                    Expenses
                  </AppText>
                  <AppText variant="bodyBold">£{expensesTotal.toFixed(2)}</AppText>
                </View>
                <View style={styles.metricItem}>
                  <AppText variant="caption" color="secondary">
                    Net
                  </AppText>
                  <AppText variant="bodyBold" style={{ color: net >= 0 ? colors.success : colors.error }}>
                    £{net.toFixed(2)}
                  </AppText>
                </View>
              </View>

              <View style={styles.eventActions}>
                <SecondaryButton onPress={() => handleToggleEvent(event.id)} size="sm">
                  {expanded ? "Hide expenses" : "View expenses"}
                </SecondaryButton>
                <PrimaryButton onPress={() => openExpenseModal(event)} size="sm">
                  Add Expense
                </PrimaryButton>
              </View>

              {expanded && (
                <View style={styles.expensesSection}>
                  {expenses.length === 0 ? (
                    <AppText variant="small" color="secondary">
                      No expenses yet.
                    </AppText>
                  ) : (
                    expenses.map((expense) => (
                      <View key={expense.id} style={[styles.expenseRow, { borderColor: colors.border }]}>
                        <View style={styles.expenseInfo}>
                          <AppText variant="bodyBold">{expense.description}</AppText>
                          <View style={styles.expenseMeta}>
                            <Badge
                              label={
                                CATEGORY_OPTIONS.find((option) => option.value === expense.category)?.label ||
                                expense.category
                              }
                            />
                            <AppText variant="small" color="secondary">
                              {formatDateDDMMYYYY(expense.incurredDateISO)}
                            </AppText>
                          </View>
                        </View>
                        <View style={styles.expenseActions}>
                          <AppText variant="bodyBold">£{expense.amount.toFixed(2)}</AppText>
                          <SecondaryButton
                            onPress={() => handleDeleteExpense(event.id, expense.id)}
                            size="sm"
                            style={styles.deleteButton}
                          >
                            Delete
                          </SecondaryButton>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              )}
            </AppCard>
          );
        })
      )}

      <Modal visible={isExpenseModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <AppText variant="h2" style={styles.modalTitle}>
              Add Expense
            </AppText>

            <AppText variant="caption" color="secondary" style={styles.modalLabel}>
              Description
            </AppText>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="e.g. Trophy engraving"
              style={[styles.input, { borderColor: colors.border, color: colors.text }]}
            />

            <AppText variant="caption" color="secondary" style={styles.modalLabel}>
              Amount
            </AppText>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              keyboardType="decimal-pad"
              style={[styles.input, { borderColor: colors.border, color: colors.text }]}
            />

            <AppText variant="caption" color="secondary" style={styles.modalLabel}>
              Category
            </AppText>
            <View style={styles.categoryGrid}>
              {CATEGORY_OPTIONS.map((option) => {
                const selected = option.value === category;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setCategory(option.value)}
                    style={[
                      styles.categoryOption,
                      {
                        borderColor: selected ? colors.primary : colors.border,
                        backgroundColor: selected ? colors.primary + "15" : colors.surface,
                      },
                    ]}
                  >
                    <AppText variant="small" style={{ color: selected ? colors.primary : colors.textSecondary }}>
                      {option.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>

            <AppText variant="caption" color="secondary" style={styles.modalLabel}>
              Date
            </AppText>
            <TextInput
              value={incurredDateISO}
              onChangeText={setIncurredDateISO}
              placeholder="YYYY-MM-DD"
              style={[styles.input, { borderColor: colors.border, color: colors.text }]}
            />

            <View style={styles.modalActions}>
              <SecondaryButton onPress={closeExpenseModal} size="sm" style={styles.modalButton}>
                Cancel
              </SecondaryButton>
              <PrimaryButton onPress={handleSaveExpense} size="sm" style={styles.modalButton}>
                Save
              </PrimaryButton>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    marginBottom: spacing.xs,
  },
  subtitle: {
    marginBottom: spacing.lg,
  },
  emptyState: {
    marginTop: spacing.lg,
  },
  eventCard: {
    marginBottom: spacing.base,
  },
  eventHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  eventHeaderText: {
    flex: 1,
    marginRight: spacing.sm,
  },
  metricsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  metricItem: {
    flex: 1,
    alignItems: "flex-start",
  },
  eventActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  expensesSection: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  expenseRow: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  expenseInfo: {
    gap: spacing.xs,
  },
  expenseMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.xs,
  },
  expenseActions: {
    marginTop: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  deleteButton: {
    paddingHorizontal: spacing.sm,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: spacing.lg,
  },
  modalCard: {
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  modalTitle: {
    marginBottom: spacing.md,
  },
  modalLabel: {
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  categoryOption: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  modalButton: {
    minWidth: 96,
  },
});
