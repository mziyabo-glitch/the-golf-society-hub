/**
 * AuthScreen — email / password sign-in, sign-up, and forgot password.
 * Rendered by the root layout when no session exists.
 *
 * "Remember me" is web-only. Native always persists auth until explicit sign-out.
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
import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { InlineNotice } from "@/components/ui/InlineNotice";
import {
  signInWithEmail,
  signUpWithEmail,
  resetPassword,
  signInWithGoogle,
  signInWithMagicLink,
} from "@/lib/auth_supabase";
import { setRememberMe } from "@/lib/supabaseStorage";
import { useBootstrap } from "@/lib/useBootstrap";
import { useRouter } from "expo-router";
import { getColors, spacing, radius } from "@/lib/ui/theme";
import { blurWebActiveElement } from "@/lib/ui/focus";
import {
  getInAppBrowserInfo,
  isDomNotAllowedError,
  webPermissionBlockedMessage,
} from "@/lib/web/browserEnvironment";

const masterLogo = require("@/assets/images/master-logo.png");

type Mode = "signIn" | "signUp" | "forgotPassword" | "magicLink";

export function AuthScreen() {
  const colors = getColors();
  const { refresh } = useBootstrap();
  const router = useRouter();

  const inAppBrowser =
    Platform.OS === "web" ? getInAppBrowserInfo() : { inApp: false as const, label: null as string | null };

  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMeLocal] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isSignIn = mode === "signIn";
  const isForgot = mode === "forgotPassword";
  const isMagicLink = mode === "magicLink";

  const canSubmitAuth = email.trim().length > 0 && password.length >= 6;
  const canSubmitReset = email.trim().length > 0;
  const canSubmitMagicLink = email.trim().length > 0;

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

    if (isMagicLink) {
      if (!canSubmitMagicLink) return;
      setLoading(true);
      setError(null);
      setSuccess(null);

      if (Platform.OS === "web") {
        setRememberMe(rememberMe);
      }

      try {
        const { error } = await signInWithMagicLink(submitEmail);
        if (error) {
          setError(error.message || "Failed to send magic link.");
        } else {
          setSuccess("Check your email for a sign-in link. Click it to sign in.");
        }
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

    // Remember-me semantics are web-only; native always persists session.
    if (Platform.OS === "web") {
      setRememberMe(rememberMe);
    }

    let skipLoadingReset = false;

    try {
      if (isSignIn) {
        const { data, error } = await signInWithEmail(submitEmail, submitPassword);
        if (error) {
          setError(error.message || "Sign in failed.");
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
      if (!skipLoadingReset) setLoading(false);
    }
  };

  const switchMode = (newMode: Mode) => {
    setMode(newMode);
    setError(null);
    setSuccess(null);
  };

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
              Sign in with magic link
            </AppText>
            <AppText variant="body" color="secondary" style={styles.brandSubtitle}>
              Enter your email and we’ll send you a sign-in link.
            </AppText>
          </View>

          <AppCard style={styles.formCard}>
            {error && (
              <InlineNotice variant="error" message={error} style={styles.notice} />
            )}
            {success && (
              <InlineNotice variant="success" message={success} style={styles.notice} />
            )}
            {Platform.OS === "web" && inAppBrowser.inApp && (
              <InlineNotice
                variant="info"
                message="Open in Safari for best results"
                detail={
                  inAppBrowser.label
                    ? `The ${inAppBrowser.label} browser often blocks sign-in. Use the menu (⋯ or Share) and choose “Open in Safari” or “Open in Browser”.`
                    : "In-app browsers often block sign-in. Open this link in Safari instead."
                }
                style={styles.notice}
              />
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
              disabled={!canSubmitMagicLink || loading}
              style={styles.submitButton}
            >
              Send magic link
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
              Enter your email and we’ll send you a reset link.
            </AppText>
          </View>

          <AppCard style={styles.formCard}>
            {error && (
              <InlineNotice variant="error" message={error} style={styles.notice} />
            )}
            {success && (
              <InlineNotice variant="success" message={success} style={styles.notice} />
            )}
            {Platform.OS === "web" && inAppBrowser.inApp && (
              <InlineNotice
                variant="info"
                message="Open in Safari for best results"
                detail={
                  inAppBrowser.label
                    ? `The ${inAppBrowser.label} browser often blocks sign-in. Use the menu (⋯ or Share) and choose “Open in Safari” or “Open in Browser”.`
                    : "In-app browsers often block sign-in. Open this link in Safari instead."
                }
                style={styles.notice}
              />
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
          {Platform.OS === "web" && inAppBrowser.inApp && (
            <InlineNotice
              variant="info"
              message="Open in Safari for best results"
              detail={
                inAppBrowser.label
                  ? `The ${inAppBrowser.label} browser often blocks sign-in. Use the menu (⋯ or Share) and choose “Open in Safari” or “Open in Browser”.`
                  : "In-app browsers often block sign-in. Open this link in Safari instead."
              }
              style={styles.notice}
            />
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

          {/* Remember me (web-only) + Forgot password row */}
          {isSignIn && Platform.OS === "web" && (
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

          {!isSignIn && (
            <AppText variant="small" color="secondary" style={styles.consentText}>
              By creating an account, you agree to our{" "}
              <AppText
                variant="small"
                style={[styles.inlineLink, { color: colors.primary }]}
                onPress={() => router.push("/privacy-policy")}
              >
                Privacy Policy
              </AppText>
              .
            </AppText>
          )}

          {isSignIn && (
            <>
              <View style={styles.dividerRow}>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <AppText variant="small" color="tertiary" style={styles.dividerText}>or</AppText>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
              </View>

              <SecondaryButton
                onPress={async () => {
                  if (loading) return;
                  setLoading(true);
                  setError(null);
                  if (Platform.OS === "web") {
                    setRememberMe(rememberMe);
                  }
                  try {
                    const { error } = await signInWithGoogle();
                    if (error) {
                      setError(
                        Platform.OS === "web" && isDomNotAllowedError(error)
                          ? webPermissionBlockedMessage()
                          : error.message || "Google sign-in failed.",
                      );
                    }
                  } catch (e: unknown) {
                    setError(
                      Platform.OS === "web" && isDomNotAllowedError(e)
                        ? webPermissionBlockedMessage()
                        : e instanceof Error
                          ? e.message
                          : "Something went wrong.",
                    );
                  } finally {
                    setLoading(false);
                  }
                }}
                loading={loading}
                disabled={loading}
                style={styles.submitButton}
              >
                Sign in with Google
              </SecondaryButton>

              <Pressable
                onPress={() => switchMode("magicLink")}
                style={styles.magicLinkRow}
                hitSlop={8}
              >
                <AppText variant="small" color="secondary">
                  Prefer no password?{" "}
                </AppText>
                <AppText variant="small" style={{ color: colors.primary, fontWeight: "600" }}>
                  Sign in with magic link
                </AppText>
              </Pressable>
            </>
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
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: spacing.base,
    gap: spacing.sm,
  },
  divider: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    minWidth: 24,
    textAlign: "center",
  },
  magicLinkRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
  },
  consentText: {
    textAlign: "center",
    marginTop: spacing.base,
    lineHeight: 20,
  },
  inlineLink: {
    textDecorationLine: "underline",
    fontWeight: "600",
  },
});
