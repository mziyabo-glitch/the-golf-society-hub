import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

const STORAGE_KEY = "GSOCIETY_ACTIVE";
const EVENTS_KEY = "GSOCIETY_EVENTS";
const MEMBERS_KEY = "GSOCIETY_MEMBERS";

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

export default function SocietyDashboardScreen() {
  const [society, setSociety] = useState<SocietyData | null>(null);
  const [events, setEvents] = useState<EventData[]>([]);
  const [members, setMembers] = useState<MemberData[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      // Load society
      const societyData = await AsyncStorage.getItem(STORAGE_KEY);
      if (societyData) {
        setSociety(JSON.parse(societyData));
      }

      // Load events
      const eventsData = await AsyncStorage.getItem(EVENTS_KEY);
      if (eventsData) {
        setEvents(JSON.parse(eventsData));
      }

      // Load members
      const membersData = await AsyncStorage.getItem(MEMBERS_KEY);
      if (membersData) {
        setMembers(JSON.parse(membersData));
      }
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleResetSociety = async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
      router.replace("/");
    } catch (error) {
      console.error("Error resetting society:", error);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#0B6E4F" />
        <Text style={styles.loadingText}>Loading society...</Text>
      </View>
    );
  }

  if (!society) {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Society Dashboard</Text>
          <Text style={styles.subtitle}>Manage your society, events, and members.</Text>

          {/* Empty State */}
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>No Society Found</Text>
            <Text style={styles.emptyStateText}>
              You haven't created a society yet. Create one to get started!
            </Text>
            <Pressable
              onPress={() => router.push("/create-society")}
              style={styles.primaryButton}
            >
              <Text style={styles.buttonText}>Create a Society</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/")}
              style={styles.tertiaryButton}
            >
              <Text style={styles.buttonText}>Back to Home</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Society Dashboard</Text>
        <Text style={styles.subtitle}>Manage your society, events, and members.</Text>

        {/* Society Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Society Information</Text>

          {/* Society Name */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Society Name</Text>
            <Text style={styles.fieldValue}>{society.name}</Text>
          </View>

          {/* Home Course */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Home Course</Text>
            <Text style={styles.fieldValue}>{society.homeCourse || "Not specified"}</Text>
          </View>

          {/* Country */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Country</Text>
            <Text style={styles.fieldValue}>{society.country}</Text>
          </View>

          {/* Default Scoring Mode */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Default Scoring Mode</Text>
            <Text style={styles.fieldValue}>{society.scoringMode}</Text>
          </View>

          {/* Handicap Rule */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Handicap Rule</Text>
            <Text style={styles.fieldValue}>{society.handicapRule}</Text>
          </View>
        </View>

        {/* Events Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Events</Text>
          {events.length === 0 ? (
            <Text style={styles.emptyText}>No events yet</Text>
          ) : (
            events.map((event) => (
              <View key={event.id} style={styles.listItem}>
                <Text style={styles.listItemTitle}>{event.name}</Text>
                <Text style={styles.listItemSubtitle}>{event.date}</Text>
              </View>
            ))
          )}
          <Pressable
            onPress={() => router.push("/create-event" as any)}
            style={styles.sectionButton}
          >
            <Text style={styles.sectionButtonText}>Create Event</Text>
          </Pressable>
        </View>

        {/* Members Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Members</Text>
          {members.length === 0 ? (
            <Text style={styles.emptyText}>No members yet</Text>
          ) : (
            members.map((member) => (
              <View key={member.id} style={styles.listItem}>
                <Text style={styles.listItemTitle}>{member.name}</Text>
                {member.handicap !== undefined && (
                  <Text style={styles.listItemSubtitle}>Handicap: {member.handicap}</Text>
                )}
              </View>
            ))
          )}
          <Pressable
            onPress={() => router.push("/add-member" as any)}
            style={styles.sectionButton}
          >
            <Text style={styles.sectionButtonText}>Add Member</Text>
          </Pressable>
        </View>

        {/* Reset Society Button */}
        <Pressable
          onPress={handleResetSociety}
          style={styles.resetButton}
        >
          <Text style={styles.resetButtonText}>Reset Society</Text>
        </Pressable>

        {/* Back to Home Button */}
        <Pressable
          onPress={() => router.push("/")}
          style={styles.tertiaryButton}
        >
          <Text style={styles.buttonText}>Back to Home</Text>
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
    marginTop: 16,
    fontSize: 16,
    opacity: 0.7,
  },
  emptyState: {
    marginTop: 40,
    alignItems: "center",
  },
  emptyStateTitle: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 12,
    color: "#111827",
  },
  emptyStateText: {
    fontSize: 16,
    opacity: 0.7,
    textAlign: "center",
    marginBottom: 32,
    lineHeight: 24,
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
  resetButton: {
    backgroundColor: "#ef4444",
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
  buttonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "700",
  },
  resetButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "700",
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
  listItem: {
    backgroundColor: "#f3f4f6",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  listItemTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  listItemSubtitle: {
    fontSize: 14,
    opacity: 0.7,
    color: "#111827",
  },
  sectionButton: {
    backgroundColor: "#0B6E4F",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
  },
  sectionButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
});
