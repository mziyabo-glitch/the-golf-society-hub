// app/_layout.tsx
import { Stack, Redirect } from "expo-router";
import { BootstrapProvider, useBootstrap } from "@/lib/useBootstrap";
import { View, ActivityIndicator } from "react-native";

function RootNavigator() {
  const { user, loading } = useBootstrap();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const hasSociety = !!user?.activeSocietyId;

  return (
    <>
      {/* Gate the app to the correct tree */}
      {hasSociety ? <Redirect href="/(tabs)" /> : <Redirect href="/join" />}

      {/* Register routes (so navigation always works) */}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="join" />
        <Stack.Screen name="join-society" />
        <Stack.Screen name="create-society" />
        <Stack.Screen name="society" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}

export default function Layout() {
  return (
    <BootstrapProvider>
      <RootNavigator />
    </BootstrapProvider>
  );
}
