/**
 * Off-screen export card for calculated prize pool payout results (Pot and Pot Splitter).
 */

import React, { forwardRef } from "react";
import { View, Text, StyleSheet } from "react-native";
import { SocietyLogoImage } from "@/components/ui/SocietyLogoImage";
import { colors } from "@/lib/ui/theme";
import type { PrizePoolResultsShareSection } from "@/lib/event-prize-pool-share";

export type PrizePoolResultsShareCardProps = {
  societyName: string;
  societyLogoUrl: string | null;
  eventName: string;
  eventDateLine: string;
  venueLine: string | null;
  poolName: string;
  potMasterName: string | null;
  /** e.g. "Prize Pool (Pot)" or "Prize Pool (Pot) Splitter" */
  poolKindLabel: string;
  eventFormatLabel: string;
  rankingPolicyLine: string;
  metaLines: string[];
  splitterRollNote: string | null;
  sections: PrizePoolResultsShareSection[];
  poolStatusLabel: string;
  lastCalculatedLabel: string | null;
  paymentInstructions: string | null;
};

const EXPORT_WIDTH = 1080;
const MAX_ROWS_PER_SECTION = 36;

const PrizePoolResultsShareCard = forwardRef<View, PrizePoolResultsShareCardProps>(
  (
    {
      societyName,
      societyLogoUrl,
      eventName,
      eventDateLine,
      venueLine,
      poolName,
      potMasterName,
      poolKindLabel,
      eventFormatLabel,
      rankingPolicyLine,
      metaLines,
      splitterRollNote,
      sections,
      poolStatusLabel,
      lastCalculatedLabel,
      paymentInstructions,
    },
    ref,
  ) => {
    const payTrim = paymentInstructions?.trim() ?? "";
    const meta = metaLines.filter((s) => s.trim().length > 0);

    return (
      <View ref={ref} testID="prize-pool-results-share" style={styles.root} collapsable={false}>
        <View style={styles.sheet}>
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

          <Text style={styles.kicker}>Payout results</Text>
          <Text style={styles.poolName} numberOfLines={3}>
            {poolName}
          </Text>
          <Text style={styles.kindBadge}>{poolKindLabel}</Text>
          <Text style={styles.hostedBy}>
            Hosted by <Text style={styles.hostedByStrong}>{potMasterName?.trim() || "Pot Master (not assigned)"}</Text>
          </Text>

          <View style={styles.statGrid}>
            <View style={styles.statCell}>
              <Text style={styles.statLabel}>Pool status</Text>
              <Text style={styles.statValue} numberOfLines={2}>
                {poolStatusLabel}
              </Text>
            </View>
            <View style={styles.statCell}>
              <Text style={styles.statLabel}>Format</Text>
              <Text style={styles.statValue} numberOfLines={3}>
                {eventFormatLabel}
              </Text>
            </View>
            {lastCalculatedLabel ? (
              <View style={styles.statCell}>
                <Text style={styles.statLabel}>Calculated</Text>
                <Text style={styles.statValue} numberOfLines={3}>
                  {lastCalculatedLabel}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Scoring context</Text>
            <Text style={styles.sectionBodyMuted}>{rankingPolicyLine}</Text>
          </View>

          {meta.length > 0 ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Pool details</Text>
              {meta.map((line, i) => (
                <Text key={`meta-${i}`} style={styles.ruleBullet}>
                  {"\u2022 "}
                  {line}
                </Text>
              ))}
            </View>
          ) : null}

          {splitterRollNote ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Note</Text>
              <Text style={styles.sectionBody}>{splitterRollNote}</Text>
            </View>
          ) : null}

          {payTrim.length > 0 ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Payment notes (event)</Text>
              <Text style={styles.sectionBody}>{payTrim}</Text>
            </View>
          ) : null}

          {sections.map((sec, si) => {
            const display = sec.rows.slice(0, MAX_ROWS_PER_SECTION);
            const overflow = Math.max(0, sec.rows.length - display.length);
            return (
              <View key={`sec-${si}-${sec.title ?? "all"}`} style={{ marginBottom: 20 }}>
                <Text style={styles.tableTitle}>
                  {sec.title != null && String(sec.title).length > 0 ? sec.title : "Payouts"}
                </Text>
                <View style={styles.table}>
                  <View style={[styles.tr, styles.trHead]}>
                    <Text style={[styles.th, styles.colRank]}>#</Text>
                    <Text style={[styles.th, styles.colName]}>Player</Text>
                    <Text style={[styles.th, styles.colPos]}>Placing</Text>
                    <Text style={[styles.th, styles.colScore]}>Score</Text>
                    <Text style={[styles.th, styles.colPay]}>Payout</Text>
                  </View>
                  {display.map((row, ri) => (
                    <View key={`${row.playerName}-${ri}`} style={[styles.tr, ri % 2 === 1 ? styles.trAlt : undefined]}>
                      <Text style={[styles.td, styles.colRank]}>{ri + 1}</Text>
                      <View style={[styles.colName, styles.nameCell]}>
                        <Text style={styles.nameMain} numberOfLines={2}>
                          {row.playerName}
                        </Text>
                        {row.note ? (
                          <Text style={styles.nameNote} numberOfLines={2}>
                            {row.note}
                          </Text>
                        ) : null}
                      </View>
                      <Text style={[styles.td, styles.colPos]} numberOfLines={3}>
                        {row.positionLine}
                      </Text>
                      <Text style={[styles.td, styles.colScore]} numberOfLines={2}>
                        {row.scoreLine}
                      </Text>
                      <Text style={[styles.td, styles.colPay]} numberOfLines={1}>
                        {row.payoutLine}
                      </Text>
                    </View>
                  ))}
                </View>
                {overflow > 0 ? (
                  <Text style={styles.overflowNote}>+{overflow} more in this category (not shown)</Text>
                ) : null}
              </View>
            );
          })}

          <View style={styles.brandFooter}>
            <Text style={styles.brandTitle}>The Golf Society Hub</Text>
            <Text style={styles.brandSub}>Prize pool · calculated payout results</Text>
          </View>
        </View>
      </View>
    );
  },
);

PrizePoolResultsShareCard.displayName = "PrizePoolResultsShareCard";

export default PrizePoolResultsShareCard;

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
  logoCol: { paddingTop: 4 },
  headerTextCol: { flex: 1, minWidth: 0 },
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
    marginBottom: 8,
  },
  kindBadge: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.light.primary,
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
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 22,
  },
  statCell: {
    flexGrow: 1,
    flexBasis: "28%",
    minWidth: 200,
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
    fontSize: 20,
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
    alignItems: "flex-start",
    minHeight: 52,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  trHead: {
    backgroundColor: "#EEF2FF",
    minHeight: 44,
    alignItems: "center",
  },
  trAlt: { backgroundColor: "#F9FAFB" },
  th: {
    fontSize: 14,
    fontWeight: "800",
    color: "#374151",
  },
  td: {
    fontSize: 16,
    color: "#111827",
  },
  colRank: { width: 36, textAlign: "center", paddingTop: 4 },
  colName: { flex: 1, minWidth: 0, paddingRight: 6 },
  nameCell: { justifyContent: "center" },
  nameMain: { fontSize: 17, fontWeight: "800", color: "#111827" },
  nameNote: { fontSize: 13, color: "#6B7280", marginTop: 4, lineHeight: 18 },
  colPos: { width: 120, paddingTop: 4 },
  colScore: { width: 88, paddingTop: 4 },
  colPay: { width: 100, textAlign: "right", fontWeight: "800", paddingTop: 4 },
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
