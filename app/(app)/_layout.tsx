import { useRef } from "react";
import { Stack } from "expo-router";
import { View, StyleSheet } from "react-native";
import { useSocietyMembershipGuard } from "@/lib/access/useSocietyMembershipGuard";
import { LoadingState } from "@/components/ui/LoadingState";
import { getColors, spacing } from "@/lib/ui/theme";

export default function AppLayout() {
  const { loading, isMember, redirecting } = useSocietyMembershipGuard();
  const colors = getColors();

  // Track whether the Stack has been rendered at least once.
  // Once rendered, keep it mounted even during bootstrap refreshes
  // so that navigation state (e.g. Billing screen) is preserved.
  const hasRenderedStack = useRef(false);
  if (isMember || !loading) hasRenderedStack.current = true;

  const showOverlay = (loading && !hasRenderedStack.current) || redirecting;

  // Always render Stack so expo-router can match child routes; overlay loading when needed.
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
