import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { ensureSignedIn, initActiveSocietyId } from "@/lib/firebase";

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function startup() {
      try {
        await ensureSignedIn();
        await initActiveSocietyId();
      } catch (e) {
        console.error("Startup error:", e);
      } finally {
        setIsReady(true);
      }
    }
    startup();
  }, []);

  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#004d40" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="society/index" />
      <Stack.Screen name="create-society" options={{ presentation: 'modal' }} />
      <Stack.Screen name="create-event" options={{ presentation: 'modal' }} />
      <Stack.Screen name="add-member" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
