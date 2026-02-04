import { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { PrimaryButton } from "@/components/ui/Button";
import { getColors, spacing, radius } from "@/lib/ui/theme";
import { supabase } from "@/lib/supabase";

export default function LoginScreen() {
  const colors = getColors();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setTimeout(() => {
      setCooldownSeconds((prev) => Math.max(prev - 1, 0));
    }, 1000);

    return () => clearTimeout(timer);
  }, [cooldownSeconds]);

  const handleSendMagicLink = async () => {
    if (sending || cooldownSeconds > 0) return;

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      Alert.alert("Missing Email", "Please enter your email address.");
      return;
    }
    if (!trimmedEmail.includes("@")) {
      Alert.alert("Invalid Email", "Please enter a valid email address.");
      return;
    }

    const redirectTo =
      Platform.OS === "web"
        ? `${window.location.origin}/auth/callback`
        : "golfsocietypro://auth/callback";

    console.log("[login] send magic link", { platform: Platform.OS, redirectTo });

    setSending(true);
    setCooldownSeconds(60);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmedEmail,
        options: {
          emailRedirectTo: redirectTo,
        },
      });

      if (error) {
        const message = error?.message?.toLowerCase() ?? "";
        const isRateLimit =
          error?.status === 429 ||
          message.includes("rate limit") ||
          message.includes("too many requests");
        if (isRateLimit) {
          Alert.alert(
            "Please wait",
            "Too many requests. Please wait 60 seconds before trying again."
          );
          return;
        }
        throw error;
      }

      setSent(true);
      Alert.alert("Check your email", "We sent you a magic link to sign in.");
    } catch (err: any) {
      console.error("[login] send magic link error:", err);
      Alert.alert("Sign-in failed", err?.message || "Unable to send magic link.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.content}>
          <View style={[styles.iconContainer, { backgroundColor: colors.backgroundTertiary }]}>
            <AppText variant="h1" color="primary">
              G
            </AppText>
          </View>
          <AppText variant="title" style={styles.title}>
            Sign in
          </AppText>
          <AppText variant="body" color="secondary" style={styles.subtitle}>
            Use your email to receive a magic link and access your society.
          </AppText>

          <AppCard style={styles.formCard}>
            <View style={styles.formField}>
              <AppText variant="captionBold" style={styles.label}>
                Email
              </AppText>
              <AppInput
                placeholder="you@example.com"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <PrimaryButton
              onPress={handleSendMagicLink}
              loading={sending}
              disabled={sending || cooldownSeconds > 0}
              style={styles.submitButton}
            >
              {sending
                ? "Sending..."
                : cooldownSeconds > 0
                ? `Try again in ${cooldownSeconds}s`
                : "Send Magic Link"}
            </PrimaryButton>
          </AppCard>

          {sent && (
            <AppCard style={[styles.noticeCard, { backgroundColor: colors.backgroundTertiary }]}>
              <AppText variant="caption" color="tertiary">
                Check your inbox and tap the link to finish signing in.
              </AppText>
            </AppCard>
          )}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flex: 1,
    alignItems: "center",
    paddingTop: spacing.xl,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  title: {
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  subtitle: {
    textAlign: "center",
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  formCard: {
    width: "100%",
  },
  formField: {
    marginBottom: spacing.base,
  },
  label: {
    marginBottom: spacing.xs,
  },
  submitButton: {
    marginTop: spacing.sm,
  },
  noticeCard: {
    width: "100%",
    marginTop: spacing.base,
  },
});
