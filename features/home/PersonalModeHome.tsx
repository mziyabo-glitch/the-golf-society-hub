import { useState } from "react";
import { View, Pressable, Image, type PressableStateCallbackType } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { PrimaryButton } from "@/components/ui/Button";
import { useBootstrap } from "@/lib/useBootstrap";
import { blurWebActiveElement } from "@/lib/ui/focus";
import { pressableSurfaceStyle } from "@/lib/ui/interaction";
import { useReducedMotion } from "@/hooks/useReducedMotion";

import { HomeAppBar, PoweredByFooter } from "./components/HomeChrome";
import { homeDashboardStyles as styles, personalHomeStyles } from "./homeDashboardStyles";

const appIcon = require("@/assets/images/app-icon.png");

type Colors = ReturnType<typeof import("@/lib/ui/theme").getColors>;

export function PersonalModeHome({
  colors,
  router,
  tabContentStyle,
}: {
  colors: Colors;
  router: ReturnType<typeof useRouter>;
  tabContentStyle: { paddingTop: number; paddingBottom: number };
}) {
  const reduceMotionPm = useReducedMotion();
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const { profile: pmProfile } = useBootstrap();
  const pmProfileComplete = pmProfile?.profile_complete === true;
  const cardPressStyle = ({ pressed }: PressableStateCallbackType) => [
    styles.cardPressable,
    pressableSurfaceStyle({ pressed }, { reduceMotion: reduceMotionPm, scale: "card" }),
  ];
  const pushWithBlur = (href: Parameters<typeof router.push>[0]) => {
    blurWebActiveElement();
    router.push(href);
  };
  const openJoinByCode = () => {
    const targetPath = "/join?mode=join";
    console.log("ENTER JOIN CODE CLICK", targetPath);
    blurWebActiveElement();
    router.push({ pathname: "/join", params: { mode: "join" } });
  };
  const openCreateSociety = () => {
    blurWebActiveElement();
    router.push({ pathname: "/onboarding", params: { mode: "create" } });
  };

  return (
    <Screen
      style={{ backgroundColor: colors.backgroundSecondary }}
      contentStyle={[styles.screenContent, tabContentStyle]}
    >
      <HomeAppBar colors={colors} onOpenMore={() => pushWithBlur("/(app)/(tabs)/more")} />

      {/* Welcome header */}
      <AppCard style={[styles.premiumCard, personalHomeStyles.welcomeSection, { borderColor: colors.borderLight }]}>
        <View style={[personalHomeStyles.welcomeShield, { backgroundColor: colors.primary + "12" }]}>
          <Image source={appIcon} style={personalHomeStyles.welcomeShieldIcon} resizeMode="contain" />
        </View>
        <AppText variant="title" style={personalHomeStyles.welcomeTitle}>
          Welcome
        </AppText>
        <AppText variant="body" color="secondary" style={personalHomeStyles.welcomeSubtitle}>
          Use the app as an individual, or join a society when you are ready.
        </AppText>
      </AppCard>

      {/* Complete profile banner */}
      {!pmProfileComplete && (
        <Pressable onPress={() => pushWithBlur("/(app)/my-profile")} style={cardPressStyle}>
          <AppCard style={[styles.premiumCard, styles.profileBanner, { borderColor: colors.info + "40" }]}>
            <View style={styles.profileBannerRow}>
              <View style={[styles.profileBannerIcon, { backgroundColor: colors.info + "18" }]}>
                <Feather name="user" size={20} color={colors.info} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyBold">Complete your profile</AppText>
                <AppText variant="small" color="secondary" style={{ marginTop: 2 }}>
                  Add your name and details to get started.
                </AppText>
              </View>
              <Feather name="chevron-right" size={18} color={colors.info} />
            </View>
          </AppCard>
        </Pressable>
      )}

      <Pressable onPress={() => pushWithBlur("/(app)/free-play")} style={cardPressStyle}>
        <AppCard style={styles.premiumCard}>
          <View style={personalHomeStyles.featureRow}>
            <View style={[personalHomeStyles.featureIcon, { backgroundColor: colors.success + "14" }]}>
              <Feather name="flag" size={20} color={colors.success} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="bodyBold">Free Play Scorecard</AppText>
              <AppText variant="small" color="secondary">
                Score a casual round with verified courses, net or Stableford leaderboard, and guests.
              </AppText>
            </View>
            <Feather name="chevron-right" size={18} color={colors.textTertiary} />
          </View>
        </AppCard>
      </Pressable>

      {/* Feature cards */}
      <Pressable onPress={() => pushWithBlur("/(app)/(tabs)/sinbook")} style={cardPressStyle}>
        <AppCard style={styles.premiumCard}>
          <View style={personalHomeStyles.featureRow}>
            <View style={[personalHomeStyles.featureIcon, { backgroundColor: colors.primary + "14" }]}>
              <Feather name="zap" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="bodyBold">Rivalries</AppText>
              <AppText variant="small" color="secondary">
                Challenge a mate and track friendly head-to-head results — not real-money betting.
              </AppText>
            </View>
            <Feather name="chevron-right" size={18} color={colors.textTertiary} />
          </View>
        </AppCard>
      </Pressable>

      <AppCard style={styles.premiumCard}>
        <View style={personalHomeStyles.featureRow}>
          <View style={[personalHomeStyles.featureIcon, { backgroundColor: colors.info + "14" }]}>
            <Feather name="cloud" size={20} color={colors.info} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="bodyBold">Weather</AppText>
            <AppText variant="small" color="secondary">
              Course-specific forecasts for your round
            </AppText>
          </View>
          <View style={[personalHomeStyles.comingSoonBadge, { backgroundColor: colors.backgroundTertiary }]}>
            <AppText variant="small" color="tertiary">Soon</AppText>
          </View>
        </View>
      </AppCard>

      <Pressable onPress={() => pushWithBlur("/(app)/(tabs)/settings")} style={cardPressStyle}>
        <AppCard style={styles.premiumCard}>
          <View style={personalHomeStyles.featureRow}>
            <View style={[personalHomeStyles.featureIcon, { backgroundColor: colors.backgroundTertiary }]}>
              <Feather name="user" size={20} color={colors.textSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="bodyBold">Profile</AppText>
              <AppText variant="small" color="secondary">
                Your account and preferences
              </AppText>
            </View>
            <Feather name="chevron-right" size={18} color={colors.textTertiary} />
          </View>
        </AppCard>
      </Pressable>

      {/* Society join nudge — subtle card */}
      {!nudgeDismissed && (
        <AppCard style={[styles.premiumCard, personalHomeStyles.nudgeCard, { borderColor: colors.primary + "25" }]}>
          <View style={personalHomeStyles.nudgeHeader}>
            <View style={[personalHomeStyles.nudgeIcon, { backgroundColor: colors.primary + "14" }]}>
              <Feather name="users" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="bodyBold">Join a Society</AppText>
              <AppText variant="small" color="secondary" style={{ marginTop: 2 }}>
                Get events, tee sheets, and leaderboards when you join your society.
              </AppText>
            </View>
          </View>

          <View style={personalHomeStyles.nudgeActions}>
            <PrimaryButton
              onPress={openJoinByCode}
              size="sm"
              style={{ flex: 1 }}
            >
              Enter join code
            </PrimaryButton>
            <Pressable
              onPress={openCreateSociety}
              style={({ pressed }) => [
                personalHomeStyles.nudgeSecondary,
                { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <AppText variant="small" color="primary" style={{ fontWeight: "600" }}>
                Create a society
              </AppText>
            </Pressable>
          </View>

          <Pressable
            onPress={() => setNudgeDismissed(true)}
            style={personalHomeStyles.nudgeDismiss}
            hitSlop={8}
          >
            <AppText variant="small" color="tertiary">Not now</AppText>
          </Pressable>
        </AppCard>
      )}

      <PoweredByFooter colors={colors} />
    </Screen>
  );
}
