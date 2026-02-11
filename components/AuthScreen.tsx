/**
 * AuthScreen — email / password sign-in and sign-up.
 * Rendered by the root layout when no session exists.
 * One-time sign-in: session is persisted by Supabase.
 */

import { useState } from "react";
import {
  StyleSheet,
  View,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from "react-native";
import { Feather } from "@expo/vector-icons";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { PrimaryButton } from "@/components/ui/Button";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { signInWithEmail, signUpWithEmail } from "@/lib/auth_supabase";
import { getColors, spacing, radius } from "@/lib/ui/theme";

type Mode = "signIn" | "signUp";

export function AuthScreen() {
  const colors = getColors();

  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isSignIn = mode === "signIn";
  const canSubmit = email.trim().length > 0 && password.length >= 6;

  const handleSubmit = async () => {
    if (!canSubmit || loading) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (isSignIn) {
        await signInWithEmail(email, password);
        // Session is set — onAuthStateChange in useBootstrap will re-bootstrap.
      } else {
        const { needsConfirmation } = await signUpWithEmail(email, password);
        if (needsConfirmation) {
          setSuccess("Check your email to confirm your account, then sign in.");
          setMode("signIn");
        }
        // If no confirmation needed, session is set and bootstrap re-runs.
      }
    } catch (e: any) {
      setError(e?.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setMode(isSignIn ? "signUp" : "signIn");
    setError(null);
    setSuccess(null);
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.container}
      >
        {/* Branding */}
        <View style={styles.brandSection}>
          <View style={[styles.brandIcon, { backgroundColor: colors.primary + "14" }]}>
            <Feather name="flag" size={36} color={colors.primary} />
          </View>
          <AppText variant="title" style={styles.brandTitle}>
            Golf Society Hub
          </AppText>
          <AppText variant="body" color="secondary" style={styles.brandSubtitle}>
            {isSignIn
              ? "Sign in to continue"
              : "Create your account"}
          </AppText>
        </View>

        {/* Form */}
        <AppCard style={styles.formCard}>
          {error && (
            <InlineNotice
              variant="error"
              message={error}
              style={styles.notice}
            />
          )}

          {success && (
            <InlineNotice
              variant="success"
              message={success}
              style={styles.notice}
            />
          )}

          <View style={styles.field}>
            <AppText variant="captionBold" style={styles.label}>Email</AppText>
            <AppInput
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
            />
          </View>

          <View style={styles.field}>
            <AppText variant="captionBold" style={styles.label}>Password</AppText>
            <AppInput
              placeholder={isSignIn ? "Your password" : "Min 6 characters"}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              textContentType={isSignIn ? "password" : "newPassword"}
              autoComplete={isSignIn ? "current-password" : "new-password"}
            />
          </View>

          <PrimaryButton
            onPress={handleSubmit}
            loading={loading}
            disabled={!canSubmit || loading}
            style={styles.submitButton}
          >
            {isSignIn ? "Sign In" : "Create Account"}
          </PrimaryButton>
        </AppCard>

        {/* Toggle sign-in / sign-up */}
        <Pressable onPress={toggleMode} style={styles.toggleRow} hitSlop={8}>
          <AppText variant="body" color="secondary">
            {isSignIn ? "Don't have an account? " : "Already have an account? "}
          </AppText>
          <AppText variant="bodyBold" color="primary">
            {isSignIn ? "Sign Up" : "Sign In"}
          </AppText>
        </Pressable>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
  },
  brandSection: {
    alignItems: "center",
    marginBottom: spacing.xl,
  },
  brandIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  brandTitle: {
    textAlign: "center",
    marginBottom: spacing.xs,
  },
  brandSubtitle: {
    textAlign: "center",
  },
  formCard: {
    width: "100%",
  },
  notice: {
    marginBottom: spacing.base,
  },
  field: {
    marginBottom: spacing.base,
  },
  label: {
    marginBottom: spacing.xs,
  },
  submitButton: {
    marginTop: spacing.sm,
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
  },
});
