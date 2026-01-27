// lib/db/expenseRepo.ts
import { supabase, requireSupabaseSession } from "@/lib/supabase";

export type EventExpense = {
  id: string;
  description?: string;
  amount: number;
  createdAt?: string | null;
  createdBy?: string | null;
};

/**
 * List all expenses for an event.
 */
export async function listEventExpenses(_societyId: string, eventId: string) {
  await requireSupabaseSession("expenseRepo.listEventExpenses");
  const { data, error } = await supabase
    .from("event_expenses")
    .select("id, event_id, description, name, amount, created_at, created_by")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message || "Failed to load event expenses");
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    description: row.description ?? row.name ?? "",
    amount: Number(row.amount ?? 0),
    createdAt: row.created_at ?? null,
    createdBy: row.created_by ?? null,
  })) as EventExpense[];
}

/**
 * Create an expense entry in event_expenses.
 */
export async function createEventExpense(
  societyId: string,
  eventId: string,
  input: { description: string; amount: number; createdBy?: string }
) {
  await requireSupabaseSession("expenseRepo.createEventExpense");
  const { description, amount, createdBy } = input;

  if (!eventId) throw new Error("Missing eventId");
  if (!description?.trim()) throw new Error("Expense description is required");
  if (typeof amount !== "number" || isNaN(amount) || amount <= 0) {
    throw new Error("Expense amount must be a positive number");
  }

  const payload: Record<string, unknown> = {
    society_id: societyId,
    event_id: eventId,
    description: description.trim(),
    amount,
  };

  if (createdBy) payload.created_by = createdBy;

  let { error } = await supabase.from("event_expenses").insert(payload);
  if (error && error.code === "42703") {
    const fallback: Record<string, unknown> = {
      event_id: eventId,
      description: description.trim(),
      amount,
    };
    if (createdBy) fallback.created_by = createdBy;
    const { error: fallbackError } = await supabase.from("event_expenses").insert(fallback);
    if (!fallbackError) return;
    error = fallbackError;
  }
  if (error) {
    throw new Error(error.message || "Failed to create event expense");
  }
}

/**
 * Delete an expense.
 */
export async function deleteEventExpense(
  _societyId: string,
  _eventId: string,
  expenseId: string
) {
  await requireSupabaseSession("expenseRepo.deleteEventExpense");
  if (!expenseId) throw new Error("Missing expenseId");

  const { error } = await supabase.from("event_expenses").delete().eq("id", expenseId);
  if (error) {
    throw new Error(error.message || "Failed to delete event expense");
  }
}
