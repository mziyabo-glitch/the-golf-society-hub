import { View, StyleSheet } from "react-native";
import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";

export default function ExploreScreen() {
  return (
    <Screen>
      <View style={styles.container}>
        <AppText variant="title">Explore</AppText>
        <AppText>Explore screen placeholder. Content to be implemented.</AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
});
