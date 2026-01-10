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
import { db, getActiveSocietyId, isFirebaseConfigured, logFirestoreOp, getCurrentUserUid } from "../firebase";
import { checkOperationReady, logDataSanity, handleFirestoreError, getFirestoreErrorCode } from "./errors";
import type { MemberData } from "../models";

// ============================================================================
// TYPES
// ============================================================================

export interface FirestoreMember {
  id: string;
  uid?: string; // Firebase Auth UID - links member to auth user
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
  const collectionPath = `societies/${effectiveSocietyId}/members`;
  
  // Pre-flight checks
  const readyError = checkOperationReady("listMembers");
  if (readyError) {
    console.error("[Members] Operation not ready:", readyError.message);
    return [];
  }

  if (!effectiveSocietyId) {
    console.error("[Members] No society ID provided or available");
    return [];
  }

  try {
    logFirestoreOp("read", collectionPath);
    
    const membersRef = collection(db, "societies", effectiveSocietyId, "members");
    const q = query(membersRef, orderBy("name", "asc"));
    const snapshot = await getDocs(q);

    const members: MemberData[] = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return mapFirestoreMember(docSnap.id, data);
    });

    // Dev mode sanity check
    logDataSanity("listMembers", {
      societyId: effectiveSocietyId,
      memberCount: members.length,
      path: collectionPath,
    });

    return members;
  } catch (error) {
    handleFirestoreError(error, "listMembers", collectionPath, false);
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
        // Detailed error logging for debugging permission issues
        const errorCode = getFirestoreErrorCode(error);
        const authUid = getCurrentUserUid();
        
        console.error("[Members] Subscription error:", {
          code: errorCode,
          message: error.message,
          societyId: effectiveSocietyId,
          authUid,
          hint: errorCode.includes("permission") 
            ? `Member doc should exist at societies/${effectiveSocietyId}/members/${authUid} with status='active'`
            : undefined,
        });
        
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
 * 
 * IMPORTANT: For new members, uses auth.uid as the document ID
 * This allows security rules to verify member identity via request.auth.uid
 * 
 * @param member - Member data to save
 * @param societyId - Society ID (uses active society if not provided)
 * @param useAuthUidAsId - If true and creating new member, use auth.uid as doc ID
 */
export async function upsertMember(
  member: MemberData,
  societyId?: string,
  useAuthUidAsId = false
): Promise<{ success: boolean; error?: string; memberId?: string }> {
  const effectiveSocietyId = societyId || getActiveSocietyId();
  const authUid = getCurrentUserUid();
  
  // For new members, prefer auth.uid as doc ID for security rule compatibility
  let memberId = member.id;
  if (!memberId) {
    memberId = useAuthUidAsId && authUid ? authUid : `member-${Date.now()}`;
  }
  
  const docPath = `societies/${effectiveSocietyId}/members/${memberId}`;
  
  // Pre-flight checks
  const readyError = checkOperationReady("upsertMember");
  if (readyError) {
    console.error("[Members] upsertMember failed:", readyError.message);
    return { success: false, error: readyError.message };
  }
  
  if (!effectiveSocietyId) {
    const error = "No society ID available";
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
    
    // Store uid for security rule compatibility
    // This links the member document to a Firebase Auth user
    if (authUid) {
      payload.uid = authUid;
    }

    // Check if this is a new member
    const existingDoc = await getDoc(memberRef);
    if (!existingDoc.exists()) {
      payload.createdAt = serverTimestamp();
    }

    logFirestoreOp("write", docPath, memberId, { name: member.name, uid: authUid });
    await setDoc(memberRef, payload, { merge: true });

    // Dev mode: log the document path written
    logDataSanity("upsertMember", {
      societyId: effectiveSocietyId,
      path: docPath,
    });

    return { success: true, memberId };
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
function mapFirestoreMember(id: string, data: Record<string, unknown>): MemberData & { uid?: string } {
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
    uid: data.uid as string | undefined,
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

/**
 * Get the current user's member record by their auth UID
 * Used to find the member associated with the current Firebase Auth user
 */
export async function getCurrentUserMember(societyId?: string): Promise<(MemberData & { uid?: string }) | null> {
  const authUid = getCurrentUserUid();
  if (!authUid) {
    console.log("[Members] No auth UID - user not signed in");
    return null;
  }
  
  // Try to get member document by auth UID (preferred - matches security rules)
  const memberByUid = await getMember(authUid, societyId);
  if (memberByUid) {
    return memberByUid;
  }
  
  // Fallback: search for member with matching uid field
  // This handles legacy members that weren't created with auth.uid as doc ID
  const effectiveSocietyId = societyId || getActiveSocietyId();
  if (!effectiveSocietyId) {
    return null;
  }
  
  try {
    const membersRef = collection(db, "societies", effectiveSocietyId, "members");
    const q = query(membersRef, orderBy("name", "asc"));
    const snapshot = await getDocs(q);
    
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      if (data.uid === authUid) {
        return mapFirestoreMember(docSnap.id, data);
      }
    }
    
    return null;
  } catch (error) {
    console.error("[Members] Error searching for member by uid:", error);
    return null;
  }
}

/**
 * Link an existing member to the current auth user
 * Updates the member document with the current user's UID
 */
export async function linkMemberToCurrentUser(
  memberId: string,
  societyId?: string
): Promise<{ success: boolean; error?: string }> {
  const effectiveSocietyId = societyId || getActiveSocietyId();
  const authUid = getCurrentUserUid();
  
  if (!authUid) {
    return { success: false, error: "Not signed in" };
  }
  
  if (!effectiveSocietyId) {
    return { success: false, error: "No society selected" };
  }
  
  try {
    const memberRef = doc(db, "societies", effectiveSocietyId, "members", memberId);
    await setDoc(memberRef, { uid: authUid, updatedAt: serverTimestamp() }, { merge: true });
    
    console.log("[Members] Linked member to auth user:", { memberId, authUid, societyId: effectiveSocietyId });
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[Members] Error linking member to auth user:", error);
    return { success: false, error: errorMessage };
  }
}
