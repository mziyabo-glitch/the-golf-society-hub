import { useEffect } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

type ErrorScreenProps = {
  error?: Error;
  retry?: () => void;
};

export default function GlobalErrorScreen({ error, retry }: ErrorScreenProps) {
  const message = error?.message || "Unknown render error";
  const stack = error?.stack || "No stack trace available.";

  useEffect(() => {
    console.error("[app/+error] App crashed while rendering:", error);
  }, [error]);

  return (
    <View style={styles.root}>
      <Text style={styles.title}>App crashed while rendering</Text>
      <Text selectable style={styles.message}>
        {message}
      </Text>
      <ScrollView
        style={styles.stackContainer}
        contentContainerStyle={styles.stackContent}
      >
        <Text selectable style={styles.stackText}>
          {stack}
        </Text>
      </ScrollView>
      {retry ? (
        <Pressable onPress={retry} style={styles.retryButton}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0f172a",
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  title: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 12,
  },
  message: {
    color: "#fca5a5",
    fontSize: 15,
    marginBottom: 12,
  },
  stackContainer: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#334155",
    borderRadius: 8,
    backgroundColor: "#020617",
  },
  stackContent: {
    padding: 12,
  },
  stackText: {
    color: "#e2e8f0",
    fontFamily: "monospace",
    fontSize: 12,
    lineHeight: 18,
  },
  retryButton: {
    marginTop: 12,
    backgroundColor: "#1d4ed8",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  retryText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 15,
  },
});

