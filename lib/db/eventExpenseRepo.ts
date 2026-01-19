import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { stripUndefined } from "@/lib/db/sanitize";

export type EventExpenseCategory = "prizes" | "trophies" | "admin" | "food" | "other";

export type EventExpenseDoc = {
  id: string;
  eventId: string;
  societyId: string;
  description: string;
  amount: number;
  category: EventExpenseCategory;
  incurredDateISO: string;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

type EventExpenseInput = Omit<EventExpenseDoc, "id" | "createdAt" | "updatedAt">;

export async function createEventExpense(input: EventExpenseInput): Promise<EventExpenseDoc> {
  const payload = stripUndefined({
    ...input,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  if (__DEV__) {
    console.log("[Firestore] createEventExpense", {
      path: `events/${input.eventId}/expenses`,
      payload,
    });
  }

  const ref = await addDoc(collection(db, "events", input.eventId, "expenses"), payload);
  return { id: ref.id, ...payload };
}

export function subscribeExpensesByEvent(
  eventId: string,
  onChange: (expenses: EventExpenseDoc[]) => void,
  onError?: (error: Error) => void
): () => void {
  const ref = collection(db, "events", eventId, "expenses");
  return onSnapshot(
    ref,
    (snap) => {
      const items = snap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<EventExpenseDoc, "id">),
      }));
      onChange(items.sort((a, b) => b.incurredDateISO.localeCompare(a.incurredDateISO)));
    },
    (error) => {
      if (onError) onError(error);
    }
  );
}

export async function updateEventExpenseDoc(
  eventId: string,
  expenseId: string,
  updates: Partial<EventExpenseDoc>
): Promise<void> {
  const ref = doc(db, "events", eventId, "expenses", expenseId);
  const payload: Record<string, unknown> = stripUndefined({
    ...updates,
    updatedAt: serverTimestamp(),
  });
  delete payload.id;
  delete payload.eventId;
  await updateDoc(ref, payload);
}

export async function deleteEventExpenseDoc(eventId: string, expenseId: string): Promise<void> {
  await deleteDoc(doc(db, "events", eventId, "expenses", expenseId));
}
