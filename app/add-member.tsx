import { View, StyleSheet } from "react-native";
import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";

/**
 * Static-export safe screen.
 * Keep it simple: no firebase reads at module scope, no window access at module scope.
 * You can wire it back into Firestore once export is stable.
 */
export default function AddMemberScreen() {
  return (
    <Screen>
      <View style={styles.container}>
        <AppText variant="title">Add Member</AppText>
        <AppText>This route is now export-safe. Wire up Firestore after the build is green.</AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
});
