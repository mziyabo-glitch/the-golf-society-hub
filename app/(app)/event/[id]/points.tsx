/**
 * Event Points Screen
 */

import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import { View } from "react-native";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { SecondaryButton } from "@/components/ui/Button";

export default function EventPointsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();

  const eventId = useMemo(() => {
    const raw: any = (params as any)?.id;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [params]);

  return (
    <Screen>
      <SecondaryButton onPress={() => router.back()} size="sm">
        {"Back"}
      </SecondaryButton>

      <View style={{ marginTop: 16 }}>
        <AppText variant="h2">Points</AppText>
        <AppText style={{ marginTop: 8, opacity: 0.7 }}>
          Event ID: {eventId ?? "missing"}
        </AppText>
      </View>
    </Screen>
  );
}
