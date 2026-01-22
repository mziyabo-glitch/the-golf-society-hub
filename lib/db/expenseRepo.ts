// lib/db/expenseRepo.ts
import { db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";

export type EventExpense = {
  id: string;
  description?: string;
  amount: number;
  createdAt?: any;
  createdBy?: string;
};

function expensesCol(societyId: string, eventId: string) {
  return collection(db, "societies", societyId, "events", eventId, "expenses");
}

/**
 * List all expenses for an event.
 */
export async function listEventExpenses(societyId: string, eventId: string) {
  const q = query(expensesCol(societyId, eventId), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);

  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<EventExpense, "id">),
  })) as EventExpense[];
}

/**
 * Create an expense entry under:
 * societies/{societyId}/events/{eventId}/expenses/{expenseId}
 */
export async function createEventExpense(
  societyId: string,
  eventId: string,
  input: { description: string; amount: number; createdBy?: string }
) {
  const { description, amount, createdBy } = input;

  if (!societyId) throw new Error("Missing societyId");
  if (!eventId) throw new Error("Missing eventId");
  if (!description?.trim()) throw new Error("Expense description is required");
  if (typeof amount !== "number" || isNaN(amount) || amount <= 0)
    throw new Error("Expense amount must be a positive number");

  await addDoc(expensesCol(societyId, eventId), {
    description: description.trim(),
    amount,
    createdBy: createdBy ?? null,
    createdAt: serverTimestamp(),
  });
}

/**
 * Delete an expense.
 */
export async function deleteEventExpense(
  societyId: string,
  eventId: string,
  expenseId: string
) {
  if (!societyId) throw new Error("Missing societyId");
  if (!eventId) throw new Error("Missing eventId");
  if (!expenseId) throw new Error("Missing expenseId");

  await deleteDoc(
    doc(db, "societies", societyId, "events", eventId, "expenses", expenseId)
  );
}
