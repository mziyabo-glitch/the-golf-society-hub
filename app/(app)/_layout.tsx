import { Stack } from "expo-router";
import { View } from "react-native";
import { useSocietyMembershipGuard } from "@/lib/access/useSocietyMembershipGuard";
import { LoadingState } from "@/components/ui/LoadingState";
import { getColors } from "@/lib/ui/theme";

export default function AppLayout() {
  const { loading, isMember, redirecting } = useSocietyMembershipGuard();
  const colors = getColors();

  // While bootstrap is loading or we're mid-redirect, show a spinner
  // instead of briefly flashing society screens the user shouldn't see.
  if (loading || redirecting || !isMember) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background }}>
        <LoadingState message="Loading..." />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
