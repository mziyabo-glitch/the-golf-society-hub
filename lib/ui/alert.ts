import { Alert, Platform } from "react-native";

/**
 * Cross-platform destructive-confirmation dialog.
 * Uses window.confirm on web, Alert.alert on native.
 */
function webConfirm(message: string): boolean {
  return (
    typeof globalThis !== "undefined" &&
    typeof (globalThis as unknown as { confirm?: (m: string) => boolean }).confirm === "function" &&
    (globalThis as unknown as { confirm: (m: string) => boolean }).confirm(message)
  );
}

/**
 * Cross-platform OK/Cancel (non-destructive). Web uses `confirm` because `Alert.alert` is often invisible there.
 */
export function confirmAction(
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void | Promise<void>,
): void {
  const run = () => {
    void Promise.resolve(onConfirm());
  };
  if (Platform.OS === "web") {
    if (webConfirm(`${title}\n\n${message}`)) run();
  } else {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      { text: confirmLabel, onPress: run },
    ]);
  }
}

export function confirmDestructive(
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void | Promise<void>,
): void {
  if (Platform.OS === "web") {
    if (webConfirm(`${title}\n\n${message}`)) {
      void Promise.resolve(onConfirm());
    }
  } else {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      { text: confirmLabel, style: "destructive", onPress: () => void Promise.resolve(onConfirm()) },
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
