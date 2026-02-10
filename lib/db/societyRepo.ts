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

export type SocietyDoc = {
  id: string;
  name: string;
  country: string;
  joinCode?: string;
  createdAt?: unknown;
  createdBy?: string;
  homeCourseId?: string | null;
  homeCourse?: string | null;
  scoringMode?: "Stableford" | "Strokeplay" | "Both";
  handicapRule?: "Allow WHS" | "Fixed HCP" | "No HCP";
  logoUrl?: string | null;
  adminPin?: string;
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

/**
 * Generate a unique, human-friendly join code
 * Format: 6 uppercase alphanumeric characters (no confusing chars like 0/O, 1/I/L)
 */
function generateJoinCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function createSociety(input: SocietyInput): Promise<SocietyDoc> {
  const joinCode = generateJoinCode();

  const payload = stripUndefined({
    name: input.name,
    country: input.country,
    createdBy: input.createdBy,
    joinCode,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    homeCourseId: input.homeCourseId ?? null,
    homeCourse: input.homeCourse?.trim() || null,
    scoringMode: input.scoringMode,
    handicapRule: input.handicapRule,
    logoUrl: input.logoUrl ?? null,
  });

  const ref = await addDoc(collection(getDb(), "societies"), payload);
  return { id: ref.id, ...payload, joinCode };
}

export async function getSocietyDoc(id: string): Promise<SocietyDoc | null> {
  const ref = doc(getDb(), "societies", id);
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
  const ref = doc(getDb(), "societies", id);
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
  const ref = doc(getDb(), "societies", id);
  const payload: Record<string, unknown> = { ...updates, updatedAt: serverTimestamp() };
  delete payload.id;
  for (const k of Object.keys(payload)) {
    if (payload[k] === undefined) delete payload[k];
  }
  await updateDoc(ref, payload);
}

/**
 * Find a society by its join code.
 * Returns the society doc if found, null if not found.
 */
export async function findSocietyByJoinCode(joinCode: string): Promise<SocietyDoc | null> {
  const normalizedCode = joinCode.trim().toUpperCase();
  if (!normalizedCode || normalizedCode.length < 4) {
    return null;
  }

  const q = query(
    collection(getDb(), "societies"),
    where("joinCode", "==", normalizedCode)
  );

  const snap = await getDocs(q);
  if (snap.empty) {
    return null;
  }

  const docSnap = snap.docs[0];
  return { id: docSnap.id, ...(docSnap.data() as Omit<SocietyDoc, "id">) };
}

/**
 * Regenerate join code for a society (Captain only)
 */
export async function regenerateJoinCode(societyId: string): Promise<string> {
  const newCode = generateJoinCode();
  await updateSocietyDoc(societyId, { joinCode: newCode });
  return newCode;
}
