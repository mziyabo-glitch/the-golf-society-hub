/**
 * Reset Password screen — PUBLIC route (no auth required).
 *
 * Flow:
 * 1. User clicks password-reset link in email
 * 2. Supabase redirects to /reset-password#access_token=...&refresh_token=...&type=recovery
 * 3. This screen parses the hash tokens and calls setSession()
 * 4. User enters a new password
 * 5. Calls supabase.auth.updateUser({ password })
 */

import { useState, useEffect } from "react";
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
import { LoadingState } from "@/components/ui/LoadingState";
import { supabase } from "@/lib/supabase";
import { getColors, spacing } from "@/lib/ui/theme";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const colors = getColors();

  // Token exchange state
  const [ready, setReady] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  // Form state
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // --- Step 1: Parse tokens from URL hash and establish session ---
  useEffect(() => {
    async function exchangeToken() {
      try {
        // Hash fragment: #access_token=xxx&refresh_token=xxx&type=recovery&...
        const hash =
          typeof window !== "undefined"
            ? window.location.hash.substring(1)
            : "";
        const params = new URLSearchParams(hash);

        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        const type = params.get("type");

        console.log("[ResetPassword] token exchange", {
          hasAccessToken: !!accessToken,
          hasRefreshToken: !!refreshToken,
          type,
        });

        if (!accessToken || !refreshToken) {
          // No tokens in URL — check if Supabase already has a recovery session
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (session) {
            console.log("[ResetPassword] existing session found, proceeding");
            setReady(true);
            return;
          }

          setTokenError(
            "Invalid or expired reset link. Please request a new one."
          );
          return;
        }

        if (type !== "recovery") {
          setTokenError("This link is not a password reset link.");
          return;
        }

        // Exchange tokens for a session
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (sessionError) {
          console.error("[ResetPassword] setSession error:", sessionError);
          setTokenError(sessionError.message);
          return;
        }

        console.log("[ResetPassword] session established from recovery token");

        // Clean the hash from the URL (cosmetic)
        if (typeof window !== "undefined") {
          window.history.replaceState(null, "", window.location.pathname);
        }

        setReady(true);
      } catch (e: any) {
        console.error("[ResetPassword] token exchange failed:", e);
        setTokenError(e?.message || "Failed to process reset link.");
      }
    }

    exchangeToken();
  }, []);

  const canSubmit = password.length >= 6 && password === confirmPassword;

  const handlePasswordChange = (text: string) => {
    setPassword(text);
    setError(null);
  };

  const handleConfirmChange = (text: string) => {
    setConfirmPassword(text);
    setError(null);
  };

  // --- Step 2: Update password ---
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

  // --- Render: loading while exchanging token ---
  if (!ready && !tokenError) {
    return (
      <Screen>
        <View style={styles.container}>
          <LoadingState message="Verifying reset link..." />
        </View>
      </Screen>
    );
  }

  // --- Render: token error ---
  if (tokenError) {
    return (
      <Screen>
        <View style={styles.container}>
          <View style={styles.brandSection}>
            <View
              style={[
                styles.brandIcon,
                { backgroundColor: colors.error + "14" },
              ]}
            >
              <Feather name="alert-circle" size={32} color={colors.error} />
            </View>
            <AppText variant="title" style={styles.brandTitle}>
              Reset Link Invalid
            </AppText>
            <AppText
              variant="body"
              color="secondary"
              style={styles.brandSubtitle}
            >
              {tokenError}
            </AppText>
          </View>

          <PrimaryButton
            onPress={() => router.replace("/")}
            style={styles.submitButton}
          >
            Back to Sign In
          </PrimaryButton>
        </View>
      </Screen>
    );
  }

  // --- Render: success ---
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

          <PrimaryButton
            onPress={() => router.replace("/")}
            style={styles.submitButton}
          >
            Continue to Sign In
          </PrimaryButton>
        </View>
      </Screen>
    );
  }

  // --- Render: password form ---
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
            <InlineNotice
              variant="error"
              message={error}
              style={styles.notice}
            />
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
