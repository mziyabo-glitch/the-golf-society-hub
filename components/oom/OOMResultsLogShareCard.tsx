/**
 * OOMResultsLogShareCard - A shareable Results Log card for Order of Merit
 *
 * This component renders a clean, UK-style export-ready card showing the latest
 * OOM event results. Designed to be captured off-screen with react-native-view-shot.
 */

import React, { forwardRef } from "react";
import { View, Text, StyleSheet, Image } from "react-native";

const horizontalLogo = require("@/assets/images/horizontal-logo.png");

export type ResultRow = {
  memberName: string;
  dayValue: number | null;
  position: number | null;
  points: number;
};

export type EventLogData = {
  eventName: string;
  eventDate: string | null;
  format: string | null;
  results: ResultRow[];
};

type OOMResultsLogShareCardProps = {
  societyName: string;
  event: EventLogData;
  isLatestOnly?: boolean;
  logoUrl?: string | null;
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
 * Format date for display (UK format)
 */
function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Format event format for display
 */
function formatLabel(format: string | null): string {
  if (!format) return "";
  if (format.includes("strokeplay")) return "Strokeplay";
  if (format === "medal") return "Medal";
  if (format === "stableford") return "Stableford";
  return format.charAt(0).toUpperCase() + format.slice(1);
}

function getInitials(name: string): string {
  if (!name) return "GS";
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return name.substring(0, 2).toUpperCase();
  return words.slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

const OOMResultsLogShareCard = forwardRef<View, OOMResultsLogShareCardProps>(
  ({ societyName, event, isLatestOnly = true, logoUrl }, ref) => {
    const isStrokeplay = event.format?.includes("strokeplay") || event.format === "medal";

    return (
      <View ref={ref} style={styles.container} collapsable={false}>
        {/* App brand header */}
        <View style={styles.brandHeader}>
          <Image source={horizontalLogo} style={styles.brandLogo} resizeMode="contain" />
        </View>

        {/* Society header */}
        <View style={styles.header}>
          {logoUrl ? (
            <Image source={{ uri: logoUrl }} style={styles.logo} resizeMode="contain" />
          ) : (
            <View style={styles.logoPlaceholder}>
              <Text style={styles.logoInitials}>{getInitials(societyName)}</Text>
            </View>
          )}
          <Text style={styles.societyName}>{societyName}</Text>
          <Text style={styles.title}>Order of Merit</Text>
          <Text style={styles.subtitle}>
            {isLatestOnly ? "Latest Event Results" : "Results Log"}
          </Text>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Event Card */}
        <View style={styles.eventCard}>
          {/* Event Header */}
          <View style={styles.eventHeader}>
            <Text style={styles.eventName}>{event.eventName}</Text>
            <View style={styles.eventMeta}>
              {event.eventDate && (
                <Text style={styles.eventDate}>{formatDate(event.eventDate)}</Text>
              )}
              {event.format && (
                <>
                  <Text style={styles.eventDateDot}> • </Text>
                  <Text style={styles.eventFormat}>{formatLabel(event.format)}</Text>
                </>
              )}
            </View>
          </View>

          {/* Table */}
          <View style={styles.table}>
            {/* Table Header */}
            <View style={styles.tableHeader}>
              <Text style={[styles.headerCell, styles.nameCol]}>Player</Text>
              <Text style={[styles.headerCell, styles.valueCol]}>
                {isStrokeplay ? "Net" : "Pts"}
              </Text>
              <Text style={[styles.headerCell, styles.posCol]}>Pos</Text>
              <Text style={[styles.headerCell, styles.oomCol]}>OOM</Text>
            </View>

            {/* Table Rows */}
            {event.results.map((row, index) => {
              const isTop3 = row.position !== null && row.position <= 3;

              return (
                <View
                  key={`${row.memberName}-${index}`}
                  style={[
                    styles.tableRow,
                    index % 2 === 1 && styles.tableRowAlt,
                    isTop3 && styles.tableRowTop3,
                    index === event.results.length - 1 && styles.tableRowLast,
                  ]}
                >
                  <Text style={[styles.nameText, isTop3 && styles.nameTextTop3]} numberOfLines={1}>
                    {row.memberName}
                  </Text>
                  <Text style={styles.valueText}>
                    {row.dayValue ?? "-"}
                  </Text>
                  <Text style={[styles.posText, isTop3 && styles.posTextTop3]}>
                    {row.position ?? "-"}
                  </Text>
                  <Text style={[styles.oomText, isTop3 && styles.oomTextTop3]}>
                    {formatPoints(row.points)}
                  </Text>
                </View>
              );
            })}
          </View>
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

OOMResultsLogShareCard.displayName = "OOMResultsLogShareCard";

export default OOMResultsLogShareCard;

// Brand colors
const BRAND_GREEN = "#0B6E4F";

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
  brandHeader: {
    alignItems: "center",
    marginBottom: 16,
  },
  brandLogo: {
    width: 200,
    height: 40,
  },
  header: {
    alignItems: "center",
    marginBottom: 20,
  },
  logo: {
    width: 48,
    height: 48,
    borderRadius: 10,
    marginBottom: 8,
  },
  logoPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: "rgba(11, 110, 79, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  logoInitials: {
    fontSize: 14,
    fontWeight: "700",
    color: BRAND_GREEN,
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
  },
  divider: {
    height: 3,
    backgroundColor: BRAND_GREEN,
    marginBottom: 20,
    borderRadius: 2,
  },
  eventCard: {
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  eventHeader: {
    backgroundColor: "#F9FAFB",
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  eventName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  eventMeta: {
    flexDirection: "row",
    alignItems: "center",
  },
  eventDate: {
    fontSize: 13,
    color: "#6B7280",
  },
  eventDateDot: {
    fontSize: 13,
    color: "#9CA3AF",
  },
  eventFormat: {
    fontSize: 13,
    color: "#6B7280",
  },
  table: {
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: BRAND_GREEN,
  },
  headerCell: {
    fontSize: 11,
    fontWeight: "600",
    color: "#FFFFFF",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  nameCol: {
    flex: 1,
  },
  valueCol: {
    width: 50,
    textAlign: "center",
  },
  posCol: {
    width: 40,
    textAlign: "center",
  },
  oomCol: {
    width: 50,
    textAlign: "right",
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
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
  nameText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: "#111827",
  },
  nameTextTop3: {
    fontWeight: "600",
  },
  valueText: {
    width: 50,
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
  },
  posText: {
    width: 40,
    fontSize: 14,
    fontWeight: "500",
    color: "#6B7280",
    textAlign: "center",
  },
  posTextTop3: {
    fontWeight: "600",
    color: "#D97706",
  },
  oomText: {
    width: 50,
    fontSize: 14,
    fontWeight: "600",
    color: BRAND_GREEN,
    textAlign: "right",
  },
  oomTextTop3: {
    fontWeight: "700",
    fontSize: 15,
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
