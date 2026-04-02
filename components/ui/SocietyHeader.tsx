/**
 * Society Header Component
 * Displays society logo and name consistently across screens
 *
 * Two variants:
 * - SocietyHeader: Full card version with padding (for top of screen)
 * - SocietyBadge: Compact inline version (for headers)
 */

import { StyleSheet, View, ViewStyle } from "react-native";
import { AppText } from "./AppText";
import { AppCard } from "./AppCard";
import { SocietyLogoImage } from "./SocietyLogoImage";
import { spacing } from "@/lib/ui/theme";

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
  const initials = getInitials(societyName);

  return (
    <AppCard style={style || styles.container}>
      <View style={styles.content}>
        <SocietyLogoImage
          logoUrl={logoUrl ?? null}
          size="hero"
          variant="hero"
          placeholderText={initials}
        />
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
  sm: 44,
  md: 64,
  lg: 80,
};

export function SocietyBadge({
  societyName,
  logoUrl,
  size = "md",
  showName = true,
  style,
}: SocietyBadgeProps) {
  const initials = getInitials(societyName);
  const badgeSize = BADGE_SIZES[size];

  return (
    <View style={[styles.badgeContainer, style]}>
      <SocietyLogoImage
        logoUrl={logoUrl ?? null}
        size={badgeSize}
        placeholderText={initials}
      />
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
});
