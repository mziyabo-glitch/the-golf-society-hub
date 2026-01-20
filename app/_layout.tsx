// app/_layout.tsx
import { Stack } from "expo-router";
import { BootstrapProvider, useBootstrap } from "@/lib/useBootstrap";
import { View, ActivityIndicator } from "react-native";

function RootNavigator() {
  const { user, loading } = useBootstrap();

  // ⛔ DO NOT ROUTE WHILE LOADING
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {!user?.activeSocietyId ? (
        <Stack.Screen name="join" />
      ) : (
        <Stack.Screen name="(tabs)" />
      )}
    </Stack>
  );
}

export default function Layout() {
  return (
    <BootstrapProvider>
      <RootNavigator />
    </BootstrapProvider>
  );
}
