/**
 * Society Header Component
 * Displays society logo and name consistently across screens
 *
 * Two variants:
 * - SocietyHeader: Full card version with padding (for top of screen)
 * - SocietyBadge: Compact inline version (for headers)
 */

import { Image, StyleSheet, View, ViewStyle } from "react-native";
import { AppText } from "./AppText";
import { AppCard } from "./AppCard";
import { getColors, spacing, radius } from "@/lib/ui/theme";

// ============================================================================
// SocietyHeader - Full card version
// ============================================================================

type SocietyHeaderProps = {
  societyName: string;
  logoUrl?: string | null;
  subtitle?: string;
  style?: ViewStyle;
};

export function SocietyHeader({ societyName, logoUrl, subtitle, style }: SocietyHeaderProps) {
  const colors = getColors();
  const initials = getInitials(societyName);

  return (
    <AppCard style={style || styles.container}>
      <View style={styles.content}>
        {logoUrl ? (
          <Image
            source={{ uri: logoUrl }}
            style={styles.logo}
            resizeMode="contain"
          />
        ) : (
          <View style={[styles.initialsContainer, { backgroundColor: colors.primary + "15" }]}>
            <AppText variant="h1" color="primary">
              {initials}
            </AppText>
          </View>
        )}
        <View style={styles.textContainer}>
          <AppText variant="h2" numberOfLines={1} ellipsizeMode="tail">
            {societyName}
          </AppText>
          {subtitle && (
            <AppText variant="small" color="secondary" numberOfLines={1} ellipsizeMode="tail">
              {subtitle}
            </AppText>
          )}
        </View>
      </View>
    </AppCard>
  );
}

// ============================================================================
// SocietyBadge - Compact inline version
// ============================================================================

type SocietyBadgeProps = {
  societyName: string;
  logoUrl?: string | null;
  size?: "sm" | "md" | "lg";
  showName?: boolean;
  style?: ViewStyle;
};

const BADGE_SIZES = {
  sm: 32,
  md: 44,
  lg: 56,
};

const BADGE_FONT_SIZES = {
  sm: 12,
  md: 16,
  lg: 20,
};

export function SocietyBadge({
  societyName,
  logoUrl,
  size = "md",
  showName = true,
  style,
}: SocietyBadgeProps) {
  const colors = getColors();
  const initials = getInitials(societyName);
  const badgeSize = BADGE_SIZES[size];
  const fontSize = BADGE_FONT_SIZES[size];

  return (
    <View style={[styles.badgeContainer, style]}>
      {logoUrl ? (
        <Image
          source={{ uri: logoUrl }}
          style={[
            styles.badgeLogo,
            { width: badgeSize, height: badgeSize, borderRadius: radius.sm },
          ]}
          resizeMode="contain"
        />
      ) : (
        <View
          style={[
            styles.badgeInitials,
            {
              width: badgeSize,
              height: badgeSize,
              backgroundColor: colors.primary + "15",
              borderRadius: radius.sm,
            },
          ]}
        >
          <AppText
            style={{ fontSize, fontWeight: "600" }}
            color="primary"
          >
            {initials}
          </AppText>
        </View>
      )}
      {showName && (
        <AppText variant={size === "lg" ? "h2" : "bodyBold"} numberOfLines={1} style={{ flex: 1 }}>
          {societyName}
        </AppText>
      )}
    </View>
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get initials from society name
 * - Single word: First two letters (e.g., "Birchwood" -> "BI")
 * - Multiple words: First letter of each word (e.g., "The Golf Society" -> "TGS")
 * - Max 3 characters
 */
function getInitials(name: string): string {
  if (!name) return "GS";

  const words = name.trim().split(/\s+/);

  if (words.length === 1) {
    // Single word: take first 2 letters
    return name.substring(0, 2).toUpperCase();
  }

  // Multiple words: take first letter of each (max 3)
  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  // SocietyHeader styles
  container: {
    marginBottom: spacing.base,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  logo: {
    width: 60,
    height: 60,
    borderRadius: radius.sm,
  },
  initialsContainer: {
    width: 60,
    height: 60,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  textContainer: {
    flex: 1,
    minWidth: 0,
  },

  // SocietyBadge styles
  badgeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  badgeLogo: {
    backgroundColor: "transparent",
  },
  badgeInitials: {
    alignItems: "center",
    justifyContent: "center",
  },
});
