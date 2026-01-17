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

import { db } from "@/lib/firebase";

export type EventDoc = {
  id: string;
  societyId: string;
  name: string;
  status?: string;
  date: string;
  courseId?: string;
  courseName?: string;
  maleTeeSetId?: string;
  femaleTeeSetId?: string;
  handicapAllowancePct?: number;
  createdAt?: unknown;
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

type EventInput = Omit<EventDoc, "id" | "createdAt">;

export async function createEvent(input: EventInput): Promise<EventDoc> {
  const payload = {
    ...input,
    status: input.status ?? "scheduled",
    createdAt: serverTimestamp(),
  };

  const ref = await addDoc(collection(db, "events"), payload);
  return { id: ref.id, ...payload };
}

export async function getEventDoc(id: string): Promise<EventDoc | null> {
  const ref = doc(db, "events", id);
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
  const ref = doc(db, "events", id);
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
  const ref = doc(db, "events", id);
  const payload: Record<string, unknown> = { ...updates };
  delete payload.id;
  for (const k of Object.keys(payload)) {
    if (payload[k] === undefined) delete payload[k];
  }
  await updateDoc(ref, payload);
}

export async function listEventsBySociety(societyId: string): Promise<EventDoc[]> {
  const q = query(collection(db, "events"), where("societyId", "==", societyId));
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
  const q = query(collection(db, "events"), where("societyId", "==", societyId));
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
