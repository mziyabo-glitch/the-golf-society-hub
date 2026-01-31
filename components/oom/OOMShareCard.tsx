/**
 * OOMShareCard - A shareable Order of Merit leaderboard card
 *
 * This component renders a clean, export-ready card for sharing as an image.
 * It's designed to be rendered off-screen and captured with react-native-view-shot.
 */

import React, { forwardRef } from "react";
import { View, Text, StyleSheet } from "react-native";

export type OOMShareRow = {
  position: number;
  name: string;
  points: number;
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
 * Get medal emoji for top 3 positions
 */
function getMedalEmoji(position: number): string {
  if (position === 1) return "🥇";
  if (position === 2) return "🥈";
  if (position === 3) return "🥉";
  return "";
}

const OOMShareCard = forwardRef<View, OOMShareCardProps>(
  ({ societyName, seasonLabel, rows }, ref) => {
    return (
      <View ref={ref} style={styles.container} collapsable={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Order of Merit</Text>
          <Text style={styles.societyName}>{societyName}</Text>
          <Text style={styles.seasonLabel}>{seasonLabel}</Text>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Table Header */}
        <View style={styles.tableHeader}>
          <Text style={[styles.headerCell, styles.posCol]}>Pos</Text>
          <Text style={[styles.headerCell, styles.nameCol]}>Player</Text>
          <Text style={[styles.headerCell, styles.pointsCol]}>Points</Text>
        </View>

        {/* Table Rows */}
        {rows.map((row, index) => {
          const isTop3 = row.position <= 3;
          const medal = getMedalEmoji(row.position);

          return (
            <View
              key={`${row.name}-${index}`}
              style={[
                styles.tableRow,
                index % 2 === 0 && styles.tableRowAlt,
                isTop3 && styles.tableRowTop3,
              ]}
            >
              <View style={styles.posCol}>
                {medal ? (
                  <Text style={styles.medal}>{medal}</Text>
                ) : (
                  <Text style={styles.posText}>{row.position}</Text>
                )}
              </View>
              <Text
                style={[styles.nameText, isTop3 && styles.nameTextTop3]}
                numberOfLines={1}
              >
                {row.name}
              </Text>
              <Text style={[styles.pointsText, isTop3 && styles.pointsTextTop3]}>
                {formatPoints(row.points)}
              </Text>
            </View>
          );
        })}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Produced by The Golf Society Hub</Text>
        </View>
      </View>
    );
  }
);

OOMShareCard.displayName = "OOMShareCard";

export default OOMShareCard;

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FFFFFF",
    width: 360,
    paddingVertical: 24,
    paddingHorizontal: 20,
    borderRadius: 16,
  },
  header: {
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0B6E4F",
    marginBottom: 4,
  },
  societyName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 2,
  },
  seasonLabel: {
    fontSize: 14,
    color: "#6B7280",
  },
  divider: {
    height: 2,
    backgroundColor: "#0B6E4F",
    marginBottom: 16,
    borderRadius: 1,
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: "#0B6E4F",
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  headerCell: {
    fontSize: 13,
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
  },
  pointsCol: {
    width: 70,
    textAlign: "right",
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  tableRowAlt: {
    backgroundColor: "#F9FAFB",
  },
  tableRowTop3: {
    backgroundColor: "#FEF3C7",
  },
  medal: {
    fontSize: 18,
  },
  posText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#6B7280",
    textAlign: "center",
  },
  nameText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: "#111827",
    paddingRight: 8,
  },
  nameTextTop3: {
    fontWeight: "600",
  },
  pointsText: {
    width: 70,
    fontSize: 15,
    fontWeight: "600",
    color: "#0B6E4F",
    textAlign: "right",
  },
  pointsTextTop3: {
    fontWeight: "700",
    fontSize: 16,
  },
  footer: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    alignItems: "center",
  },
  footerText: {
    fontSize: 12,
    color: "#9CA3AF",
    fontStyle: "italic",
  },
});
