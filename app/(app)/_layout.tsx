import { useRef } from "react";
import { Stack } from "expo-router";
import { View, StyleSheet } from "react-native";
import { useSocietyMembershipGuard } from "@/lib/access/useSocietyMembershipGuard";
import { LoadingState } from "@/components/ui/LoadingState";
import { getColors, spacing } from "@/lib/ui/theme";

export default function AppLayout() {
  console.log("APP_LAYOUT_TOP");
  const { loading, isMember, redirecting } = useSocietyMembershipGuard();
  console.log("APP_LAYOUT_AFTER_HOOK_1");
  const colors = getColors();
  const hasRenderedStack = useRef(false);
  if (isMember || !loading) hasRenderedStack.current = true;
  const showOverlay = (loading && !hasRenderedStack.current) || redirecting;
  console.log("APP_LAYOUT_AFTER_HOOK_2");

  // FIX React #310: Always render the Stack so expo-router can match child routes.
  // Overlay loading/redirecting on top (matches root _layout.tsx pattern).
  // Previously we returned early with a spinner, which unmounted the Stack and
  // caused hook count mismatch when the Stack remounted.
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack screenOptions={{ headerShown: false }} />
      {showOverlay && (
        <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: colors.background }]}>
          <LoadingState message="Loading..." />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
  },
});
