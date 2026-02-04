import { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import * as Linking from "expo-linking";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { PrimaryButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { getColors, spacing, radius } from "@/lib/ui/theme";
import { supabase } from "@/lib/supabase";

function looksLikeMagicLink(url: string): boolean {
  return url.includes("code=") || url.includes("access_token=");
}

export default function LoginScreen() {
  const colors = getColors();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    const handleUrl = async (url: string | null) => {
      if (!url || !looksLikeMagicLink(url)) return;
      setLinking(true);
      try {
        const { error } = await supabase.auth.exchangeCodeForSession(url);
        if (error) {
          console.warn("[login] exchangeCodeForSession error:", error.message);
        }
      } catch (err) {
        console.warn("[login] exchangeCodeForSession failed:", err);
      } finally {
        setLinking(false);
      }
    };

    Linking.getInitialURL().then(handleUrl);
    const subscription = Linking.addEventListener("url", ({ url }) => {
      handleUrl(url);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const handleSendMagicLink = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      Alert.alert("Missing Email", "Please enter your email address.");
      return;
    }
    if (!trimmedEmail.includes("@")) {
      Alert.alert("Invalid Email", "Please enter a valid email address.");
      return;
    }

    setSending(true);
    try {
      const redirectTo = Linking.createURL("login");
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmedEmail,
        options: {
          emailRedirectTo: redirectTo,
        },
      });

      if (error) {
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

  if (linking) {
    return (
      <Screen scrollable={false}>
        <View style={styles.centered}>
          <LoadingState message="Signing you in..." />
        </View>
      </Screen>
    );
  }

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
              disabled={sending}
              style={styles.submitButton}
            >
              {sending ? "Sending..." : "Send Magic Link"}
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
