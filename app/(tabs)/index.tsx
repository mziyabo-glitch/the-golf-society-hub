import { useBootstrap } from "@/lib/useBootstrap";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

export default function HomeScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const { user, loading } = useBootstrap();

  useEffect(() => {
    if (loading) return;
    if (user?.activeSocietyId) {
      router.replace("/society");
      return;
    }
    setChecking(false);
  }, [loading, user?.activeSocietyId, router]);

  if (checking || loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#0B6E4F" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 24, justifyContent: "center" }}>
      <Text style={{ fontSize: 34, fontWeight: "800", marginBottom: 6 }}>
        The Golf Society Hub
      </Text>
      <Text style={{ fontSize: 16, opacity: 0.75, marginBottom: 28 }}>
        Everything Golf Society
      </Text>

      <Pressable
        onPress={() => router.push("/create-society")}
        style={{
          backgroundColor: "#0B6E4F",
          paddingVertical: 14,
          borderRadius: 14,
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>
          Create a Society
        </Text>
      </Pressable>

      <Pressable
        onPress={() => {}}
        style={{
          backgroundColor: "#111827",
          paddingVertical: 14,
          borderRadius: 14,
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>
          Join a Society
        </Text>
      </Pressable>

      <Pressable onPress={() => {}} style={{ paddingVertical: 12, alignItems: "center" }}>
        <Text style={{ fontSize: 16, fontWeight: "600", opacity: 0.8 }}>
          I already have an account
        </Text>
      </Pressable>
    </View>
  );
}
