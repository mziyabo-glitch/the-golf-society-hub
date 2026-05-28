import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { type GroupedPlayer } from "@/lib/teeSheetGrouping";
import { type TeeSheetData } from "@/lib/teeSheetPdf";
import { formatHandicap } from "@/lib/whs";
import {
  buildInfoCards,
  buildPosterHeader,
  formatCompetitionLine,
} from "@/lib/teeSheet/teeSheetPosterMeta";
import { teeIndicatorForAssignment, type TeeAssignment } from "@/lib/teeSheet/teeAssignment";

const m4FairwayLogo = require("@/assets/images/m4-fairway-logo.png");

export const posterTokens = {
  bg: "#FFFFFF",
  navy: "#0B1F3A",
  green: "#0E7A3D",
  gold: "#C6A663",
  border: "#E6EAF0",
  muted: "#64748B",
  shadow: "#0B1F3A20",
  cardRadius: 20,
  pillRadius: 999,
};

const PAGE_WIDTH = 900;
const PAGE_HEIGHT = 792;
const MAX_GROUPS_PER_PAGE = 12;

export type PosterPlayer = GroupedPlayer & {
  gender: "male" | "female" | null;
  playingHandicap: number | null;
  teeAssignment: TeeAssignment;
  manualOverride?: boolean;
};

export type PosterGroup = {
  groupNumber: number;
  teeTime: string;
  players: PosterPlayer[];
};

function getTeeIndicator(player: PosterPlayer, data: TeeSheetData): { label: string; color: string } {
  return teeIndicatorForAssignment(data, player.teeAssignment);
}

export const TeeGroupCard = React.memo(function TeeGroupCard({
  group,
  data,
}: {
  group: PosterGroup;
  data: TeeSheetData;
}) {
  return (
    <View style={styles.groupCard}>
      <View style={styles.groupTopRow}>
        <View style={styles.teeTimeBadge}>
          <Text style={styles.teeTimeLabel}>{group.teeTime}</Text>
        </View>
        <Text style={styles.groupId}>Group {group.groupNumber}</Text>
      </View>

      <View style={styles.groupHeaderRow}>
        <Text style={[styles.groupHeaderText, styles.playerCol]}>Player</Text>
        <Text style={styles.groupHeaderText}>HI</Text>
        <Text style={styles.groupHeaderText}>PH</Text>
        <Text style={styles.groupHeaderText}>Tee</Text>
      </View>

      {Array.from({ length: 4 }).map((_, idx) => {
        const player = group.players[idx] ?? null;
        const tee = player ? getTeeIndicator(player, data) : null;
        const isAlt = idx % 2 === 1;
        return (
          <View key={`${group.groupNumber}-${idx}`} style={[styles.playerRow, isAlt ? styles.playerRowAlt : null]}>
            <View style={styles.playerCell}>
              <View style={styles.playerNumberCircle}>
                <Text style={styles.playerNumberText}>{idx + 1}</Text>
              </View>
              <Text style={styles.playerName} numberOfLines={1}>
                {player?.name || "-"}
              </Text>
            </View>
            <Text style={styles.playerStat}>{player ? formatHandicap(player.handicapIndex, 1) : "-"}</Text>
            <Text style={styles.playerStatStrong}>{player ? formatHandicap(player.playingHandicap) : "-"}</Text>
            <View style={styles.teeCompactWrap}>
              <View style={[styles.teeDot, tee ? { backgroundColor: tee.color } : null]} />
              <Text style={[styles.teeCompactLabel, tee ? { color: tee.color } : null]} numberOfLines={1}>
                {tee?.label || "Tee TBC"}
              </Text>
              {player?.manualOverride ? (
                <Feather
                  name="shield"
                  size={10}
                  color={posterTokens.navy}
                  accessibilityLabel="Manual tee override"
                />
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
});

export const TeeSheetPoster = React.forwardRef<View, {
  data: TeeSheetData;
  groups: PosterGroup[];
  pageIndex: number;
  pageCount: number;
}>(({ data, groups, pageIndex, pageCount }, ref) => {
  const header = buildPosterHeader(data);
  const infoCards = buildInfoCards(data);
  const leftGroups = groups.slice(0, 6);
  const rightGroups = groups.slice(6, MAX_GROUPS_PER_PAGE);
  const ntp = formatCompetitionLine(data.nearestPinHoles);
  const ld = formatCompetitionLine(data.longestDriveHoles);

  return (
    <View ref={ref} style={styles.poster} collapsable={false}>
      <Text style={styles.watermark}>M4 FAIRWAY</Text>
      <View style={styles.headerCard}>
        <View style={styles.logoWrap}>
          <Image source={m4FairwayLogo} style={styles.logo} resizeMode="contain" />
        </View>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>{header.title}</Text>
          <View style={styles.subtitleBadge}>
            <Text style={styles.subtitleText}>{header.badge}</Text>
          </View>
        </View>
      </View>

      <View style={styles.infoBar}>
        {infoCards.map((card) => (
          <View key={card.label} style={styles.infoCard}>
            <Text style={styles.infoLabel}>{card.label}</Text>
            <Text style={styles.infoValue} numberOfLines={2}>{card.value}</Text>
          </View>
        ))}
      </View>

      <View style={styles.groupColumns}>
        <View style={styles.groupColumn}>
          {leftGroups.map((group) => <TeeGroupCard key={`left-${group.groupNumber}`} group={group} data={data} />)}
        </View>
        <View style={styles.groupColumn}>
          {rightGroups.map((group) => <TeeGroupCard key={`right-${group.groupNumber}`} group={group} data={data} />)}
        </View>
      </View>

      <View style={styles.footerStrip}>
        <View style={styles.footerCard}>
          <Text style={styles.footerCardTitle}>Nearest the Pin</Text>
          <Text style={styles.footerCardBody}>{ntp}</Text>
        </View>
        <View style={styles.footerCard}>
          <Text style={styles.footerCardTitle}>Longest Drive</Text>
          <Text style={styles.footerCardBody}>{ld}</Text>
        </View>
        <View style={styles.brandFooter}>
          <Text style={styles.brandFooterText}>Produced by The Golf Society Hub</Text>
          <Text style={styles.legendText}>Tee colours: yellow = Men, red = Ladies</Text>
          <Text style={styles.brandFooterPage}>Page {pageIndex + 1} / {pageCount}</Text>
        </View>
      </View>
    </View>
  );
});

TeeSheetPoster.displayName = "TeeSheetPoster";

const styles = StyleSheet.create({
  poster: {
    width: PAGE_WIDTH,
    minHeight: PAGE_HEIGHT,
    backgroundColor: posterTokens.bg,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 16,
    marginBottom: 14,
  },
  watermark: {
    position: "absolute",
    top: 18,
    left: 280,
    color: "#0B1F3A10",
    fontSize: 64,
    fontWeight: "800",
    letterSpacing: 3,
  },
  headerCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: posterTokens.border,
    padding: 16,
    backgroundColor: "#FFFFFF",
    shadowColor: posterTokens.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  logoWrap: {
    width: 300,
    height: 118,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  logo: {
    width: 288,
    height: 108,
  },
  titleWrap: {
    flex: 1,
    alignItems: "center",
    paddingRight: 12,
  },
  title: {
    color: posterTokens.navy,
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: 0.6,
    textAlign: "center",
  },
  subtitleBadge: {
    marginTop: 10,
    borderRadius: posterTokens.pillRadius,
    borderWidth: 1,
    borderColor: `${posterTokens.green}70`,
    backgroundColor: `${posterTokens.green}10`,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  subtitleText: {
    color: posterTokens.green,
    fontWeight: "700",
    fontSize: 12,
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  infoBar: {
    marginTop: 14,
    flexDirection: "row",
    gap: 10,
  },
  infoCard: {
    flex: 1,
    minHeight: 74,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: posterTokens.border,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: posterTokens.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  infoLabel: {
    color: posterTokens.muted,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: 4,
    fontWeight: "700",
  },
  infoValue: {
    color: posterTokens.navy,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 18,
  },
  groupColumns: {
    marginTop: 12,
    flexDirection: "row",
    gap: 12,
    flex: 1,
  },
  groupColumn: {
    flex: 1,
    gap: 10,
  },
  groupCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: posterTokens.border,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
    shadowColor: posterTokens.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  groupTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 10,
    paddingBottom: 8,
  },
  teeTimeBadge: {
    backgroundColor: posterTokens.green,
    borderRadius: posterTokens.pillRadius,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  teeTimeLabel: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  groupId: {
    color: posterTokens.navy,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  groupHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: posterTokens.navy,
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 10,
  },
  groupHeaderText: {
    width: 40,
    textAlign: "right",
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  playerCol: {
    flex: 1,
    width: undefined,
    textAlign: "left",
  },
  playerRow: {
    minHeight: 38,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: posterTokens.border,
  },
  playerRowAlt: {
    backgroundColor: "#F8FAFC",
  },
  playerCell: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  playerNumberCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF2F7",
    borderWidth: 1,
    borderColor: "#DCE3EE",
  },
  playerNumberText: {
    color: posterTokens.navy,
    fontSize: 10,
    fontWeight: "700",
  },
  playerName: {
    color: posterTokens.navy,
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
  playerStat: {
    width: 40,
    textAlign: "right",
    color: "#334155",
    fontSize: 12,
    fontWeight: "600",
  },
  playerStatStrong: {
    width: 40,
    textAlign: "right",
    color: posterTokens.navy,
    fontSize: 12,
    fontWeight: "800",
  },
  teeCompactWrap: {
    width: 78,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    minWidth: 0,
  },
  teeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#94A3B8",
  },
  teeCompactLabel: {
    color: "#64748B",
    fontWeight: "700",
    fontSize: 10,
    flexShrink: 1,
    minWidth: 0,
    textAlign: "right",
  },
  footerStrip: {
    marginTop: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: posterTokens.border,
    backgroundColor: "#FFFFFF",
    padding: 10,
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
  },
  footerCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: posterTokens.border,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  footerCardTitle: {
    color: posterTokens.navy,
    fontWeight: "800",
    fontSize: 12,
    marginBottom: 4,
  },
  footerCardBody: {
    color: "#334155",
    fontWeight: "600",
    fontSize: 12,
  },
  brandFooter: {
    width: 230,
    justifyContent: "space-between",
    paddingVertical: 2,
    borderLeftWidth: 1,
    borderLeftColor: posterTokens.border,
    paddingLeft: 10,
  },
  brandFooterText: {
    color: posterTokens.navy,
    fontSize: 11,
    fontWeight: "700",
  },
  legendText: {
    color: "#475569",
    fontSize: 10,
    fontWeight: "600",
  },
  brandFooterPage: {
    color: posterTokens.muted,
    fontSize: 10,
    fontWeight: "600",
  },
});
