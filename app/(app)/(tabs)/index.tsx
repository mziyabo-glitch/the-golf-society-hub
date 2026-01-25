import { StyleSheet, View } from "react-native";
import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";

export default function ScreenComponent() {
  return (
    <Screen>
      <View style={styles.container}>
        <AppText variant="title">Welcome</AppText>
        <AppText style={styles.sub}>Home</AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10 },
  sub: { opacity: 0.8, lineHeight: 20 },
});
