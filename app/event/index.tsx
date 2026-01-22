// app/event/index.tsx
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { PrimaryButton } from "@/components/ui/Button";

/**
 * This app has a dynamic event route at: /event/[id]
 * Some navigation paths (tabs / buttons) reference /event,
 * so we provide an index route to avoid "No route named 'event'" warnings
 * and to prevent bundling/import errors.
 */
export default function EventIndexScreen() {
  return (
    <Screen>
      <View style={styles.container}>
        <AppText style={styles.title}>Event</AppText>
        <AppText style={styles.body}>
          Select an event from History to view details and the event P&amp;L.
        </AppText>

        <View style={{ height: 12 }} />

        <PrimaryButton
          label="Go to History"
          onPress={() => router.push("/history")}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 6,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
  },
  body: {
    opacity: 0.85,
    lineHeight: 20,
  },
});
