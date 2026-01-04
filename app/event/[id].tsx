import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

const EVENTS_KEY = "GSOCIETY_EVENTS";
const MEMBERS_KEY = "GSOCIETY_MEMBERS";
const SCORES_KEY = "GSOCIETY_SCORES";

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

export default function EventDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [event, setEvent] = useState<EventData | null>(null);
  const [members, setMembers] = useState<MemberData[]>([]);
  const [scores, setScores] = useState<{ [memberId: string]: ScoreData }>({});
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      // Load event
      const eventsData = await AsyncStorage.getItem(EVENTS_KEY);
      if (eventsData) {
        const events: EventData[] = JSON.parse(eventsData);
        const foundEvent = events.find((e) => e.id === id);
        if (foundEvent) {
          setEvent(foundEvent);
        }
      }

      // Load members
      const membersData = await AsyncStorage.getItem(MEMBERS_KEY);
      if (membersData) {
        setMembers(JSON.parse(membersData));
      }

      // Load scores
      const scoresData = await AsyncStorage.getItem(SCORES_KEY);
      if (scoresData) {
        const allScores: ScoresData = JSON.parse(scoresData);
        if (allScores[id]) {
          setScores(allScores[id]);
        }
      }
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleScoreChange = (memberId: string, field: "stableford" | "strokeplay", value: string) => {
    setScores((prev) => ({
      ...prev,
      [memberId]: {
        ...prev[memberId],
        [field]: value.trim() ? parseFloat(value.trim()) : undefined,
      },
    }));
  };

  const handleSaveScores = async () => {
    try {
      // Load all scores
      const scoresData = await AsyncStorage.getItem(SCORES_KEY);
      const allScores: ScoresData = scoresData ? JSON.parse(scoresData) : {};

      // Update scores for this event
      allScores[id] = scores;

      // Save back
      await AsyncStorage.setItem(SCORES_KEY, JSON.stringify(allScores));

      Alert.alert("Success", "Scores saved successfully!");
    } catch (error) {
      console.error("Error saving scores:", error);
      Alert.alert("Error", "Failed to save scores");
    }
  };

  const getLeaderboard = () => {
    if (!event) return [];

    const memberScores = members
      .map((member) => {
        const memberScore = scores[member.id];
        let score: number | null = null;
        let useStableford = false;

        if (event.format === "Stableford" && memberScore?.stableford !== undefined) {
          score = memberScore.stableford;
          useStableford = true;
        } else if (event.format === "Strokeplay" && memberScore?.strokeplay !== undefined) {
          score = memberScore.strokeplay;
          useStableford = false;
        } else if (event.format === "Both") {
          // For "Both", prioritize Stableford if available, else Strokeplay
          if (memberScore?.stableford !== undefined) {
            score = memberScore.stableford;
            useStableford = true;
          } else if (memberScore?.strokeplay !== undefined) {
            score = memberScore.strokeplay;
            useStableford = false;
          }
        }

        return {
          member,
          score,
          useStableford,
          stableford: memberScore?.stableford,
          strokeplay: memberScore?.strokeplay,
        };
      })
      .filter((item) => item.score !== null);

    // Sort: Stableford = highest wins (descending), Strokeplay = lowest wins (ascending)
    return memberScores.sort((a, b) => {
      if (a.useStableford) {
        // Stableford: higher is better
        return (b.score || 0) - (a.score || 0);
      } else {
        // Strokeplay: lower is better
        return (a.score || Infinity) - (b.score || Infinity);
      }
    });
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.loadingText}>Loading event...</Text>
      </View>
    );
  }

  if (!event) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.errorText}>Event not found</Text>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.buttonText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  const leaderboard = getLeaderboard();

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>{event.name}</Text>
        <Text style={styles.subtitle}>Event Details</Text>

        {/* Event Info Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Event Information</Text>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Date</Text>
            <Text style={styles.fieldValue}>{event.date || "Not specified"}</Text>
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Course</Text>
            <Text style={styles.fieldValue}>{event.courseName || "Not specified"}</Text>
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Format</Text>
            <Text style={styles.fieldValue}>{event.format}</Text>
          </View>
        </View>

        {!showLeaderboard ? (
          <>
            {/* Scores Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Scores</Text>
              {members.length === 0 ? (
                <Text style={styles.emptyText}>No members added yet</Text>
              ) : (
                members.map((member) => (
                  <View key={member.id} style={styles.scoreCard}>
                    <Text style={styles.memberName}>{member.name}</Text>
                    {member.handicap !== undefined && (
                      <Text style={styles.memberHandicap}>HCP: {member.handicap}</Text>
                    )}

                    <View style={styles.scoreInputs}>
                      {(event.format === "Stableford" || event.format === "Both") && (
                        <View style={styles.scoreInput}>
                          <Text style={styles.scoreLabel}>Stableford Points</Text>
                          <TextInput
                            value={scores[member.id]?.stableford?.toString() || ""}
                            onChangeText={(value) => handleScoreChange(member.id, "stableford", value)}
                            placeholder="Points"
                            keyboardType="numeric"
                            style={styles.input}
                          />
                        </View>
                      )}

                      {(event.format === "Strokeplay" || event.format === "Both") && (
                        <View style={styles.scoreInput}>
                          <Text style={styles.scoreLabel}>Strokeplay Gross</Text>
                          <TextInput
                            value={scores[member.id]?.strokeplay?.toString() || ""}
                            onChangeText={(value) => handleScoreChange(member.id, "strokeplay", value)}
                            placeholder="Gross score"
                            keyboardType="numeric"
                            style={styles.input}
                          />
                        </View>
                      )}
                    </View>
                  </View>
                ))
              )}
            </View>

            {/* Save Scores Button */}
            <Pressable onPress={handleSaveScores} style={styles.primaryButton}>
              <Text style={styles.buttonText}>Save Scores</Text>
            </Pressable>

            {/* View Leaderboard Button */}
            {leaderboard.length > 0 && (
              <Pressable
                onPress={() => setShowLeaderboard(true)}
                style={styles.secondaryButton}
              >
                <Text style={styles.buttonText}>View Leaderboard</Text>
              </Pressable>
            )}
          </>
        ) : (
          <>
            {/* Leaderboard Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Leaderboard</Text>
              {leaderboard.length === 0 ? (
                <Text style={styles.emptyText}>No scores entered yet</Text>
              ) : (
                leaderboard.map((item, index) => (
                  <View key={item.member.id} style={styles.leaderboardItem}>
                    <View style={styles.positionBadge}>
                      <Text style={styles.positionText}>{index + 1}</Text>
                    </View>
                    <View style={styles.leaderboardContent}>
                      <Text style={styles.leaderboardName}>{item.member.name}</Text>
                      <View style={styles.leaderboardScores}>
                        {item.stableford !== undefined && (
                          <Text style={styles.leaderboardScore}>Stableford: {item.stableford}</Text>
                        )}
                        {item.strokeplay !== undefined && (
                          <Text style={styles.leaderboardScore}>Strokeplay: {item.strokeplay}</Text>
                        )}
                      </View>
                    </View>
                  </View>
                ))
              )}
            </View>

            {/* Back to Scores Button */}
            <Pressable
              onPress={() => setShowLeaderboard(false)}
              style={styles.secondaryButton}
            >
              <Text style={styles.buttonText}>Back to Scores</Text>
            </Pressable>
          </>
        )}

        {/* Back Button */}
        <Pressable onPress={() => router.back()} style={styles.tertiaryButton}>
          <Text style={styles.buttonText}>Back</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  content: {
    flex: 1,
    padding: 24,
  },
  centerContent: {
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 34,
    fontWeight: "800",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.75,
    marginBottom: 28,
  },
  loadingText: {
    fontSize: 16,
    opacity: 0.7,
  },
  errorText: {
    fontSize: 16,
    color: "#ef4444",
    marginBottom: 16,
  },
  card: {
    backgroundColor: "#f3f4f6",
    borderRadius: 14,
    padding: 20,
    marginBottom: 24,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 16,
    color: "#111827",
  },
  field: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 6,
    opacity: 0.7,
  },
  fieldValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 12,
    color: "#111827",
  },
  emptyText: {
    fontSize: 14,
    opacity: 0.6,
    marginBottom: 12,
    fontStyle: "italic",
  },
  scoreCard: {
    backgroundColor: "#f3f4f6",
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
  },
  memberName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  memberHandicap: {
    fontSize: 14,
    opacity: 0.7,
    color: "#111827",
    marginBottom: 12,
  },
  scoreInputs: {
    gap: 12,
  },
  scoreInput: {
    marginBottom: 8,
  },
  scoreLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 6,
    opacity: 0.7,
  },
  input: {
    backgroundColor: "#fff",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  leaderboardItem: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    borderRadius: 10,
    padding: 16,
    marginBottom: 8,
    alignItems: "center",
  },
  positionBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#0B6E4F",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  positionText: {
    color: "white",
    fontSize: 18,
    fontWeight: "700",
  },
  leaderboardContent: {
    flex: 1,
  },
  leaderboardName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  leaderboardScores: {
    flexDirection: "row",
    gap: 12,
  },
  leaderboardScore: {
    fontSize: 14,
    opacity: 0.7,
    color: "#111827",
  },
  primaryButton: {
    backgroundColor: "#0B6E4F",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  secondaryButton: {
    backgroundColor: "#0B6E4F",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  tertiaryButton: {
    backgroundColor: "#111827",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  backButton: {
    backgroundColor: "#111827",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 16,
  },
  buttonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "700",
  },
});

