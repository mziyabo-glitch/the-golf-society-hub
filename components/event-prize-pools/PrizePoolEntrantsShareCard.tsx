/**
 * Off-screen export card: Pot Master–confirmed entrants and derived pot (PNG share).
 */

import React, { forwardRef } from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "@/lib/ui/theme";

export type PrizePoolEntrantShareRow = {
  name: string;
  front9?: string;
  back9?: string;
  birdies?: string;
};

type PrizePoolEntrantsShareCardProps = {
  eventTitle: string;
  poolName: string;
  potLabel: string;
  confirmedCount: number;
  entrants: PrizePoolEntrantShareRow[];
  showSplitterScores: boolean;
};

const EXPORT_WIDTH = 920;
const MAX_ROWS = 42;

const PrizePoolEntrantsShareCard = forwardRef<View, PrizePoolEntrantsShareCardProps>(
  ({ eventTitle, poolName, potLabel, confirmedCount, entrants, showSplitterScores }, ref) => {
    const display = entrants.slice(0, MAX_ROWS);
    const overflow = Math.max(0, entrants.length - display.length);

    return (
      <View
        ref={ref}
        testID="prize-pool-entrants-share"
        style={styles.root}
        collapsable={false}
      >
        <View style={styles.sheet}>
          <Text style={styles.kicker}>Prize pool</Text>
          <Text style={styles.poolName} numberOfLines={2}>
            {poolName}
          </Text>
          <Text style={styles.eventTitle} numberOfLines={2}>
            {eventTitle}
          </Text>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total pot</Text>
            <Text style={styles.summaryValue}>{potLabel}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Confirmed entrants</Text>
            <Text style={styles.summaryValue}>{String(confirmedCount)}</Text>
          </View>

          <Text style={styles.tableTitle}>Entrants</Text>
          <View style={styles.table}>
            <View style={[styles.tr, styles.trHead]}>
              <Text style={[styles.th, styles.colIdx]}>#</Text>
              <Text style={[styles.th, styles.colName]}>Name</Text>
              {showSplitterScores ? (
                <>
                  <Text style={[styles.th, styles.colNum]}>F9</Text>
                  <Text style={[styles.th, styles.colNum]}>B9</Text>
                  <Text style={[styles.th, styles.colNum]}>Birdies</Text>
                </>
              ) : null}
            </View>
            {display.map((row, i) => (
              <View
                key={`${row.name}-${i}`}
                style={[styles.tr, i % 2 === 1 ? styles.trAlt : undefined]}
              >
                <Text style={[styles.td, styles.colIdx]}>{i + 1}</Text>
                <Text style={[styles.td, styles.colName]} numberOfLines={1}>
                  {row.name}
                </Text>
                {showSplitterScores ? (
                  <>
                    <Text style={[styles.td, styles.colNum]} numberOfLines={1}>
                      {row.front9 ?? "—"}
                    </Text>
                    <Text style={[styles.td, styles.colNum]} numberOfLines={1}>
                      {row.back9 ?? "—"}
                    </Text>
                    <Text style={[styles.td, styles.colNum]} numberOfLines={1}>
                      {row.birdies ?? "—"}
                    </Text>
                  </>
                ) : null}
              </View>
            ))}
          </View>
          {overflow > 0 ? (
            <Text style={styles.overflowNote}>+{overflow} more (not shown)</Text>
          ) : null}

          <Text style={styles.footer}>Pot Master–confirmed entrants · The Golf Society Hub</Text>
        </View>
      </View>
    );
  },
);

PrizePoolEntrantsShareCard.displayName = "PrizePoolEntrantsShareCard";

export default PrizePoolEntrantsShareCard;

const styles = StyleSheet.create({
  root: {
    width: EXPORT_WIDTH,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 40,
    paddingVertical: 36,
  },
  sheet: {
    width: "100%",
  },
  kicker: {
    fontSize: 18,
    fontWeight: "600",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  poolName: {
    fontSize: 40,
    lineHeight: 44,
    fontWeight: "700",
    color: colors.light.primary,
    marginBottom: 8,
  },
  eventTitle: {
    fontSize: 22,
    lineHeight: 26,
    color: "#374151",
    marginBottom: 22,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  summaryLabel: {
    fontSize: 20,
    color: "#4B5563",
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
  },
  tableTitle: {
    marginTop: 20,
    marginBottom: 8,
    fontSize: 20,
    fontWeight: "600",
    color: "#374151",
  },
  table: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 4,
    overflow: "hidden",
  },
  tr: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  trHead: {
    backgroundColor: "#F3F4F6",
    minHeight: 44,
  },
  trAlt: {
    backgroundColor: "#F9FAFB",
  },
  th: {
    fontSize: 15,
    fontWeight: "600",
    color: "#374151",
  },
  td: {
    fontSize: 17,
    color: "#111827",
  },
  colIdx: {
    width: 36,
    textAlign: "center",
  },
  colName: {
    flex: 1,
    paddingRight: 8,
  },
  colNum: {
    width: 56,
    textAlign: "center",
  },
  overflowNote: {
    marginTop: 10,
    fontSize: 16,
    color: "#6B7280",
  },
  footer: {
    marginTop: 22,
    fontSize: 14,
    color: "#9CA3AF",
  },
});
