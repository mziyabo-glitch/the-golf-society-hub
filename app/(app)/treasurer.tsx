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
  ActivityIndicator,
  StyleSheet,
  View,
  Alert,
  Pressable,
  ScrollView,
  Modal,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { StatCard } from "@/components/ui/StatCard";
import { Toast } from "@/components/ui/Toast";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { useBootstrap } from "@/lib/useBootstrap";
import { useAsyncAction } from "@/lib/hooks/useAsyncAction";
import { getPermissionsForMember } from "@/lib/rbac";
import { getColors, spacing, radius } from "@/lib/ui/theme";
import { formatError } from "@/lib/ui/formatError";

import { guard } from "@/lib/guards";
import {
  parseCurrencyToPence,
  formatPenceToGBP,
  formatPenceToPoundsInput,
} from "@/lib/utils/currency";
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
  entryType?: string;
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
  const [entryNotice, setEntryNotice] = useState<{ type: "success" | "error" | "info"; message: string; detail?: string } | null>(null);
  const [openingNotice, setOpeningNotice] = useState<{ type: "success" | "error" | "info"; message: string; detail?: string } | null>(null);
  const exportAction = useAsyncAction();

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

    // Type validation
    if (!entryForm.entryType || !["income", "cost"].includes(entryForm.entryType)) {
      errors.entryType = "Select income or expense";
    }

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
    setOpeningNotice(null);
    setShowOpeningBalanceModal(true);
  };

  const handleSaveOpeningBalance = async () => {
    if (!guard(permissions.canAccessFinance, "Only the Captain or Treasurer can update the opening balance.")) return;

    setOpeningNotice(null);
    const pence = parseCurrencyToPence(openingBalanceInput);
    if (pence === null) {
      setOpeningNotice({ type: "error", message: "Enter a valid amount." });
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
      const formatted = formatError(err);
      setOpeningNotice({ type: "error", message: formatted.message, detail: formatted.detail });
    } finally {
      setSaving(false);
    }
  };

  // ========== ADD/EDIT ENTRY ==========

  const handleOpenAddEntry = () => {
    setEditingEntry(null);
    setEntryForm({ ...initialFormData, entryDate: getToday() });
    setFormErrors({});
    setEntryNotice(null);
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
    setEntryNotice(null);
    setShowEntryModal(true);
  };

  const handleSaveEntry = async () => {
    if (!guard(permissions.canAccessFinance, "Only the Captain or Treasurer can add or edit finance entries.")) return;

    setEntryNotice(null);
    if (!validateForm()) {
      setEntryNotice({ type: "error", message: "Please fix the highlighted fields." });
      return;
    }

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
      setEntryNotice(null);
      setShowEntryModal(false);
      await loadData();
    } catch (err: any) {
      console.error("[Treasurer] handleSaveEntry error:", err);
      const formatted = formatError(err);
      setEntryNotice({ type: "error", message: formatted.message, detail: formatted.detail });
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
              const formatted = formatError(err);
              setToast({ visible: true, message: formatted.message, type: "error" });
            }
          },
        },
      ]
    );
  };

  // ========== PDF EXPORT ==========

  const handleExportPdf = async () => {
    if (!summary || !society) return;

    exportAction.reset();
    const exported = await exportAction.run(async () => {
      const html = generateLedgerPdfHtml({
        societyName: society.name || "Golf Society",
        logoUrl: (society as any)?.logo_url || (society as any)?.logoUrl || null,
        openingBalancePence: summary.openingBalancePence,
        entries: entriesWithBalance,
        totalIncomePence: summary.totalIncomePence,
        totalCostsPence: summary.totalCostsPence,
        currentBalancePence: summary.currentBalancePence,
      });

      if (Platform.OS === "web") {
        await Print.printAsync({ html });
        return true;
      }

      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: "Society Financial Ledger",
          UTI: "com.adobe.pdf",
        });
        return true;
      }

      await Print.printAsync({ html });
      return true;
    });

    if (!exported) {
      if (exportAction.error) {
        setToast({ visible: true, message: exportAction.error.message, type: "error" });
      }
      return;
    }

    setToast({ visible: true, message: "Exported", type: "success" });
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
          style={({ pressed }) => [
            styles.exportButton,
            { opacity: exportAction.loading ? 0.5 : pressed ? 0.7 : 1 },
          ]}
          onPress={handleExportPdf}
          disabled={exportAction.loading}
        >
          {exportAction.loading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Feather name="download" size={18} color={colors.primary} />
          )}
          <AppText variant="small" style={{ color: colors.primary, marginLeft: 4 }}>
            {exportAction.loading ? "Exporting..." : "PDF"}
          </AppText>
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {exportAction.error ? (
          <InlineNotice
            variant="error"
            message={exportAction.error.message}
            detail={exportAction.error.detail}
            style={{ marginBottom: spacing.sm }}
          />
        ) : null}
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
          <PrimaryButton onPress={handleOpenAddEntry} size="sm" disabled={saving}>
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
                No entries yet
              </AppText>
              <AppText variant="small" color="tertiary" style={styles.emptyHint}>
                Add your first income or cost to get started
              </AppText>
              <PrimaryButton onPress={handleOpenAddEntry} size="sm" style={{ marginTop: spacing.base }}>
                <Feather name="plus" size={16} color="#fff" /> Add income/cost
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

            {openingNotice ? (
              <InlineNotice
                variant={openingNotice.type}
                message={openingNotice.message}
                detail={openingNotice.detail}
                style={{ marginBottom: spacing.sm }}
              />
            ) : null}

            <View style={styles.amountInputRow}>
              <AppText variant="h1" style={{ color: colors.textTertiary }}>£</AppText>
              <AppInput
                placeholder="0.00"
                value={openingBalanceInput}
                onChangeText={(text) => {
                  setOpeningBalanceInput(text);
                  setOpeningNotice(null);
                }}
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

            {entryNotice ? (
              <InlineNotice
                variant={entryNotice.type}
                message={entryNotice.message}
                detail={entryNotice.detail}
                style={{ marginBottom: spacing.sm }}
              />
            ) : null}

            {/* Type Selector */}
            <View style={styles.formGroup}>
              <AppText variant="caption" color="secondary" style={styles.formLabel}>Type</AppText>
              <View style={[styles.segmentedControl, { borderColor: colors.border }]}>
                <Pressable
                  style={[
                    styles.segmentButton,
                    entryForm.entryType === "income" && { backgroundColor: colors.success },
                  ]}
                  onPress={() => {
                    setEntryForm({ ...entryForm, entryType: "income" });
                    setEntryNotice(null);
                    setFormErrors((prev) => ({ ...prev, entryType: undefined }));
                  }}
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
                  onPress={() => {
                    setEntryForm({ ...entryForm, entryType: "cost" });
                    setEntryNotice(null);
                    setFormErrors((prev) => ({ ...prev, entryType: undefined }));
                  }}
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
              {formErrors.entryType && (
                <AppText variant="small" style={{ color: colors.error, marginTop: 4 }}>
                  {formErrors.entryType}
                </AppText>
              )}
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
                  setEntryNotice(null);
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
                    setEntryNotice(null);
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
                  setEntryNotice(null);
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

// ========== PDF GENERATION ==========

type LedgerPdfData = {
  societyName: string;
  logoUrl: string | null;
  openingBalancePence: number;
  entries: EntryWithBalance[];
  totalIncomePence: number;
  totalCostsPence: number;
  currentBalancePence: number;
};

function generateLedgerPdfHtml(data: LedgerPdfData): string {
  const {
    societyName,
    logoUrl,
    openingBalancePence,
    entries,
    totalIncomePence,
    totalCostsPence,
    currentBalancePence,
  } = data;

  const today = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" style="height: 50px; width: auto; margin-right: 16px;" />`
    : "";

  const entriesHtml = entries.length === 0
    ? `<tr><td colspan="5" style="padding: 24px; text-align: center; color: #6B7280;">No entries recorded</td></tr>`
    : entries
        .map(
          (entry) => `
          <tr>
            <td style="padding: 8px 12px; border-bottom: 1px solid #E5E7EB;">
              ${new Date(entry.entry_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
            </td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #E5E7EB;">
              <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background: ${
                entry.entry_type === "income" ? "#DEF7EC" : "#FDE8E8"
              }; color: ${entry.entry_type === "income" ? "#03543F" : "#9B1C1C"};">
                ${entry.entry_type === "income" ? "Income" : "Expense"}
              </span>
            </td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #E5E7EB;">${entry.description}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #E5E7EB; text-align: right; font-family: 'SF Mono', Consolas, monospace; color: ${
              entry.entry_type === "income" ? "#03543F" : "#9B1C1C"
            };">
              ${entry.entry_type === "income" ? "+" : "-"}${formatPenceToGBP(entry.amount_pence)}
            </td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #E5E7EB; text-align: right; font-family: 'SF Mono', Consolas, monospace; font-weight: 600;">
              ${formatPenceToGBP(entry.runningBalancePence)}
            </td>
          </tr>
        `
        )
        .join("");

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Financial Ledger - ${societyName}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            padding: 24px;
            color: #111827;
            background: #fff;
            font-size: 12px;
            line-height: 1.4;
          }
          .container { max-width: 800px; margin: 0 auto; }
          .header {
            display: flex;
            align-items: center;
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 2px solid #0B6E4F;
          }
          .header-text { flex: 1; }
          .society-name {
            font-size: 14px;
            font-weight: 600;
            color: #0B6E4F;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 4px;
          }
          .title { font-size: 20px; font-weight: 700; color: #111827; margin-bottom: 4px; }
          .date { font-size: 12px; color: #6B7280; }
          .summary { display: flex; gap: 16px; margin-bottom: 24px; }
          .summary-card {
            flex: 1;
            background: #F9FAFB;
            border: 1px solid #E5E7EB;
            border-radius: 8px;
            padding: 12px;
            text-align: center;
          }
          .summary-card.highlight { background: #0B6E4F; border-color: #0B6E4F; }
          .summary-card.highlight .summary-label, .summary-card.highlight .summary-value { color: #fff; }
          .summary-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #6B7280; margin-bottom: 4px; }
          .summary-value { font-size: 18px; font-weight: 700; color: #111827; font-family: 'SF Mono', Consolas, monospace; }
          .summary-value.income { color: #03543F; }
          .summary-value.cost { color: #9B1C1C; }
          table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #E5E7EB; border-radius: 8px; overflow: hidden; }
          thead tr { background: #F9FAFB; }
          th { padding: 10px 12px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #6B7280; font-weight: 600; }
          th:nth-child(4), th:nth-child(5) { text-align: right; }
          .footer { margin-top: 24px; padding-top: 16px; border-top: 1px solid #E5E7EB; text-align: center; font-size: 11px; color: #9CA3AF; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            ${logoHtml}
            <div class="header-text">
              <div class="society-name">${societyName}</div>
              <div class="title">Society Financial Ledger</div>
              <div class="date">Generated on ${today}</div>
            </div>
          </div>
          <div class="summary">
            <div class="summary-card">
              <div class="summary-label">Opening Balance</div>
              <div class="summary-value">${formatPenceToGBP(openingBalancePence)}</div>
            </div>
            <div class="summary-card">
              <div class="summary-label">Total Income</div>
              <div class="summary-value income">${formatPenceToGBP(totalIncomePence)}</div>
            </div>
            <div class="summary-card">
              <div class="summary-label">Total Costs</div>
              <div class="summary-value cost">${formatPenceToGBP(totalCostsPence)}</div>
            </div>
            <div class="summary-card highlight">
              <div class="summary-label">Closing Balance</div>
              <div class="summary-value">${formatPenceToGBP(currentBalancePence)}</div>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 100px;">Date</th>
                <th style="width: 80px;">Type</th>
                <th>Description</th>
                <th style="width: 100px; text-align: right;">Amount</th>
                <th style="width: 100px; text-align: right;">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr style="background: #F0FDF4;">
                <td style="padding: 8px 12px; border-bottom: 1px solid #E5E7EB;">-</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #E5E7EB;">
                  <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background: #E5E7EB; color: #374151;">Opening</span>
                </td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #E5E7EB; font-style: italic;">Opening Balance</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #E5E7EB; text-align: right;">-</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #E5E7EB; text-align: right; font-family: 'SF Mono', Consolas, monospace; font-weight: 600;">${formatPenceToGBP(openingBalancePence)}</td>
              </tr>
              ${entriesHtml}
            </tbody>
          </table>
          <div class="footer">
            ${entries.length} transaction${entries.length !== 1 ? "s" : ""} recorded<br/>
            Produced by The Golf Society Hub
          </div>
        </div>
      </body>
    </html>
  `;
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
