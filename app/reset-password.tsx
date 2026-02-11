/**
 * Reset Password screen — handles the recovery link from Supabase.
 *
 * Flow:
 * 1. User clicks "Forgot password" → receives email with reset link
 * 2. Link opens: /reset-password#access_token=...&type=recovery
 * 3. Supabase client (detectSessionInUrl: true) processes the token
 * 4. onAuthStateChange fires PASSWORD_RECOVERY → user has a valid session
 * 5. This screen renders a "set new password" form
 * 6. Calls supabase.auth.updateUser({ password }) to apply the change
 */

import { useState } from "react";
import {
  StyleSheet,
  View,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { PrimaryButton } from "@/components/ui/Button";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { supabase } from "@/lib/supabase";
import { getColors, spacing } from "@/lib/ui/theme";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const colors = getColors();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const canSubmit = password.length >= 6 && password === confirmPassword;

  const handlePasswordChange = (text: string) => {
    setPassword(text);
    setError(null);
  };

  const handleConfirmChange = (text: string) => {
    setConfirmPassword(text);
    setError(null);
  };

  const handleSubmit = async () => {
    if (loading || !canSubmit) return;

    setLoading(true);
    setError(null);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        console.error("[ResetPassword] updateUser error:", {
          code: updateError.status,
          message: updateError.message,
        });
        setError(updateError.message);
        return;
      }

      console.log("[ResetPassword] Password updated successfully");
      setSuccess(true);
    } catch (e: any) {
      console.error("[ResetPassword] unexpected error:", e);
      setError(e?.message || "Failed to update password.");
    } finally {
      setLoading(false);
    }
  };

  // --- Success state ---
  if (success) {
    return (
      <Screen>
        <View style={styles.container}>
          <View style={styles.brandSection}>
            <View
              style={[
                styles.brandIcon,
                { backgroundColor: colors.success + "14" },
              ]}
            >
              <Feather name="check-circle" size={32} color={colors.success} />
            </View>
            <AppText variant="title" style={styles.brandTitle}>
              Password Updated
            </AppText>
            <AppText
              variant="body"
              color="secondary"
              style={styles.brandSubtitle}
            >
              Your password has been reset successfully. You can now sign in
              with your new password.
            </AppText>
          </View>

          <PrimaryButton onPress={() => router.replace("/")} style={styles.submitButton}>
            Continue
          </PrimaryButton>
        </View>
      </Screen>
    );
  }

  // --- Password form ---
  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.container}
      >
        <View style={styles.brandSection}>
          <View
            style={[
              styles.brandIcon,
              { backgroundColor: colors.primary + "14" },
            ]}
          >
            <Feather name="lock" size={32} color={colors.primary} />
          </View>
          <AppText variant="title" style={styles.brandTitle}>
            Set New Password
          </AppText>
          <AppText
            variant="body"
            color="secondary"
            style={styles.brandSubtitle}
          >
            Enter your new password below.
          </AppText>
        </View>

        <AppCard style={styles.formCard}>
          {error && (
            <InlineNotice variant="error" message={error} style={styles.notice} />
          )}

          <View style={styles.field}>
            <AppText variant="captionBold" style={styles.label}>
              New Password
            </AppText>
            <AppInput
              placeholder="Min 6 characters"
              value={password}
              onChangeText={handlePasswordChange}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="newPassword"
              autoComplete="new-password"
            />
          </View>

          <View style={styles.field}>
            <AppText variant="captionBold" style={styles.label}>
              Confirm Password
            </AppText>
            <AppInput
              placeholder="Re-enter password"
              value={confirmPassword}
              onChangeText={handleConfirmChange}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="newPassword"
              autoComplete="new-password"
            />
          </View>

          {password.length > 0 &&
            confirmPassword.length > 0 &&
            password !== confirmPassword && (
              <InlineNotice
                variant="error"
                message="Passwords do not match"
                style={styles.notice}
              />
            )}

          <PrimaryButton
            onPress={handleSubmit}
            loading={loading}
            disabled={!canSubmit || loading}
            style={styles.submitButton}
          >
            Update Password
          </PrimaryButton>
        </AppCard>
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
});
