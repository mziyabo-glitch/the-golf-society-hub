/**
 * OOM Share Screen
 *
 * Renders a clean "document-style" Order of Merit leaderboard and captures it
 * as a PNG via react-native-view-shot. No tabs, no app chrome — just the image.
 *
 * Route: /(app)/oom-share?societyId=...
 */

import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { getOrderOfMeritTotals, getOrderOfMeritLog } from "@/lib/db_supabase/resultsRepo";
import { getSociety } from "@/lib/db_supabase/societyRepo";
import { getMembersBySocietyId } from "@/lib/db_supabase/memberRepo";
import { buildWinsMap, buildPlayedMap } from "@/lib/pdf/oomPdf";
import { captureAndShare } from "@/lib/share/captureAndShare";

// ── Constants ────────────────────────────────────────────────────────────────

const BRAND_GREEN = "#0B6E4F";
const GOLD_BG = "#FFFBEB";
const CARD_WIDTH = 420;

// ── Types ────────────────────────────────────────────────────────────────────

type OomRow = {
  position: number;
  memberName: string;
  handicapLabel: string | null;
  points: number;
  wins: number;
  played: number;
};

type ShareData = {
  rows: OomRow[];
  societyName: string;
  logoUrl: string | null;
  seasonYear: number;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatPoints(pts: number): string {
  if (pts === Math.floor(pts)) return pts.toString();
  return pts.toFixed(1);
}

function getMedalEmoji(pos: number): string | null {
  if (pos === 1) return "🥇";
  if (pos === 2) return "🥈";
  if (pos === 3) return "🥉";
  return null;
}

// ── Screen ───────────────────────────────────────────────────────────────────

export default function OomShareScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ societyId?: string }>();
  const societyId = Array.isArray(params.societyId)
    ? params.societyId[0]
    : params.societyId;

  const scrollRef = useRef<ScrollView>(null);
  const [data, setData] = useState<ShareData | null>(null);
  const [layoutReady, setLayoutReady] = useState(false);
  const [logoReady, setLogoReady] = useState(false);
  const hasCaptured = useRef(false);

  // ── Fetch data ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!societyId) {
      Alert.alert("Error", "Missing society.");
      router.back();
      return;
    }

    (async () => {
      try {
        const [society, totals, log, members] = await Promise.all([
          getSociety(societyId),
          getOrderOfMeritTotals(societyId),
          getOrderOfMeritLog(societyId),
          getMembersBySocietyId(societyId),
        ]);

        const memberMap = new Map(members.map((m) => [m.id, m]));
        const winsMap = buildWinsMap(log);
        const playedMap = buildPlayedMap(log);

        // Filter to members with points > 0, sort by points desc → wins desc → name asc
        const sorted = totals
          .filter((e) => e.totalPoints > 0)
          .sort((a, b) => {
            if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
            const wA = winsMap.get(a.memberId) || 0;
            const wB = winsMap.get(b.memberId) || 0;
            if (wB !== wA) return wB - wA;
            return a.memberName.localeCompare(b.memberName);
          });

        // Assign positions with tie handling
        let pos = 1;
        let lastPts: number | null = null;

        const rows: OomRow[] = sorted.map((entry, idx) => {
          if (lastPts !== null && entry.totalPoints < lastPts) pos = idx + 1;
          lastPts = entry.totalPoints;

          const member = memberMap.get(entry.memberId);
          const hi =
            (member as any)?.playing_handicap ??
            member?.handicapIndex ??
            (member as any)?.handicap_index ??
            null;
          const handicapLabel = hi != null ? Number(hi).toFixed(1) : null;

          return {
            position: pos,
            memberName: entry.memberName,
            handicapLabel,
            points: entry.totalPoints,
            wins: winsMap.get(entry.memberId) || 0,
            played: playedMap.get(entry.memberId) || 0,
          };
        });

        const logoUrl =
          (society as any)?.logo_url || (society as any)?.logoUrl || null;

        setData({
          rows,
          societyName: society?.name || "Golf Society",
          logoUrl,
          seasonYear: new Date().getFullYear(),
        });

        // Prefetch logo
        if (logoUrl) {
          Image.prefetch(logoUrl)
            .then(() => setLogoReady(true))
            .catch(() => setLogoReady(true));
        } else {
          setLogoReady(true);
        }
      } catch (err: any) {
        console.error("[oom-share] load error:", err);
        Alert.alert("Error", "Failed to load leaderboard data.");
        router.back();
      }
    })();
  }, [societyId]);

  // ── Capture + share when ready ─────────────────────────────────────────────

  useEffect(() => {
    if (!data || !layoutReady || !logoReady || hasCaptured.current) return;
    hasCaptured.current = true;

    (async () => {
      try {
        // Wait for paint
        await new Promise((r) => setTimeout(r, 400));

        await captureAndShare(scrollRef, {
          dialogTitle: "Order of Merit",
        });
      } catch (err: any) {
        console.error("[oom-share] capture error:", err);
        Alert.alert("Error", err?.message || "Failed to share.");
      } finally {
        router.back();
      }
    })();
  }, [data, layoutReady, logoReady]);

  // ── Loading state ──────────────────────────────────────────────────────────

  if (!data) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Generating leaderboard...</Text>
      </View>
    );
  }

  // ── Render document ────────────────────────────────────────────────────────

  const { rows, societyName, logoUrl, seasonYear } = data;

  return (
    <View style={styles.screen}>
      <ScrollView
        ref={scrollRef}
        onLayout={() => setLayoutReady(true)}
        contentContainerStyle={styles.pageContainer}
      >
        <View style={styles.page} collapsable={false}>
          {/* Logo */}
          {logoUrl ? (
            <Image
              source={{ uri: logoUrl }}
              style={styles.logo}
              resizeMode="contain"
            />
          ) : null}

          {/* Title */}
          <Text style={styles.title}>Order of Merit</Text>
          <Text style={styles.subtitle}>
            {societyName} — {seasonYear}
          </Text>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Table */}
          <View style={styles.table}>
            {/* Header row */}
            <View style={styles.headerRow}>
              <Text style={[styles.headerCell, styles.posCol]}>Pos</Text>
              <Text style={[styles.headerCell, styles.memberCol]}>Member</Text>
              <Text style={[styles.headerCell, styles.numCol]}>Points</Text>
              <Text style={[styles.headerCell, styles.numCol]}>Wins</Text>
              <Text style={[styles.headerCell, styles.numCol]}>Played</Text>
            </View>

            {/* Data rows */}
            {rows.map((row, index) => {
              const medal = getMedalEmoji(row.position);
              const isTop3 = row.position <= 3;
              const isLast = index === rows.length - 1;

              return (
                <View
                  key={`${row.memberName}-${index}`}
                  style={[
                    styles.dataRow,
                    isTop3 && styles.dataRowTop3,
                    index % 2 === 1 && !isTop3 && styles.dataRowAlt,
                    isLast && styles.dataRowLast,
                  ]}
                >
                  <View style={styles.posCol}>
                    {medal ? (
                      <Text style={styles.medalText}>{medal}</Text>
                    ) : (
                      <Text style={styles.posText}>{row.position}</Text>
                    )}
                  </View>
                  <View style={styles.memberCol}>
                    <Text
                      style={[styles.memberName, isTop3 && styles.memberNameTop3]}
                      numberOfLines={1}
                    >
                      {row.memberName}
                    </Text>
                    {row.handicapLabel && (
                      <Text style={styles.handicapText}>
                        HCP: {row.handicapLabel}
                      </Text>
                    )}
                  </View>
                  <Text
                    style={[
                      styles.numCell,
                      styles.numCol,
                      isTop3 && styles.pointsTop3,
                    ]}
                  >
                    {formatPoints(row.points)}
                  </Text>
                  <Text style={[styles.numCell, styles.numCol]}>{row.wins}</Text>
                  <Text style={[styles.numCell, styles.numCol]}>{row.played}</Text>
                </View>
              );
            })}
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <View style={styles.footerLine} />
            <Text style={styles.footerText}>
              Produced by The Golf Society Hub
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F3F4F6",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
  },
  loadingText: {
    fontSize: 16,
    color: "#6B7280",
    fontWeight: "500",
  },
  pageContainer: {
    alignItems: "center",
    paddingVertical: 24,
  },
  page: {
    backgroundColor: "#FFFFFF",
    width: CARD_WIDTH,
    paddingTop: 28,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderRadius: 16,
    // Shadow for screen preview
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },

  // Logo
  logo: {
    width: 56,
    height: 56,
    borderRadius: 12,
    alignSelf: "center",
    marginBottom: 8,
  },

  // Title
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: BRAND_GREEN,
    textAlign: "center",
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "400",
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 16,
  },

  // Divider
  divider: {
    height: 3,
    backgroundColor: BRAND_GREEN,
    borderRadius: 2,
    marginBottom: 0,
  },

  // Table
  table: {
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderTopWidth: 0,
  },
  headerRow: {
    flexDirection: "row",
    backgroundColor: BRAND_GREEN,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  headerCell: {
    fontSize: 11,
    fontWeight: "600",
    color: "#FFFFFF",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  dataRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  dataRowAlt: {
    backgroundColor: "#FAFAFA",
  },
  dataRowTop3: {
    backgroundColor: GOLD_BG,
  },
  dataRowLast: {
    borderBottomWidth: 0,
  },

  // Column widths
  posCol: {
    width: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  memberCol: {
    flex: 1,
    justifyContent: "center",
  },
  numCol: {
    width: 52,
    alignItems: "center",
    justifyContent: "center",
  },

  // Cell text
  medalText: {
    fontSize: 18,
  },
  posText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
    textAlign: "center",
  },
  memberName: {
    fontSize: 14,
    fontWeight: "500",
    color: "#111827",
  },
  memberNameTop3: {
    fontWeight: "600",
  },
  handicapText: {
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 1,
  },
  numCell: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
    textAlign: "center",
  },
  pointsTop3: {
    fontWeight: "700",
    color: BRAND_GREEN,
  },

  // Footer
  footer: {
    marginTop: 20,
    alignItems: "center",
  },
  footerLine: {
    width: 60,
    height: 2,
    backgroundColor: "#E5E7EB",
    borderRadius: 1,
    marginBottom: 10,
  },
  footerText: {
    fontSize: 11,
    color: "#9CA3AF",
    fontStyle: "italic",
  },
});
