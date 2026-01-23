import { View, StyleSheet } from "react-native";
import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";

export default function EventIndexScreen() {
  return (
    <Screen>
      <View style={styles.container}>
        <AppText variant="title">Event</AppText>
        <AppText>Select an event from the Events list.</AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
});
