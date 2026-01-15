import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { ensureSignedIn, initActiveSocietyId } from "@/lib/firebase";
import { View, ActivityIndicator } from "react-native";

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // RUN ONCE ON APP START
    const startup = async () => {
      try {
        console.log("App Starting... checking auth");
        await ensureSignedIn();      // 1. Restore User
        await initActiveSocietyId(); // 2. Restore Society ID
        console.log("App Ready.");
      } catch (e) {
        console.error("Startup failed:", e);
      } finally {
        setReady(true);
      }
    };
    startup();
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' }}>
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
