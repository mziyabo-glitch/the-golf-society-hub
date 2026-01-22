// app/_layout.tsx
import { Stack, Redirect } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { BootstrapProvider, useBootstrap } from "@/lib/useBootstrap";

function Root() {
  const { user, loading, error } = useBootstrap();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, padding: 16, justifyContent: "center" }}>
        <View
          style={{
            padding: 16,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#ddd",
          }}
        >
          <View style={{ marginBottom: 8 }}>
            <View style={{ marginBottom: 8 }}>
              <View>
                <View>
                  {/* plain text, no dependency on your UI components */}
                </View>
              </View>
            </View>
          </View>
          <View>
            <View>
              <View>
                {/* plain text */}
              </View>
            </View>
          </View>

          {/* Using native Text avoids component import issues */}
          {/* eslint-disable-next-line react-native/no-inline-styles */}
          <View>
            {/* @ts-ignore */}
            <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 8 }}>
              App failed to load
            </Text>
            {/* @ts-ignore */}
            <Text style={{ opacity: 0.85 }}>{error}</Text>
          </View>
        </View>
      </View>
    );
  }

  const hasSociety = !!user?.activeSocietyId;
  return (
    <>
      {hasSociety ? <Redirect href="/(tabs)" /> : <Redirect href="/join" />}
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}

// Need Text import for the above:
import { Text } from "react-native";

export default function Layout() {
  return (
    <BootstrapProvider>
      <Root />
    </BootstrapProvider>
  );
}
