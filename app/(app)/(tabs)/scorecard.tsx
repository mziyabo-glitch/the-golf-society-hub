/**
 * Matchday-first Scorecard tab — hero entry to live scoring (premium).
 * Official published results stay reachable without a seat (read-only leaderboard).
 */

import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { LicenceRequiredModal } from "@/components/LicenceRequiredModal";
import { useBootstrap } from "@/lib/useBootstrap";
import { usePaidAccess } from "@/lib/access/usePaidAccess";
import { getEventsForSociety, type EventDoc } from "@/lib/db_supabase/eventRepo";
import { findTodayScorecardEvent } from "@/lib/matchday/scorecardMatchday";
import { fetchPlayerRoundRow } from "@/lib/db_supabase/eventPlayerScoringRepo";
import { supabase } from "@/lib/supabase";
import { scoringPublishStatusFromEvent } from "@/lib/services/publishEventScoringService";
import { isOfficialScoringPublished } from "@/lib/scoring/eventScoringPublishStatus";
import { getColors, iconSize, spacing, radius } from "@/lib/ui/theme";
import { formatEventDate } from "@/features/home/homeFormatters";

export default function ScorecardTabScreen() {
  const router = useRouter();
  const colors = getColors();
  const tabBarHeight = useBottomTabBarHeight();
  const { societyId, society, member, loading: bootstrapLoading } = useBootstrap();
  const { needsLicence, guardPaidAction, modalVisible, setModalVisible, societyId: guardSocietyId } = usePaidAccess();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [todayEvent, setTodayEvent] = useState<EventDoc | null>(null);
  const [hasRoundProgress, setHasRoundProgress] = useState(false);
  const [officialPublished, setOfficialPublished] = useState(false);

  const load = useCallback(async () => {
    if (!societyId || !member?.id) {
      setTodayEvent(null);
      setHasRoundProgress(false);
      setOfficialPublished(false);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setError(null);
    try {
      const events = await getEventsForSociety(societyId);
      const ev = findTodayScorecardEvent(events);
      setTodayEvent(ev);
      const published = ev
        ? isOfficialScoringPublished(scoringPublishStatusFromEvent(ev))
        : false;
      setOfficialPublished(published);

      if (ev?.id && member.id && !needsLicence) {
        const row = await fetchPlayerRoundRow(supabase, ev.id, member.id);
        const played = row != null && Number((row as { holes_played?: unknown }).holes_played ?? 0) > 0;
        setHasRoundProgress(played);
      } else {
        setHasRoundProgress(false);
      }
    } catch (e) {
      setTodayEvent(null);
      setHasRoundProgress(false);
      setOfficialPublished(false);
      setError(e instanceof Error ? e.message : "Could not load events.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [societyId, member?.id, needsLicence]);

  useFocusEffect(
    useCallback(() => {
      if (bootstrapLoading) return;
      setLoading(true);
      void load();
    }, [bootstrapLoading, load]),
  );

  if (bootstrapLoading || loading) {
    return (
      <Screen>
        <LoadingState message="Loading scorecard…" />
      </Screen>
    );
  }

  if (!societyId) {
    return (
      <Screen>
        <EmptyState title="Join a society" message="Choose a society to use the scorecard." />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <EmptyState title="Something went wrong" message={error} />
        <SecondaryButton label="Retry" onPress={() => { setLoading(true); void load(); }} style={{ marginTop: spacing.base }} />
      </Screen>
    );
  }

  const societyName = String(society?.name ?? "Your society").trim();

  if (!todayEvent) {
    return (
      <Screen style={{ backgroundColor: colors.backgroundSecondary }}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: tabBarHeight + spacing.xl }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
        >
          <View style={styles.heroTop}>
            <View style={[styles.heroIcon, { backgroundColor: `${colors.primary}18` }]}>
              <Feather name="edit-3" size={36} color={colors.primary} />
            </View>
            <AppText variant="h1" style={styles.heroTitle}>
              Scorecard
            </AppText>
            <AppText variant="small" color="muted" style={styles.societyLine}>
              {societyName}
            </AppText>
            <AppText variant="body" color="secondary" style={styles.heroSub}>
              No in-play event today. When your society has a match on the calendar for today, your round starts here.
            </AppText>
          </View>
          <PrimaryButton label="Browse events" onPress={() => router.push("/(app)/(tabs)/events" as never)} />
          <AppCard style={styles.freePlayCard}>
            <AppText variant="captionBold" color="muted">
              Free play scorecard
            </AppText>
            <AppText variant="small" color="secondary" style={{ marginTop: spacing.xs, marginBottom: spacing.sm }}>
              Start a personal or social round outside events.
            </AppText>
            <PrimaryButton
              label="New free-play round"
              onPress={() => {
                if (!guardPaidAction()) return;
                router.push("/(app)/free-play" as never);
              }}
            />
            <SecondaryButton
              label="Join a round"
              onPress={() => router.push({ pathname: "/(app)/free-play", params: { join: "1" } } as never)}
              style={{ marginTop: spacing.sm }}
            />
          </AppCard>
        </ScrollView>
        <LicenceRequiredModal
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
          societyId={guardSocietyId}
        />
      </Screen>
    );
  }

  const dateLabel = formatEventDate(todayEvent.date);
  const liveCta = hasRoundProgress ? "Continue scoring" : "Start scoring";

  return (
    <Screen style={{ backgroundColor: colors.backgroundSecondary }}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: tabBarHeight + spacing.xl }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
      >
        <View style={styles.heroTop}>
          <View style={[styles.heroIcon, { backgroundColor: `${colors.primary}18` }]}>
            <Feather name="edit-3" size={36} color={colors.primary} />
          </View>
          <AppText variant="h1" style={styles.heroTitle}>
            Scorecard
          </AppText>
          <AppText variant="small" color="muted" style={styles.societyLine}>
            {societyName} · today
          </AppText>
        </View>

        <AppCard style={styles.eventCard}>
          <AppText variant="captionBold" color="muted">
            {"Today's event"}
          </AppText>
          <AppText variant="title" style={{ marginTop: spacing.xs }} numberOfLines={2}>
            {todayEvent.name}
          </AppText>
          <View style={styles.metaRow}>
            <Feather name="calendar" size={16} color={colors.textSecondary} />
            <AppText variant="small" color="secondary">
              {dateLabel}
            </AppText>
          </View>
        </AppCard>

        {needsLicence ? (
          <>
            <InlineNotice
              variant="info"
              message="Live scoring and round tracking need a society seat (or Captain access). Official published results stay free to view below."
            />
            <PrimaryButton label="Unlock live scoring" onPress={() => router.push("/(app)/premium-scoring" as never)} />
            <SecondaryButton label="Billing and seats" onPress={() => router.push("/(app)/billing" as never)} style={{ marginTop: spacing.sm }} />
          </>
        ) : (
          <>
            <AppText variant="small" color="secondary" style={{ marginBottom: spacing.md }}>
              {hasRoundProgress ? "Pick up your saved gross card." : "Open gross entry for this match."}
            </AppText>
            <PrimaryButton
              label={liveCta}
              onPress={() =>
                router.push({ pathname: "/(app)/event/[id]/gross-scores", params: { id: todayEvent.id } } as never)
              }
            />
          </>
        )}

        {officialPublished ? (
          <Pressable
            style={styles.secondaryLink}
            onPress={() =>
              router.push({
                pathname: "/(app)/event/[id]/gross-scores/leaderboard",
                params: { id: todayEvent.id },
              } as never)
            }
          >
            <AppText variant="bodyBold" color="primary">
              Official leaderboard
            </AppText>
            <Feather name="chevron-right" size={iconSize.sm} color={colors.primary} />
          </Pressable>
        ) : needsLicence ? null : (
          <Pressable
            style={styles.secondaryLink}
            onPress={() =>
              router.push({
                pathname: "/(app)/event/[id]/gross-scores/leaderboard",
                params: { id: todayEvent.id },
              } as never)
            }
          >
            <AppText variant="bodyBold" color="primary">
              Live leaderboard
            </AppText>
            <Feather name="chevron-right" size={iconSize.sm} color={colors.primary} />
          </Pressable>
        )}

        <View style={[styles.footer, { borderTopColor: colors.borderLight }]}>
          <PrimaryButton
            label="Free-play scorecard (personal/social)"
            onPress={() => router.push("/(app)/free-play" as never)}
            style={{ marginBottom: spacing.sm }}
          />
          <AppText variant="caption" color="tertiary" style={{ marginBottom: spacing.sm, textAlign: "center" }}>
            Free Play is separate from official event scoring and publishing.
          </AppText>
          <SecondaryButton
            label="Event details"
            onPress={() => router.push({ pathname: "/(app)/event/[id]", params: { id: todayEvent.id } } as never)}
          />
        </View>
      </ScrollView>
      <LicenceRequiredModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        societyId={guardSocietyId}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.lg,
  },
  heroTop: {
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  heroIcon: {
    width: 80,
    height: 80,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  heroTitle: {
    textAlign: "center",
  },
  societyLine: {
    textAlign: "center",
    marginTop: spacing.xs,
  },
  heroSub: {
    textAlign: "center",
    marginTop: spacing.sm,
    maxWidth: 340,
    paddingHorizontal: spacing.sm,
  },
  eventCard: {
    marginBottom: spacing.lg,
    padding: spacing.base,
  },
  freePlayCard: {
    marginTop: spacing.lg,
    padding: spacing.base,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  secondaryLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
  },
  footer: {
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
