import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

import { getDb } from "@/lib/firebase";
import { stripUndefined } from "@/lib/db/sanitize";

export type EventDoc = {
  id: string;
  societyId: string;
  name: string;
  date: string;
  createdAt?: unknown;
  createdBy?: string;
  status?: string;
  courseId?: string;
  courseName?: string;
  maleTeeSetId?: string;
  femaleTeeSetId?: string;
  handicapAllowancePct?: number;
  handicapAllowance?: 0.9 | 1.0;
  format?: "Stableford" | "Strokeplay" | "Both";
  playerIds?: string[];
  teeSheet?: {
    startTimeISO: string;
    intervalMins: number;
    groups: Array<{ timeISO: string; players: string[] }>;
  };
  isCompleted?: boolean;
  completedAt?: string;
  resultsStatus?: "draft" | "published";
  publishedAt?: string;
  resultsUpdatedAt?: string;
  isOOM?: boolean;
  winnerId?: string;
  winnerName?: string;
  handicapSnapshot?: Record<string, number>;
  playingHandicapSnapshot?: Record<string, number>;
  rsvps?: Record<string, "going" | "maybe" | "no" | "yes">;
  guests?: Array<{
    id: string;
    name: string;
    sex: "male" | "female";
    handicapIndex?: number;
    included: boolean;
  }>;
  teeSheetNotes?: string;
  nearestToPinHoles?: number[];
  longestDriveHoles?: number[];
  results?: {
    [memberId: string]: {
      grossScore: number;
      netScore?: number;
      stableford?: number;
      strokeplay?: number;
    };
  };
  eventFee?: number;
  payments?: Record<
    string,
    {
      paid: boolean;
      paidAtISO?: string;
      method?: "cash" | "bank" | "other";
    }
  >;
};

type CreateEventPayload = {
  name: string;
  date: string;
  createdBy: string;
  courseId?: string;
  courseName?: string;
  format?: "Stableford" | "Strokeplay" | "Both";
  isOOM?: boolean;
};

export async function createEvent(
  societyId: string,
  payload: CreateEventPayload
): Promise<EventDoc> {
  const data = stripUndefined({
    societyId,
    name: payload.name,
    date: payload.date,
    createdBy: payload.createdBy,
    createdAt: serverTimestamp(),
    status: "scheduled",
    courseId: payload.courseId,
    courseName: payload.courseName,
    format: payload.format,
    isOOM: payload.isOOM,
    isCompleted: false,
  });

  const ref = await addDoc(collection(getDb(), "events"), data);
  return { id: ref.id, ...data } as EventDoc;
}

export async function getEventDoc(id: string): Promise<EventDoc | null> {
  const ref = doc(getDb(), "events", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    return null;
  }
  return { id: snap.id, ...(snap.data() as Omit<EventDoc, "id">) };
}

export function subscribeEventDoc(
  id: string,
  onChange: (event: EventDoc | null) => void,
  onError?: (error: Error) => void
): () => void {
  const ref = doc(getDb(), "events", id);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onChange(null);
        return;
      }
      onChange({ id: snap.id, ...(snap.data() as Omit<EventDoc, "id">) });
    },
    (error) => {
      if (onError) onError(error);
    }
  );
}

export async function updateEventDoc(id: string, updates: Partial<EventDoc>): Promise<void> {
  const ref = doc(getDb(), "events", id);
  const payload: Record<string, unknown> = { ...updates };
  delete payload.id;
  for (const k of Object.keys(payload)) {
    if (payload[k] === undefined) delete payload[k];
  }
  await updateDoc(ref, payload);
}

export async function listEventsBySociety(societyId: string): Promise<EventDoc[]> {
  const q = query(collection(getDb(), "events"), where("societyId", "==", societyId));
  const snap = await getDocs(q);
  const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<EventDoc, "id">) }));
  return items.sort((a, b) => {
    const aTime = a.date ? new Date(a.date).getTime() : 0;
    const bTime = b.date ? new Date(b.date).getTime() : 0;
    return bTime - aTime;
  });
}

export function subscribeEventsBySociety(
  societyId: string,
  onChange: (events: EventDoc[]) => void,
  onError?: (error: Error) => void
): () => void {
  const q = query(collection(getDb(), "events"), where("societyId", "==", societyId));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<EventDoc, "id">) }));
      onChange(
        items.sort((a, b) => {
          const aTime = a.date ? new Date(a.date).getTime() : 0;
          const bTime = b.date ? new Date(b.date).getTime() : 0;
          return bTime - aTime;
        })
      );
    },
    (error) => {
      if (onError) onError(error);
    }
  );
}

/**
 * Convenience alias used by finance screens.
 * Fetches a single event doc by societyId + eventId.
 * (societyId is accepted for API symmetry but not needed for the lookup.)
 */
export async function getEvent(
  _societyId: string,
  eventId: string
): Promise<EventDoc | null> {
  return getEventDoc(eventId);
}

/**
 * Set the event fee amount.
 */
export async function setEventFee(
  _societyId: string,
  eventId: string,
  fee: number
): Promise<void> {
  await updateEventDoc(eventId, { eventFee: fee });
}

/**
 * Toggle a member's payment status on an event.
 */
export async function setEventPaymentStatus(
  _societyId: string,
  eventId: string,
  memberId: string,
  paid: boolean
): Promise<void> {
  const event = await getEventDoc(eventId);
  const payments = event?.payments ?? {};
  payments[memberId] = {
    ...payments[memberId],
    paid,
    ...(paid ? { paidAtISO: new Date().toISOString() } : {}),
  };
  await updateEventDoc(eventId, { payments });
}
