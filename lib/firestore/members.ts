/**
 * Firestore Helpers for Members
 * 
 * FIRESTORE-ONLY: No AsyncStorage for members data.
 * 
 * Schema:
 * societies/{societyId}/members/{memberId}
 *   ├─ name: string (required, min 2 chars)
 *   ├─ handicap: number (optional, >= 0)
 *   ├─ sex: "male" | "female" (optional)
 *   ├─ status: "active" | "inactive" (default: "active")
 *   ├─ roles: string[] (e.g., ["member"], ["captain", "admin"])
 *   ├─ email: string (optional)
 *   ├─ paid: boolean (optional)
 *   ├─ amountPaid: number (optional)
 *   ├─ paidDate: string (optional)
 *   ├─ createdAt: Timestamp
 *   ├─ updatedAt: Timestamp
 */

import { 
  collection, 
  doc, 
  getDoc,
  getDocs, 
  setDoc, 
  deleteDoc, 
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  Unsubscribe,
} from "firebase/firestore";
import { db, getActiveSocietyId, isFirebaseConfigured } from "../firebase";
import type { MemberData } from "../models";

// ============================================================================
// TYPES
// ============================================================================

export interface FirestoreMember {
  id: string;
  name: string;
  handicap?: number;
  sex?: "male" | "female";
  status: "active" | "inactive";
  roles: string[];
  email?: string;
  paid?: boolean;
  amountPaid?: number;
  paidDate?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface MemberValidationResult {
  valid: boolean;
  errors: string[];
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate member data before saving
 */
export function validateMember(member: Partial<MemberData>): MemberValidationResult {
  const errors: string[] = [];

  // Name is required and must be at least 2 characters
  if (!member.name || member.name.trim().length < 2) {
    errors.push("Name is required and must be at least 2 characters");
  }

  // Handicap must be a number >= 0 if provided
  if (member.handicap !== undefined && member.handicap !== null) {
    if (typeof member.handicap !== "number" || member.handicap < 0) {
      errors.push("Handicap must be a number >= 0");
    }
  }

  // Roles must be an array of strings
  if (member.roles !== undefined) {
    if (!Array.isArray(member.roles)) {
      errors.push("Roles must be an array of strings");
    } else {
      const invalidRoles = member.roles.filter((r) => typeof r !== "string");
      if (invalidRoles.length > 0) {
        errors.push("All roles must be strings");
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// READ OPERATIONS
// ============================================================================

/**
 * List all members for a society (one-time fetch)
 * Returns members ordered by name
 */
export async function listMembers(societyId?: string): Promise<MemberData[]> {
  const effectiveSocietyId = societyId || getActiveSocietyId();
  
  if (!effectiveSocietyId) {
    console.error("[Members] No society ID provided or available");
    return [];
  }

  if (!isFirebaseConfigured()) {
    console.error("[Members] Firebase not configured");
    return [];
  }

  try {
    const membersRef = collection(db, "societies", effectiveSocietyId, "members");
    const q = query(membersRef, orderBy("name", "asc"));
    const snapshot = await getDocs(q);

    const members: MemberData[] = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return mapFirestoreMember(docSnap.id, data);
    });

    console.log(`[Members] Loaded ${members.length} members from Firestore`);
    return members;
  } catch (error) {
    console.error("[Members] Error listing members:", error, { societyId: effectiveSocietyId });
    throw error;
  }
}

/**
 * Get a single member by ID
 */
export async function getMember(memberId: string, societyId?: string): Promise<MemberData | null> {
  const effectiveSocietyId = societyId || getActiveSocietyId();
  
  if (!effectiveSocietyId) {
    console.error("[Members] No society ID provided or available");
    return null;
  }

  if (!isFirebaseConfigured()) {
    console.error("[Members] Firebase not configured");
    return null;
  }

  try {
    const memberRef = doc(db, "societies", effectiveSocietyId, "members", memberId);
    const snapshot = await getDoc(memberRef);

    if (!snapshot.exists()) {
      console.log(`[Members] Member not found: ${memberId}`);
      return null;
    }

    return mapFirestoreMember(snapshot.id, snapshot.data());
  } catch (error) {
    console.error("[Members] Error getting member:", error, { societyId: effectiveSocietyId, memberId });
    throw error;
  }
}

/**
 * Subscribe to members collection with real-time updates
 * Returns an unsubscribe function
 */
export function subscribeMembers(
  callback: (members: MemberData[]) => void,
  onError?: (error: Error) => void,
  societyId?: string
): Unsubscribe {
  const effectiveSocietyId = societyId || getActiveSocietyId();
  
  if (!effectiveSocietyId) {
    console.error("[Members] No society ID provided or available");
    if (onError) onError(new Error("No society ID available"));
    return () => {}; // Return no-op unsubscribe
  }

  if (!isFirebaseConfigured()) {
    console.error("[Members] Firebase not configured");
    if (onError) onError(new Error("Firebase not configured"));
    return () => {};
  }

  try {
    const membersRef = collection(db, "societies", effectiveSocietyId, "members");
    const q = query(membersRef, orderBy("name", "asc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const members: MemberData[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return mapFirestoreMember(docSnap.id, data);
        });
        console.log(`[Members] Real-time update: ${members.length} members`);
        callback(members);
      },
      (error) => {
        console.error("[Members] Subscription error:", error, { societyId: effectiveSocietyId });
        if (onError) onError(error);
      }
    );

    return unsubscribe;
  } catch (error) {
    console.error("[Members] Error setting up subscription:", error);
    if (onError) onError(error instanceof Error ? error : new Error(String(error)));
    return () => {};
  }
}

// ============================================================================
// WRITE OPERATIONS
// ============================================================================

/**
 * Create or update a member
 * Uses setDoc with merge:true for upsert behavior
 */
export async function upsertMember(
  member: MemberData,
  societyId?: string
): Promise<{ success: boolean; error?: string }> {
  const effectiveSocietyId = societyId || getActiveSocietyId();
  
  if (!effectiveSocietyId) {
    const error = "No society ID available";
    console.error("[Members] upsertMember failed:", error);
    return { success: false, error };
  }

  if (!isFirebaseConfigured()) {
    const error = "Firebase not configured";
    console.error("[Members] upsertMember failed:", error);
    return { success: false, error };
  }

  // Validate member data
  const validation = validateMember(member);
  if (!validation.valid) {
    const error = validation.errors.join("; ");
    console.error("[Members] Validation failed:", error);
    return { success: false, error };
  }

  // Generate ID if not provided
  const memberId = member.id || `member-${Date.now()}`;

  try {
    const memberRef = doc(db, "societies", effectiveSocietyId, "members", memberId);

    // Ensure roles is always an array of lowercase strings
    const roles = Array.isArray(member.roles)
      ? member.roles.map((r) => (typeof r === "string" ? r.toLowerCase() : "member"))
      : ["member"];

    const payload: Record<string, unknown> = {
      name: member.name.trim(),
      sex: member.sex || null,
      status: "active",
      roles,
      handicap: member.handicap ?? null,
      email: member.email || null,
      paid: member.paid ?? false,
      amountPaid: member.amountPaid ?? 0,
      paidDate: member.paidDate || null,
      updatedAt: serverTimestamp(),
    };

    // Check if this is a new member
    const existingDoc = await getDoc(memberRef);
    if (!existingDoc.exists()) {
      payload.createdAt = serverTimestamp();
    }

    await setDoc(memberRef, payload, { merge: true });

    console.log(`[Members] Saved member: ${memberId} (${member.name})`, {
      societyId: effectiveSocietyId,
    });

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[Members] Error saving member:", error, {
      societyId: effectiveSocietyId,
      memberId,
    });
    return { success: false, error: errorMessage };
  }
}

/**
 * Delete a member from Firestore
 */
export async function deleteMemberById(
  memberId: string,
  societyId?: string
): Promise<{ success: boolean; error?: string }> {
  const effectiveSocietyId = societyId || getActiveSocietyId();
  
  if (!effectiveSocietyId) {
    const error = "No society ID available";
    console.error("[Members] deleteMember failed:", error);
    return { success: false, error };
  }

  if (!isFirebaseConfigured()) {
    const error = "Firebase not configured";
    console.error("[Members] deleteMember failed:", error);
    return { success: false, error };
  }

  if (!memberId) {
    const error = "Member ID is required";
    console.error("[Members] deleteMember failed:", error);
    return { success: false, error };
  }

  try {
    const memberRef = doc(db, "societies", effectiveSocietyId, "members", memberId);
    await deleteDoc(memberRef);

    console.log(`[Members] Deleted member: ${memberId}`, {
      societyId: effectiveSocietyId,
    });

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[Members] Error deleting member:", error, {
      societyId: effectiveSocietyId,
      memberId,
    });
    return { success: false, error: errorMessage };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Map Firestore document data to MemberData type
 */
function mapFirestoreMember(id: string, data: Record<string, unknown>): MemberData {
  // Ensure roles is always an array
  let roles: string[];
  if (Array.isArray(data.roles)) {
    roles = data.roles.map((r) => (typeof r === "string" ? r.toLowerCase() : "member"));
  } else if (typeof data.roles === "string") {
    // Handle legacy string format (e.g., "captain,admin")
    roles = data.roles.split(",").map((r) => r.trim().toLowerCase()).filter(Boolean);
  } else {
    roles = ["member"];
  }

  return {
    id,
    name: (data.name as string) || "Unknown",
    email: data.email as string | undefined,
    handicap: data.handicap as number | undefined,
    sex: (data.sex as "male" | "female") || undefined,
    roles,
    paid: data.paid as boolean | undefined,
    amountPaid: data.amountPaid as number | undefined,
    paidDate: data.paidDate as string | undefined,
  };
}
