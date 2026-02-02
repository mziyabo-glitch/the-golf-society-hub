/**
 * Treasurer Ledger Screen
 *
 * Allows Captain/Treasurer to:
 * - View opening balance, income, costs, current balance
 * - View itemised ledger entries with running balance
 * - Add/Edit/Delete entries
 * - Set opening balance
 * - Export to PDF
 */

import { useCallback, useState } from "react";
import {
  StyleSheet,
  View,
  Alert,
  Pressable,
  ScrollView,
  Modal,
  TextInput,
  Platform,
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
import { PrimaryButton, SecondaryButton, DestructiveButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { useBootstrap } from "@/lib/useBootstrap";
import { getPermissionsForMember } from "@/lib/rbac";
import { getColors, spacing, radius } from "@/lib/ui/theme";
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

const initialFormData: EntryFormData = {
  entryType: "income",
  entryDate: new Date().toISOString().split("T")[0],
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
  const [saving, setSaving] = useState(false);

  const permissions = getPermissionsForMember(member as any);
  const canManageFinance = permissions.canAccessFinance;

  // Load data
  const loadData = useCallback(async () => {
    if (!societyId) return;

    setLoading(true);
    try {
      const openingBalance = await getOpeningBalance(societyId);
      const data = await getFinanceSummary(societyId, openingBalance);
      setSummary(data);

      // Calculate running balances
      const withBalances = calculateRunningBalances(data.entries, openingBalance);
      setEntriesWithBalance(withBalances);
    } catch (err: any) {
      console.error("[Treasurer] loadData error:", err);
      Alert.alert("Error", err?.message || "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }, [societyId]);

  // Refresh on focus
  useFocusEffect(
    useCallback(() => {
      if (societyId) {
        loadData();
      }
    }, [societyId, loadData])
  );

  // ========== OPENING BALANCE ==========

  const handleOpenOpeningBalanceModal = () => {
    setOpeningBalanceInput(formatPenceToPoundsInput(summary?.openingBalancePence ?? 0));
    setShowOpeningBalanceModal(true);
  };

  const handleSaveOpeningBalance = async () => {
    const pence = parseCurrencyToPence(openingBalanceInput);
    if (pence === null) {
      Alert.alert("Invalid Amount", "Please enter a valid amount.");
      return;
    }

    setSaving(true);
    try {
      await updateOpeningBalance(societyId!, pence);
      setShowOpeningBalanceModal(false);
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
    setEntryForm(initialFormData);
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
    setShowEntryModal(true);
  };

  const handleSaveEntry = async () => {
    // Validate
    const amountPence = parseCurrencyToPence(entryForm.amountInput);
    if (amountPence === null || amountPence <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid amount greater than zero.");
      return;
    }

    if (!entryForm.description.trim()) {
      Alert.alert("Missing Description", "Please enter a description.");
      return;
    }

    if (!entryForm.entryDate) {
      Alert.alert("Missing Date", "Please enter a date.");
      return;
    }

    setSaving(true);
    try {
      if (editingEntry) {
        // Update existing
        await updateFinanceEntry(editingEntry.id, {
          entry_type: entryForm.entryType,
          entry_date: entryForm.entryDate,
          amount_pence: amountPence,
          description: entryForm.description.trim(),
        });
      } else {
        // Create new
        await createFinanceEntry({
          society_id: societyId!,
          entry_type: entryForm.entryType,
          entry_date: entryForm.entryDate,
          amount_pence: amountPence,
          description: entryForm.description.trim(),
        });
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
      `Are you sure you want to delete this ${entry.entry_type} entry for ${formatPenceToGBP(entry.amount_pence)}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteFinanceEntry(entry.id);
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
      const html = generateLedgerPdfHtml({
        societyName: society.name || "Golf Society",
        logoUrl: (society as any)?.logo_url || (society as any)?.logoUrl || null,
        openingBalancePence: summary.openingBalancePence,
        entries: entriesWithBalance,
        totalIncomePence: summary.totalIncomePence,
        totalCostsPence: summary.totalCostsPence,
        currentBalancePence: summary.currentBalancePence,
      });

      // On web, use printAsync which opens print dialog
      if (Platform.OS === "web") {
        await Print.printAsync({ html });
        return;
      }

      // On native, generate PDF file and share
      const { uri } = await Print.printToFileAsync({
        html,
        base64: false,
      });

      console.log("[Treasurer] PDF file created at:", uri);

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: "Society Financial Ledger",
          UTI: "com.adobe.pdf",
        });
      } else {
        // Fallback to print if sharing not available
        await Print.printAsync({ html });
      }
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

  return (
    <Screen>
      {/* Header */}
      <View style={styles.header}>
        <SecondaryButton onPress={() => router.back()} size="sm">
          <Feather name="arrow-left" size={16} color={colors.text} /> Back
        </SecondaryButton>
        <SecondaryButton onPress={handleExportPdf} size="sm">
          <Feather name="download" size={16} color={colors.text} /> Export PDF
        </SecondaryButton>
      </View>

      <AppText variant="title" style={styles.title}>
        <Feather name="book" size={24} color={colors.primary} /> Treasurer
      </AppText>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Summary Cards */}
        <AppCard style={styles.summaryCard}>
          <View style={styles.summaryGrid}>
            <Pressable
              style={styles.summaryItem}
              onPress={handleOpenOpeningBalanceModal}
            >
              <AppText variant="caption" color="secondary">Opening Balance</AppText>
              <AppText variant="h2">{formatPenceToGBP(summary?.openingBalancePence ?? 0)}</AppText>
              <AppText variant="small" color="tertiary">Tap to edit</AppText>
            </Pressable>
            <View style={styles.summaryItem}>
              <AppText variant="caption" color="secondary">Total Income</AppText>
              <AppText variant="h2" style={{ color: colors.success }}>
                {formatPenceToGBP(summary?.totalIncomePence ?? 0)}
              </AppText>
            </View>
            <View style={styles.summaryItem}>
              <AppText variant="caption" color="secondary">Total Costs</AppText>
              <AppText variant="h2" style={{ color: colors.error }}>
                {formatPenceToGBP(summary?.totalCostsPence ?? 0)}
              </AppText>
            </View>
            <View style={styles.summaryItem}>
              <AppText variant="caption" color="secondary">Current Balance</AppText>
              <AppText
                variant="h1"
                style={{
                  color: (summary?.currentBalancePence ?? 0) >= 0 ? colors.success : colors.error,
                }}
              >
                {formatPenceToGBP(summary?.currentBalancePence ?? 0)}
              </AppText>
            </View>
          </View>
        </AppCard>

        {/* Add Entry Button */}
        <View style={styles.addButtonRow}>
          <AppText variant="h2">Ledger Entries</AppText>
          <PrimaryButton onPress={handleOpenAddEntry} size="sm">
            <Feather name="plus" size={16} color={colors.textInverse} /> Add Entry
          </PrimaryButton>
        </View>

        {/* Entries List */}
        {entriesWithBalance.length === 0 ? (
          <AppCard>
            <EmptyState
              icon={<Feather name="inbox" size={32} color={colors.textTertiary} />}
              title="No entries yet"
              message="Add your first entry to start tracking finances."
            />
            <View style={{ marginTop: spacing.base, alignItems: "center" }}>
              <PrimaryButton onPress={handleOpenAddEntry}>
                <Feather name="plus" size={16} color={colors.textInverse} /> Add First Entry
              </PrimaryButton>
            </View>
          </AppCard>
        ) : (
          <>
            {/* Table Header */}
            <View style={[styles.tableHeader, { backgroundColor: colors.backgroundTertiary }]}>
              <AppText variant="small" color="secondary" style={styles.colDate}>Date</AppText>
              <AppText variant="small" color="secondary" style={styles.colType}>Type</AppText>
              <AppText variant="small" color="secondary" style={styles.colDesc}>Description</AppText>
              <AppText variant="small" color="secondary" style={styles.colAmount}>Amount</AppText>
              <AppText variant="small" color="secondary" style={styles.colBalance}>Balance</AppText>
              <View style={styles.colActions} />
            </View>

            {entriesWithBalance.map((entry) => (
              <AppCard key={entry.id} style={styles.entryCard} padding="sm">
                <Pressable
                  style={styles.entryRow}
                  onPress={() => handleOpenEditEntry(entry)}
                >
                  <AppText variant="small" style={styles.colDate}>
                    {formatDate(entry.entry_date)}
                  </AppText>
                  <View style={styles.colType}>
                    <View
                      style={[
                        styles.typeBadge,
                        {
                          backgroundColor:
                            entry.entry_type === "income"
                              ? colors.success + "20"
                              : colors.error + "20",
                        },
                      ]}
                    >
                      <AppText
                        variant="small"
                        style={{
                          color: entry.entry_type === "income" ? colors.success : colors.error,
                        }}
                      >
                        {entry.entry_type === "income" ? "IN" : "OUT"}
                      </AppText>
                    </View>
                  </View>
                  <AppText variant="body" numberOfLines={1} style={styles.colDesc}>
                    {entry.description}
                  </AppText>
                  <AppText
                    variant="bodyBold"
                    style={[
                      styles.colAmount,
                      { color: entry.entry_type === "income" ? colors.success : colors.error },
                    ]}
                  >
                    {entry.entry_type === "income" ? "+" : "-"}
                    {formatPenceToGBP(entry.amount_pence)}
                  </AppText>
                  <AppText
                    variant="body"
                    style={[
                      styles.colBalance,
                      { color: entry.runningBalancePence >= 0 ? colors.text : colors.error },
                    ]}
                  >
                    {formatPenceToGBP(entry.runningBalancePence)}
                  </AppText>
                  <Pressable
                    style={styles.colActions}
                    onPress={() => handleDeleteEntry(entry)}
                    hitSlop={8}
                  >
                    <Feather name="trash-2" size={16} color={colors.error} />
                  </Pressable>
                </Pressable>
              </AppCard>
            ))}
          </>
        )}

        <View style={{ height: spacing.xl }} />
      </ScrollView>

      {/* Opening Balance Modal */}
      <Modal
        visible={showOpeningBalanceModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowOpeningBalanceModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <AppText variant="h2" style={{ marginBottom: spacing.base }}>
              Set Opening Balance
            </AppText>
            <AppText variant="body" color="secondary" style={{ marginBottom: spacing.base }}>
              Enter the starting balance for your society ledger.
            </AppText>
            <View style={styles.inputWrapper}>
              <AppText variant="h2" style={{ marginRight: spacing.xs }}>£</AppText>
              <AppInput
                placeholder="0.00"
                value={openingBalanceInput}
                onChangeText={setOpeningBalanceInput}
                keyboardType="decimal-pad"
                style={{ flex: 1 }}
                autoFocus
              />
            </View>
            <View style={styles.modalActions}>
              <SecondaryButton
                onPress={() => setShowOpeningBalanceModal(false)}
                disabled={saving}
              >
                Cancel
              </SecondaryButton>
              <PrimaryButton onPress={handleSaveOpeningBalance} loading={saving}>
                Save
              </PrimaryButton>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add/Edit Entry Modal */}
      <Modal
        visible={showEntryModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowEntryModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <AppText variant="h2" style={{ marginBottom: spacing.base }}>
              {editingEntry ? "Edit Entry" : "Add Entry"}
            </AppText>

            {/* Type Selector */}
            <AppText variant="caption" color="secondary" style={{ marginBottom: spacing.xs }}>
              Type
            </AppText>
            <View style={styles.segmentedControl}>
              <Pressable
                style={[
                  styles.segmentButton,
                  entryForm.entryType === "income" && {
                    backgroundColor: colors.success,
                  },
                ]}
                onPress={() => setEntryForm({ ...entryForm, entryType: "income" })}
              >
                <AppText
                  variant="bodyBold"
                  style={{
                    color: entryForm.entryType === "income" ? "#fff" : colors.text,
                  }}
                >
                  Income
                </AppText>
              </Pressable>
              <Pressable
                style={[
                  styles.segmentButton,
                  entryForm.entryType === "cost" && {
                    backgroundColor: colors.error,
                  },
                ]}
                onPress={() => setEntryForm({ ...entryForm, entryType: "cost" })}
              >
                <AppText
                  variant="bodyBold"
                  style={{
                    color: entryForm.entryType === "cost" ? "#fff" : colors.text,
                  }}
                >
                  Cost
                </AppText>
              </Pressable>
            </View>

            {/* Date Input */}
            <AppText variant="caption" color="secondary" style={{ marginTop: spacing.base, marginBottom: spacing.xs }}>
              Date (YYYY-MM-DD)
            </AppText>
            <AppInput
              placeholder="2024-01-15"
              value={entryForm.entryDate}
              onChangeText={(text) => setEntryForm({ ...entryForm, entryDate: text })}
              keyboardType="default"
            />

            {/* Amount Input */}
            <AppText variant="caption" color="secondary" style={{ marginTop: spacing.base, marginBottom: spacing.xs }}>
              Amount
            </AppText>
            <View style={styles.inputWrapper}>
              <AppText variant="h2" style={{ marginRight: spacing.xs }}>£</AppText>
              <AppInput
                placeholder="0.00"
                value={entryForm.amountInput}
                onChangeText={(text) => setEntryForm({ ...entryForm, amountInput: text })}
                keyboardType="decimal-pad"
                style={{ flex: 1 }}
              />
            </View>

            {/* Description Input */}
            <AppText variant="caption" color="secondary" style={{ marginTop: spacing.base, marginBottom: spacing.xs }}>
              Description
            </AppText>
            <AppInput
              placeholder="e.g., Annual membership fees"
              value={entryForm.description}
              onChangeText={(text) => setEntryForm({ ...entryForm, description: text })}
              multiline
              numberOfLines={2}
            />

            <View style={styles.modalActions}>
              <SecondaryButton
                onPress={() => setShowEntryModal(false)}
                disabled={saving}
              >
                Cancel
              </SecondaryButton>
              <PrimaryButton onPress={handleSaveEntry} loading={saving}>
                {editingEntry ? "Update" : "Add"}
              </PrimaryButton>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

// ========== HELPERS ==========

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
    });
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
              ${new Date(entry.entry_date).toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #E5E7EB;">
              <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background: ${
                entry.entry_type === "income" ? "#DEF7EC" : "#FDE8E8"
              }; color: ${entry.entry_type === "income" ? "#03543F" : "#9B1C1C"};">
                ${entry.entry_type === "income" ? "Income" : "Cost"}
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
          .title {
            font-size: 20px;
            font-weight: 700;
            color: #111827;
            margin-bottom: 4px;
          }
          .date {
            font-size: 12px;
            color: #6B7280;
          }
          .summary {
            display: flex;
            gap: 16px;
            margin-bottom: 24px;
          }
          .summary-card {
            flex: 1;
            background: #F9FAFB;
            border: 1px solid #E5E7EB;
            border-radius: 8px;
            padding: 12px;
            text-align: center;
          }
          .summary-card.highlight {
            background: #0B6E4F;
            border-color: #0B6E4F;
          }
          .summary-card.highlight .summary-label,
          .summary-card.highlight .summary-value {
            color: #fff;
          }
          .summary-label {
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #6B7280;
            margin-bottom: 4px;
          }
          .summary-value {
            font-size: 18px;
            font-weight: 700;
            color: #111827;
            font-family: 'SF Mono', Consolas, monospace;
          }
          .summary-value.income { color: #03543F; }
          .summary-value.cost { color: #9B1C1C; }
          table {
            width: 100%;
            border-collapse: collapse;
            background: #fff;
            border: 1px solid #E5E7EB;
            border-radius: 8px;
            overflow: hidden;
          }
          thead tr {
            background: #F9FAFB;
          }
          th {
            padding: 10px 12px;
            text-align: left;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #6B7280;
            font-weight: 600;
          }
          th:nth-child(4), th:nth-child(5) {
            text-align: right;
          }
          .footer {
            margin-top: 24px;
            padding-top: 16px;
            border-top: 1px solid #E5E7EB;
            text-align: center;
            font-size: 11px;
            color: #9CA3AF;
          }
          @media print {
            body { padding: 16px; }
            .container { max-width: 100%; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <!-- Header -->
          <div class="header">
            ${logoHtml}
            <div class="header-text">
              <div class="society-name">${societyName}</div>
              <div class="title">Society Financial Ledger</div>
              <div class="date">Generated on ${today}</div>
            </div>
          </div>

          <!-- Summary -->
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

          <!-- Ledger Table -->
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
              <!-- Opening Balance Row -->
              <tr style="background: #F0FDF4;">
                <td style="padding: 8px 12px; border-bottom: 1px solid #E5E7EB;">-</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #E5E7EB;">
                  <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background: #E5E7EB; color: #374151;">
                    Opening
                  </span>
                </td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #E5E7EB; font-style: italic;">Opening Balance</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #E5E7EB; text-align: right;">-</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #E5E7EB; text-align: right; font-family: 'SF Mono', Consolas, monospace; font-weight: 600;">
                  ${formatPenceToGBP(openingBalancePence)}
                </td>
              </tr>
              ${entriesHtml}
            </tbody>
          </table>

          <!-- Footer -->
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
    justifyContent: "space-between",
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
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  summaryItem: {
    width: "48%",
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  addButtonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    marginBottom: spacing.xs,
  },
  entryCard: {
    marginBottom: spacing.xs,
  },
  entryRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  colDate: {
    width: 50,
  },
  colType: {
    width: 40,
    alignItems: "center",
  },
  colDesc: {
    flex: 1,
    marginHorizontal: spacing.xs,
  },
  colAmount: {
    width: 70,
    textAlign: "right",
  },
  colBalance: {
    width: 70,
    textAlign: "right",
  },
  colActions: {
    width: 32,
    alignItems: "center",
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.base,
  },
  modalContent: {
    width: "100%",
    maxWidth: 400,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  segmentedControl: {
    flexDirection: "row",
    borderRadius: radius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  segmentButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: "center",
    backgroundColor: "#F9FAFB",
  },
});
