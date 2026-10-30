/**
 * Native status bar, root background, and Android system chrome for edge-to-edge builds.
 * Web/PWA uses index.html + manifest; this runs only on iOS/Android.
 */

import { useEffect } from "react";
import { Platform } from "react-native";
import * as SystemUI from "expo-system-ui";
import { StatusBar } from "expo-status-bar";

import { useTheme } from "@/lib/ui/themeContext";
import { getColors } from "@/lib/ui/theme";

export function NativeAppChrome() {
  const { ready } = useTheme();
  const colors = getColors();

  useEffect(() => {
    if (Platform.OS === "web" || !ready) return;
    void SystemUI.setBackgroundColorAsync(colors.background);
  }, [ready, colors.background]);

  if (Platform.OS === "web") return null;

  return (
    <StatusBar
      style="dark"
      backgroundColor={colors.background}
      translucent={Platform.OS === "android"}
    />
  );
}
