import { Platform } from "react-native";

/**
 * Prevent web a11y warnings when a focused control is moved into an
 * aria-hidden navigation container during route transitions.
 */
export function blurWebActiveElement(): void {
  if (Platform.OS !== "web" || typeof document === "undefined") return;

  const activeElement = document.activeElement as (HTMLElement & { blur?: () => void }) | null;
  if (!activeElement || activeElement === document.body) return;

  if (typeof activeElement.blur === "function") {
    activeElement.blur();
  }
}
