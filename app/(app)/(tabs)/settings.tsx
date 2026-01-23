// app/(tabs)/settings.tsx
import { useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";

import { Screen } from "@/components/ui/Screen";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";

import { useBootstrap } from "@/lib/useBootstrap";
import { canResetSociety } from "@/lib/permissions";

import { resetSocietyData } from "@/lib/db/resetSociety";
import { setActiveSociety, setActiveMember } from "@/lib/db/userRepo";

export default function SettingsTabScreen() {
  const { user, societyId, member, refresh } = useBootstrap();
  const [busy, setBusy] = useState(false);

  const allowReset = useMemo(() => canResetSociety(member), [member]);

  const handleResetSociety = () => {
    if (!user?.uid || !societyId) return;

    if (!allowReset) {
      Alert.alert("Reset Society", "Only Captain or Treasurer can do this.");
      return;
    }

    Alert.alert(
      "Reset Society",
      "This will delete the society and ALL its data (events, members, expenses, tee sheets). This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              // ✅ Cascade delete
              await resetSocietyData(societyId);

              // ✅ Clear user active links
              await setActiveSociety(user.uid, null);
              await setActiveMember(user.uid, null);

              // ✅ Refresh app state (if your hook supports it)
              await refresh?.();

              Alert.alert("Done", "Society has been reset.");
              router.replace("/(auth)/join");
            } catch (e: any) {
              console.error(e);
              Alert.alert(
                "Reset Society",
                e?.message ?? "Failed to reset society."
              );
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Screen>
      <SectionHeader title="Settings" />

      <ScrollView contentContainerStyle={styles.container}>
        <AppCard style={{ marginBottom: 12 }}>
          <View style={styles.row}>
            <Feather name="trash-2" size={18} />
            <View style={{ flex: 1 }}>
              <AppText style={styles.title}>Reset Society</AppText>
              <AppText style={styles.muted}>
                Captain/Treasurer only. Deletes society, members, events and
                expenses.
              </AppText>
            </View>
          </View>

          <PrimaryButton
            label={busy ? "Working..." : "Reset Society"}
            onPress={handleResetSociety}
            disabled={busy || !allowReset}
          />

          {!allowReset ? (
            <AppText style={styles.warn}>
              You don’t have permission to reset the society.
            </AppText>
          ) : null}
        </AppCard>

        <AppCard>
          <SecondaryButton label="Back" onPress={() => router.back()} />
        </AppCard>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 24,
    gap: 12,
  },
  row: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    marginBottom: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 2,
  },
  muted: {
    opacity: 0.7,
  },
  warn: {
    marginTop: 10,
    opacity: 0.75,
  },
});
