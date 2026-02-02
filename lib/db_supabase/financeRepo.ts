/**
 * Finance Repository
 *
 * CRUD operations for finance_entries table.
 * Handles the society ledger with income/cost entries.
 *
 * Database Schema (assumed):
 * - id: uuid (primary key)
 * - society_id: uuid (foreign key to societies)
 * - entry_type: text ('income' | 'cost')
 * - entry_date: date (the date of the transaction)
 * - amount_pence: integer (amount in pence, always positive)
 * - description: text (description of the entry)
 * - event_id: uuid | null (optional link to events)
 * - created_at: timestamptz
 * - updated_at: timestamptz
 */

import { supabase } from "@/lib/supabase";

export type FinanceEntryType = "income" | "cost";

export type FinanceEntryDoc = {
  id: string;
  society_id: string;
  entry_type: FinanceEntryType;
  entry_date: string; // YYYY-MM-DD
  amount_pence: number;
  description: string;
  event_id: string | null;
  created_at: string;
  updated_at?: string;
};

export type FinanceEntryInput = {
  society_id: string;
  entry_type: FinanceEntryType;
  entry_date: string; // YYYY-MM-DD
  amount_pence: number;
  description: string;
  event_id?: string | null;
};

export type FinanceEntryUpdate = {
  entry_type?: FinanceEntryType;
  entry_date?: string;
  amount_pence?: number;
  description?: string;
  event_id?: string | null;
};

export type FinanceSummary = {
  entries: FinanceEntryDoc[];
  openingBalancePence: number;
  totalIncomePence: number;
  totalCostsPence: number;
  currentBalancePence: number;
};

/**
 * Get all finance entries for a society, sorted by entry_date ASC, then created_at ASC
 * This ordering ensures a stable running balance calculation.
 *
 * @param societyId - The society to get entries for
 * @returns Array of finance entries
 */
export async function getFinanceEntries(
  societyId: string
): Promise<FinanceEntryDoc[]> {
  console.log("[financeRepo] getFinanceEntries:", { societyId });

  const { data, error } = await supabase
    .from("finance_entries")
    .select("*")
    .eq("society_id", societyId)
    .order("entry_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[financeRepo] getFinanceEntries failed:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw new Error(error.message || "Failed to load finance entries");
  }

  return data || [];
}

/**
 * Get a single finance entry by ID
 *
 * @param entryId - The entry ID
 * @returns The finance entry or null
 */
export async function getFinanceEntry(
  entryId: string
): Promise<FinanceEntryDoc | null> {
  console.log("[financeRepo] getFinanceEntry:", { entryId });

  const { data, error } = await supabase
    .from("finance_entries")
    .select("*")
    .eq("id", entryId)
    .maybeSingle();

  if (error) {
    console.error("[financeRepo] getFinanceEntry failed:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw new Error(error.message || "Failed to load finance entry");
  }

  return data;
}

/**
 * Create a new finance entry
 *
 * @param input - The entry data
 * @returns The created entry
 */
export async function createFinanceEntry(
  input: FinanceEntryInput
): Promise<FinanceEntryDoc> {
  console.log("[financeRepo] createFinanceEntry:", input);

  // Validate amount is positive
  if (input.amount_pence <= 0) {
    throw new Error("Amount must be greater than zero");
  }

  const { data, error } = await supabase
    .from("finance_entries")
    .insert({
      society_id: input.society_id,
      entry_type: input.entry_type,
      entry_date: input.entry_date,
      amount_pence: input.amount_pence,
      description: input.description.trim(),
      event_id: input.event_id || null,
    })
    .select()
    .single();

  if (error) {
    console.error("[financeRepo] createFinanceEntry failed:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });

    // Handle RLS permission errors
    if (error.code === "42501" || error.message?.includes("row-level security")) {
      throw new Error("Only Captain or Treasurer can add finance entries.");
    }

    throw new Error(error.message || "Failed to create finance entry");
  }

  console.log("[financeRepo] createFinanceEntry success:", data.id);
  return data;
}

/**
 * Update an existing finance entry
 *
 * @param entryId - The entry ID to update
 * @param updates - The fields to update
 * @returns The updated entry
 */
export async function updateFinanceEntry(
  entryId: string,
  updates: FinanceEntryUpdate
): Promise<FinanceEntryDoc> {
  console.log("[financeRepo] updateFinanceEntry:", { entryId, updates });

  // Validate amount if provided
  if (updates.amount_pence !== undefined && updates.amount_pence <= 0) {
    throw new Error("Amount must be greater than zero");
  }

  // Trim description if provided
  const payload: FinanceEntryUpdate = { ...updates };
  if (payload.description !== undefined) {
    payload.description = payload.description.trim();
  }

  const { data, error } = await supabase
    .from("finance_entries")
    .update(payload)
    .eq("id", entryId)
    .select()
    .single();

  if (error) {
    console.error("[financeRepo] updateFinanceEntry failed:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });

    // Handle RLS permission errors
    if (error.code === "42501" || error.message?.includes("row-level security")) {
      throw new Error("Only Captain or Treasurer can update finance entries.");
    }

    throw new Error(error.message || "Failed to update finance entry");
  }

  console.log("[financeRepo] updateFinanceEntry success:", data.id);
  return data;
}

/**
 * Delete a finance entry
 *
 * @param entryId - The entry ID to delete
 */
export async function deleteFinanceEntry(entryId: string): Promise<void> {
  console.log("[financeRepo] deleteFinanceEntry:", { entryId });

  const { error } = await supabase
    .from("finance_entries")
    .delete()
    .eq("id", entryId);

  if (error) {
    console.error("[financeRepo] deleteFinanceEntry failed:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });

    // Handle RLS permission errors
    if (error.code === "42501" || error.message?.includes("row-level security")) {
      throw new Error("Only Captain or Treasurer can delete finance entries.");
    }

    throw new Error(error.message || "Failed to delete finance entry");
  }

  console.log("[financeRepo] deleteFinanceEntry success");
}

/**
 * Get finance summary for a society including all entries and totals.
 * Calculates running balance as: opening_balance + sum(income) - sum(cost)
 *
 * @param societyId - The society ID
 * @param openingBalancePence - The opening balance from societies table
 * @returns Finance summary with entries and totals
 */
export async function getFinanceSummary(
  societyId: string,
  openingBalancePence: number = 0
): Promise<FinanceSummary> {
  console.log("[financeRepo] getFinanceSummary:", { societyId, openingBalancePence });

  const entries = await getFinanceEntries(societyId);

  // Calculate totals
  let totalIncomePence = 0;
  let totalCostsPence = 0;

  for (const entry of entries) {
    if (entry.entry_type === "income") {
      totalIncomePence += entry.amount_pence;
    } else if (entry.entry_type === "cost") {
      totalCostsPence += entry.amount_pence;
    }
  }

  const currentBalancePence = openingBalancePence + totalIncomePence - totalCostsPence;

  return {
    entries,
    openingBalancePence,
    totalIncomePence,
    totalCostsPence,
    currentBalancePence,
  };
}

/**
 * Calculate running balance for each entry.
 * Returns entries with an additional `runningBalancePence` field.
 *
 * @param entries - The finance entries (should be sorted by date ASC)
 * @param openingBalancePence - The starting balance
 * @returns Entries with running balance
 */
export function calculateRunningBalances(
  entries: FinanceEntryDoc[],
  openingBalancePence: number
): (FinanceEntryDoc & { runningBalancePence: number })[] {
  let balance = openingBalancePence;

  return entries.map((entry) => {
    if (entry.entry_type === "income") {
      balance += entry.amount_pence;
    } else if (entry.entry_type === "cost") {
      balance -= entry.amount_pence;
    }
    return { ...entry, runningBalancePence: balance };
  });
}

/**
 * Update the opening balance for a society
 *
 * @param societyId - The society ID
 * @param openingBalancePence - The new opening balance in pence
 */
export async function updateOpeningBalance(
  societyId: string,
  openingBalancePence: number
): Promise<void> {
  console.log("[financeRepo] updateOpeningBalance:", { societyId, openingBalancePence });

  const { error } = await supabase
    .from("societies")
    .update({ opening_balance_pence: openingBalancePence })
    .eq("id", societyId);

  if (error) {
    console.error("[financeRepo] updateOpeningBalance failed:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });

    // Handle RLS permission errors
    if (error.code === "42501" || error.message?.includes("row-level security")) {
      throw new Error("Only Captain or Treasurer can update the opening balance.");
    }

    throw new Error(error.message || "Failed to update opening balance");
  }

  console.log("[financeRepo] updateOpeningBalance success");
}

/**
 * Get the opening balance for a society
 *
 * @param societyId - The society ID
 * @returns The opening balance in pence (defaults to 0)
 */
export async function getOpeningBalance(societyId: string): Promise<number> {
  console.log("[financeRepo] getOpeningBalance:", { societyId });

  const { data, error } = await supabase
    .from("societies")
    .select("opening_balance_pence")
    .eq("id", societyId)
    .single();

  if (error) {
    console.error("[financeRepo] getOpeningBalance failed:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw new Error(error.message || "Failed to get opening balance");
  }

  return data?.opening_balance_pence ?? 0;
}
