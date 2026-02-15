/**
 * AuthScreen — email / password sign-in, sign-up, and forgot password.
 * Rendered by the root layout when no session exists.
 * One-time sign-in: session is persisted by Supabase.
 */

import { useCallback, useState } from "react";
import {
  StyleSheet,
  View,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from "react-native";
import { Feather } from "@expo/vector-icons";

const masterLogo = require("@/assets/images/master-logo.png");

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { InlineNotice } from "@/components/ui/InlineNotice";
import {
  signInWithEmail,
  signUpWithEmail,
  signInWithMagicLink,
  resetPassword,
} from "@/lib/auth_supabase";
import { getColors, spacing, radius } from "@/lib/ui/theme";

type Mode = "signIn" | "signUp" | "forgotPassword";

export function AuthScreen() {
  const colors = getColors();

  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [magicLinkLoading, setMagicLinkLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isSignIn = mode === "signIn";
  const isSignUp = mode === "signUp";
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
            <Image
              source={masterLogo}
              style={styles.brandLogoSmall}
              resizeMode="contain"
            />
            <AppText variant="title" style={styles.brandTitle}>
              Reset Password
            </AppText>
            <AppText variant="body" color="secondary" style={styles.brandSubtitle}>
              Enter your email and we'll send you a reset link.
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
          <Image
            source={masterLogo}
            style={styles.brandLogo}
            resizeMode="contain"
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

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            <AppText variant="small" color="tertiary" style={styles.dividerText}>or</AppText>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          </View>

          {/* Magic Link — passwordless email sign-in */}
          {isSignIn && (
            <SecondaryButton
              onPress={async () => {
                const trimmed = email.trim();
                if (!trimmed || magicLinkLoading || loading) return;
                setMagicLinkLoading(true);
                setError(null);
                setSuccess(null);
                try {
                  await signInWithMagicLink(trimmed);
                  setSuccess("Magic link sent! Check your email and click the link to sign in.");
                } catch (e: any) {
                  setError(e?.message || "Failed to send magic link.");
                } finally {
                  setMagicLinkLoading(false);
                }
              }}
              loading={magicLinkLoading}
              disabled={!email.trim() || magicLinkLoading || loading}
              icon={<Feather name="mail" size={18} color={colors.primary} />}
            >
              Sign in with Email Link
            </SecondaryButton>
          )}
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
    width: 280,
    height: 220,
    marginBottom: spacing.md,
  },
  brandLogoSmall: {
    width: 170,
    height: 130,
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
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: spacing.base,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dividerText: {
    marginHorizontal: spacing.sm,
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
  },
});
