import { useRef } from "react";
import { Stack, useRouter } from "expo-router";
import { View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSocietyMembershipGuard } from "@/lib/access/useSocietyMembershipGuard";
import { LoadingState } from "@/components/ui/LoadingState";
import { AppText } from "@/components/ui/AppText";
import { PrimaryButton } from "@/components/ui/Button";
import { getColors, spacing } from "@/lib/ui/theme";

export default function AppLayout() {
  const { loading, isMember, redirecting } = useSocietyMembershipGuard();
  const colors = getColors();
  const router = useRouter();

  // Track whether the Stack has been rendered at least once.
  // Once rendered, keep it mounted even during bootstrap refreshes
  // so that navigation state (e.g. Billing screen) is preserved.
  const hasRenderedStack = useRef(false);
  if (isMember) hasRenderedStack.current = true;

  // First-time bootstrap: show spinner until we know membership.
  if (loading && !hasRenderedStack.current) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <LoadingState message="Loading..." />
      </View>
    );
  }

  // Guard is actively clearing a stale pointer and redirecting.
  if (redirecting) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <LoadingState message="Redirecting..." />
      </View>
    );
  }

  // Not a member (and not just a mid-session refresh) — show empty state.
  if (!isMember && !hasRenderedStack.current) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <View style={[styles.iconCircle, { backgroundColor: colors.primary + "14" }]}>
          <Feather name="users" size={32} color={colors.primary} />
        </View>
        <AppText variant="h2" style={styles.title}>
          Join a society to continue
        </AppText>
        <AppText variant="body" color="secondary" style={styles.subtitle}>
          You need to be a member of a golf society to use the app.
        </AppText>
        <PrimaryButton onPress={() => router.replace("/onboarding")} style={styles.cta}>
          Join or Create a Society
        </PrimaryButton>
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  title: {
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  subtitle: {
    textAlign: "center",
    marginBottom: spacing.xl,
  },
  cta: {
    minWidth: 220,
  },
});
