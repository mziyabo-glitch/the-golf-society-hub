/**
 * TEST PLAN:
 * - Navigate to event details, tap "Players" button
 * - Verify all society members are listed with checkboxes
 * - Toggle members on/off, verify selection persists
 * - Save and return to event details
 * - Verify selected players count appears on dashboard
 * - Close/reopen app, verify player selection persists
 */

import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

/**
 * HOW TO TEST:
 * - As member: try to access players screen (should show alert and redirect)
 * - As captain: verify can manage players
 * - Select/deselect players and save
 * - Verify player count updates on event card
 */

import { getCourseHandicap, getPlayingHandicap } from "@/lib/handicap";
import { canCreateEvents, normalizeMemberRoles, normalizeSessionRole } from "@/lib/permissions";
import { useBootstrap } from "@/lib/useBootstrap";
import { subscribeEventDoc, updateEventDoc, type EventDoc } from "@/lib/db/eventRepo";
import { subscribeMembersBySociety, type MemberDoc } from "@/lib/db/memberRepo";
import { subscribeCoursesBySociety, type CourseDoc } from "@/lib/db/courseRepo";
import { subscribeTeesetsBySociety, type TeeSetDoc } from "@/lib/db/teesetRepo";

type EventData = EventDoc;
type MemberData = MemberDoc;
type CourseWithTees = CourseDoc & { teeSets: TeeSetDoc[] };

export default function EventPlayersScreen() {
  const { id: eventId } = useLocalSearchParams<{ id: string }>();
  const { user } = useBootstrap();
  const [event, setEvent] = useState<EventData | null>(null);
  const [members, setMembers] = useState<MemberData[]>([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [canManagePlayers, setCanManagePlayers] = useState(false);
  const [courses, setCourses] = useState<CourseDoc[]>([]);
  const [teeSets, setTeeSets] = useState<TeeSetDoc[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<CourseWithTees | null>(null);
  const [selectedMaleTeeSet, setSelectedMaleTeeSet] = useState<TeeSetDoc | null>(null);
  const [selectedFemaleTeeSet, setSelectedFemaleTeeSet] = useState<TeeSetDoc | null>(null);

  const coursesWithTees = useMemo<CourseWithTees[]>(
    () =>
      courses.map((course) => ({
        ...course,
        teeSets: teeSets.filter((tee) => tee.courseId === course.id),
      })),
    [courses, teeSets]
  );

  useEffect(() => {
    if (!eventId) return;
    setLoading(true);
    const unsubscribe = subscribeEventDoc(eventId, (doc) => {
      setEvent(doc);
      setSelectedPlayerIds(new Set(doc?.playerIds || []));
      setLoading(false);
    });
    return () => unsubscribe();
  }, [eventId]);

  useEffect(() => {
    if (!user?.activeSocietyId) {
      setMembers([]);
      return;
    }
    const unsubscribe = subscribeMembersBySociety(user.activeSocietyId, (items) => {
      setMembers(items);
    });
    return () => unsubscribe();
  }, [user?.activeSocietyId]);

  useEffect(() => {
    if (!user?.activeSocietyId) {
      setCourses([]);
      setTeeSets([]);
      return;
    }
    const unsubscribeCourses = subscribeCoursesBySociety(user.activeSocietyId, (items) => {
      setCourses(items);
    });
    const unsubscribeTees = subscribeTeesetsBySociety(user.activeSocietyId, (items) => {
      setTeeSets(items);
    });
    return () => {
      unsubscribeCourses();
      unsubscribeTees();
    };
  }, [user?.activeSocietyId]);

  useEffect(() => {
    if (!event) return;
    if (event.courseId) {
      const course = coursesWithTees.find((c) => c.id === event.courseId) || null;
      setSelectedCourse(course);
      if (course && event.maleTeeSetId) {
        setSelectedMaleTeeSet(course.teeSets.find((t) => t.id === event.maleTeeSetId) || null);
      } else {
        setSelectedMaleTeeSet(null);
      }
      if (course && event.femaleTeeSetId) {
        setSelectedFemaleTeeSet(course.teeSets.find((t) => t.id === event.femaleTeeSetId) || null);
      } else {
        setSelectedFemaleTeeSet(null);
      }
    }
  }, [coursesWithTees, event]);

  useEffect(() => {
    const currentMember = members.find((m) => m.id === user?.activeMemberId) || null;
    const sessionRole = normalizeSessionRole("member");
    const roles = normalizeMemberRoles(currentMember?.roles);
    const canManage = canCreateEvents(sessionRole, roles);
    setCanManagePlayers(canManage);

    if (!canManage) {
      Alert.alert("Access Denied", "Only Captain or Admin can manage players", [
        { text: "OK", onPress: () => router.back() },
      ]);
    }
  }, [members, router, user?.activeMemberId]);

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
      await updateEventDoc(event.id, {
        playerIds: Array.from(selectedPlayerIds),
      });
      Alert.alert("Success", "Players saved successfully");
      router.back();
    } catch (error) {
      console.error("Error saving players:", error);
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
            <Text style={styles.emptySubtext}>Add members first, then select players for this event</Text>
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
                        const ph = event ? getPlayingHandicap(member, event, selectedCourse, selectedMaleTeeSet, selectedFemaleTeeSet) : null;
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

