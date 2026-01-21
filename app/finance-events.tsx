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
import { subscribeSocietyDoc, type SocietyDoc } from "@/lib/db/societyRepo";
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
  const iso = event.date || "";
  return !!iso && iso < getTodayISO();
};

export default function FinanceEventsScreen() {
  const { user } = useBootstrap();
  const colors = getColors();

  const [filter, setFilter] = useState<FilterMode>("upcoming");

  const [society, setSociety] = useState<SocietyDoc | null>(null);

  const [members, setMembers] = useState<MemberDoc[]>([]);
  const [events, setEvents] = useState<EventDoc[]>([]);
  const [loading, setLoading] = useState(true);

  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [expensesByEvent, setExpensesByEvent] = useState<Record<string, EventExpenseDoc[]>>({});
  const [expenseTotalsByEvent, setExpenseTotalsByEvent] = useState<Record<string, number>>({});

  // Expense modal state
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [expenseDraft, setExpenseDraft] = useState<Partial<EventExpenseDoc>>({
    category: "other",
    description: "",
    amount: 0,
    incurredDateISO: getTodayISO(),
  });

  const filteredEvents = useMemo(() => {
    const items = [...events];

    const upcoming = items.filter((e) => !isEventCompleted(e));
    const completed = items.filter((e) => isEventCompleted(e));

    const chosen = filter === "upcoming" ? upcoming : completed;

    return chosen.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  }, [events, filter]);

  useEffect(() => {
    if (!user?.activeSocietyId) {
      setMembers([]);
      setEvents([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const unsubMembers = subscribeMembersBySociety(user.activeSocietyId, (items) => {
      setMembers(items);
    });

    const unsubEvents = subscribeEventsBySociety(
      user.activeSocietyId,
      (items) => {
        setEvents(items);
        setLoading(false);
      },
      (error) => {
        console.error("Error loading events:", error);
        setLoading(false);
      }
    );

    return () => {
      unsubMembers();
      unsubEvents();
    };
  }, [user?.activeSocietyId]);

  useEffect(() => {
    if (!user?.activeSocietyId) {
      setSociety(null);
      return;
    }
    const unsubscribe = subscribeSocietyDoc(user.activeSocietyId, (doc) => {
      setSociety(doc);
    });
    return () => unsubscribe();
  }, [user?.activeSocietyId]);

  // Season-level expense totals (so Season P&L can be computed)
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
          const total = items.reduce((sum, x) => sum + (x.amount || 0), 0);
          setExpenseTotalsByEvent((prev) => ({ ...prev, [eventId]: total }));
        },
        (error) => {
          console.error("Error loading expenses for season totals:", error);
        }
      );
      unsubs.push(unsub);
    });

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [events]);

  // Expanded event expense list
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

  const handleToggleEvent = (eventId: string) => {
    setExpandedEventId((prev) => (prev === eventId ? null : eventId));
  };

  const openAddExpense = (eventId: string) => {
    setExpandedEventId(eventId);
    setExpenseDraft({
      category: "other",
      description: "",
      amount: 0,
      incurredDateISO: getTodayISO(),
    });
    setExpenseModalOpen(true);
  };

  const saveExpense = async () => {
    if (!expandedEventId) return;

    const amount = Number(expenseDraft.amount || 0);
    if (!Number.isFinite(amount) || amount < 0) {
      Alert.alert("Invalid amount", "Please enter a valid amount.");
      return;
    }

    try {
      await createEventExpense(expandedEventId, {
        category: expenseDraft.category as EventExpenseCategory,
        description: String(expenseDraft.description || "").trim(),
        amount,
        incurredDateISO: String(expenseDraft.incurredDateISO || getTodayISO()),
      });

      setExpenseModalOpen(false);
    } catch (e: any) {
      console.error("createEventExpense failed:", e);
      Alert.alert("Error", e?.message ?? "Could not add expense");
    }
  };

  const seasonFee = society?.annualFee ?? 0;

  const membershipExpected = seasonFee * members.length;
  const membershipReceived = members.reduce((sum, m) => {
    if (!m.paid) return sum;
    const amt = typeof m.amountPaid === "number" ? m.amountPaid : seasonFee;
    return sum + (amt || 0);
  }, 0);
  const membershipOutstanding = membershipExpected - membershipReceived;

  const eventsNet = events.reduce((sum, event) => {
    const fee = event.eventFee || 0;
    const received = event.payments
      ? Object.values(event.payments).reduce((s: number, p: any) => s + (p.paid ? fee : 0), 0)
      : 0;
    const expensesTotal = expenseTotalsByEvent[event.id] || 0;
    return sum + (received - expensesTotal);
  }, 0);

  const seasonNet = membershipReceived + eventsNet;

  if (loading) {
    return <LoadingState title="Loading finance…" />;
  }

  return (
    <Screen title="Event Finance" subtitle="Event P&L and season roll-up">
      <AppCard style={styles.summaryCard}>
        <AppText variant="h3" style={{ marginBottom: spacing.sm }}>
          Season P&amp;L
        </AppText>

        <View style={styles.summaryRow}>
          <AppText variant="body" color="secondary">
            Season Fee
          </AppText>
          <AppText variant="body">£{seasonFee.toFixed(2)}</AppText>
        </View>

        <View style={styles.summaryRow}>
          <AppText variant="body" color="secondary">
            Membership (received)
          </AppText>
          <AppText variant="body">£{membershipReceived.toFixed(2)}</AppText>
        </View>

        <View style={styles.summaryRow}>
          <AppText variant="body" color="secondary">
            Membership (outstanding)
          </AppText>
          <AppText variant="body">£{membershipOutstanding.toFixed(2)}</AppText>
        </View>

        <View style={styles.summaryRow}>
          <AppText variant="body" color="secondary">
            Events net (fees - expenses)
          </AppText>
          <AppText variant="body">£{eventsNet.toFixed(2)}</AppText>
        </View>

        <View style={[styles.summaryRow, { marginTop: spacing.sm }]}>
          <AppText variant="h3">Season Net</AppText>
          <AppText variant="h3">£{seasonNet.toFixed(2)}</AppText>
        </View>
      </AppCard>

      <SegmentedTabs
        options={[
          { value: "upcoming", label: "Upcoming" },
          { value: "completed", label: "Completed" },
        ]}
        value={filter}
        onSelect={setFilter}
      />

      {filteredEvents.length === 0 ? (
        <EmptyState
          title="No events to display"
          message="Create events to see event P&L."
          icon={<Feather name="calendar" size={24} color={colors.primary} />}
          style={styles.emptyState}
        />
      ) : (
        filteredEvents.map((event) => {
          const fee = event.eventFee || 0;
          const participants = event.playerIds?.length ?? members.length;
          const expected = fee * participants;

          const received = event.payments
            ? Object.values(event.payments).reduce((sum, payment: any) => sum + (payment.paid ? fee : 0), 0)
            : 0;

          const outstanding = expected - received;

          const expenses = expensesByEvent[event.id] || [];
          const totalExpenses = expenses.reduce((sum, expense) => sum + (expense.amount || 0), 0);
          const profitLoss = received - totalExpenses;

          const isExpanded = expandedEventId === event.id;

          return (
            <AppCard key={event.id} style={styles.card}>
              <Pressable onPress={() => handleToggleEvent(event.id)} style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <AppText variant="h3">{event.name}</AppText>
                  <AppText variant="caption" color="secondary">
                    {formatDateDDMMYYYY(event.date)} • £{(event.eventFee || 0).toFixed(2)} fee
                  </AppText>
                </View>

                <Feather name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color={colors.textSecondary} />
              </Pressable>

              <View style={styles.metricsRow}>
                <View style={styles.metric}>
                  <AppText variant="caption" color="secondary">Expected</AppText>
                  <AppText variant="body">£{expected.toFixed(2)}</AppText>
                </View>
                <View style={styles.metric}>
                  <AppText variant="caption" color="secondary">Received</AppText>
                  <AppText variant="body">£{received.toFixed(2)}</AppText>
                </View>
                <View style={styles.metric}>
                  <AppText variant="caption" color="secondary">Outstanding</AppText>
                  <AppText variant="body">£{outstanding.toFixed(2)}</AppText>
                </View>
              </View>

              <View style={styles.metricsRow}>
                <View style={styles.metric}>
                  <AppText variant="caption" color="secondary">Expenses</AppText>
                  <AppText variant="body">£{totalExpenses.toFixed(2)}</AppText>
                </View>
                <View style={styles.metric}>
                  <AppText variant="caption" color="secondary">P&amp;L</AppText>
                  <Badge
                    label={`£${profitLoss.toFixed(2)}`}
                    tone={profitLoss >= 0 ? "success" : "danger"}
                  />
                </View>
              </View>

              {isExpanded && (
                <View style={{ marginTop: spacing.md }}>
                  <PrimaryButton
                    onPress={() => openAddExpense(event.id)}
                    iconLeft={<Feather name="plus" size={16} color="#fff" />}
                  >
                    Add Expense
                  </PrimaryButton>

                  <View style={{ height: spacing.sm }} />

                  {expenses.length === 0 ? (
                    <AppText variant="body" color="secondary">
                      No expenses yet.
                    </AppText>
                  ) : (
                    expenses.map((ex) => (
                      <View key={ex.id} style={styles.expenseRow}>
                        <View style={{ flex: 1 }}>
                          <AppText variant="body">{ex.description || "Expense"}</AppText>
                          <AppText variant="caption" color="secondary">
                            {ex.category} • {ex.incurredDateISO}
                          </AppText>
                        </View>
                        <AppText variant="body">£{(ex.amount || 0).toFixed(2)}</AppText>
                        <Pressable
                          onPress={async () => {
                            try {
                              await deleteEventExpenseDoc(event.id, ex.id);
                            } catch (e: any) {
                              Alert.alert("Error", e?.message ?? "Could not delete expense");
                            }
                          }}
                          style={{ marginLeft: spacing.sm }}
                        >
                          <Feather name="trash-2" size={18} color={colors.danger} />
                        </Pressable>
                      </View>
                    ))
                  )}
                </View>
              )}
            </AppCard>
          );
        })
      )}

      <Modal visible={expenseModalOpen} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <AppText variant="h3" style={{ marginBottom: spacing.md }}>
              Add Expense
            </AppText>

            <AppInput
              label="Description"
              value={String(expenseDraft.description || "")}
              onChangeText={(v) => setExpenseDraft((p) => ({ ...p, description: v }))}
              placeholder="e.g. Prizes"
            />

            <AppInput
              label="Amount (£)"
              value={String(expenseDraft.amount ?? "")}
              onChangeText={(v) => setExpenseDraft((p) => ({ ...p, amount: Number(v) }))}
              keyboardType="numeric"
              placeholder="0"
            />

            <AppInput
              label="Date (YYYY-MM-DD)"
              value={String(expenseDraft.incurredDateISO || getTodayISO())}
              onChangeText={(v) => setExpenseDraft((p) => ({ ...p, incurredDateISO: v }))}
              placeholder={getTodayISO()}
            />

            <View style={{ height: spacing.md }} />

            <PrimaryButton onPress={saveExpense}>Save</PrimaryButton>
            <View style={{ height: spacing.sm }} />
            <SecondaryButton
              onPress={() => {
                setExpenseModalOpen(false);
              }}
            >
              Cancel
            </SecondaryButton>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  summaryCard: {
    marginBottom: spacing.lg,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  emptyState: {
    marginTop: spacing.xl,
  },
  card: {
    marginTop: spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  metricsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  metric: {
    flex: 1,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  expenseRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  modalCard: {
    width: "100%",
    backgroundColor: "white",
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
});
