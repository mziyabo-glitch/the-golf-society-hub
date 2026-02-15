/**
 * AuthScreen — email / password sign-in, sign-up, and forgot password.
 * Rendered by the root layout when no session exists.
 * One-time sign-in: session is persisted by Supabase.
 */

import { useCallback, useState } from "react";
import {
  StyleSheet,
  View,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from "react-native";

import { SafeLogo } from "@/components/SafeLogo";
import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { PrimaryButton } from "@/components/ui/Button";
import { InlineNotice } from "@/components/ui/InlineNotice";
import {
  signInWithEmail,
  signUpWithEmail,
  resetPassword,
} from "@/lib/auth_supabase";
import { spacing } from "@/lib/ui/theme";

type Mode = "signIn" | "signUp" | "forgotPassword";
const BRAND_LOGO_WIDTH = 280;
const BRAND_LOGO_HEIGHT = 220;
const BRAND_LOGO_SMALL_WIDTH = 170;
const BRAND_LOGO_SMALL_HEIGHT = 130;

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isSignIn = mode === "signIn";
  const isForgot = mode === "forgotPassword";

  const canSubmitAuth = email.trim().length > 0 && password.length >= 6;
  const canSubmitReset = email.trim().length > 0;

  // Clear error/success when user edits fields
  const handleEmailChange = useCallback((text: string) => {
    setEmail(text);
    setError(null);
  }, []);

  const handlePasswordChange = useCallback((text: string) => {
    setPassword(text);
    setError(null);
  }, []);

  const handleSubmit = async () => {
    if (loading) return;

    // Snapshot current field values
    const submitEmail = email.trim().toLowerCase();
    const submitPassword = password;

    if (isForgot) {
      if (!canSubmitReset) return;
      setLoading(true);
      setError(null);
      setSuccess(null);
      console.log("[AuthScreen] resetPassword submit:", { email: submitEmail });

      try {
        await resetPassword(submitEmail);
        setSuccess("If an account exists with that email, you'll receive a password reset link.");
      } catch (e: any) {
        console.error("[AuthScreen] resetPassword error:", e);
        setError(e?.message || "Something went wrong.");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!canSubmitAuth) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    console.log("[AuthScreen] submit:", {
      mode,
      email: submitEmail,
      passwordLength: submitPassword.length,
    });

    try {
      if (isSignIn) {
        await signInWithEmail(submitEmail, submitPassword);
        // Session is set — onAuthStateChange in useBootstrap will re-bootstrap.
      } else {
        const { needsConfirmation } = await signUpWithEmail(submitEmail, submitPassword);
        if (needsConfirmation) {
          setSuccess("Check your email to confirm your account, then sign in.");
          setMode("signIn");
          setPassword("");
        }
        // If no confirmation needed, session is set and bootstrap re-runs.
      }
    } catch (e: any) {
      console.error("[AuthScreen] auth error:", { mode, email: submitEmail, error: e?.message });
      setError(e?.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (newMode: Mode) => {
    setMode(newMode);
    setError(null);
    setSuccess(null);
  };

  // --- Forgot Password UI ---
  if (isForgot) {
    return (
      <Screen>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.container}
        >
          <View style={styles.brandSection}>
            <SafeLogo
              variant="master"
              width={BRAND_LOGO_SMALL_WIDTH}
              height={BRAND_LOGO_SMALL_HEIGHT}
              style={styles.brandLogoSmall}
              fallbackTitle="Golf Society Hub"
            />
            <AppText variant="title" style={styles.brandTitle}>
              Reset Password
            </AppText>
            <AppText variant="body" color="secondary" style={styles.brandSubtitle}>
              Enter your email and we&apos;ll send you a reset link.
            </AppText>
          </View>

          <AppCard style={styles.formCard}>
            {error && (
              <InlineNotice variant="error" message={error} style={styles.notice} />
            )}
            {success && (
              <InlineNotice variant="success" message={success} style={styles.notice} />
            )}

            <View style={styles.field}>
              <AppText variant="captionBold" style={styles.label}>Email</AppText>
              <AppInput
                placeholder="you@example.com"
                value={email}
                onChangeText={handleEmailChange}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
              />
            </View>

            <PrimaryButton
              onPress={handleSubmit}
              loading={loading}
              disabled={!canSubmitReset || loading}
              style={styles.submitButton}
            >
              Send Reset Link
            </PrimaryButton>
          </AppCard>

          <Pressable onPress={() => switchMode("signIn")} style={styles.toggleRow} hitSlop={8}>
            <AppText variant="bodyBold" color="primary">
              Back to Sign In
            </AppText>
          </Pressable>
        </KeyboardAvoidingView>
      </Screen>
    );
  }

  // --- Sign In / Sign Up UI ---
  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.container}
      >
        {/* Branding */}
        <View style={styles.brandSection}>
          <SafeLogo
            variant="master"
            width={BRAND_LOGO_WIDTH}
            height={BRAND_LOGO_HEIGHT}
            style={styles.brandLogo}
            fallbackTitle="Golf Society Hub"
          />
          <AppText variant="body" color="secondary" style={styles.brandSubtitle}>
            {isSignIn ? "Sign in to continue" : "Create your account"}
          </AppText>
        </View>

        {/* Form */}
        <AppCard style={styles.formCard}>
          {error && (
            <InlineNotice variant="error" message={error} style={styles.notice} />
          )}
          {success && (
            <InlineNotice variant="success" message={success} style={styles.notice} />
          )}

          <View style={styles.field}>
            <AppText variant="captionBold" style={styles.label}>Email</AppText>
            <AppInput
              placeholder="you@example.com"
              value={email}
              onChangeText={handleEmailChange}
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
              onChangeText={handlePasswordChange}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              textContentType={isSignIn ? "password" : "newPassword"}
              autoComplete={isSignIn ? "current-password" : "new-password"}
            />
          </View>

          {/* Forgot password link — sign in mode only */}
          {isSignIn && (
            <Pressable
              onPress={() => switchMode("forgotPassword")}
              style={styles.forgotRow}
              hitSlop={8}
            >
              <AppText variant="small" color="primary">Forgot password?</AppText>
            </Pressable>
          )}

          <PrimaryButton
            onPress={handleSubmit}
            loading={loading}
            disabled={!canSubmitAuth || loading}
            style={styles.submitButton}
          >
            {isSignIn ? "Sign In" : "Create Account"}
          </PrimaryButton>
        </AppCard>

        {/* Toggle sign-in / sign-up */}
        <Pressable onPress={() => switchMode(isSignIn ? "signUp" : "signIn")} style={styles.toggleRow} hitSlop={8}>
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
  brandLogo: {
    width: BRAND_LOGO_WIDTH,
    height: BRAND_LOGO_HEIGHT,
    marginBottom: spacing.md,
  },
  brandLogoSmall: {
    width: BRAND_LOGO_SMALL_WIDTH,
    height: BRAND_LOGO_SMALL_HEIGHT,
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
  forgotRow: {
    alignSelf: "flex-end",
    marginBottom: spacing.sm,
    marginTop: -spacing.xs,
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
