import { addDoc, collection, doc, getDoc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";

import { db } from "@/lib/firebase";
import { stripUndefined } from "@/lib/db/sanitize";

export type SocietyDoc = {
  id: string;
  name: string;
  country: string;
  createdAt?: unknown;
  createdBy?: string;
  homeCourseId?: string | null;
  homeCourse?: string | null;
  scoringMode?: "Stableford" | "Strokeplay" | "Both";
  handicapRule?: "Allow WHS" | "Fixed HCP" | "No HCP";
  logoUrl?: string | null;
  annualFee?: number;
  updatedAt?: unknown;
};

type SocietyInput = {
  name: string;
  country: string;
  createdBy: string;
  homeCourseId?: string | null;
  homeCourse?: string;
  scoringMode?: "Stableford" | "Strokeplay" | "Both";
  handicapRule?: "Allow WHS" | "Fixed HCP" | "No HCP";
  logoUrl?: string | null;
};

export async function createSociety(input: SocietyInput): Promise<SocietyDoc> {
  const payload = stripUndefined({
    name: input.name,
    country: input.country,
    createdBy: input.createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    homeCourseId: input.homeCourseId ?? null,
    homeCourse: input.homeCourse?.trim() || null,
    scoringMode: input.scoringMode,
    handicapRule: input.handicapRule,
    logoUrl: input.logoUrl ?? null,
  });

  const ref = await addDoc(collection(db, "societies"), payload);
  return { id: ref.id, ...payload };
}

export async function getSocietyDoc(id: string): Promise<SocietyDoc | null> {
  const ref = doc(db, "societies", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    return null;
  }
  return { id: snap.id, ...(snap.data() as Omit<SocietyDoc, "id">) };
}

export function subscribeSocietyDoc(
  id: string,
  onChange: (society: SocietyDoc | null) => void,
  onError?: (error: Error) => void
): () => void {
  const ref = doc(db, "societies", id);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onChange(null);
        return;
      }
      onChange({ id: snap.id, ...(snap.data() as Omit<SocietyDoc, "id">) });
    },
    (error) => {
      if (onError) onError(error);
    }
  );
}

export async function updateSocietyDoc(id: string, updates: Partial<SocietyDoc>): Promise<void> {
  const ref = doc(db, "societies", id);
  const payload: Record<string, unknown> = { ...updates, updatedAt: serverTimestamp() };
  delete payload.id;
  for (const k of Object.keys(payload)) {
    if (payload[k] === undefined) delete payload[k];
  }
  await updateDoc(ref, payload);
}
