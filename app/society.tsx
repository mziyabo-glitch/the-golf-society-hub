import { InfoCard } from "@/components/ui/info-card";
import { PrimaryButton } from "@/components/ui/primary-button";
import { SecondaryActionButton } from "@/components/ui/secondary-action-button";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";

const STORAGE_KEY = "GSOCIETY_ACTIVE";
const EVENTS_KEY = "GSOCIETY_EVENTS";
const MEMBERS_KEY = "GSOCIETY_MEMBERS";
const SCORES_KEY = "GSOCIETY_SCORES";
const DRAFT_KEY = "GSOCIETY_DRAFT";

type SocietyData = {
  name: string;
  homeCourse: string;
  country: string;
  scoringMode: "Stableford" | "Strokeplay" | "Both";
  handicapRule: "Allow WHS" | "Fixed HCP" | "No HCP";
};

type EventData = {
  id: string;
  name: string;
  date: string;
  courseName: string;
  format: "Stableford" | "Strokeplay" | "Both";
};

type MemberData = {
  id: string;
  name: string;
  handicap?: number;
};

type ScoreData = {
  stableford?: number;
  strokeplay?: number;
};

type ScoresData = {
  [eventId: string]: {
    [memberId: string]: ScoreData;
  };
};

export default function SocietyDashboardScreen() {
  const [society, setSociety] = useState<SocietyData | null>(null);
  const [events, setEvents] = useState<EventData[]>([]);
  const [members, setMembers] = useState<MemberData[]>([]);
  const [scores, setScores] = useState<ScoresData>({});
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      const societyData = await AsyncStorage.getItem(STORAGE_KEY);
      if (societyData) {
        setSociety(JSON.parse(societyData));
      }

      const eventsData = await AsyncStorage.getItem(EVENTS_KEY);
      if (eventsData) {
        setEvents(JSON.parse(eventsData));
      }

      const membersData = await AsyncStorage.getItem(MEMBERS_KEY);
      if (membersData) {
        setMembers(JSON.parse(membersData));
      }

      const scoresData = await AsyncStorage.getItem(SCORES_KEY);
      if (scoresData) {
        setScores(JSON.parse(scoresData));
      }
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getNextEvent = (): EventData | null => {
    if (events.length === 0) return null;
    const now = new Date().getTime();
    const futureEvents = events
      .filter((e) => {
        if (!e.date) return false;
        const eventDate = new Date(e.date).getTime();
        return eventDate >= now;
      })
      .sort((a, b) => {
        const dateA = a.date ? new Date(a.date).getTime() : Infinity;
        const dateB = b.date ? new Date(b.date).getTime() : Infinity;
        return dateA - dateB;
      });
    return futureEvents.length > 0 ? futureEvents[0] : null;
  };

  const getLastEvent = (): EventData | null => {
    if (events.length === 0) return null;
    const sorted = [...events].sort((a, b) => {
      const dateA = a.date ? new Date(a.date).getTime() : 0;
      const dateB = b.date ? new Date(b.date).getTime() : 0;
      return dateB - dateA;
    });
    return sorted[0];
  };

  const getLastWinner = (event: EventData | null): { memberName: string } | null => {
    if (!event || !scores[event.id]) return null;

    const eventScores = scores[event.id];
    const memberScores = members
      .map((member) => {
        const memberScore = eventScores[member.id];
        if (!memberScore) return null;

        let score: number | null = null;
        let useStableford = false;

        if (event.format === "Stableford" && memberScore.stableford !== undefined) {
          score = memberScore.stableford;
          useStableford = true;
        } else if (event.format === "Strokeplay" && memberScore.strokeplay !== undefined) {
          score = memberScore.strokeplay;
          useStableford = false;
        } else if (event.format === "Both") {
          if (memberScore.stableford !== undefined) {
            score = memberScore.stableford;
            useStableford = true;
          } else if (memberScore.strokeplay !== undefined) {
            score = memberScore.strokeplay;
            useStableford = false;
          }
        }

        return score !== null ? { member, score, useStableford } : null;
      })
      .filter((item): item is { member: MemberData; score: number; useStableford: boolean } => item !== null);

    if (memberScores.length === 0) return null;

    const sorted = memberScores.sort((a, b) => {
      if (a.useStableford) {
        return b.score - a.score;
      } else {
        return a.score - b.score;
      }
    });

    return {
      memberName: sorted[0].member.name,
    };
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#0B6E4F" />
      </View>
    );
  }

  if (!society) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.emptyTitle}>No Society Found</Text>
        <Text style={styles.emptyText}>Create a society to get started</Text>
        <PrimaryButton
          label="Create Society"
          onPress={() => router.push("/create-society")}
          style={styles.emptyButton}
        />
      </View>
    );
  }

  const nextEvent = getNextEvent();
  const lastEvent = getLastEvent();
  const lastWinner = lastEvent ? getLastWinner(lastEvent) : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.content}>
        <Text style={styles.societyName}>{society.name}</Text>

        <PrimaryButton
          label="Create Event"
          onPress={() => router.push("/create-event" as any)}
          style={styles.primaryCTA}
        />

        <View style={styles.secondaryActions}>
          <SecondaryActionButton
            label="Members"
            onPress={() => router.push("/members" as any)}
            style={styles.secondaryButton}
          />
          <SecondaryActionButton
            label="History"
            onPress={() => router.push("/history" as any)}
            style={styles.secondaryButton}
          />
          <SecondaryActionButton
            label="Settings"
            onPress={() => router.push("/settings" as any)}
            style={styles.secondaryButton}
          />
        </View>

        {nextEvent ? (
          <InfoCard
            title={nextEvent.name}
            subtitle={nextEvent.date || "No date"}
            detail={nextEvent.courseName || undefined}
            ctaLabel="View / Edit"
            onPress={() => router.push(`/event/${nextEvent.id}` as any)}
          />
        ) : (
          <InfoCard
            title="No upcoming event yet"
            subtitle="Create your first event to get started"
            emptyState
          />
        )}

        {lastEvent ? (
          <InfoCard
            title={lastEvent.name}
            subtitle={lastEvent.date || "No date"}
            detail={
              lastWinner
                ? `Winner: ${lastWinner.memberName}`
                : lastEvent.courseName || undefined
            }
            ctaLabel="View Summary"
            onPress={() => router.push(`/event/${lastEvent.id}` as any)}
          />
        ) : (
          <InfoCard
            title="No past events yet"
            subtitle="Your event history will appear here"
            emptyState
          />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  contentContainer: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    padding: 20,
    maxWidth: 600,
    alignSelf: "center",
    width: "100%",
  },
  centerContent: {
    justifyContent: "center",
    alignItems: "center",
  },
  societyName: {
    fontSize: 36,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 24,
    marginTop: 8,
  },
  primaryCTA: {
    marginBottom: 16,
  },
  secondaryActions: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 24,
  },
  secondaryButton: {
    flex: 1,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    opacity: 0.7,
    color: "#111827",
    marginBottom: 24,
  },
  emptyButton: {
    minWidth: 200,
  },
});
