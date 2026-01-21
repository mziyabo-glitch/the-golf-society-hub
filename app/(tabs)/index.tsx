import { useEffect } from "react";
import { useRouter } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { useBootstrap } from "@/lib/useBootstrap";

export default function Index() {
  const router = useRouter();
  const { isLoading, hasSociety, needsSociety } = useBootstrap();

  useEffect(() => {
    if (isLoading) return;

    if (needsSociety) {
      router.replace("/society");
    }

    if (hasSociety) {
      router.replace("/home");
    }
  }, [isLoading, hasSociety, needsSociety]);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <ActivityIndicator size="large" />
    </View>
  );
}
