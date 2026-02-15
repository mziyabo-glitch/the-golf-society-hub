import { StyleSheet, Text, View } from "react-native";

export default function IndexHelloScreen() {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Hello</Text>
      <Text style={styles.subtitle}>Expo Router is rendering.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    backgroundColor: "#ffffff",
  },
  title: {
    fontSize: 30,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: "#475569",
  },
});

