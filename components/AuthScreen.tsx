/**
 * AuthScreen — email / password sign-in, sign-up, and forgot password.
 * Rendered by the root layout when no session exists.
 *
 * "Remember me" controls whether the session is persisted in storage.
 * When unchecked the session lives only in memory and is lost on reload.
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
import { PrimaryButton } from "@/components/ui/Button";
import { InlineNotice } from "@/components/ui/InlineNotice";
import {
  signInWithEmail,
  signUpWithEmail,
  resetPassword,
} from "@/lib/auth_supabase";
import { setRememberMe } from "@/lib/supabaseStorage";
import { getColors, spacing, radius } from "@/lib/ui/theme";

type Mode = "signIn" | "signUp" | "forgotPassword";

export function AuthScreen() {
  const colors = getColors();

  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMeLocal] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isSignIn = mode === "signIn";
  const isForgot = mode === "forgotPassword";

  const canSubmitAuth = email.trim().length > 0 && password.length >= 6;
  const canSubmitReset = email.trim().length > 0;

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

    const submitEmail = email.trim().toLowerCase();
    const submitPassword = password;

    if (isForgot) {
      if (!canSubmitReset) return;
      setLoading(true);
      setError(null);
      setSuccess(null);

      try {
        await resetPassword(submitEmail);
        setSuccess("If an account exists with that email, you'll receive a password reset link.");
      } catch (e: any) {
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

    // Persist the remember-me preference BEFORE signing in so the
    // storage adapter knows whether to actually write the session.
    setRememberMe(rememberMe);

    try {
      if (isSignIn) {
        await signInWithEmail(submitEmail, submitPassword);
      } else {
        const { needsConfirmation } = await signUpWithEmail(submitEmail, submitPassword);
        if (needsConfirmation) {
          setSuccess("Check your email to confirm your account, then sign in.");
          setMode("signIn");
          setPassword("");
        }
      }
    } catch (e: any) {
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

          {/* Remember me + Forgot password row */}
          {isSignIn && (
            <View style={styles.optionsRow}>
              <Pressable
                style={styles.rememberRow}
                onPress={() => setRememberMeLocal((v) => !v)}
                hitSlop={6}
              >
                <View
                  style={[
                    styles.checkbox,
                    {
                      borderColor: rememberMe ? colors.primary : colors.border,
                      backgroundColor: rememberMe ? colors.primary : "transparent",
                    },
                  ]}
                >
                  {rememberMe && (
                    <Feather name="check" size={12} color="#fff" />
                  )}
                </View>
                <AppText variant="small" color="secondary">
                  Remember me
                </AppText>
              </Pressable>

              <Pressable
                onPress={() => switchMode("forgotPassword")}
                hitSlop={8}
              >
                <AppText variant="small" color="primary">Forgot password?</AppText>
              </Pressable>
            </View>
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
  optionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
    marginTop: -spacing.xs,
  },
  rememberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: radius.sm,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
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
