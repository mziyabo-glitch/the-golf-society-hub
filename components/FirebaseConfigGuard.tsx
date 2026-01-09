/**
 * Firebase Config Guard Component
 * 
 * Shows a friendly error screen when Firebase is not configured
 * with details about which environment variables are missing.
 */

import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { getFirebaseConfigStatus } from "@/lib/firebase";
import { spacing } from "@/lib/ui/theme";

interface FirebaseConfigGuardProps {
  children: React.ReactNode;
}

export function FirebaseConfigGuard({ children }: FirebaseConfigGuardProps) {
  const status = getFirebaseConfigStatus();
  
  // If configured, render children
  if (status.configured) {
    return <>{children}</>;
  }
  
  // Only show error screen in production or if explicitly using dummy config
  const isProduction = process.env.NODE_ENV === "production";
  if (!isProduction && !status.usingDummyConfig) {
    // In dev with partial config, still render but warn
    console.warn("[FirebaseConfigGuard] Firebase not fully configured:", status.missingVars);
    return <>{children}</>;
  }
  
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.icon}>🔧</Text>
        <Text style={styles.title}>Firebase Not Configured</Text>
        <Text style={styles.message}>
          This deployment is missing required Firebase environment variables.
        </Text>
        
        {status.missingVars.length > 0 && (
          <View style={styles.missingVarsContainer}>
            <Text style={styles.missingVarsTitle}>Missing variables:</Text>
            {status.missingVars.map((varName) => (
              <Text key={varName} style={styles.missingVar}>
                • {varName}
              </Text>
            ))}
          </View>
        )}
        
        <Text style={styles.helpText}>
          Please configure these variables in your Vercel project settings or .env file.
        </Text>
        
        <Pressable
          onPress={() => {
            if (Platform.OS === "web" && typeof window !== "undefined") {
              window.location.reload();
            }
          }}
          style={styles.button}
        >
          <Text style={styles.buttonText}>Reload</Text>
        </Pressable>
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
    maxWidth: 400,
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
    color: "#dc2626",
  },
  message: {
    fontSize: 15,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: spacing.md,
    lineHeight: 22,
  },
  missingVarsContainer: {
    backgroundColor: "#fef2f2",
    padding: spacing.md,
    borderRadius: 12,
    marginBottom: spacing.md,
    width: "100%",
  },
  missingVarsTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#991b1b",
    marginBottom: spacing.xs,
  },
  missingVar: {
    fontSize: 12,
    color: "#991b1b",
    fontFamily: Platform.OS === "web" ? "monospace" : undefined,
    marginBottom: 2,
  },
  helpText: {
    fontSize: 13,
    color: "#9ca3af",
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  button: {
    backgroundColor: "#0B6E4F",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
