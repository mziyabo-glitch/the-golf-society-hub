/**
 * Permission Denied Screen Component
 * 
 * Shows a friendly error screen when a user doesn't have access to a society
 * or when Firestore permission-denied errors occur.
 */

import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { router } from "expo-router";
import { spacing } from "@/lib/ui/theme";

interface PermissionDeniedScreenProps {
  /** The specific error message to display */
  message?: string;
  /** Error code for debugging */
  errorCode?: string;
  /** Whether to show "Ask your Captain" text */
  showContactCaptain?: boolean;
  /** Custom action button label */
  actionLabel?: string;
  /** Custom action to perform */
  onAction?: () => void;
}

export function PermissionDeniedScreen({ 
  message = "You don't have access to view this content.",
  errorCode,
  showContactCaptain = true,
  actionLabel = "Go Back",
  onAction,
}: PermissionDeniedScreenProps) {
  const handleAction = () => {
    if (onAction) {
      onAction();
    } else {
      router.back();
    }
  };
  
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.icon}>🔒</Text>
        <Text style={styles.title}>Access Denied</Text>
        <Text style={styles.message}>{message}</Text>
        
        {showContactCaptain && (
          <View style={styles.helpContainer}>
            <Text style={styles.helpText}>
              Ask your Captain to add you to the society or check your permissions.
            </Text>
          </View>
        )}
        
        {errorCode && __DEV__ && (
          <View style={styles.debugContainer}>
            <Text style={styles.debugLabel}>Error Code:</Text>
            <Text style={styles.debugValue}>{errorCode}</Text>
          </View>
        )}
        
        <View style={styles.buttonContainer}>
          <Pressable
            onPress={handleAction}
            style={styles.button}
          >
            <Text style={styles.buttonText}>{actionLabel}</Text>
          </Pressable>
          
          <Pressable
            onPress={() => {
              if (Platform.OS === "web" && typeof window !== "undefined") {
                window.location.href = "/";
              } else {
                router.replace("/");
              }
            }}
            style={[styles.button, styles.secondaryButton]}
          >
            <Text style={[styles.buttonText, styles.secondaryButtonText]}>
              Return to Home
            </Text>
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
    maxWidth: 360,
  },
  icon: {
    fontSize: 56,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: spacing.sm,
    textAlign: "center",
    color: "#dc2626",
  },
  message: {
    fontSize: 15,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: spacing.md,
    lineHeight: 22,
  },
  helpContainer: {
    backgroundColor: "#fef3c7",
    padding: spacing.md,
    borderRadius: 12,
    marginBottom: spacing.md,
    width: "100%",
  },
  helpText: {
    fontSize: 14,
    color: "#92400e",
    textAlign: "center",
    lineHeight: 20,
  },
  debugContainer: {
    backgroundColor: "#f3f4f6",
    padding: spacing.sm,
    borderRadius: 8,
    marginBottom: spacing.lg,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  debugLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
  },
  debugValue: {
    fontSize: 12,
    color: "#374151",
    fontFamily: Platform.OS === "web" ? "monospace" : undefined,
  },
  buttonContainer: {
    width: "100%",
    gap: spacing.sm,
  },
  button: {
    backgroundColor: "#0B6E4F",
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
