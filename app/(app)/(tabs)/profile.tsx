import { View, StyleSheet } from "react-native";
import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { SecondaryButton } from "@/components/ui/Button";
import { useRouter } from "expo-router";

export default function ProfileScreen() {
  const router = useRouter();

  return (
    <Screen>
      <View style={styles.container}>
        <AppText variant="title">Profile</AppText>
        <AppText style={styles.body}>Profile screen placeholder.</AppText>

        <SecondaryButton onPress={() => router.push("/(app)/settings")}>
          Settings
        </SecondaryButton>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  body: { opacity: 0.85 },
});
