import { View, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { PrimaryButton } from "@/components/ui/Button";

export default function EventTabScreen() {
  const router = useRouter();

  // No events yet → do not navigate
  const eventId: string | null = null;

  return (
    <Screen>
      <View style={styles.container}>
        <AppText variant="title">Events</AppText>
        <AppText>Select an event to view details.</AppText>

        <PrimaryButton
          disabled
          onPress={() => {
            if (!eventId) return;
            router.push(`/event/${eventId}`);
          }}
        >
          View Event
        </PrimaryButton>
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
