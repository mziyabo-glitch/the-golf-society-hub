/**
 * TEST PLAN:
 * - Navigate to event details, tap "Players" button
 * - Verify all society members are listed with checkboxes
 * - Toggle members on/off, verify selection persists
 * - Save and return to event details
 * - Verify selected players count appears on dashboard
 * - Close/reopen app, verify player selection persists
 */

import { useFocusEffect } from "@react-navigation/native";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
} from "react-native";

/**
 * HOW TO TEST:
 * - As member: try to access players screen (should show alert and redirect)
 * - As captain: verify can manage players
 * - Select/deselect players and save
 * - Verify player count updates on event card
 *
 * FIRESTORE-ONLY: Events are loaded from Firestore
 */

import { getCourseHandicap, getPlayingHandicap } from "@/lib/handicap";
import type { Course, TeeSet } from "@/lib/models";
import { canCreateEvents, normalizeMemberRoles, normalizeSessionRole } from "@/lib/permissions";
import { getCurrentUserRoles } from "@/lib/roles";
import { getSession } from "@/lib/session";
import { getActiveSocietyId } from "@/lib/firebase";
import { getEventById, updateEvent } from "@/lib/firestore/events";
import { listMembers } from "@/lib/firestore/members";
import { getCourses } from "@/lib/firestore/society";

type EventData = {
  id: string;
  name: string;
  date: string;
  courseName: string;
  courseId?: string;
  maleTeeSetId?: string;
  femaleTeeSetId?: string;
  handicapAllowance?: 0.9 | 1.0;
  handicapAllowancePct?: number;
  format: "Stableford" | "Strokeplay" | "Both";
  playerIds?: string[];
};

type MemberData = {
  id: string;
  name: string;
  handicap?: number;
  sex?: "male" | "female";
};

export default function EventPlayersScreen() {
  const { id: eventId } = useLocalSearchParams<{ id: string }>();
  const [event, setEvent] = useState<EventData | null>(null);
  const [members, setMembers] = useState<MemberData[]>([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<"admin" | "member">("member");
  const [canManagePlayers, setCanManagePlayers] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [selectedMaleTeeSet, setSelectedMaleTeeSet] = useState<TeeSet | null>(null);
  const [selectedFemaleTeeSet, setSelectedFemaleTeeSet] = useState<TeeSet | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [eventId])
  );

  const loadData = async () => {
    try {
      const societyId = getActiveSocietyId();
      if (!societyId || !eventId) {
        setLoading(false);
        return;
      }

      // Load courses from Firestore
      let loadedCourses: Course[] = [];
      try {
        loadedCourses = await getCourses();
        setCourses(loadedCourses);
      } catch (error) {
        console.error("[Players] Error loading courses:", error);
      }

      // Load event from Firestore
      const currentEvent = await getEventById(eventId, societyId);
      if (currentEvent) {
        const eventData: EventData = {
          id: currentEvent.id,
          name: currentEvent.name,
          date: currentEvent.date,
          courseName: currentEvent.courseName || "",
          courseId: currentEvent.courseId,
          maleTeeSetId: currentEvent.maleTeeSetId,
          femaleTeeSetId: currentEvent.femaleTeeSetId,
          handicapAllowance: currentEvent.handicapAllowance,
          handicapAllowancePct: currentEvent.handicapAllowancePct,
          format: currentEvent.format || "Stableford",
          playerIds: currentEvent.playerIds,
        };

        setEvent(eventData);
        setSelectedPlayerIds(new Set(eventData.playerIds || []));

        // Load course and tee sets for this event
        if (eventData.courseId) {
          const course = loadedCourses.find((c) => c.id === eventData.courseId);
          if (course) {
            setSelectedCourse(course);
            if (eventData.maleTeeSetId) {
              const maleTee = course.teeSets.find((t) => t.id === eventData.maleTeeSetId);
              setSelectedMaleTeeSet(maleTee || null);
            }
            if (eventData.femaleTeeSetId) {
              const femaleTee = course.teeSets.find((t) => t.id === eventData.femaleTeeSetId);
              setSelectedFemaleTeeSet(femaleTee || null);
            }
          }
        }
      }

      // Load members from Firestore
      const loadedMembers = await listMembers(societyId);
      setMembers(loadedMembers);

      // Load session (single source of truth)
      const session = await getSession();
      setRole(session.role);

      // Check permissions using pure functions
      const sessionRole = normalizeSessionRole(session.role);
      const roles = normalizeMemberRoles(await getCurrentUserRoles());
      const canManage = canCreateEvents(sessionRole, roles);
      setCanManagePlayers(canManage);

      if (!canManage) {
        Alert.alert("Access Denied", "Only Captain or Admin can manage players", [
          { text: "OK", onPress: () => router.back() },
        ]);
      }
    } catch (error) {
      console.error("Error loading data:", error);
      Alert.alert("Error", "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  if (!canManagePlayers && !loading) {
    return null; // Will redirect via Alert
  }

  const togglePlayer = (memberId: string) => {
    setSelectedPlayerIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(memberId)) {
        newSet.delete(memberId);
      } else {
        newSet.add(memberId);
      }
      return newSet;
    });
  };

  const handleSave = async () => {
    if (!event) return;

    try {
      // Update playerIds in Firestore
      const result = await updateEvent(event.id, {
        playerIds: Array.from(selectedPlayerIds),
      });

      if (!result.success) {
        Alert.alert("Error", result.error || "Failed to save players");
        return;
      }

      Alert.alert("Success", "Players saved successfully");
      router.back();
    } catch (error) {
      console.error("[Players] Error saving players:", error);
      Alert.alert("Error", "Failed to save players");
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.loadingText}>Loading...</Text>
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

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Event Players</Text>
        <Text style={styles.subtitle}>{event.name}</Text>

        {members.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No members added to society yet</Text>
            <Text style={styles.emptySubtext}>
              Add members first, then select players for this event
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.membersList}>
              {members.map((member) => {
                const isSelected = selectedPlayerIds.has(member.id);
                return (
                  <Pressable
                    key={member.id}
                    onPress={() => togglePlayer(member.id)}
                    style={[styles.memberCard, isSelected && styles.memberCardSelected]}
                  >
                    <View style={styles.memberInfo}>
                      <Text style={styles.memberName}>{member.name}</Text>
                      {(() => {
                        const ch = getCourseHandicap(member, selectedMaleTeeSet, selectedFemaleTeeSet);
                        const ph = event
                          ? getPlayingHandicap(
                              member,
                              event,
                              selectedCourse,
                              selectedMaleTeeSet,
                              selectedFemaleTeeSet
                            )
                          : null;
                        return (
                          <View style={styles.handicapInfo}>
                            {member.handicap !== undefined && (
                              <Text style={styles.memberHandicap}>HI: {member.handicap}</Text>
                            )}
                            {ch !== null && (
                              <Text style={styles.memberHandicap}> | CH: {ch}</Text>
                            )}
                            {ph !== null && (
                              <Text style={styles.memberHandicap}> | PH: {ph}</Text>
                            )}
                          </View>
                        );
                      })()}
                    </View>
                    <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                      {isSelected && <View style={styles.checkmark} />}
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.countText}>
              {selectedPlayerIds.size} of {members.length} players selected
            </Text>
          </>
        )}

        <Pressable onPress={handleSave} style={styles.saveButton}>
          <Text style={styles.buttonText}>Save Players</Text>
        </Pressable>

        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.buttonText}>Cancel</Text>
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
    marginBottom: 24,
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
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    opacity: 0.7,
    color: "#111827",
    textAlign: "center",
  },
  membersList: {
    marginBottom: 16,
  },
  memberCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: "transparent",
  },
  memberCardSelected: {
    backgroundColor: "#f0fdf4",
    borderColor: "#0B6E4F",
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  handicapInfo: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 4,
  },
  memberHandicap: {
    fontSize: 14,
    opacity: 0.7,
    color: "#111827",
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#d1d5db",
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxSelected: {
    backgroundColor: "#0B6E4F",
    borderColor: "#0B6E4F",
  },
  checkmark: {
    width: 6,
    height: 10,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderColor: "#fff",
    transform: [{ rotate: "45deg" }],
  },
  countText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 24,
  },
  saveButton: {
    backgroundColor: "#0B6E4F",
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
  },
  buttonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "700",
  },
});

