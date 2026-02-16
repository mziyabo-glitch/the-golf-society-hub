/**
 * Catch-all for unmatched routes.
 *
 * Expo Router shows this when no route file matches the URL.
 * We intercept /reset-password here as a fallback in case the
 * normal route file isn't resolved by the router.
 */

import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { usePathname, useRouter, Stack } from "expo-router";
import { Feather } from "@expo/vector-icons";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { LoadingState } from "@/components/ui/LoadingState";
import { supabase } from "@/lib/supabase";
import { getColors, spacing } from "@/lib/ui/theme";

export default function NotFoundScreen() {
  const pathname = usePathname();
  const router = useRouter();

  // If the URL is /reset-password, render the reset password flow
  if (pathname === "/reset-password") {
    return <ResetPasswordFallback />;
  }

  // Generic 404
  const colors = getColors();
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Screen>
        <View style={styles.container}>
          <View style={styles.brandSection}>
            <View style={[styles.brandIcon, { backgroundColor: colors.warning + "14" }]}>
              <Feather name="alert-triangle" size={32} color={colors.warning} />
            </View>
            <AppText variant="title" style={styles.brandTitle}>
              Page Not Found
            </AppText>
            <AppText variant="body" color="secondary" style={styles.brandSubtitle}>
              The page you&apos;re looking for doesn&apos;t exist.
            </AppText>
          </View>
          <PrimaryButton onPress={() => router.replace("/")}>
            Go Home
          </PrimaryButton>
        </View>
      </Screen>
    </>
  );
}

// ─── Inline reset-password flow (fallback) ──────────────────────────

function ResetPasswordFallback() {
  const router = useRouter();
  const colors = getColors();

  const [ready, setReady] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Parse recovery tokens from URL hash
  useEffect(() => {
    async function exchangeToken() {
      try {
        const hash =
          typeof window !== "undefined"
            ? window.location.hash.substring(1)
            : "";
        const params = new URLSearchParams(hash);

        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        const type = params.get("type");

        console.log("[ResetPassword +not-found] token exchange", {
          hasAccessToken: !!accessToken,
          hasRefreshToken: !!refreshToken,
          type,
        });

        if (!accessToken || !refreshToken) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            setReady(true);
            return;
          }
          setTokenError("Invalid or expired reset link. Please request a new one.");
          return;
        }

        if (type !== "recovery") {
          setTokenError("This link is not a password reset link.");
          return;
        }

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

  const handleSubmit = async () => {
    if (loading || !canSubmit) return;
    setLoading(true);
    setError(null);

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        console.error("[ResetPassword] updateUser error:", updateError.message);
        setError(updateError.message);
        return;
      }
      console.log("[ResetPassword] Password updated successfully");
      setSuccess(true);
    } catch (e: any) {
      setError(e?.message || "Failed to update password.");
    } finally {
      setLoading(false);
    }
  };

  // Loading
  if (!ready && !tokenError) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <Screen>
          <View style={styles.container}>
            <LoadingState message="Verifying reset link..." />
          </View>
        </Screen>
      </>
    );
  }

  // Token error
  if (tokenError) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <Screen>
          <View style={styles.container}>
            <View style={styles.brandSection}>
              <View style={[styles.brandIcon, { backgroundColor: colors.error + "14" }]}>
                <Feather name="alert-circle" size={32} color={colors.error} />
              </View>
              <AppText variant="title" style={styles.brandTitle}>Reset Link Invalid</AppText>
              <AppText variant="body" color="secondary" style={styles.brandSubtitle}>
                {tokenError}
              </AppText>
            </View>
            <PrimaryButton onPress={() => router.replace("/")}>Back to Sign In</PrimaryButton>
          </View>
        </Screen>
      </>
    );
  }

  // Success
  if (success) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <Screen>
          <View style={styles.container}>
            <View style={styles.brandSection}>
              <View style={[styles.brandIcon, { backgroundColor: colors.success + "14" }]}>
                <Feather name="check-circle" size={32} color={colors.success} />
              </View>
              <AppText variant="title" style={styles.brandTitle}>Password Updated</AppText>
              <AppText variant="body" color="secondary" style={styles.brandSubtitle}>
                Your password has been reset successfully.
              </AppText>
            </View>
            <PrimaryButton onPress={() => router.replace("/")}>Continue to Sign In</PrimaryButton>
          </View>
        </Screen>
      </>
    );
  }

  // Password form
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Screen>
        <View style={styles.container}>
          <View style={styles.brandSection}>
            <View style={[styles.brandIcon, { backgroundColor: colors.primary + "14" }]}>
              <Feather name="lock" size={32} color={colors.primary} />
            </View>
            <AppText variant="title" style={styles.brandTitle}>Set New Password</AppText>
            <AppText variant="body" color="secondary" style={styles.brandSubtitle}>
              Enter your new password below.
            </AppText>
          </View>

          <AppCard style={styles.formCard}>
            {error && <InlineNotice variant="error" message={error} style={styles.notice} />}

            <View style={styles.field}>
              <AppText variant="captionBold" style={styles.label}>New Password</AppText>
              <AppInput
                placeholder="Min 6 characters"
                value={password}
                onChangeText={(t) => { setPassword(t); setError(null); }}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.field}>
              <AppText variant="captionBold" style={styles.label}>Confirm Password</AppText>
              <AppInput
                placeholder="Re-enter password"
                value={confirmPassword}
                onChangeText={(t) => { setConfirmPassword(t); setError(null); }}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {password.length > 0 && confirmPassword.length > 0 && password !== confirmPassword && (
              <InlineNotice variant="error" message="Passwords do not match" style={styles.notice} />
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
        </View>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center" },
  brandSection: { alignItems: "center", marginBottom: spacing.xl },
  brandIcon: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: "center", justifyContent: "center",
    marginBottom: spacing.md,
  },
  brandTitle: { textAlign: "center", marginBottom: spacing.xs },
  brandSubtitle: { textAlign: "center" },
  formCard: { width: "100%" },
  notice: { marginBottom: spacing.base },
  field: { marginBottom: spacing.base },
  label: { marginBottom: spacing.xs },
  submitButton: { marginTop: spacing.sm },
});
