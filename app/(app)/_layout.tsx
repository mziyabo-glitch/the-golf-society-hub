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

  // First-time bootstrap: show spinner until we know state.
  if (loading && !hasRenderedStack.current) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <LoadingState message="Loading..." />
      </View>
    );
  }

  // Guard is actively clearing a stale pointer.
  if (redirecting) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <LoadingState message="Loading..." />
      </View>
    );
  }

  // Render Stack for both Personal Mode (no society) and Society Mode.
  return <Stack screenOptions={{ headerShown: false }} />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
  },
});
