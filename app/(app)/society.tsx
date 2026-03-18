import { View, StyleSheet } from "react-native";
import { useRouter } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { SecondaryButton } from "@/components/ui/Button";
import { AppText } from "@/components/ui/AppText";

export default function SocietyDashboardScreen() {
  const router = useRouter();

  // TEMP until roles are wired properly
  const isManCo = true;

  return (
    <Screen>
      <View style={styles.container}>
        <AppText variant="title">Society</AppText>

        {isManCo && (
          <>
            <SectionHeader title="ManCo Tools" />

            <View style={styles.stack}>
              <SecondaryButton onPress={() => router.push("/(app)/(tabs)/members")}>
                Members
              </SecondaryButton>

              <SecondaryButton onPress={() => router.push("/(app)/(tabs)/leaderboard")}>
                Leaderboard
              </SecondaryButton>

              <SecondaryButton onPress={() => router.push("/(app)/(tabs)/settings")}>
                Settings
              </SecondaryButton>
            </View>
          </>
        )}

        <SectionHeader title="General" />
        <SecondaryButton onPress={() => router.push("/(app)/(tabs)")}>
          Home
        </SecondaryButton>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 16,
  },
  stack: {
    gap: 12,
  },
});
