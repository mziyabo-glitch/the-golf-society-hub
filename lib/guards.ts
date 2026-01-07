/**
 * Permission guards for write operations
 * Prevents unauthorized actions with user-friendly alerts
 */

import { Alert } from "react-native";

/**
 * Guard a write operation with a permission check
 * @param permission - Boolean permission flag
 * @param message - Optional custom error message
 * @returns true if permission granted, false if denied
 */
export function guard(permission: boolean, message?: string): boolean {
  if (!permission) {
    Alert.alert(
      "Access Denied",
      message || "You don't have permission to perform this action.",
      [{ text: "OK" }]
    );
    return false;
  }
  return true;
}

/**
 * Guard with redirect callback
 * @param permission - Boolean permission flag
 * @param message - Optional custom error message
 * @param onDenied - Callback when permission denied (e.g., router.back())
 * @returns true if permission granted, false if denied
 */
export function guardWithRedirect(
  permission: boolean,
  message?: string,
  onDenied?: () => void
): boolean {
  if (!permission) {
    Alert.alert(
      "Access Denied",
      message || "You don't have permission to perform this action.",
      [
        {
          text: "OK",
          onPress: () => {
            if (onDenied) onDenied();
          },
        },
      ]
    );
    return false;
  }
  return true;
}

/**
 * Guard that throws an error (for use in try/catch blocks)
 * @param permission - Boolean permission flag
 * @param message - Optional custom error message
 * @throws Error if permission denied
 */
export function guardOrThrow(permission: boolean, message?: string): void {
  if (!permission) {
    throw new Error(message || "Permission denied");
  }
}

