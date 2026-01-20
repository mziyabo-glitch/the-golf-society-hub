import { Stack } from "expo-router";
import { BootstrapProvider, useBootstrap } from "@/lib/useBootstrap";
import { View, ActivityIndicator } from "react-native";

function Gate({ children }: { children: React.ReactNode }) {
  const { loading } = useBootstrap();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <BootstrapProvider>
      <Gate>
        <Stack screenOptions={{ headerShown: false }} />
      </Gate>
    </BootstrapProvider>
  );
}
