/**
 * Permission guards for write operations
 * Prevents unauthorized actions with user-friendly alerts
 */

import { Alert, Platform } from "react-native";

// ============================================================================
// CROSS-PLATFORM ALERT
// React Native's Alert.alert does NOT work on web
// ============================================================================

type AlertButton = {
  text: string;
  onPress?: () => void;
  style?: "default" | "cancel" | "destructive";
};

/**
 * Cross-platform alert that works on web and native
 * On web: uses window.confirm for simple dialogs
 * On native: uses React Native's Alert
 */
export function showAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[]
): void {
  if (Platform.OS === "web") {
    // On web, use browser dialogs
    const hasDestructive = buttons?.some(b => b.style === "destructive");
    const cancelButton = buttons?.find(b => b.style === "cancel");
    const confirmButton = buttons?.find(b => b.style === "destructive") || 
                          buttons?.find(b => b.style !== "cancel");
    
    if (hasDestructive || (buttons && buttons.length > 1)) {
      // Use confirm for destructive actions
      const confirmed = window.confirm(`${title}\n\n${message || ""}`);
      if (confirmed && confirmButton?.onPress) {
        confirmButton.onPress();
      } else if (!confirmed && cancelButton?.onPress) {
        cancelButton.onPress();
      }
    } else {
      // Simple alert
      window.alert(`${title}\n\n${message || ""}`);
      // Call the first button's onPress if it exists
      if (buttons && buttons.length > 0 && buttons[0].onPress) {
        buttons[0].onPress();
      }
    }
  } else {
    // On native, use React Native's Alert
    Alert.alert(title, message, buttons);
  }
}

/**
 * Cross-platform confirmation dialog
 * Returns a promise that resolves to true (confirmed) or false (cancelled)
 */
export function confirmAlert(
  title: string,
  message?: string,
  confirmText: string = "OK",
  cancelText: string = "Cancel"
): Promise<boolean> {
  return new Promise((resolve) => {
    if (Platform.OS === "web") {
      const confirmed = window.confirm(`${title}\n\n${message || ""}`);
      resolve(confirmed);
    } else {
      Alert.alert(
        title,
        message,
        [
          { text: cancelText, style: "cancel", onPress: () => resolve(false) },
          { text: confirmText, style: "destructive", onPress: () => resolve(true) },
        ]
      );
    }
  });
}

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














