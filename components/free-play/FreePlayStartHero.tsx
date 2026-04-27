import { View, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";

import { AppText } from "@/components/ui/AppText";
import { radius, spacing } from "@/lib/ui/theme";
import { freePlayPremium } from "@/lib/ui/freePlayPremiumTheme";

type FreePlayStartHeroProps = {
  onStartFreeRound: () => void;
  onResumeRound?: () => void;
  resumeLabel?: string | null;
  societyRoundDisabled?: boolean;
  onSocietyRound?: () => void;
};

/**
 * Flagship “Start a Round” hero — GameBook-style energy without copying their UI.
 */
export function FreePlayStartHero({
  onStartFreeRound,
  onResumeRound,
  resumeLabel,
  societyRoundDisabled = true,
  onSocietyRound,
}: FreePlayStartHeroProps) {
  const deep = freePlayPremium.accentDeepGreen;
  const cream = freePlayPremium.creamSurface;

  return (
    <View
      style={[
        styles.hero,
        {
          backgroundColor: deep,
          borderRadius: freePlayPremium.heroRadius,
          ...freePlayPremium.heroShadow,
        },
      ]}
    >
      <View style={styles.heroTopRow}>
        <View style={[styles.iconBadge, { backgroundColor: `${cream}22` }]}>
          <Feather name="flag" size={22} color={cream} />
        </View>
        <AppText variant="captionBold" style={{ color: `${cream}cc`, letterSpacing: 0.6 }}>
          FREE PLAY
        </AppText>
      </View>
      <AppText variant="h1" style={[styles.heroTitle, { color: cream }]}>
        Start a Round
      </AppText>
      <AppText variant="small" style={[styles.heroSub, { color: `${cream}cc` }]}>
        Score yourself, your group, or a society match — fast, clear, built for the course.
      </AppText>

      <View style={styles.ctaRow}>
        <Pressable
          onPress={onStartFreeRound}
          style={({ pressed }) => [
            styles.primaryCta,
            { backgroundColor: cream, opacity: pressed ? 0.92 : 1 },
          ]}
        >
          <Feather name="play-circle" size={18} color={deep} />
          <AppText variant="captionBold" style={{ color: deep, marginLeft: spacing.xs }}>
            Start free round
          </AppText>
        </Pressable>
        {onResumeRound && resumeLabel ? (
          <Pressable
            onPress={onResumeRound}
            style={({ pressed }) => [
              styles.secondaryCta,
              { borderColor: `${cream}55`, opacity: pressed ? 0.88 : 1 },
            ]}
          >
            <Feather name="rotate-ccw" size={16} color={cream} />
            <AppText variant="captionBold" style={{ color: cream, marginLeft: spacing.xs }} numberOfLines={1}>
              {resumeLabel}
            </AppText>
          </Pressable>
        ) : null}
      </View>

      <Pressable
        onPress={societyRoundDisabled ? undefined : onSocietyRound}
        disabled={societyRoundDisabled}
        style={({ pressed }) => [
          styles.tertiaryCta,
          {
            borderColor: `${cream}33`,
            opacity: societyRoundDisabled ? 0.45 : pressed ? 0.85 : 1,
          },
        ]}
      >
        <Feather name="users" size={16} color={cream} />
        <AppText variant="small" style={{ color: `${cream}bb`, marginLeft: spacing.xs, flex: 1 }}>
          Score society round{societyRoundDisabled ? " — coming soon" : ""}
        </AppText>
        <Feather name="chevron-right" size={16} color={`${cream}88`} />
      </Pressable>

      <View style={[styles.strip, { backgroundColor: `${cream}14` }]}>
        <AppText variant="caption" style={{ color: `${cream}aa` }}>
          Tip: pick a verified course when possible — handicaps and Stableford are more reliable with full hole data.
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    padding: spacing.base,
    marginBottom: spacing.md,
    overflow: "hidden",
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: {
    marginTop: spacing.xs,
    letterSpacing: -0.5,
  },
  heroSub: {
    marginTop: spacing.sm,
    lineHeight: 20,
    maxWidth: 520,
  },
  ctaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  primaryCta: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderRadius: radius.full,
  },
  secondaryCta: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderRadius: radius.full,
    borderWidth: 1,
    maxWidth: "100%",
  },
  tertiaryCta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  strip: {
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.sm,
  },
});
