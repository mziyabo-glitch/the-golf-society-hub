/**
 * Keep the native splash visible until theme storage resolves (see ThemeProvider).
 * Web: preventAutoHideAsync is a no-op; first-frame theme uses sync localStorage peek instead.
 * Must load early — import this module before themed UI in `app/_layout.tsx`.
 */

import { Platform } from "react-native";
import * as SplashScreen from "expo-splash-screen";

if (Platform.OS !== "web") {
  void SplashScreen.preventAutoHideAsync();
}
