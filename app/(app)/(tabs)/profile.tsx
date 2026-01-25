// app/(app)/(tabs)/profile.tsx
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { SecondaryButton } from "@/components/ui/Button";

export default function ProfileTab() {
  return (
    <Screen>
      <View style={styles.container}>
        <AppText variant="title">Profile</AppText>
        <AppText>
          This is your profile tab. If you want, we can show user details + active society here.
        </AppText>

        <SecondaryButton onPress={() => router.push("/settings")}>
          Open Settings
        </SecondaryButton>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
});
