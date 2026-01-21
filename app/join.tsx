import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";

export default function JoinScreen() {
  const router = useRouter();

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 40 }}>
      <View style={{ alignItems: "center", marginBottom: 24 }}>
        <Text style={{ fontSize: 28, fontWeight: "800", marginBottom: 6 }}>
          No Society Found
        </Text>
        <Text style={{ opacity: 0.7 }}>Create a society to get started</Text>
      </View>

      <Pressable
        onPress={() => router.push("/create-society")}
        style={{
          backgroundColor: "#2F6F62",
          paddingVertical: 14,
          borderRadius: 14,
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>
          Create Society
        </Text>
      </Pressable>

      <Pressable
        onPress={() => router.push("/join-society")}
        style={{
          backgroundColor: "#0F172A",
          paddingVertical: 14,
          borderRadius: 14,
          alignItems: "center",
        }}
      >
        <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>
          Join Existing Society
        </Text>
      </Pressable>
    </ScrollView>
  );
}
