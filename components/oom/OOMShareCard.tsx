/**
 * OOMShareCard - A shareable Order of Merit leaderboard card
 *
 * This component renders a clean, UK-style export-ready card for sharing as an image.
 * It's designed to be rendered off-screen and captured with react-native-view-shot.
 *
 * IMPORTANT: This component is rendered completely off-screen (outside the main UI tree)
 * to ensure the captured image never includes navigation bars or tabs.
 */

import React, { forwardRef } from "react";
import { View, Text, StyleSheet } from "react-native";
import { SocietyLogoImage } from "@/components/ui/SocietyLogoImage";
import { colors } from "@/lib/ui/theme";

export type OOMShareRow = {
  position: number;
  name: string;
  points: number;
  eventsPlayed?: number;
};

type OOMShareCardProps = {
  societyName: string;
  seasonLabel: string;
  rows: OOMShareRow[];
  logoUrl?: string | null;
};

const A4_EXPORT_WIDTH = 1240;
const A4_EXPORT_HEIGHT = 1754;
const MAX_ROWS = 30;

/**
 * Format points for display (handles decimals from tie averaging)
 */
function formatPoints(pts: number): string {
  if (pts === Math.floor(pts)) {
    return pts.toString();
  }
  return pts.toFixed(1);
}

type PositionTone = "gold" | "silver" | "bronze" | "default";

/**
 * Position badges are rendered as deterministic chips (instead of emoji)
 * so exports look consistent across devices/platform fonts.
 */
function getPositionMeta(position: number): { text: string; tone: PositionTone } {
  if (position === 1) return { text: "1", tone: "gold" };
  if (position === 2) return { text: "2", tone: "silver" };
  if (position === 3) return { text: "3", tone: "bronze" };
  return { text: position.toString(), tone: "default" };
}

function getInitials(name: string): string {
  if (!name) return "GS";
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return name.substring(0, 2).toUpperCase();
  return words.slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

const OOMShareCard = forwardRef<View, OOMShareCardProps>(
  ({ societyName, seasonLabel, rows, logoUrl }, ref) => {
    const displayRows = rows.slice(0, MAX_ROWS);
    const rowDensityStyle =
      displayRows.length >= 28
        ? styles.rowDense
        : displayRows.length >= 24
          ? styles.rowMid
          : styles.rowComfortable;

    return (
      <View ref={ref} style={styles.container} collapsable={false}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <SocietyLogoImage
              logoUrl={logoUrl ?? null}
              size="medium"
              variant="default"
              placeholderText={getInitials(societyName)}
            />
            <View style={styles.headerTextBlock}>
              <Text style={styles.title}>Order of Merit</Text>
              <Text style={styles.societyName} numberOfLines={1}>
                {societyName}
              </Text>
              <Text style={styles.seasonLabel} numberOfLines={1}>
                {seasonLabel}
              </Text>
            </View>
          </View>

          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.headerCell, styles.rankCol]}>Rank</Text>
              <Text style={[styles.headerCell, styles.nameCol]}>Name</Text>
              <Text style={[styles.headerCell, styles.eventsCol]}>Events</Text>
              <Text style={[styles.headerCell, styles.pointsCol]}>Points</Text>
            </View>

            {displayRows.map((row, index) => {
              const pos = getPositionMeta(row.position);
              return (
                <View
                  key={`${row.name}-${index}`}
                  style={[
                    styles.tableRow,
                    rowDensityStyle,
                    index % 2 === 1 && styles.tableRowAlt,
                    index === displayRows.length - 1 && styles.tableRowLast,
                  ]}
                >
                  <View style={styles.rankCol}>
                    <View
                      style={[
                        styles.positionBadge,
                        pos.tone === "gold" && styles.positionBadgeGold,
                        pos.tone === "silver" && styles.positionBadgeSilver,
                        pos.tone === "bronze" && styles.positionBadgeBronze,
                      ]}
                    >
                      <Text style={styles.positionBadgeText}>{pos.text}</Text>
                    </View>
                  </View>

                  <Text style={styles.nameText} numberOfLines={1}>
                    {row.name}
                  </Text>

                  <Text style={styles.eventsText} numberOfLines={1}>
                    {row.eventsPlayed ?? 0}
                  </Text>

                  <Text style={styles.pointsText} numberOfLines={1}>
                    {formatPoints(row.points)}
                  </Text>
                </View>
              );
            })}
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Produced by The Golf Society Hub</Text>
          </View>
        </View>
      </View>
    );
  }
);

OOMShareCard.displayName = "OOMShareCard";

export default OOMShareCard;

const styles = StyleSheet.create({
  container: {
    width: A4_EXPORT_WIDTH,
    height: A4_EXPORT_HEIGHT,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 52,
    paddingTop: 44,
    paddingBottom: 30,
  },
  sheet: {
    flex: 1,
    width: "100%",
    maxWidth: 1136,
    alignSelf: "center",
  },
  header: {
    height: 170,
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#D1D5DB",
    paddingBottom: 16,
    marginBottom: 14,
  },
  headerTextBlock: {
    flex: 1,
  },
  societyName: {
    fontSize: 24,
    lineHeight: 26,
    color: "#4B5563",
  },
  title: {
    fontSize: 62,
    lineHeight: 64,
    fontWeight: "700",
    color: colors.light.primary,
    marginBottom: 6,
  },
  seasonLabel: {
    fontSize: 21,
    lineHeight: 23,
    color: "#6B7280",
    marginTop: 2,
  },
  table: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 0,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "#F3F4F6",
    borderBottomWidth: 1,
    borderBottomColor: "#D1D5DB",
  },
  headerCell: {
    fontSize: 18,
    lineHeight: 20,
    fontWeight: "600",
    color: "#374151",
    textTransform: "uppercase",
    letterSpacing: 0.2,
  },
  rankCol: {
    width: 80,
    alignItems: "center",
    justifyContent: "center",
  },
  nameCol: {
    flex: 1,
  },
  eventsCol: {
    width: 90,
    textAlign: "center",
  },
  pointsCol: {
    width: 120,
    textAlign: "right",
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  rowComfortable: {
    minHeight: 56,
    paddingVertical: 8,
  },
  rowMid: {
    minHeight: 50,
    paddingVertical: 7,
  },
  rowDense: {
    minHeight: 44,
    paddingVertical: 6,
  },
  tableRowAlt: {
    backgroundColor: "#FCFCFD",
  },
  tableRowLast: {
    borderBottomWidth: 0,
  },
  positionBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  positionBadgeGold: {
    backgroundColor: "#FDE68A",
  },
  positionBadgeSilver: {
    backgroundColor: "#E5E7EB",
  },
  positionBadgeBronze: {
    backgroundColor: "#FCD9B6",
  },
  positionBadgeText: {
    fontSize: 18,
    lineHeight: 20,
    fontWeight: "700",
    color: "#374151",
  },
  nameText: {
    flex: 1,
    fontSize: 21,
    lineHeight: 23,
    fontWeight: "500",
    color: "#111827",
    paddingRight: 8,
  },
  eventsText: {
    width: 90,
    textAlign: "center",
    fontSize: 18,
    lineHeight: 20,
    color: "#4B5563",
  },
  pointsText: {
    width: 120,
    textAlign: "right",
    fontSize: 24,
    lineHeight: 26,
    fontWeight: "700",
    color: "#111827",
  },
  footer: {
    paddingTop: 10,
    alignItems: "center",
  },
  footerText: {
    fontSize: 16,
    lineHeight: 18,
    color: "#9CA3AF",
  },
});
