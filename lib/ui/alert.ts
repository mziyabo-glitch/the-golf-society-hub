import { Alert, Platform } from "react-native";

/**
 * Cross-platform destructive-confirmation dialog.
 * Uses window.confirm on web, Alert.alert on native.
 */
export function confirmDestructive(
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void | Promise<void>,
): void {
  if (Platform.OS === "web") {
    if (window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
  } else {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      { text: confirmLabel, style: "destructive", onPress: () => onConfirm() },
    ]);
  }
}

/**
 * Cross-platform info/error alert (single OK button).
 * Uses window.alert on web, Alert.alert on native.
 */
export function showAlert(title: string, message?: string): void {
  if (Platform.OS === "web") {
    window.alert(message ? `${title}\n\n${message}` : title);
  } else {
    Alert.alert(title, message);
  }
}
