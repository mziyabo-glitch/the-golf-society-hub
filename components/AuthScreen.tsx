/**
 * AuthScreen — Google, Apple, magic link (primary) + password (secondary).
 * Rendered by the root layout when no session exists.
 *
 * Auth methods (in order of prominence):
 * - Google sign-in
 * - Apple sign-in
 * - Email magic link
 * - Password sign-in (collapsed, de-prioritized)
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
import * as WebBrowser from "expo-web-browser";

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
  signInWithOAuth,
  signInWithMagicLink,
  resetPassword,
} from "@/lib/auth_supabase";
import { setRememberMe } from "@/lib/supabaseStorage";
import { useBootstrap } from "@/lib/useBootstrap";
import { useRouter } from "expo-router";
import { getColors, spacing, radius } from "@/lib/ui/theme";
import { blurWebActiveElement } from "@/lib/ui/focus";

type Mode = "main" | "magicLink" | "password" | "signUp" | "forgotPassword";

export function AuthScreen() {
  const colors = getColors();
  const { refresh } = useBootstrap();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("main");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMeLocal] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isMagicLink = mode === "magicLink";
  const isPassword = mode === "password";
  const isSignUp = mode === "signUp";
  const isForgot = mode === "forgotPassword";

  const canSubmitMagicLink = email.trim().length > 0;
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

  const handleOAuth = async (provider: "google" | "apple") => {
    if (loading) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const { data, error: oauthError } = await signInWithOAuth(provider);
      if (oauthError) {
        setError(oauthError.message || "Sign-in failed.");
        return;
      }
      if (data?.url) {
        if (Platform.OS === "web") {
          window.location.href = data.url;
        } else {
          const result = await WebBrowser.openAuthSessionAsync(
            data.url,
            undefined,
            { showInRecents: true }
          );
          if (result.type === "success" && result.url) {
            const hashIdx = result.url.indexOf("#");
            const hash = hashIdx >= 0 ? result.url.substring(hashIdx + 1) : "";
            const params = new URLSearchParams(hash);
            const accessToken = params.get("access_token");
            const refreshToken = params.get("refresh_token");
            if (accessToken && refreshToken) {
              const { supabase } = await import("@/lib/supabase");
              const { error: sessionErr } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              });
              if (!sessionErr) {
                refresh();
                blurWebActiveElement();
                router.replace("/(app)/(tabs)");
                return;
              }
            }
          }
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLink = async () => {
    if (!canSubmitMagicLink || loading) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const { data, error: magicError } = await signInWithMagicLink(
        email.trim().toLowerCase()
      );
      if (magicError) {
        setError(magicError.message || "Failed to send link.");
        return;
      }
      setSuccess(data?.message || "Check your email for the sign-in link.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async () => {
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
        setSuccess(
          "If an account exists, you'll receive a password reset link."
        );
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!canSubmitAuth) return;
    setRememberMe(rememberMe);
    setLoading(true);
    setError(null);
    setSuccess(null);

    let skipLoadingReset = false;
    try {
      if (isPassword) {
        const { data, error: signInError } = await signInWithEmail(submitEmail, submitPassword);
        if (signInError) {
          setError(signInError.message || "Sign in failed.");
          return;
        }
        if (data?.session) {
          refresh();
          blurWebActiveElement();
          router.replace("/(app)/(tabs)");
          skipLoadingReset = true;
          return;
        }
        setError("Sign in failed — no session returned.");
      } else {
        const { needsConfirmation } = await signUpWithEmail(
          submitEmail,
          submitPassword
        );
        if (needsConfirmation) {
          setSuccess("Check your email to confirm your account, then sign in.");
          setMode("password");
          setPassword("");
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      if (!skipLoadingReset) setLoading(false);
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
            <AppText
              variant="body"
              color="secondary"
              style={styles.brandSubtitle}
            >
              Enter your email and we'll send you a reset link.
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
            {success && (
              <InlineNotice
                variant="success"
                message={success}
                style={styles.notice}
              />
            )}

            <View style={styles.field}>
              <AppText variant="captionBold" style={styles.label}>
                Email
              </AppText>
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
              onPress={handlePasswordSubmit}
              loading={loading}
              disabled={!canSubmitReset || loading}
              style={styles.submitButton}
            >
              Send Reset Link
            </PrimaryButton>
          </AppCard>

          <Pressable
            onPress={() => switchMode("main")}
            style={styles.toggleRow}
            hitSlop={8}
          >
            <AppText variant="bodyBold" color="primary">
              Back to Sign In
            </AppText>
          </Pressable>
        </KeyboardAvoidingView>
      </Screen>
    );
  }

  // --- Magic Link UI ---
  if (isMagicLink) {
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
              Sign in with Email
            </AppText>
            <AppText
              variant="body"
              color="secondary"
              style={styles.brandSubtitle}
            >
              We'll send you a one-time link. No password needed.
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
            {success && (
              <InlineNotice
                variant="success"
                message={success}
                style={styles.notice}
              />
            )}

            <View style={styles.field}>
              <AppText variant="captionBold" style={styles.label}>
                Email
              </AppText>
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
              onPress={handleMagicLink}
              loading={loading}
              disabled={!canSubmitMagicLink || loading}
              style={styles.submitButton}
            >
              Send Magic Link
            </PrimaryButton>
          </AppCard>

          <Pressable
            onPress={() => switchMode("main")}
            style={styles.toggleRow}
            hitSlop={8}
          >
            <AppText variant="bodyBold" color="primary">
              Back
            </AppText>
          </Pressable>
        </KeyboardAvoidingView>
      </Screen>
    );
  }

  // --- Password Sign In / Sign Up (expanded) ---
  if (isPassword || isSignUp) {
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
              {isPassword ? "Sign in with password" : "Create account"}
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
            {success && (
              <InlineNotice
                variant="success"
                message={success}
                style={styles.notice}
              />
            )}

            <View style={styles.field}>
              <AppText variant="captionBold" style={styles.label}>
                Email
              </AppText>
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
              <AppText variant="captionBold" style={styles.label}>
                Password
              </AppText>
              <AppInput
                placeholder={isPassword ? "Your password" : "Min 6 characters"}
                value={password}
                onChangeText={handlePasswordChange}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                textContentType={isPassword ? "password" : "newPassword"}
                autoComplete={isPassword ? "current-password" : "new-password"}
              />
            </View>

            {isPassword && (
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
                        borderColor: rememberMe
                          ? colors.primary
                          : colors.border,
                        backgroundColor: rememberMe
                          ? colors.primary
                          : "transparent",
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
                  <AppText variant="small" color="primary">
                    Forgot password?
                  </AppText>
                </Pressable>
              </View>
            )}

            <PrimaryButton
              onPress={handlePasswordSubmit}
              loading={loading}
              disabled={!canSubmitAuth || loading}
              style={styles.submitButton}
            >
              {isPassword ? "Sign In" : "Create Account"}
            </PrimaryButton>
          </AppCard>

          <Pressable
            onPress={() => switchMode("main")}
            style={styles.toggleRow}
            hitSlop={8}
          >
            <AppText variant="body" color="secondary">
              Use Google, Apple, or magic link instead
            </AppText>
          </Pressable>
        </KeyboardAvoidingView>
      </Screen>
    );
  }

  // --- Main: OAuth + Magic Link ---
  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.container}
      >
        <View style={styles.brandSection}>
          <Image
            source={masterLogo}
            style={styles.brandLogo}
            resizeMode="contain"
          />
          <AppText variant="body" color="secondary" style={styles.brandSubtitle}>
            Sign in to continue
          </AppText>
        </View>

        <AppCard style={styles.formCard}>
          {error && (
            <InlineNotice variant="error" message={error} style={styles.notice} />
          )}
          {success && (
            <InlineNotice
              variant="success"
              message={success}
              style={styles.notice}
            />
          )}

          <PrimaryButton
            onPress={() => handleOAuth("google")}
            loading={loading}
            disabled={loading}
            style={styles.oauthButton}
          >
            Continue with Google
          </PrimaryButton>

          {Platform.OS === "ios" && (
            <SecondaryButton
              onPress={() => handleOAuth("apple")}
              disabled={loading}
              style={styles.oauthButton}
            >
              Continue with Apple
            </SecondaryButton>
          )}

          <Pressable
            onPress={() => {
              setEmail("");
              switchMode("magicLink");
            }}
            style={styles.oauthButton}
            disabled={loading}
          >
            <AppText variant="button" color="primary">
              Continue with Email (magic link)
            </AppText>
          </Pressable>

          <View style={styles.dividerRow}>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <AppText variant="small" color="tertiary" style={styles.dividerText}>
              or
            </AppText>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
          </View>

          <Pressable
            onPress={() => switchMode("password")}
            style={styles.passwordLink}
            hitSlop={8}
          >
            <AppText variant="small" color="secondary">
              Sign in with password
            </AppText>
          </Pressable>

          <Pressable
            onPress={() => switchMode("signUp")}
            style={styles.passwordLink}
            hitSlop={8}
          >
            <AppText variant="small" color="secondary">
              Create account with password
            </AppText>
          </Pressable>
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
  oauthButton: {
    marginBottom: spacing.sm,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: spacing.base,
  },
  divider: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    marginHorizontal: spacing.sm,
  },
  passwordLink: {
    paddingVertical: spacing.xs,
    alignItems: "center",
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
