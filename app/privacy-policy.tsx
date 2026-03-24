import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";

import { Screen } from "@/components/ui/Screen";
import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { SecondaryButton } from "@/components/ui/Button";
import { getColors, spacing } from "@/lib/ui/theme";

type PolicySection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

const sections: PolicySection[] = [
  {
    title: "1. Introduction",
    paragraphs: [
      "Welcome to The Golf Society Hub (\"we\", \"our\", \"the app\").",
      "We are committed to protecting your personal data and respecting your privacy. This Privacy Policy explains how we collect, use, and store your information when you use the app.",
      "The Golf Society Hub is a platform designed to help golf societies manage members, events, scoring, and payments.",
    ],
  },
  {
    title: "2. Who We Are",
    paragraphs: [
      "The Golf Society Hub is operated by an independent developer based in the United Kingdom.",
      "For GDPR purposes, we act as the Data Controller for your personal data.",
    ],
  },
  {
    title: "3. What Data We Collect",
    paragraphs: ["We only collect data necessary to run a golf society effectively.", "Account Information"],
    bullets: ["Name", "Email address (if provided)", "User ID (system generated)"],
  },
  {
    title: "Society & Membership Data",
    bullets: [
      "Society membership",
      "Role (e.g. Captain, Treasurer, Member)",
      "Handicap / WHS Index (optional)",
    ],
  },
  {
    title: "Event Data",
    bullets: ["Event participation (attending / not attending)", "Scores and results", "Tee sheet information"],
  },
  {
    title: "Payment Data",
    bullets: ["Payment status (paid / unpaid)", "Transaction reference (where applicable)"],
    paragraphs: [
      "Important: We do not store or process your card or payment details. Payments are handled securely by Stripe.",
    ],
  },
  {
    title: "Guest Profiles",
    paragraphs: [
      "Society administrators may create limited profiles for individuals who have not yet joined the app. These profiles typically include:",
    ],
    bullets: ["Name only", "Event participation", "These profiles are held on a temporary basis until claimed or removed."],
  },
  {
    title: "4. How We Use Your Data",
    paragraphs: ["We use your data to:"],
    bullets: [
      "Manage golf society memberships",
      "Organise and run events",
      "Generate tee sheets and results",
      "Track payments within societies",
      "Improve the functionality of the app",
      "We do not sell your data or use it for advertising.",
    ],
  },
  {
    title: "5. Lawful Basis for Processing",
    paragraphs: ["Under UK GDPR, we rely on:"],
    bullets: [
      "Legitimate Interest - to operate and manage golf societies efficiently",
      "Contractual Necessity - where you use the app as part of a society",
      "Consent - where applicable (e.g. optional data)",
    ],
  },
  {
    title: "6. Who Can See Your Data",
    paragraphs: ["Your data is only visible to:"],
    bullets: [
      "Members of your golf society",
      "Society administrators (e.g. Captain, Treasurer)",
      "The platform operator (for support and maintenance)",
      "We enforce strict society-level data separation, meaning members of one society cannot see data from another society unless explicitly part of a joint event.",
    ],
  },
  {
    title: "7. Payments",
    paragraphs: ["Payments are processed by Stripe."],
    bullets: [
      "We do not store card details",
      "We only store payment status and references",
      "Stripe processes data in accordance with its own privacy and security standards",
    ],
  },
  {
    title: "8. Data Retention",
    paragraphs: ["We retain data only as long as necessary:"],
    bullets: [
      "Active users: while your account is in use",
      "Guest profiles: up to 12 months if unclaimed",
      "Event and scoring history: retained for society records",
      "We may anonymise or delete data when it is no longer required.",
    ],
  },
  {
    title: "9. Your Rights",
    paragraphs: ["Under UK GDPR, you have the right to:"],
    bullets: [
      "Access your data",
      "Correct inaccurate data",
      "Request deletion of your data",
      "Object to certain processing",
      "Request data portability",
      "To exercise these rights, please contact us using the details below.",
    ],
  },
  {
    title: "10. Data Security",
    paragraphs: ["We take appropriate technical measures to protect your data, including:"],
    bullets: ["Secure authentication", "Role-based access control", "Database security policies"],
  },
  {
    title: "",
    paragraphs: ["However, no system is completely secure, and you use the app at your own risk."],
  },
  {
    title: "11. Third-Party Services",
    paragraphs: ["We use trusted third-party providers to operate the app, including:"],
    bullets: ["Supabase (database and authentication)", "Stripe (payments)"],
  },
  {
    title: "",
    paragraphs: ["These providers process data in accordance with their own privacy policies."],
  },
  {
    title: "12. Changes to This Policy",
    paragraphs: ["We may update this Privacy Policy from time to time. The latest version will always be available within the app."],
  },
  {
    title: "13. Contact",
    paragraphs: [
      "If you have any questions about this Privacy Policy or your data, please contact:",
      "Email: mziyabo@gmail.com",
    ],
  },
  {
    title: "14. Summary (Plain English)",
    bullets: [
      "We only collect what we need to run your golf society",
      "Your data stays within your society",
      "Payments are handled securely by Stripe",
      "We do not sell your data",
      "You can request deletion at any time",
    ],
  },
];

export default function PrivacyPolicyScreen() {
  const router = useRouter();
  const colors = getColors();

  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <SecondaryButton onPress={() => router.back()} size="sm">
            <Feather name="arrow-left" size={14} color={colors.primary} /> Back
          </SecondaryButton>
        </View>

        <AppCard style={styles.policyCard}>
          <AppText variant="title" style={styles.title}>
            Privacy Policy - The Golf Society Hub
          </AppText>
          <AppText variant="caption" color="secondary" style={styles.updated}>
            Last updated: March 2026
          </AppText>

          {sections.map((section, index) => (
            <View key={`${section.title}-${index}`} style={styles.section}>
              {section.title ? (
                <AppText variant="h2" style={styles.sectionTitle}>
                  {section.title}
                </AppText>
              ) : null}
              {section.paragraphs?.map((paragraph, paragraphIndex) => (
                <AppText key={`${index}-p-${paragraphIndex}`} variant="body" style={styles.paragraph}>
                  {paragraph}
                </AppText>
              ))}
              {section.bullets?.map((bullet, bulletIndex) => (
                <View key={`${index}-b-${bulletIndex}`} style={styles.bulletRow}>
                  <AppText variant="body" style={styles.bulletMarker}>
                    - 
                  </AppText>
                  <AppText variant="body" style={styles.bulletText}>
                    {bullet}
                  </AppText>
                </View>
              ))}
            </View>
          ))}
        </AppCard>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    alignItems: "center",
  },
  headerRow: {
    width: "100%",
    maxWidth: 920,
    marginBottom: spacing.sm,
  },
  policyCard: {
    width: "100%",
    maxWidth: 920,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  title: {
    marginBottom: spacing.xs,
  },
  updated: {
    marginBottom: spacing.base,
  },
  section: {
    marginTop: spacing.base,
  },
  sectionTitle: {
    marginBottom: spacing.xs,
  },
  paragraph: {
    marginBottom: spacing.xs,
    lineHeight: 22,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: spacing.xs,
  },
  bulletMarker: {
    width: 14,
    lineHeight: 22,
  },
  bulletText: {
    flex: 1,
    lineHeight: 22,
  },
});
