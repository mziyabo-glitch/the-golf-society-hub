/**
 * Off-screen export card for Pot Master prize pool PNG share.
 * Must include full context: logo, event, pool, stats, rules, notes, format-aware copy.
 */

import React, { forwardRef } from "react";
import { View, Text, StyleSheet } from "react-native";
import { SocietyLogoImage } from "@/components/ui/SocietyLogoImage";
import { colors } from "@/lib/ui/theme";

export type PrizePoolEntrantShareRow = {
  name: string;
  front9?: string;
  back9?: string;
  birdies?: string;
};

export type PrizePoolEntrantsShareCardProps = {
  societyName: string;
  societyLogoUrl: string | null;
  eventName: string;
  eventDateLine: string;
  venueLine: string | null;
  eventFormatRaw: string | undefined;
  eventFormatLabel: string;
  rankingPolicyLine: string;
  poolName: string;
  potMasterName: string | null;
  entryAmountLabel: string;
  confirmedCount: number;
  totalPotLabel: string;
  rulesLines: string[];
  potMasterNotes: string | null;
  eventPaymentInstructions: string | null;
  entrants: PrizePoolEntrantShareRow[];
  showSplitterScores: boolean;
};

const EXPORT_WIDTH = 1080;
const MAX_ROWS = 42;

const PrizePoolEntrantsShareCard = forwardRef<View, PrizePoolEntrantsShareCardProps>(
  (
    {
      societyName,
      societyLogoUrl,
      eventName,
      eventDateLine,
      venueLine,
      eventFormatRaw,
      eventFormatLabel,
      rankingPolicyLine,
      poolName,
      potMasterName,
      entryAmountLabel,
      confirmedCount,
      totalPotLabel,
      rulesLines,
      potMasterNotes,
      eventPaymentInstructions,
      entrants,
      showSplitterScores,
    },
    ref,
  ) => {
    const display = entrants.slice(0, MAX_ROWS);
    const overflow = Math.max(0, entrants.length - display.length);
    const rulesToShow = rulesLines.filter((s) => s.trim().length > 0);
    const notesTrim = potMasterNotes?.trim() ?? "";
    const payTrim = eventPaymentInstructions?.trim() ?? "";

    return (
      <View
        ref={ref}
        testID="prize-pool-entrants-share"
        style={styles.root}
        collapsable={false}
      >
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.logoCol}>
              <SocietyLogoImage
                logoUrl={societyLogoUrl}
                size={88}
                variant="hero"
                placeholderText={societyName.slice(0, 2).toUpperCase() || "GS"}
              />
            </View>
            <View style={styles.headerTextCol}>
              <Text style={styles.societyName} numberOfLines={2}>
                {societyName || "Society"}
              </Text>
              <Text style={styles.eventTitle} numberOfLines={3}>
                {eventName}
              </Text>
              <Text style={styles.metaMuted}>{eventDateLine}</Text>
              {venueLine ? (
                <Text style={styles.metaMuted} numberOfLines={2}>
                  {venueLine}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.hairline} />

          {/* Pool title */}
          <Text style={styles.kicker}>Prize pool</Text>
          <Text style={styles.poolName} numberOfLines={3}>
            {poolName}
          </Text>
          <Text style={styles.hostedBy}>
            Hosted by <Text style={styles.hostedByStrong}>{potMasterName?.trim() || "Pot Master (not assigned)"}</Text>
          </Text>

          {/* Stats */}
          <View style={styles.statGrid}>
            <View style={styles.statCell}>
              <Text style={styles.statLabel}>Entry</Text>
              <Text style={styles.statValue} numberOfLines={3}>
                {entryAmountLabel}
              </Text>
            </View>
            <View style={styles.statCell}>
              <Text style={styles.statLabel}>Confirmed</Text>
              <Text style={styles.statValue}>{String(confirmedCount)}</Text>
            </View>
            <View style={styles.statCell}>
              <Text style={styles.statLabel}>Total pot</Text>
              <Text style={styles.statValue}>{totalPotLabel}</Text>
            </View>
          </View>

          {/* Format context */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Event scoring</Text>
            <Text style={styles.sectionBody}>
              Format: {eventFormatLabel}
              {eventFormatRaw ? "" : " (missing on event — confirm in event settings)"}
            </Text>
            <Text style={styles.sectionBodyMuted}>{rankingPolicyLine}</Text>
          </View>

          {/* Rules */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Rules & payout structure</Text>
            {rulesToShow.length === 0 ? (
              <Text style={styles.sectionBodyMuted}>No rules specified.</Text>
            ) : (
              rulesToShow.map((line, i) => (
                <Text key={`rule-${i}`} style={styles.ruleBullet}>
                  {"\u2022 "}
                  {line}
                </Text>
              ))
            )}
          </View>

          {/* Pot Master notes */}
          {notesTrim.length > 0 ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Pot Master message</Text>
              <Text style={styles.sectionBody}>{notesTrim}</Text>
            </View>
          ) : null}

          {/* Event-wide payment copy */}
          {payTrim.length > 0 ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Payment notes (event)</Text>
              <Text style={styles.sectionBody}>{payTrim}</Text>
            </View>
          ) : null}

          {/* Entrants */}
          <Text style={styles.tableTitle}>Pot Master–confirmed entrants</Text>
          <View style={styles.table}>
            <View style={[styles.tr, styles.trHead]}>
              <Text style={[styles.th, styles.colIdx]}>#</Text>
              <Text style={[styles.th, styles.colName]}>Name</Text>
              {showSplitterScores ? (
                <>
                  <Text style={[styles.th, styles.colNum]}>F9</Text>
                  <Text style={[styles.th, styles.colNum]}>B9</Text>
                  <Text style={[styles.th, styles.colNum]}>Brd</Text>
                </>
              ) : null}
            </View>
            {display.length === 0 ? (
              <View style={styles.tr}>
                <Text style={[styles.td, { flex: 1, paddingVertical: 12, color: "#6B7280" }]}>
                  No confirmed entrants yet.
                </Text>
              </View>
            ) : (
              display.map((row, i) => (
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
              ))
            )}
          </View>
          {overflow > 0 ? (
            <Text style={styles.overflowNote}>+{overflow} more (not shown)</Text>
          ) : null}

          <View style={styles.brandFooter}>
            <Text style={styles.brandTitle}>The Golf Society Hub</Text>
            <Text style={styles.brandSub}>Prize pool share · Pot Master confirmed entrants</Text>
          </View>
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
    backgroundColor: "#FAFAFA",
    paddingHorizontal: 44,
    paddingVertical: 40,
  },
  sheet: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 36,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 20,
    marginBottom: 8,
  },
  logoCol: {
    paddingTop: 4,
  },
  headerTextCol: {
    flex: 1,
    minWidth: 0,
  },
  societyName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 6,
  },
  eventTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
    color: colors.light.primary,
    marginBottom: 8,
  },
  metaMuted: {
    fontSize: 18,
    lineHeight: 24,
    color: "#6B7280",
    marginTop: 2,
  },
  hairline: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 20,
  },
  kicker: {
    fontSize: 16,
    fontWeight: "700",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  poolName: {
    fontSize: 36,
    lineHeight: 42,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 10,
  },
  hostedBy: {
    fontSize: 20,
    color: "#4B5563",
    marginBottom: 22,
  },
  hostedByStrong: {
    fontWeight: "800",
    color: "#111827",
  },
  statGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 22,
  },
  statCell: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  statLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
  },
  sectionCard: {
    marginBottom: 18,
    padding: 16,
    borderRadius: 14,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#374151",
    marginBottom: 8,
  },
  sectionBody: {
    fontSize: 18,
    lineHeight: 26,
    color: "#1F2937",
  },
  sectionBodyMuted: {
    fontSize: 17,
    lineHeight: 24,
    color: "#6B7280",
    marginTop: 6,
  },
  ruleBullet: {
    fontSize: 17,
    lineHeight: 26,
    color: "#374151",
    marginBottom: 6,
    paddingRight: 8,
  },
  tableTitle: {
    marginTop: 8,
    marginBottom: 10,
    fontSize: 18,
    fontWeight: "800",
    color: "#374151",
  },
  table: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    overflow: "hidden",
  },
  tr: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 46,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  trHead: {
    backgroundColor: "#EEF2FF",
    minHeight: 44,
  },
  trAlt: {
    backgroundColor: "#F9FAFB",
  },
  th: {
    fontSize: 15,
    fontWeight: "800",
    color: "#374151",
  },
  td: {
    fontSize: 17,
    color: "#111827",
  },
  colIdx: {
    width: 40,
    textAlign: "center",
  },
  colName: {
    flex: 1,
    paddingRight: 8,
  },
  colNum: {
    width: 52,
    textAlign: "center",
  },
  overflowNote: {
    marginTop: 10,
    fontSize: 16,
    color: "#6B7280",
  },
  brandFooter: {
    marginTop: 28,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    alignItems: "center",
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.light.primary,
    letterSpacing: -0.3,
  },
  brandSub: {
    marginTop: 6,
    fontSize: 15,
    color: "#9CA3AF",
    fontWeight: "600",
  },
});
