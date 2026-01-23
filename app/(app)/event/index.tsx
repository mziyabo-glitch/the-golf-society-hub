import { View, StyleSheet } from "react-native";
import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";

export default function EventIndexScreen() {
  return (
    <Screen>
      <View style={styles.container}>
        <AppText variant="title">Events</AppText>
        <AppText>This is the /event index route.</AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
});
