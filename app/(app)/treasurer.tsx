/**
 * Treasurer Ledger Screen
 *
 * Premium UI for society financial management.
 * Features:
 * - 2x2 StatCard grid for key metrics
 * - Bank-statement style ledger list
 * - Polished Add/Edit entry modal with quick date chips
 * - Toast feedback on actions
 */

import { useCallback, useState, useMemo } from "react";
import {
  StyleSheet,
  View,
  Alert,
  Pressable,
  ScrollView,
  Modal,
  Platform, // Still needed for KeyboardAvoidingView behavior
  KeyboardAvoidingView,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { StatCard } from "@/components/ui/StatCard";
import { Toast } from "@/components/ui/Toast";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { useBootstrap } from "@/lib/useBootstrap";
import { getPermissionsForMember } from "@/lib/rbac";
import { getColors, spacing, radius } from "@/lib/ui/theme";

import { guard } from "@/lib/guards";
import {
  parseCurrencyToPence,
  formatPenceToGBP,
  formatPenceToPoundsInput,
} from "@/lib/utils/currency";
import { exportLedgerPdf } from "@/lib/pdf/ledgerPdf";
import {
  getFinanceSummary,
  createFinanceEntry,
  updateFinanceEntry,
  deleteFinanceEntry,
  updateOpeningBalance,
  getOpeningBalance,
  calculateRunningBalances,
  type FinanceEntryDoc,
  type FinanceEntryType,
  type FinanceSummary,
} from "@/lib/db_supabase/financeRepo";

type EntryWithBalance = FinanceEntryDoc & { runningBalancePence: number };

type EntryFormData = {
  entryType: FinanceEntryType;
  entryDate: string;
  amountInput: string;
  description: string;
};

type FormErrors = {
  amount?: string;
  description?: string;
  date?: string;
};

const getToday = () => new Date().toISOString().split("T")[0];
const getYesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
};

const initialFormData: EntryFormData = {
  entryType: "income",
  entryDate: getToday(),
  amountInput: "",
  description: "",
};

export default function TreasurerScreen() {
  const router = useRouter();
  const { societyId, society, member, loading: bootstrapLoading } = useBootstrap();
  const colors = getColors();

  // Data state
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [entriesWithBalance, setEntriesWithBalance] = useState<EntryWithBalance[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [showOpeningBalanceModal, setShowOpeningBalanceModal] = useState(false);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<FinanceEntryDoc | null>(null);

  // Form state
  const [openingBalanceInput, setOpeningBalanceInput] = useState("");
  const [entryForm, setEntryForm] = useState<EntryFormData>(initialFormData);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);

  // Toast state
  const [toast, setToast] = useState({ visible: false, message: "", type: "success" as const });

  const permissions = getPermissionsForMember(member as any);
  const canManageFinance = permissions.canAccessFinance;

  // Entries sorted newest first for display
  const sortedEntries = useMemo(() => {
    return [...entriesWithBalance].reverse();
  }, [entriesWithBalance]);

  // ========== DATA LOADING ==========

  const loadData = useCallback(async () => {
    if (!societyId) return;

    setLoading(true);
    try {
      const openingBalance = await getOpeningBalance(societyId);
      const data = await getFinanceSummary(societyId, openingBalance);
      setSummary(data);

      const withBalances = calculateRunningBalances(data.entries, openingBalance);
      setEntriesWithBalance(withBalances);
    } catch (err: any) {
      console.error("[Treasurer] loadData error:", err);
      Alert.alert("Error", err?.message || "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }, [societyId]);

  useFocusEffect(
    useCallback(() => {
      if (societyId) {
        loadData();
      }
    }, [societyId, loadData])
  );

  // ========== VALIDATION ==========

  const validateForm = (): boolean => {
    const errors: FormErrors = {};

    // Amount validation
    const pence = parseCurrencyToPence(entryForm.amountInput);
    if (!entryForm.amountInput.trim()) {
      errors.amount = "Amount is required";
    } else if (pence === null || pence <= 0) {
      errors.amount = "Enter a valid amount greater than 0";
    }

    // Description validation
    if (!entryForm.description.trim()) {
      errors.description = "Description is required";
    } else if (entryForm.description.trim().length < 2) {
      errors.description = "Description too short";
    }

    // Date validation
    if (!entryForm.entryDate) {
      errors.date = "Date is required";
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(entryForm.entryDate)) {
      errors.date = "Use format YYYY-MM-DD";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ========== OPENING BALANCE ==========

  const handleOpenOpeningBalanceModal = () => {
    setOpeningBalanceInput(formatPenceToPoundsInput(summary?.openingBalancePence ?? 0));
    setShowOpeningBalanceModal(true);
  };

  const handleSaveOpeningBalance = async () => {
    if (!guard(permissions.canAccessFinance, "Only the Captain or Treasurer can update the opening balance.")) return;

    const pence = parseCurrencyToPence(openingBalanceInput);
    if (pence === null) {
      Alert.alert("Invalid Amount", "Please enter a valid amount.");
      return;
    }

    setSaving(true);
    try {
      await updateOpeningBalance(societyId!, pence);
      setShowOpeningBalanceModal(false);
      setToast({ visible: true, message: "Opening balance updated", type: "success" });
      await loadData();
    } catch (err: any) {
      console.error("[Treasurer] handleSaveOpeningBalance error:", err);
      Alert.alert("Error", err?.message || "Failed to save opening balance.");
    } finally {
      setSaving(false);
    }
  };

  // ========== ADD/EDIT ENTRY ==========

  const handleOpenAddEntry = () => {
    setEditingEntry(null);
    setEntryForm({ ...initialFormData, entryDate: getToday() });
    setFormErrors({});
    setShowEntryModal(true);
  };

  const handleOpenEditEntry = (entry: FinanceEntryDoc) => {
    setEditingEntry(entry);
    setEntryForm({
      entryType: entry.entry_type,
      entryDate: entry.entry_date,
      amountInput: formatPenceToPoundsInput(entry.amount_pence),
      description: entry.description,
    });
    setFormErrors({});
    setShowEntryModal(true);
  };

  const handleSaveEntry = async () => {
    if (!guard(permissions.canAccessFinance, "Only the Captain or Treasurer can add or edit finance entries.")) return;

    if (!validateForm()) return;

    const amountPence = parseCurrencyToPence(entryForm.amountInput)!;

    setSaving(true);
    try {
      if (editingEntry) {
        await updateFinanceEntry(editingEntry.id, {
          entry_type: entryForm.entryType,
          entry_date: entryForm.entryDate,
          amount_pence: amountPence,
          description: entryForm.description.trim(),
        });
        setToast({ visible: true, message: "Entry updated", type: "success" });
      } else {
        const newEntry = {
          society_id: societyId!,
          entry_type: entryForm.entryType,
          entry_date: entryForm.entryDate,
          amount_pence: amountPence,
          description: entryForm.description.trim(),
        };
        await createFinanceEntry(newEntry);
        setToast({ visible: true, message: "Entry added", type: "success" });
      }
      setShowEntryModal(false);
      await loadData();
    } catch (err: any) {
      console.error("[Treasurer] handleSaveEntry error:", err);
      Alert.alert("Error", err?.message || "Failed to save entry.");
    } finally {
      setSaving(false);
    }
  };

  // ========== DELETE ENTRY ==========

  const handleDeleteEntry = (entry: FinanceEntryDoc) => {
    Alert.alert(
      "Delete Entry",
      `Delete this ${entry.entry_type} of ${formatPenceToGBP(entry.amount_pence)}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteFinanceEntry(entry.id);
              setToast({ visible: true, message: "Entry deleted", type: "success" });
              await loadData();
            } catch (err: any) {
              console.error("[Treasurer] handleDeleteEntry error:", err);
              Alert.alert("Error", err?.message || "Failed to delete entry.");
            }
          },
        },
      ]
    );
  };

  // ========== PDF EXPORT ==========

  const handleExportPdf = async () => {
    if (!summary || !society) return;

    try {
      // Use centralized ledger PDF export - never calls Print.printAsync
      await exportLedgerPdf({
        societyName: society.name || "Golf Society",
        logoUrl: (society as any)?.logo_url || (society as any)?.logoUrl || null,
        openingBalancePence: summary.openingBalancePence,
        entries: entriesWithBalance,
        totalIncomePence: summary.totalIncomePence,
        totalCostsPence: summary.totalCostsPence,
        currentBalancePence: summary.currentBalancePence,
      });
    } catch (err: any) {
      console.error("[Treasurer] handleExportPdf error:", err);
      Alert.alert("Error", err?.message || "Failed to export PDF.");
    }
  };

  // ========== RENDER ==========

  if (bootstrapLoading || loading) {
    return (
      <Screen scrollable={false}>
        <View style={styles.centered}>
          <LoadingState message="Loading ledger..." />
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
          message="Only Captain or Treasurer can access the financial ledger."
        />
      </Screen>
    );
  }

  const currentBalance = summary?.currentBalancePence ?? 0;
  const balanceVariant =
    currentBalance > 0 ? "success" : currentBalance < 0 ? "error" : "muted";

  return (
    <Screen>
      {/* Toast */}
      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast((t) => ({ ...t, visible: false }))}
      />

      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.7 : 1 }]}
          onPress={() => router.back()}
        >
          <Feather name="arrow-left" size={20} color={colors.text} />
        </Pressable>
        <AppText variant="h1" style={styles.title}>Treasurer</AppText>
        <Pressable
          style={({ pressed }) => [styles.exportButton, { opacity: pressed ? 0.7 : 1 }]}
          onPress={handleExportPdf}
        >
          <Feather name="download" size={18} color={colors.primary} />
          <AppText variant="small" style={{ color: colors.primary, marginLeft: 4 }}>PDF</AppText>
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* 2x2 Stat Cards Grid */}
        <View style={styles.statsGrid}>
          <StatCard
            label="Opening Balance"
            value={formatPenceToGBP(summary?.openingBalancePence ?? 0)}
            hint="Tap to edit"
            variant="muted"
            onPress={handleOpenOpeningBalanceModal}
          />
          <StatCard
            label="Total Income"
            value={formatPenceToGBP(summary?.totalIncomePence ?? 0)}
            variant="success"
            icon={<Feather name="trending-up" size={12} color={colors.success} />}
          />
          <StatCard
            label="Total Costs"
            value={formatPenceToGBP(summary?.totalCostsPence ?? 0)}
            variant="error"
            icon={<Feather name="trending-down" size={12} color={colors.error} />}
          />
          <StatCard
            label="Current Balance"
            value={formatPenceToGBP(currentBalance)}
            variant={balanceVariant}
            emphasis
          />
        </View>

        {/* Add Entry Button */}
        <View style={styles.sectionHeader}>
          <AppText variant="h2">Transactions</AppText>
          <PrimaryButton onPress={handleOpenAddEntry} size="sm">
            <Feather name="plus" size={16} color="#fff" /> Add
          </PrimaryButton>
        </View>

        {/* Ledger List - Bank Statement Style */}
        {sortedEntries.length === 0 ? (
          <AppCard style={styles.emptyCard}>
            <View style={styles.emptyContent}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.backgroundTertiary }]}>
                <Feather name="inbox" size={32} color={colors.textTertiary} />
              </View>
              <AppText variant="body" color="secondary" style={styles.emptyText}>
                No transactions yet
              </AppText>
              <AppText variant="small" color="tertiary" style={styles.emptyHint}>
                Add your first income or expense to get started
              </AppText>
              <PrimaryButton onPress={handleOpenAddEntry} size="sm" style={{ marginTop: spacing.base }}>
                <Feather name="plus" size={16} color="#fff" /> Add First Entry
              </PrimaryButton>
            </View>
          </AppCard>
        ) : (
          <View style={styles.ledgerList}>
            {sortedEntries.map((entry, index) => (
              <Pressable
                key={entry.id}
                style={({ pressed }) => [
                  styles.ledgerRow,
                  {
                    backgroundColor: pressed ? colors.backgroundTertiary : colors.surface,
                    borderBottomColor: colors.border,
                    borderBottomWidth: index < sortedEntries.length - 1 ? 1 : 0,
                  },
                ]}
                onPress={() => { if (!permissions.canAccessFinance) return; handleOpenEditEntry(entry); }}
                onLongPress={() => { if (!permissions.canAccessFinance) return; handleDeleteEntry(entry); }}
              >
                {/* Date Column */}
                <View style={styles.dateCol}>
                  <AppText variant="small" color="tertiary">
                    {formatShortDate(entry.entry_date)}
                  </AppText>
                </View>

                {/* Description & Type */}
                <View style={styles.descCol}>
                  <AppText variant="bodyBold" numberOfLines={1} style={{ color: colors.text }}>
                    {entry.description}
                  </AppText>
                  <View style={styles.typeBadgeRow}>
                    <View
                      style={[
                        styles.typeBadge,
                        {
                          backgroundColor:
                            entry.entry_type === "income" ? colors.success + "15" : colors.error + "15",
                        },
                      ]}
                    >
                      <AppText
                        variant="small"
                        style={{
                          color: entry.entry_type === "income" ? colors.success : colors.error,
                          fontWeight: "600",
                        }}
                      >
                        {entry.entry_type === "income" ? "Income" : "Cost"}
                      </AppText>
                    </View>
                  </View>
                </View>

                {/* Amount Column */}
                <View style={styles.amountCol}>
                  <AppText
                    variant="bodyBold"
                    style={{
                      color: entry.entry_type === "income" ? colors.success : colors.error,
                      textAlign: "right",
                    }}
                  >
                    {entry.entry_type === "income" ? "+" : "-"}
                    {formatPenceToGBP(entry.amount_pence)}
                  </AppText>
                  {typeof entry.runningBalancePence === "number" && (
                    <AppText variant="small" color="tertiary" style={styles.balanceText}>
                      Bal {formatPenceToGBP(entry.runningBalancePence)}
                    </AppText>
                  )}
                </View>
              </Pressable>
            ))}
          </View>
        )}

        <View style={{ height: spacing.xl * 2 }} />
      </ScrollView>

      {/* Opening Balance Modal */}
      <Modal
        visible={showOpeningBalanceModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowOpeningBalanceModal(false)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowOpeningBalanceModal(false)} />
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <AppText variant="h2" style={styles.modalTitle}>Opening Balance</AppText>
            <AppText variant="body" color="secondary" style={styles.modalSubtitle}>
              Set the starting balance for your ledger
            </AppText>

            <View style={styles.amountInputRow}>
              <AppText variant="h1" style={{ color: colors.textTertiary }}>£</AppText>
              <AppInput
                placeholder="0.00"
                value={openingBalanceInput}
                onChangeText={setOpeningBalanceInput}
                keyboardType="decimal-pad"
                style={styles.amountInput}
                autoFocus
              />
            </View>

            <View style={styles.modalActions}>
              <SecondaryButton onPress={() => setShowOpeningBalanceModal(false)} disabled={saving} style={{ flex: 1 }}>
                Cancel
              </SecondaryButton>
              <PrimaryButton onPress={handleSaveOpeningBalance} loading={saving} style={{ flex: 1 }}>
                Save
              </PrimaryButton>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add/Edit Entry Modal */}
      <Modal
        visible={showEntryModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowEntryModal(false)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowEntryModal(false)} />
          <View style={[styles.modalContent, styles.entryModal, { backgroundColor: colors.surface }]}>
            <AppText variant="h2" style={styles.modalTitle}>
              {editingEntry ? "Edit Entry" : "Add Entry"}
            </AppText>

            {/* Type Selector */}
            <View style={styles.formGroup}>
              <AppText variant="caption" color="secondary" style={styles.formLabel}>Type</AppText>
              <View style={[styles.segmentedControl, { borderColor: colors.border }]}>
                <Pressable
                  style={[
                    styles.segmentButton,
                    entryForm.entryType === "income" && { backgroundColor: colors.success },
                  ]}
                  onPress={() => setEntryForm({ ...entryForm, entryType: "income" })}
                >
                  <Feather
                    name="trending-up"
                    size={14}
                    color={entryForm.entryType === "income" ? "#fff" : colors.text}
                    style={{ marginRight: 4 }}
                  />
                  <AppText
                    variant="bodyBold"
                    style={{ color: entryForm.entryType === "income" ? "#fff" : colors.text }}
                  >
                    Income
                  </AppText>
                </Pressable>
                <Pressable
                  style={[
                    styles.segmentButton,
                    entryForm.entryType === "cost" && { backgroundColor: colors.error },
                  ]}
                  onPress={() => setEntryForm({ ...entryForm, entryType: "cost" })}
                >
                  <Feather
                    name="trending-down"
                    size={14}
                    color={entryForm.entryType === "cost" ? "#fff" : colors.text}
                    style={{ marginRight: 4 }}
                  />
                  <AppText
                    variant="bodyBold"
                    style={{ color: entryForm.entryType === "cost" ? "#fff" : colors.text }}
                  >
                    Expense
                  </AppText>
                </Pressable>
              </View>
            </View>

            {/* Date with Quick Chips */}
            <View style={styles.formGroup}>
              <AppText variant="caption" color="secondary" style={styles.formLabel}>Date</AppText>
              <View style={styles.dateChips}>
                <Pressable
                  style={[
                    styles.dateChip,
                    {
                      backgroundColor: entryForm.entryDate === getToday() ? colors.primary : colors.backgroundTertiary,
                    },
                  ]}
                  onPress={() => setEntryForm({ ...entryForm, entryDate: getToday() })}
                >
                  <AppText
                    variant="small"
                    style={{ color: entryForm.entryDate === getToday() ? "#fff" : colors.text, fontWeight: "600" }}
                  >
                    Today
                  </AppText>
                </Pressable>
                <Pressable
                  style={[
                    styles.dateChip,
                    {
                      backgroundColor: entryForm.entryDate === getYesterday() ? colors.primary : colors.backgroundTertiary,
                    },
                  ]}
                  onPress={() => setEntryForm({ ...entryForm, entryDate: getYesterday() })}
                >
                  <AppText
                    variant="small"
                    style={{ color: entryForm.entryDate === getYesterday() ? "#fff" : colors.text, fontWeight: "600" }}
                  >
                    Yesterday
                  </AppText>
                </Pressable>
              </View>
              <AppInput
                placeholder="YYYY-MM-DD"
                value={entryForm.entryDate}
                onChangeText={(text) => {
                  setEntryForm({ ...entryForm, entryDate: text });
                  if (formErrors.date) setFormErrors({ ...formErrors, date: undefined });
                }}
                style={[styles.input, formErrors.date && { borderColor: colors.error }]}
              />
              {formErrors.date && (
                <AppText variant="small" style={{ color: colors.error, marginTop: 4 }}>
                  {formErrors.date}
                </AppText>
              )}
            </View>

            {/* Amount */}
            <View style={styles.formGroup}>
              <AppText variant="caption" color="secondary" style={styles.formLabel}>Amount</AppText>
              <View style={[styles.amountInputRow, formErrors.amount && { borderColor: colors.error }]}>
                <AppText variant="h2" style={{ color: colors.textTertiary }}>£</AppText>
                <AppInput
                  placeholder="0.00"
                  value={entryForm.amountInput}
                  onChangeText={(text) => {
                    setEntryForm({ ...entryForm, amountInput: text });
                    if (formErrors.amount) setFormErrors({ ...formErrors, amount: undefined });
                  }}
                  keyboardType="numeric"
                  style={styles.amountInput}
                />
              </View>
              {formErrors.amount && (
                <AppText variant="small" style={{ color: colors.error, marginTop: 4 }}>
                  {formErrors.amount}
                </AppText>
              )}
            </View>

            {/* Description */}
            <View style={styles.formGroup}>
              <AppText variant="caption" color="secondary" style={styles.formLabel}>Description</AppText>
              <AppInput
                placeholder="e.g., Annual membership fees"
                value={entryForm.description}
                onChangeText={(text) => {
                  setEntryForm({ ...entryForm, description: text });
                  if (formErrors.description) setFormErrors({ ...formErrors, description: undefined });
                }}
                style={[styles.input, formErrors.description && { borderColor: colors.error }]}
              />
              {formErrors.description && (
                <AppText variant="small" style={{ color: colors.error, marginTop: 4 }}>
                  {formErrors.description}
                </AppText>
              )}
            </View>

            {/* Actions */}
            <View style={styles.modalActions}>
              <SecondaryButton onPress={() => setShowEntryModal(false)} disabled={saving} style={{ flex: 1 }}>
                Cancel
              </SecondaryButton>
              <PrimaryButton onPress={handleSaveEntry} loading={saving} style={{ flex: 1 }}>
                {editingEntry ? "Update" : "Add Entry"}
              </PrimaryButton>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

// ========== HELPERS ==========

function formatShortDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return dateStr;
  }
}

// ========== STYLES ==========

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.base,
  },
  backButton: {
    padding: spacing.xs,
    marginRight: spacing.sm,
  },
  title: {
    flex: 1,
  },
  exportButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.xs,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  emptyCard: {
    paddingVertical: spacing.xl,
  },
  emptyContent: {
    alignItems: "center",
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.base,
  },
  emptyText: {
    marginBottom: spacing.xs,
  },
  emptyHint: {
    textAlign: "center",
    maxWidth: 240,
  },
  ledgerList: {
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  ledgerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
  },
  dateCol: {
    width: 88,
    marginRight: spacing.sm,
  },
  descCol: {
    flex: 1,
    marginRight: spacing.sm,
  },
  typeBadgeRow: {
    flexDirection: "row",
    marginTop: 2,
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  amountCol: {
    minWidth: 110,
    alignItems: "flex-end",
  },
  balanceText: {
    marginTop: 2,
    textAlign: "right",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContent: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  entryModal: {
    maxHeight: "90%",
  },
  modalTitle: {
    marginBottom: spacing.xs,
  },
  modalSubtitle: {
    marginBottom: spacing.lg,
  },
  formGroup: {
    marginBottom: spacing.base,
  },
  formLabel: {
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontSize: 11,
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: radius.md,
  },
  amountInputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
  },
  amountInput: {
    flex: 1,
    borderWidth: 0,
    fontSize: 24,
    fontWeight: "600",
  },
  segmentedControl: {
    flexDirection: "row",
    borderRadius: radius.md,
    overflow: "hidden",
    borderWidth: 1,
  },
  segmentButton: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: spacing.sm,
    backgroundColor: "transparent",
  },
  dateChips: {
    flexDirection: "row",
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  dateChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  modalActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});
