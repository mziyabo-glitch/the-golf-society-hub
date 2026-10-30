/**
 * Lightweight skeleton placeholders — theme-aware, no animation dependency.
 */

import { StyleSheet, View, type DimensionValue, type ViewStyle } from "react-native";
import { AppCard } from "./AppCard";
import { getColors, spacing, radius } from "@/lib/ui/theme";

/** Home dashboard initial load — matches app bar + identity + hero + metric rhythm */
export function HomeDashboardSkeleton() {
  const colors = getColors();
  const shimmer = colors.backgroundTertiary;

  return (
    <>
      <View style={[homeSk.appBarTier, { borderBottomColor: colors.borderLight }]}>
        <View style={homeSk.appBarSpacer} />
        <View style={[homeSk.appBarAction, { backgroundColor: shimmer, borderColor: colors.borderLight }]} />
      </View>
      <AppCard style={[homeSk.skeletonHeaderCard, homeSk.premiumCard]}>
        <View style={[homeSk.skeletonLogoFrame, { backgroundColor: shimmer }]} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <SkeletonLine width="70%" style={{ backgroundColor: shimmer }} />
          <SkeletonLine width="50%" style={{ marginTop: 6, backgroundColor: shimmer }} />
        </View>
      </AppCard>

      <AppCard style={homeSk.premiumCard}>
        <SkeletonLine width="28%" style={{ backgroundColor: shimmer }} />
        <SkeletonLine width="85%" style={{ marginTop: 12, backgroundColor: shimmer }} />
        <SkeletonLine width="55%" style={{ marginTop: 8, backgroundColor: shimmer }} />
        <View style={[homeSk.ctaBlock, { backgroundColor: shimmer }]} />
      </AppCard>

      <AppCard style={homeSk.premiumCard}>
        <SkeletonLine width="40%" style={{ backgroundColor: shimmer }} />
        <SkeletonLine width="42%" style={{ marginTop: spacing.md, height: 48, backgroundColor: shimmer }} />
      </AppCard>
    </>
  );
}

const homeSk = StyleSheet.create({
  appBarTier: {
    minHeight: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.xs,
  },
  appBarSpacer: {
    width: 30,
    height: 30,
  },
  appBarAction: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
  },
  skeletonHeaderCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  skeletonLogoFrame: {
    width: 96,
    height: 96,
    borderRadius: 22,
  },
  premiumCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  ctaBlock: {
    width: "100%",
    height: 44,
    marginTop: spacing.md,
    borderRadius: 12,
  },
});

type SkeletonLineProps = {
  width?: DimensionValue;
  height?: number;
  style?: ViewStyle;
};

export function SkeletonLine({ width = "100%", height = 12, style }: SkeletonLineProps) {
  const colors = getColors();
  return (
    <View
      style={[
        styles.line,
        { width, height, backgroundColor: colors.backgroundTertiary, borderRadius: height > 14 ? radius.sm : 6 },
        style,
      ]}
    />
  );
}

export function SkeletonCircle({ size }: { size: number }) {
  const colors = getColors();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.backgroundTertiary,
      }}
    />
  );
}

/** Events tab — stacked cards matching list rhythm */
export function EventsListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <AppCard key={i} variant="default" style={styles.card}>
          <SkeletonLine width="32%" height={10} />
          <SkeletonLine width="88%" style={{ marginTop: spacing.sm }} />
          <SkeletonLine width="55%" style={{ marginTop: spacing.xs }} />
          <SkeletonLine width="40%" height={10} style={{ marginTop: spacing.md }} />
        </AppCard>
      ))}
    </>
  );
}

/** Members tab — avatar + text columns */
export function MembersListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <View style={styles.memberList}>
      {Array.from({ length: count }).map((_, i) => (
        <AppCard key={i} variant="default" style={styles.memberCard}>
          <View style={styles.memberRow}>
            <SkeletonCircle size={44} />
            <View style={styles.memberText}>
              <SkeletonLine width="65%" height={14} />
              <SkeletonLine width="40%" style={{ marginTop: spacing.xs }} />
            </View>
            <SkeletonLine width={56} height={24} style={{ borderRadius: radius.full }} />
          </View>
        </AppCard>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  line: {
    alignSelf: "flex-start",
  },
  card: {
    marginBottom: 0,
  },
  memberList: {
    gap: spacing.sm,
  },
  memberCard: {
    marginBottom: 0,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  memberText: {
    flex: 1,
    minWidth: 0,
  },
});
