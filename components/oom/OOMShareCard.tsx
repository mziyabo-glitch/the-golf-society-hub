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
};

/**
 * Format points for display (handles decimals from tie averaging)
 */
function formatPoints(pts: number): string {
  if (pts === Math.floor(pts)) {
    return pts.toString();
  }
  return pts.toFixed(1);
}

/**
 * Get position display - medal emoji for top 3, number for rest
 */
function getPositionDisplay(position: number): { text: string; isMedal: boolean } {
  if (position === 1) return { text: "🥇", isMedal: true };
  if (position === 2) return { text: "🥈", isMedal: true };
  if (position === 3) return { text: "🥉", isMedal: true };
  return { text: position.toString(), isMedal: false };
}

const OOMShareCard = forwardRef<View, OOMShareCardProps>(
  ({ societyName, seasonLabel, rows }, ref) => {
    return (
      <View ref={ref} style={styles.container} collapsable={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.societyName}>{societyName}</Text>
          <Text style={styles.title}>Order of Merit</Text>
          <Text style={styles.subtitle}>Season Leaderboard</Text>
          <Text style={styles.seasonLabel}>{seasonLabel}</Text>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Table */}
        <View style={styles.table}>
          {/* Table Header */}
          <View style={styles.tableHeader}>
            <Text style={[styles.headerCell, styles.posCol]}>Pos</Text>
            <Text style={[styles.headerCell, styles.nameCol]}>Player</Text>
            <Text style={[styles.headerCell, styles.pointsCol]}>Points</Text>
          </View>

          {/* Table Rows */}
          {rows.map((row, index) => {
            const isTop3 = row.position <= 3;
            const pos = getPositionDisplay(row.position);

            return (
              <View
                key={`${row.name}-${index}`}
                style={[
                  styles.tableRow,
                  index % 2 === 1 && styles.tableRowAlt,
                  isTop3 && styles.tableRowTop3,
                  index === rows.length - 1 && styles.tableRowLast,
                ]}
              >
                <View style={styles.posCol}>
                  {pos.isMedal ? (
                    <Text style={styles.medal}>{pos.text}</Text>
                  ) : (
                    <Text style={styles.posText}>{pos.text}</Text>
                  )}
                </View>
                <View style={styles.nameCol}>
                  <Text
                    style={[styles.nameText, isTop3 && styles.nameTextTop3]}
                    numberOfLines={1}
                  >
                    {row.name}
                  </Text>
                  {row.eventsPlayed !== undefined && (
                    <Text style={styles.eventsText}>
                      {row.eventsPlayed} event{row.eventsPlayed !== 1 ? "s" : ""}
                    </Text>
                  )}
                </View>
                <View style={styles.pointsCol}>
                  <Text style={[styles.pointsText, isTop3 && styles.pointsTextTop3]}>
                    {formatPoints(row.points)}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.footerDivider} />
          <Text style={styles.footerText}>Produced by The Golf Society Hub</Text>
        </View>
      </View>
    );
  }
);

OOMShareCard.displayName = "OOMShareCard";

export default OOMShareCard;

// Brand colors
const BRAND_GREEN = "#0B6E4F";
const GOLD = "#D4AF37";

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FFFFFF",
    width: 380,
    paddingTop: 28,
    paddingBottom: 20,
    paddingHorizontal: 24,
    borderRadius: 16,
    overflow: "hidden",
    // Subtle shadow for depth
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  header: {
    alignItems: "center",
    marginBottom: 20,
  },
  societyName: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: BRAND_GREEN,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: "500",
    color: "#374151",
    marginBottom: 4,
  },
  seasonLabel: {
    fontSize: 13,
    color: "#9CA3AF",
  },
  divider: {
    height: 3,
    backgroundColor: BRAND_GREEN,
    marginBottom: 0,
    borderRadius: 2,
  },
  table: {
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderTopWidth: 0,
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: BRAND_GREEN,
  },
  headerCell: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  posCol: {
    width: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  nameCol: {
    flex: 1,
    justifyContent: "center",
  },
  pointsCol: {
    width: 70,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  tableRowAlt: {
    backgroundColor: "#FAFAFA",
  },
  tableRowTop3: {
    backgroundColor: "#FFFBEB",
  },
  tableRowLast: {
    borderBottomWidth: 0,
  },
  medal: {
    fontSize: 20,
  },
  posText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#6B7280",
  },
  nameText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#111827",
  },
  nameTextTop3: {
    fontWeight: "600",
  },
  eventsText: {
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 1,
  },
  pointsText: {
    fontSize: 16,
    fontWeight: "600",
    color: BRAND_GREEN,
  },
  pointsTextTop3: {
    fontWeight: "700",
    fontSize: 17,
  },
  footer: {
    marginTop: 20,
    alignItems: "center",
  },
  footerDivider: {
    width: 60,
    height: 2,
    backgroundColor: "#E5E7EB",
    marginBottom: 12,
    borderRadius: 1,
  },
  footerText: {
    fontSize: 11,
    color: "#9CA3AF",
    fontStyle: "italic",
  },
});
