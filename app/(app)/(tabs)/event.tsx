import { View, StyleSheet } from "react-native";
import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { SecondaryButton } from "@/components/ui/Button";
import { useRouter } from "expo-router";

export default function EventTabScreen() {
  const router = useRouter();

  return (
    <Screen>
      <View style={styles.container}>
        <AppText variant="title">Events</AppText>
        <AppText>Select or create an event</AppText>

        <SecondaryButton onPress={() => router.push("/(app)/create-event")}>
          Create Event
        </SecondaryButton>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 12,
  },
});
