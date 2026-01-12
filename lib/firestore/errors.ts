/**
 * Firestore Error Handling Utilities
 * 
 * Provides centralized error handling, logging, and user-friendly messages
 * for all Firestore operations.
 */

import { Alert } from "react-native";
import { isFirebaseConfigured, hasActiveSociety, getActiveSocietyId } from "../firebase";

// ============================================================================
// ERROR TYPES
// ============================================================================

export type FirestoreErrorCode =
  | "FIREBASE_NOT_CONFIGURED"
  | "NO_SOCIETY_SELECTED"
  | "PERMISSION_DENIED"
  | "NOT_FOUND"
  | "NETWORK_ERROR"
  | "QUOTA_EXCEEDED"
  | "UNKNOWN";

export interface FirestoreError {
  code: FirestoreErrorCode;
  message: string;
  operation: string;
  path?: string;
  originalError?: unknown;
}

// ============================================================================
// PRE-OPERATION GUARDS
// ============================================================================

/**
 * Check if Firebase is ready for operations
 * Returns an error object if not ready, null if OK
 */
export function checkFirebaseReady(operation: string): FirestoreError | null {
  if (!isFirebaseConfigured()) {
    return {
      code: "FIREBASE_NOT_CONFIGURED",
      message: "Firebase is not configured.",
      operation,
    };
  }
  return null;
}

/**
 * Check if a society is selected
 * Returns an error object if not selected, null if OK
 */
export function checkSocietySelected(operation: string): FirestoreError | null {
  if (!hasActiveSociety()) {
    return {
      code: "NO_SOCIETY_SELECTED",
      message: "No society selected. Please select or create a society first.",
      operation,
    };
  }
  return null;
}

/**
 * Full pre-operation check (Firebase configured + society selected)
 * Returns an error object if not ready, null if OK
 */
export function checkOperationReady(operation: string): FirestoreError | null {
  const firebaseError = checkFirebaseReady(operation);
  if (firebaseError) return firebaseError;
  
  const societyError = checkSocietySelected(operation);
  if (societyError) return societyError;
  
  return null;
}

// ============================================================================
// ERROR PARSING
// ============================================================================

/**
 * Parse a Firestore error into a user-friendly format
 */
export function parseFirestoreError(
  error: unknown,
  operation: string,
  path?: string
): FirestoreError {
  const originalError = error;
  let code: FirestoreErrorCode = "UNKNOWN";
  let message = "An unexpected error occurred";
  
  if (error instanceof Error) {
    message = error.message;
    
    // Parse Firebase error codes
    const errorString = error.message.toLowerCase();
    
    if (errorString.includes("permission-denied") || errorString.includes("permission denied")) {
      code = "PERMISSION_DENIED";
      message = "You don't have permission to perform this action.";
    } else if (errorString.includes("not-found") || errorString.includes("not found")) {
      code = "NOT_FOUND";
      message = "The requested data was not found.";
    } else if (errorString.includes("unavailable") || errorString.includes("network")) {
      code = "NETWORK_ERROR";
      message = "Network error. Please check your connection and try again.";
    } else if (errorString.includes("quota") || errorString.includes("resource-exhausted")) {
      code = "QUOTA_EXCEEDED";
      message = "Service limit reached. Please try again later.";
    }
  }
  
  return {
    code,
    message,
    operation,
    path,
    originalError,
  };
}

// ============================================================================
// ERROR LOGGING
// ============================================================================

/**
 * Log a Firestore error with full context
 */
export function logFirestoreError(error: FirestoreError): void {
  const societyId = getActiveSocietyId();
  
  console.error(
    `[Firestore Error] ${error.operation}`,
    {
      code: error.code,
      message: error.message,
      path: error.path,
      societyId,
      originalError: error.originalError,
    }
  );
}

// ============================================================================
// USER FEEDBACK
// ============================================================================

/**
 * Show a user-friendly error alert
 */
export function showFirestoreError(error: FirestoreError): void {
  const title = getErrorTitle(error.code);
  
  Alert.alert(title, error.message, [
    { text: "OK", style: "default" }
  ]);
}

/**
 * Check if an error is a permission denied error
 */
export function isPermissionDeniedError(error: FirestoreError | unknown): boolean {
  if (typeof error === "object" && error !== null && "code" in error) {
    const errObj = error as { code?: string };
    if (errObj.code === "PERMISSION_DENIED") return true;
    if (typeof errObj.code === "string" && errObj.code.includes("permission-denied")) return true;
  }
  
  if (error instanceof Error) {
    const errorString = error.message.toLowerCase();
    return errorString.includes("permission-denied") || errorString.includes("permission denied");
  }
  
  return false;
}

/**
 * Extract Firestore error code from error object
 */
export function getFirestoreErrorCode(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const errObj = error as { code?: string };
    if (errObj.code) {
      return errObj.code;
    }
  }
  if (error instanceof Error && error.message) {
    // Try to extract code from message like "FirebaseError: [code/subcode] message"
    const match = error.message.match(/\[([^\]]+)\]/);
    if (match) {
      return match[1];
    }
  }
  return "UNKNOWN";
}

/**
 * Get user-friendly message for permission denied errors
 */
export function getPermissionDeniedMessage(operation: string): string {
  switch (operation.toLowerCase()) {
    case "listmembers":
    case "getmembers":
    case "subscribemembers":
      return "You don't have access to view members in this society. Ask your Captain to add you.";
    case "upsertmember":
    case "savemember":
      return "You don't have permission to add or edit members. Only Captain, Secretary, or Admin can manage members.";
    case "deletemember":
      return "You don't have permission to remove members. Only Captain or Admin can remove members.";
    case "listevents":
    case "getevents":
      return "You don't have access to view events in this society. Ask your Captain to add you.";
    case "createevent":
    case "updateevent":
      return "You don't have permission to create or edit events. Only Captain, Admin, or Handicapper can manage events.";
    case "getsociety":
      return "You don't have access to this society. Ask your Captain to add you as a member.";
    case "getcourses":
    case "listcourses":
      return "You don't have access to view courses. Ask your Captain to add you to the society.";
    default:
      return "You don't have permission to perform this action. Ask your Captain to check your access.";
  }
}

/**
 * Show error and also log it
 * For permission denied errors, provides a more helpful message
 */
export function handleFirestoreError(
  error: unknown,
  operation: string,
  path?: string,
  showAlert = true
): FirestoreError {
  const parsed = parseFirestoreError(error, operation, path);
  
  // Extract detailed error code for debugging
  const detailedCode = getFirestoreErrorCode(error);
  
  // Log with detailed context for debugging
  console.error(`[Firestore] ${operation} failed:`, {
    code: parsed.code,
    detailedCode,
    message: parsed.message,
    path,
    societyId: getActiveSocietyId(),
    hint: parsed.code === "PERMISSION_DENIED" 
      ? "Check: 1) User is signed in, 2) Member doc exists with auth.uid as doc ID, 3) Member status is 'active'"
      : undefined,
  });
  
  // Also log the original error for full stack trace
  logFirestoreError(parsed);
  
  // Enhance permission denied messages
  if (parsed.code === "PERMISSION_DENIED") {
    parsed.message = getPermissionDeniedMessage(operation);
  }
  
  if (showAlert) {
    showFirestoreError(parsed);
  }
  
  return parsed;
}

function getErrorTitle(code: FirestoreErrorCode): string {
  switch (code) {
    case "FIREBASE_NOT_CONFIGURED":
      return "Configuration Error";
    case "NO_SOCIETY_SELECTED":
      return "No Society Selected";
    case "PERMISSION_DENIED":
      return "Access Denied";
    case "NOT_FOUND":
      return "Not Found";
    case "NETWORK_ERROR":
      return "Connection Error";
    case "QUOTA_EXCEEDED":
      return "Service Limit";
    default:
      return "Error";
  }
}

// ============================================================================
// WRAPPED OPERATIONS
// ============================================================================

/**
 * Wrap an async Firestore operation with error handling
 * Returns { success, data, error } object
 */
export async function safeFirestoreOp<T>(
  operation: string,
  path: string,
  fn: () => Promise<T>,
  showAlertOnError = true
): Promise<{ success: boolean; data?: T; error?: FirestoreError }> {
  // Pre-flight check
  const readyError = checkOperationReady(operation);
  if (readyError) {
    logFirestoreError(readyError);
    if (showAlertOnError) {
      showFirestoreError(readyError);
    }
    return { success: false, error: readyError };
  }
  
  try {
    const data = await fn();
    return { success: true, data };
  } catch (error) {
    const parsed = handleFirestoreError(error, operation, path, showAlertOnError);
    return { success: false, error: parsed };
  }
}

// ============================================================================
// DEV MODE SANITY CHECKS
// ============================================================================

/**
 * Log data sanity info in dev mode
 */
export function logDataSanity(
  screen: string,
  data: {
    societyId?: string | null;
    memberCount?: number;
    eventCount?: number;
    path?: string;
  }
): void {
  if (!__DEV__) return;
  
  console.log(
    `[DataSanity] ${screen}`,
    {
      societyId: data.societyId || "(none)",
      memberCount: data.memberCount,
      eventCount: data.eventCount,
      path: data.path,
    }
  );
}
