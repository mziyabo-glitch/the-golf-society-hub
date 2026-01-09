/**
 * No Society Guard Component
 * 
 * Shows a friendly message when no society is selected
 * and provides navigation to society selection.
 */

import { View, Text, Pressable, StyleSheet } from "react-native";
import { router } from "expo-router";
import { getColors, spacing } from "@/lib/ui/theme";

interface NoSocietyGuardProps {
  message?: string;
  showCreateButton?: boolean;
}

export function NoSocietyGuard({ 
  message = "Please select or create a society to continue.",
  showCreateButton = true,
}: NoSocietyGuardProps) {
  const colors = getColors();
  
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.icon}>🏌️</Text>
        <Text style={styles.title}>No Society Selected</Text>
        <Text style={styles.message}>{message}</Text>
        
        <View style={styles.buttonContainer}>
          {showCreateButton && (
            <Pressable
              onPress={() => router.push("/create-society")}
              style={[styles.button, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.buttonText}>Create Society</Text>
            </Pressable>
          )}
          
          <Pressable
            onPress={() => router.back()}
            style={[styles.button, styles.secondaryButton]}
          >
            <Text style={[styles.buttonText, styles.secondaryButtonText]}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  content: {
    alignItems: "center",
    maxWidth: 320,
  },
  icon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: spacing.sm,
    textAlign: "center",
    color: "#111827",
  },
  message: {
    fontSize: 15,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  buttonContainer: {
    width: "100%",
    gap: spacing.sm,
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: "center",
    width: "100%",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    backgroundColor: "#f3f4f6",
  },
  secondaryButtonText: {
    color: "#374151",
  },
});
