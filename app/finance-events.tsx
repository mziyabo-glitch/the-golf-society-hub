import { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { AppText } from "@/components/ui/AppText";
import { Badge } from "@/components/ui/Badge";
import { DestructiveButton, PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { Screen } from "@/components/ui/Screen";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { subscribeEventsBySociety, type EventDoc } from "@/lib/db/eventRepo";
import {
  createEventExpense,
  deleteEventExpenseDoc,
  subscribeExpensesByEvent,
  updateEventExpenseDoc,
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
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [filter, setFilter] = useState<FilterMode>("upcoming");
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [expensesByEvent, setExpensesByEvent] = useState<Record<string, EventExpenseDoc[]>>({});
  const [isExpenseModalVisible, setIsExpenseModalVisible] = useState(false);
  const [activeEvent, setActiveEvent] = useState<EventDoc | null>(null);
  const [activeExpense, setActiveExpense] = useState<EventExpenseDoc | null>(null);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<EventExpenseCategory>("other");
  const [incurredDateISO, setIncurredDateISO] = useState(getTodayISO());

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

  // ✅ CHANGED: list ALL events, not only events with fees
  const filteredEvents = useMemo(() => {
    const now = Date.now();
    const filtered = events.filter((event) => {
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
  }, [events, filter]);

  const handleToggleEvent = (eventId: string) => {
    setExpandedEventId((prev) => (prev === eventId ? null : eventId));
  };

  const openExpenseModal = (event: EventDoc, expense?: EventExpenseDoc) => {
    setActiveEvent(event);
    setActiveExpense(expense ?? null);
    if (expense) {
      setDescription(expense.description);
      setAmount(expense.amount.toString());
      setCategory(expense.category);
      setIncurredDateISO(expense.incurredDateISO);
    } else {
      setDescription("");
      setAmount("");
      setCategory("other");
      setIncurredDateISO(getTodayISO());
    }
    setIsExpenseModalVisible(true);
  };

  const closeExpenseModal = () => {
    setIsExpenseModalVisible(false);
    setActiveEvent(null);
    setActiveExpense(null);
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
      if (activeExpense) {
        await updateEventExpenseDoc(activeEvent.id, activeExpense.id, {
          description: description.trim(),
          amount: amountValue,
          category,
          incurredDateISO: incurredDateISO.trim() || getTodayISO(),
        });
      } else {
        await createEventExpense({
          eventId: activeEvent.id,
          societyId: user.activeSocietyId,
          description: description.trim(),
          amount: amountValue,
          category,
          incurredDateISO: incurredDateISO.trim() || getTodayISO(),
          createdBy: user.id,
        });
      }
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

  const loading = loadingEvents || loadingMembers;
  if (loading) {
    return (
      <Screen scrollable={false}>
        <LoadingState message="Loading finance events..." />
      </Screen>
    );
  }

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
          message="Create events to see event P&amp;L."
          icon={<Feather name="calendar" size={24} color={colors.primary} />}
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
          const totalExpenses = expenses.reduce((sum, expense) => sum + (expense.amount || 0), 0);
          const profitLoss = received - totalExpenses;

          const isExpanded = expandedEventId === event.id;

          return (
            <AppCard key={event.id} style={styles.card}>
              <Pressable onPress={() => handleToggleEvent(event.id)} style={styles.cardHeader}>
                <View style={styles.cardHeaderText}>
                  <AppText variant="h3">{event.name}</AppText>
                  <AppText variant="body" color="secondary">
                    {event.date ? formatDateDDMMYYYY(event.date) : "No date"}
                  </AppText>
                </View>
                <Feather name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color={colors.textSecondary} />
              </Pressable>

              <View style={styles.metricsRow}>
                <View style={styles.metric}>
                  <AppText variant="caption" color="secondary">
                    Fee
                  </AppText>
                  <AppText variant="bodyStrong">£{fee.toFixed(2)}</AppText>
                </View>

                <View style={styles.metric}>
                  <AppText variant="caption" color="secondary">
                    Expected
                  </AppText>
                  <AppText variant="bodyStrong">£{expected.toFixed(2)}</AppText>
                </View>

                <View style={styles.metric}>
                  <AppText variant="caption" color="secondary">
                    Received
                  </AppText>
                  <AppText variant="bodyStrong">£{received.toFixed(2)}</AppText>
                </View>

                <View style={styles.metric}>
                  <AppText variant="caption" color="secondary">
                    Outstanding
                  </AppText>
                  <AppText variant="bodyStrong">£{outstanding.toFixed(2)}</AppText>
                </View>
              </View>

              <View style={styles.summaryRow}>
                <Badge
                  label={`Expenses: £${totalExpenses.toFixed(2)}`}
                  variant="neutral"
                  style={styles.badge}
                />
                <Badge
                  label={`P&L: £${profitLoss.toFixed(2)}`}
                  variant={profitLoss >= 0 ? "success" : "danger"}
                  style={styles.badge}
                />
              </View>

              {isExpanded && (
                <View style={styles.expanded}>
                  <View style={styles.expensesHeader}>
                    <AppText variant="h4">Expenses</AppText>
                    <PrimaryButton label="Add expense" onPress={() => openExpenseModal(event)} />
                  </View>

                  {expenses.length === 0 ? (
                    <EmptyState
                      title="No expenses yet"
                      message="Add expenses to track P&L for this event."
                      icon={<Feather name="dollar-sign" size={24} color={colors.primary} />}
                      style={styles.emptyStateInline}
                    />
                  ) : (
                    expenses.map((expense) => (
                      <View key={expense.id} style={styles.expenseRow}>
                        <View style={styles.expenseInfo}>
                          <AppText variant="bodyStrong">{expense.description}</AppText>
                          <AppText variant="caption" color="secondary">
                            {CATEGORY_OPTIONS.find((c) => c.value === expense.category)?.label ?? "Other"} •{" "}
                            {expense.incurredDateISO}
                          </AppText>
                        </View>

                        <View style={styles.expenseActions}>
                          <AppText variant="bodyStrong">£{expense.amount.toFixed(2)}</AppText>
                          <View style={styles.iconActions}>
                            <Pressable onPress={() => openExpenseModal(event, expense)} style={styles.iconButton}>
                              <Feather name="edit-2" size={16} color={colors.textSecondary} />
                            </Pressable>
                            <Pressable onPress={() => handleDeleteExpense(event.id, expense.id)} style={styles.iconButton}>
                              <Feather name="trash-2" size={16} color={colors.danger} />
                            </Pressable>
                          </View>
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

      <Modal visible={isExpenseModalVisible} transparent animationType="fade" onRequestClose={closeExpenseModal}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: colors.card }]}>
            <AppText variant="h3" style={styles.modalTitle}>
              {activeExpense ? "Edit expense" : "Add expense"}
            </AppText>

            <AppInput label="Description" value={description} onChangeText={setDescription} placeholder="e.g. Prizes" />

            <AppInput
              label="Amount"
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              keyboardType="decimal-pad"
            />

            <AppInput
              label="Category (type one)"
              value={category}
              onChangeText={(v) => setCategory(v as any)}
              placeholder="other"
              helperText="prizes | trophies | admin | food | other"
            />

            <AppInput
              label="Incurred date (YYYY-MM-DD)"
              value={incurredDateISO}
              onChangeText={setIncurredDateISO}
              placeholder={getTodayISO()}
            />

            <View style={styles.modalActions}>
              <SecondaryButton label="Cancel" onPress={closeExpenseModal} />
              {activeExpense ? (
                <PrimaryButton label="Save" onPress={handleSaveExpense} />
              ) : (
                <PrimaryButton label="Add" onPress={handleSaveExpense} />
              )}
            </View>

            {activeExpense && (
              <View style={styles.modalDanger}>
                <DestructiveButton
                  label="Delete expense"
                  onPress={() => {
                    if (!activeEvent || !activeExpense) return;
                    closeExpenseModal();
                    handleDeleteExpense(activeEvent.id, activeExpense.id);
                  }}
                />
              </View>
            )}
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    marginBottom: spacing.sm,
  },
  subtitle: {
    marginBottom: spacing.lg,
  },
  emptyState: {
    marginTop: spacing.xl,
  },
  emptyStateInline: {
    marginTop: spacing.md,
  },
  card: {
    marginTop: spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
  },
  cardHeaderText: {
    flex: 1,
    gap: 2,
  },
  metricsRow: {
    marginTop: spacing.md,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  metric: {
    minWidth: 130,
    flexGrow: 1,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: "#F3F4F6",
  },
  summaryRow: {
    marginTop: spacing.md,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  badge: {
    alignSelf: "flex-start",
  },
  expanded: {
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  expensesHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
  },
  expenseRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: "#F9FAFB",
  },
  expenseInfo: {
    flex: 1,
    gap: 2,
  },
  expenseActions: {
    alignItems: "flex-end",
    gap: 6,
  },
  iconActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  iconButton: {
    padding: 6,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modal: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalTitle: {
    marginBottom: spacing.sm,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  modalDanger: {
    marginTop: spacing.md,
  },
});
