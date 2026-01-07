import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { getCourseHandicap, getPlayingHandicap } from "@/lib/handicap";
import type { Course, TeeSet } from "@/lib/models";
import { canCreateEvents, canEditVenueInfo, canEnterScores, normalizeMemberRoles, normalizeSessionRole } from "@/lib/permissions";
import { getCurrentUserRoles, hasManCoRole } from "@/lib/roles";
import { getSession } from "@/lib/session";
import { STORAGE_KEYS } from "@/lib/storage";
import { formatDateDDMMYYYY } from "@/utils/date";

const EVENTS_KEY = STORAGE_KEYS.EVENTS;
const MEMBERS_KEY = STORAGE_KEYS.MEMBERS;
const SCORES_KEY = STORAGE_KEYS.SCORES;
const COURSES_KEY = STORAGE_KEYS.COURSES;

type EventData = {
  id: string;
  name: string;
  date: string;
  courseName: string; // Legacy field, kept for backward compatibility
  courseId?: string; // New: reference to Course
  maleTeeSetId?: string; // New: tee set for male players
  femaleTeeSetId?: string; // New: tee set for female players
  handicapAllowance?: 0.9 | 1.0; // New: default 1.0
  handicapAllowancePct?: number; // Alternative: percentage (100 = 1.0, 90 = 0.9)
  format: "Stableford" | "Strokeplay" | "Both";
  playerIds?: string[];
  teeSheet?: {
    startTimeISO: string;
    intervalMins: number;
    groups: Array<{
      timeISO: string;
      players: string[]; // memberIds, max 4
    }>;
  };
  isCompleted?: boolean;
  completedAt?: string;
  resultsStatus?: "draft" | "published";
  publishedAt?: string;
  resultsUpdatedAt?: string;
  isOOM?: boolean;
  winnerId?: string;
  winnerName?: string;
  handicapSnapshot?: { [memberId: string]: number }; // Legacy: stores WHS index
  playingHandicapSnapshot?: { [memberId: string]: number }; // New: stores playing handicap
  rsvps?: {
    [memberId: string]: "going" | "maybe" | "no";
  };
  guests?: Array<{
    id: string;
    name: string;
    sex: "male" | "female";
    handicapIndex?: number;
    included: boolean;
  }>;
  results?: {
    [memberId: string]: {
      grossScore: number;
      netScore?: number;
      stableford?: number;
      strokeplay?: number;
    };
  };
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
  const [isOOM, setIsOOM] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDate, setEditDate] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [role, setRole] = useState<"admin" | "member">("member");
  const [isManCo, setIsManCo] = useState(false);
  const [rsvpSuccess, setRsvpSuccess] = useState(false);
  const [canEditEvent, setCanEditEvent] = useState(false);
  const [canEditVenue, setCanEditVenue] = useState(false);
  const [canEnterResults, setCanEnterResults] = useState(false);
  const [lockHandicaps, setLockHandicaps] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [selectedMaleTeeSetId, setSelectedMaleTeeSetId] = useState<string>("");
  const [selectedFemaleTeeSetId, setSelectedFemaleTeeSetId] = useState<string>("");
  const [handicapAllowance, setHandicapAllowance] = useState<0.9 | 1.0>(1.0);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [selectedMaleTeeSet, setSelectedMaleTeeSet] = useState<TeeSet | null>(null);
  const [selectedFemaleTeeSet, setSelectedFemaleTeeSet] = useState<TeeSet | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [id])
  );

  const loadData = async () => {
    try {
      // Load courses
      const coursesData = await AsyncStorage.getItem(COURSES_KEY);
      let loadedCourses: Course[] = [];
      if (coursesData) {
        loadedCourses = JSON.parse(coursesData);
        setCourses(loadedCourses);
      }

      // Load event
      const eventsData = await AsyncStorage.getItem(EVENTS_KEY);
      if (eventsData) {
        const events: EventData[] = JSON.parse(eventsData);
        const foundEvent = events.find((e) => e.id === id);
        if (foundEvent) {
          setEvent(foundEvent);
          setIsOOM(foundEvent.isOOM || false);
          setEditName(foundEvent.name);
          setEditDate(foundEvent.date || "");
          setSelectedCourseId(foundEvent.courseId || "");
          setSelectedMaleTeeSetId(foundEvent.maleTeeSetId || "");
          setSelectedFemaleTeeSetId(foundEvent.femaleTeeSetId || "");
          setHandicapAllowance(foundEvent.handicapAllowance || 1.0);
          setLockHandicaps(foundEvent.handicapSnapshot !== undefined && Object.keys(foundEvent.handicapSnapshot).length > 0);
          
          // Load course and tee sets
          if (foundEvent.courseId) {
            const course = loadedCourses.find((c) => c.id === foundEvent.courseId);
            if (course) {
              setSelectedCourse(course);
              if (foundEvent.maleTeeSetId) {
                const maleTee = course.teeSets.find((t) => t.id === foundEvent.maleTeeSetId);
                setSelectedMaleTeeSet(maleTee || null);
              }
              if (foundEvent.femaleTeeSetId) {
                const femaleTee = course.teeSets.find((t) => t.id === foundEvent.femaleTeeSetId);
                setSelectedFemaleTeeSet(femaleTee || null);
              }
            }
          }
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

      // Load session (single source of truth)
      const session = await getSession();
      setCurrentUserId(session.currentUserId);
      setRole(session.role);
      
      // Check permissions using pure functions
      const manCo = await hasManCoRole();
      setIsManCo(manCo);
      const sessionRole = normalizeSessionRole(session.role);
      const roles = normalizeMemberRoles(await getCurrentUserRoles());
      setCanEditEvent(canCreateEvents(sessionRole, roles)); // Captain/admin can edit event settings
      setCanEditVenue(canEditVenueInfo(sessionRole, roles)); // Secretary/captain/admin can edit venue
      setCanEnterResults(canEnterScores(sessionRole, roles)); // Captain/Secretary/Handicapper can enter results
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

  const handleSaveEvent = async () => {
    if (!event) return;

    // Permission check
    if (!canEditEvent) {
      Alert.alert("Access Denied", "Access denied: Captain only", [
        { text: "OK", onPress: () => setIsEditing(false) },
      ]);
      return;
    }

    if (!editName.trim()) {
      Alert.alert("Error", "Event name is required");
      return;
    }

    try {
      const eventsData = await AsyncStorage.getItem(EVENTS_KEY);
      if (!eventsData) {
        Alert.alert("Error", "Event not found");
        return;
      }

      const events: EventData[] = JSON.parse(eventsData);
      
      // If locking handicaps, create snapshot from current member handicaps
      let handicapSnapshot: { [memberId: string]: number } | undefined = undefined;
      if (lockHandicaps) {
        const membersData = await AsyncStorage.getItem(MEMBERS_KEY);
        if (membersData) {
          const allMembers: MemberData[] = JSON.parse(membersData);
          handicapSnapshot = {};
          allMembers.forEach((member) => {
            if (member.handicap !== undefined) {
              handicapSnapshot![member.id] = member.handicap;
            }
          });
        }
      }
      
      const updatedEvents = events.map((e) =>
        e.id === event.id
          ? {
              ...e,
              name: editName.trim(),
              date: editDate.trim(),
              isOOM: isOOM,
              courseId: selectedCourseId || undefined,
              maleTeeSetId: selectedMaleTeeSetId || undefined,
              femaleTeeSetId: selectedFemaleTeeSetId || undefined,
              handicapAllowance: handicapAllowance,
              handicapSnapshot: lockHandicaps ? handicapSnapshot : undefined,
              // Keep courseName for backward compatibility
              courseName: selectedCourseId ? courses.find(c => c.id === selectedCourseId)?.name || e.courseName : e.courseName,
            }
          : e
      );

      await AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(updatedEvents));
      
      // Update local state
      const updatedEvent = {
        ...event,
        name: editName.trim(),
        date: editDate.trim(),
        isOOM: isOOM,
      };
      setEvent(updatedEvent);
      setIsEditing(false);
      
      Alert.alert("Success", "Event updated successfully");
    } catch (error) {
      console.error("Error saving event:", error);
      Alert.alert("Error", "Failed to save event");
    }
  };

  const handleCancelEdit = () => {
    if (event) {
      setEditName(event.name);
      setEditDate(event.date || "");
      setIsOOM(event.isOOM || false);
    }
    setIsEditing(false);
  };

  const handleRSVP = async (status: "going" | "maybe" | "no") => {
    if (!event || !currentUserId) return;

    try {
      const eventsData = await AsyncStorage.getItem(EVENTS_KEY);
      if (!eventsData) return;

      const events: EventData[] = JSON.parse(eventsData);
      const updatedEvents = events.map((e) =>
        e.id === event.id
          ? {
              ...e,
              rsvps: {
                ...(e.rsvps || {}),
                [currentUserId]: status,
              },
            }
          : e
      );

      await AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(updatedEvents));
      
      // Update local state
      const updatedEvent = {
        ...event,
        rsvps: {
          ...(event.rsvps || {}),
          [currentUserId]: status,
        },
      };
      setEvent(updatedEvent);
      
      // Show success message
      setRsvpSuccess(true);
      setTimeout(() => setRsvpSuccess(false), 2000);
    } catch (error) {
      console.error("Error saving RSVP:", error);
      Alert.alert("Error", "Failed to save RSVP");
    }
  };

  const getRSVPCounts = () => {
    if (!event || !event.rsvps) return { going: 0, maybe: 0, no: 0 };
    const rsvps = event.rsvps;
    return {
      going: Object.values(rsvps).filter((r) => r === "going").length,
      maybe: Object.values(rsvps).filter((r) => r === "maybe").length,
      no: Object.values(rsvps).filter((r) => r === "no").length,
    };
  };

  const getRSVPList = (status: "going" | "maybe" | "no") => {
    if (!event || !event.rsvps) return [];
    return Object.entries(event.rsvps)
      .filter(([_, s]) => s === status)
      .map(([memberId]) => members.find((m) => m.id === memberId))
      .filter((m): m is MemberData => m !== undefined);
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
        {isEditing ? (
          <>
            <Text style={styles.title}>Edit Event</Text>
            <Text style={styles.subtitle}>Update event details</Text>

            {/* Edit Form */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Event Information</Text>
              
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Event Name <Text style={{ color: "#ef4444" }}>*</Text></Text>
                <TextInput
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Enter event name"
                  style={styles.input}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Event Date</Text>
                <DatePicker
                  value={editDate}
                  onChange={setEditDate}
                  placeholder="Select date"
                  style={styles.input}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Course</Text>
                {courses.length === 0 ? (
                  <View style={styles.warningBox}>
                    <Text style={styles.warningText}>No courses available. </Text>
                    <Pressable
                      onPress={() => router.push("/venue-info" as any)}
                      style={styles.linkButton}
                    >
                      <Text style={styles.linkText}>Create a course first</Text>
                    </Pressable>
                  </View>
                ) : (
                  <>
                    <Pressable
                      onPress={() => {
                        Alert.alert(
                          "Select Course",
                          "",
                          [
                            { text: "Cancel", style: "cancel" },
                            ...courses.map((course) => ({
                              text: course.name,
                              onPress: () => {
                                setSelectedCourseId(course.id);
                                setSelectedMaleTeeSetId("");
                                setSelectedFemaleTeeSetId("");
                              },
                            })),
                          ]
                        );
                      }}
                      style={styles.selectButton}
                    >
                      <Text style={styles.selectButtonText}>
                        {selectedCourseId
                          ? courses.find((c) => c.id === selectedCourseId)?.name || "Select course"
                          : event.courseName || "Select course"}
                      </Text>
                    </Pressable>
                    {selectedCourseId && (() => {
                      const selectedCourse = courses.find((c) => c.id === selectedCourseId);
                      const maleTees = selectedCourse?.teeSets.filter((t) => t.appliesTo === "male") || [];
                      const femaleTees = selectedCourse?.teeSets.filter((t) => t.appliesTo === "female") || [];
                      return (
                        <>
                          <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Male Tee Set</Text>
                          {maleTees.length === 0 ? (
                            <Text style={styles.warningText}>No male tee sets. Add in Venue Info.</Text>
                          ) : (
                            <Pressable
                              onPress={() => {
                                Alert.alert(
                                  "Select Male Tee Set",
                                  "",
                                  [
                                    { text: "Cancel", style: "cancel" },
                                    ...maleTees.map((tee) => ({
                                      text: `${tee.teeColor} (Par ${tee.par}, CR ${tee.courseRating}, SR ${tee.slopeRating})`,
                                      onPress: () => setSelectedMaleTeeSetId(tee.id),
                                    })),
                                  ]
                                );
                              }}
                              style={styles.selectButton}
                            >
                              <Text style={styles.selectButtonText}>
                                {selectedMaleTeeSetId
                                  ? maleTees.find((t) => t.id === selectedMaleTeeSetId)?.teeColor || "Select"
                                  : "Select male tee set"}
                              </Text>
                            </Pressable>
                          )}
                          <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Female Tee Set</Text>
                          {femaleTees.length === 0 ? (
                            <Text style={styles.warningText}>No female tee sets. Add in Venue Info.</Text>
                          ) : (
                            <Pressable
                              onPress={() => {
                                Alert.alert(
                                  "Select Female Tee Set",
                                  "",
                                  [
                                    { text: "Cancel", style: "cancel" },
                                    ...femaleTees.map((tee) => ({
                                      text: `${tee.teeColor} (Par ${tee.par}, CR ${tee.courseRating}, SR ${tee.slopeRating})`,
                                      onPress: () => setSelectedFemaleTeeSetId(tee.id),
                                    })),
                                  ]
                                );
                              }}
                              style={styles.selectButton}
                            >
                              <Text style={styles.selectButtonText}>
                                {selectedFemaleTeeSetId
                                  ? femaleTees.find((t) => t.id === selectedFemaleTeeSetId)?.teeColor || "Select"
                                  : "Select female tee set"}
                              </Text>
                            </Pressable>
                          )}
                          <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Handicap Allowance</Text>
                          <View style={styles.allowanceButtons}>
                            <Pressable
                              onPress={() => setHandicapAllowance(1.0)}
                              style={[
                                styles.allowanceButton,
                                handicapAllowance === 1.0 && styles.allowanceButtonActive,
                              ]}
                            >
                              <Text style={[
                                styles.allowanceButtonText,
                                handicapAllowance === 1.0 && styles.allowanceButtonTextActive,
                              ]}>100%</Text>
                            </Pressable>
                            <Pressable
                              onPress={() => setHandicapAllowance(0.9)}
                              style={[
                                styles.allowanceButton,
                                handicapAllowance === 0.9 && styles.allowanceButtonActive,
                              ]}
                            >
                              <Text style={[
                                styles.allowanceButtonText,
                                handicapAllowance === 0.9 && styles.allowanceButtonTextActive,
                              ]}>90%</Text>
                            </Pressable>
                          </View>
                        </>
                      );
                    })()}
                  </>
                )}
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Format</Text>
                <Text style={styles.fieldValue}>{event.format}</Text>
              </View>

              {event.playerIds && event.playerIds.length > 0 && (
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Players</Text>
                  <Text style={styles.fieldValue}>{event.playerIds.length} selected</Text>
                </View>
              )}

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Order of Merit Event</Text>
                <Pressable
                  onPress={() => setIsOOM(!isOOM)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginTop: 8,
                  }}
                >
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      backgroundColor: isOOM ? "#0B6E4F" : "#d1d5db",
                      marginRight: 12,
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    {isOOM && (
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: "#fff",
                        }}
                      />
                    )}
                  </View>
                  <Text style={{ fontSize: 16, color: "#111827" }}>
                    {isOOM ? "Yes, this is an Order of Merit event" : "No, this is not an Order of Merit event"}
                  </Text>
                </Pressable>
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Lock Handicaps for This Event</Text>
                <Text style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
                  Lock current handicaps to prevent changes after the round
                </Text>
                <Pressable
                  onPress={() => setLockHandicaps(!lockHandicaps)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginTop: 8,
                  }}
                >
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      backgroundColor: lockHandicaps ? "#0B6E4F" : "#d1d5db",
                      marginRight: 12,
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    {lockHandicaps && (
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: "#fff",
                        }}
                      />
                    )}
                  </View>
                  <Text style={{ fontSize: 16, color: "#111827" }}>
                    {lockHandicaps ? "Handicaps locked" : "Handicaps not locked"}
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Save/Cancel Buttons */}
            <Pressable onPress={handleSaveEvent} style={styles.primaryButton}>
              <Text style={styles.buttonText}>Save Changes</Text>
            </Pressable>

            <Pressable onPress={handleCancelEdit} style={styles.secondaryButton}>
              <Text style={styles.buttonText}>Cancel</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View style={styles.headerRow}>
              <View style={styles.titleContainer}>
                <Text style={styles.title}>{event.name}</Text>
                <Text style={styles.subtitle}>Event Details</Text>
              </View>
              {canEditEvent && (
                <Pressable
                  onPress={() => setIsEditing(true)}
                  style={styles.editButton}
                >
                  <Text style={styles.editButtonText}>Edit</Text>
                </Pressable>
              )}
            </View>

            {/* Event Info Card */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Event Information</Text>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Date</Text>
                <Text style={styles.fieldValue}>{formatDateDDMMYYYY(event.date)}</Text>
              </View>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Course</Text>
                <Text style={styles.fieldValue}>{event.courseName || "Not specified"}</Text>
              </View>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Format</Text>
                <Text style={styles.fieldValue}>{event.format}</Text>
              </View>
              {event.playerIds && event.playerIds.length > 0 && (
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Players</Text>
                  <Text style={styles.fieldValue}>{event.playerIds.length} selected</Text>
                </View>
              )}
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Order of Merit Event</Text>
                <Text style={styles.fieldValue}>{event.isOOM ? "Yes" : "No"}</Text>
              </View>
            </View>

            {/* RSVP Section */}
            {currentUserId && !event.isCompleted && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>RSVP</Text>
                {rsvpSuccess && (
                  <View style={styles.successMessage}>
                    <Text style={styles.successText}>RSVP saved!</Text>
                  </View>
                )}
                <View style={styles.rsvpButtons}>
                  <Pressable
                    onPress={() => handleRSVP("going")}
                    style={[
                      styles.rsvpButtonLarge,
                      event.rsvps?.[currentUserId || ""] === "going" && styles.rsvpButtonActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.rsvpButtonTextLarge,
                        event.rsvps?.[currentUserId || ""] === "going" && styles.rsvpButtonTextActive,
                      ]}
                    >
                      Going
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleRSVP("maybe")}
                    style={[
                      styles.rsvpButtonLarge,
                      event.rsvps?.[currentUserId || ""] === "maybe" && styles.rsvpButtonActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.rsvpButtonTextLarge,
                        event.rsvps?.[currentUserId || ""] === "maybe" && styles.rsvpButtonTextActive,
                      ]}
                    >
                      Maybe
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleRSVP("no")}
                    style={[
                      styles.rsvpButtonLarge,
                      event.rsvps?.[currentUserId || ""] === "no" && styles.rsvpButtonActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.rsvpButtonTextLarge,
                        event.rsvps?.[currentUserId || ""] === "no" && styles.rsvpButtonTextActive,
                      ]}
                    >
                      Not going
                    </Text>
                  </Pressable>
                </View>
                {(() => {
                  const counts = getRSVPCounts();
                  const goingList = getRSVPList("going");
                  const maybeList = getRSVPList("maybe");
                  const noList = getRSVPList("no");
                  return (
                    <View style={styles.rsvpCounts}>
                      <View style={styles.rsvpSummary}>
                        <Text style={styles.rsvpSummaryText}>
                          {counts.going} going, {counts.maybe} maybe, {counts.no} not going
                        </Text>
                      </View>
                      {/* Show detailed lists only for ManCo roles */}
                      {isManCo && (
                        <>
                          {counts.going > 0 && (
                            <View style={styles.rsvpGroup}>
                              <Text style={styles.rsvpGroupTitle}>Going ({counts.going})</Text>
                              {goingList.map((member) => {
                                const ch = getCourseHandicap(member, selectedMaleTeeSet, selectedFemaleTeeSet);
                                const ph = getPlayingHandicap(member, event, selectedCourse, selectedMaleTeeSet, selectedFemaleTeeSet);
                                return (
                                  <View key={member.id} style={styles.rsvpMemberRow}>
                                    <Text style={styles.rsvpMemberName}>{member.name}</Text>
                                    {member.handicap !== undefined && (
                                      <Text style={styles.rsvpHandicapInfo}>
                                        HI: {member.handicap}
                                        {ch !== null && ` | CH: ${ch}`}
                                        {ph !== null && ` | PH: ${ph}`}
                                      </Text>
                                    )}
                                  </View>
                                );
                              })}
                            </View>
                          )}
                          {counts.maybe > 0 && (
                            <View style={styles.rsvpGroup}>
                              <Text style={styles.rsvpGroupTitle}>Maybe ({counts.maybe})</Text>
                              {maybeList.map((member) => (
                                <Text key={member.id} style={styles.rsvpMemberName}>
                                  {member.name}
                                </Text>
                              ))}
                            </View>
                          )}
                          {counts.no > 0 && (
                            <View style={styles.rsvpGroup}>
                              <Text style={styles.rsvpGroupTitle}>Not going ({counts.no})</Text>
                              {noList.map((member) => (
                                <Text key={member.id} style={styles.rsvpMemberName}>
                                  {member.name}
                                </Text>
                              ))}
                            </View>
                          )}
                        </>
                      )}
                      {counts.going === 0 && counts.maybe === 0 && counts.no === 0 && (
                        <Text style={styles.emptyText}>No RSVPs yet</Text>
                      )}
                    </View>
                  );
                })()}
              </View>
            )}
          </>
        )}

        {!isEditing && (
          <>
            {/* Players Button - Captain/Admin only */}
            {canEditEvent && (
              <Pressable
                onPress={() => router.push(`/event/${event.id}/players` as any)}
                style={styles.secondaryButton}
              >
                <Text style={styles.buttonText}>Players</Text>
              </Pressable>
            )}

            {/* Enter Results / View Results Button */}
            {canEnterResults && event.resultsStatus !== "published" && (
              <Pressable
                onPress={() => router.push(`/event/${event.id}/results` as any)}
                style={styles.secondaryButton}
              >
                <Text style={styles.buttonText}>Enter Results</Text>
              </Pressable>
            )}
            {!canEnterResults && event.resultsStatus === "published" && (
              <Pressable
                onPress={() => router.push(`/event/${event.id}/results` as any)}
                style={styles.secondaryButton}
              >
                <Text style={styles.buttonText}>View Results</Text>
              </Pressable>
            )}
            {!canEnterResults && event.resultsStatus !== "published" && (
              <Pressable
                onPress={() => router.push(`/event/${event.id}/results` as any)}
                style={styles.secondaryButton}
              >
                <Text style={styles.buttonText}>Results Pending</Text>
              </Pressable>
            )}

            {/* Tee Sheet View */}
            {event.teeSheet && event.teeSheet.groups.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Tee Sheet</Text>
                {event.teeSheet.groups.map((group, groupIdx) => {
                  const timeStr = new Date(group.timeISO).toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  });
                  return (
                    <View key={groupIdx} style={styles.teeGroupCard}>
                      <Text style={styles.teeGroupTime}>
                        {timeStr} - Group {groupIdx + 1}
                      </Text>
                      {group.players.map((playerId) => {
                        const member = members.find((m) => m.id === playerId);
                        if (!member) return null;
                        const ph = getPlayingHandicap(
                          member,
                          event,
                          selectedCourse,
                          selectedMaleTeeSet,
                          selectedFemaleTeeSet
                        );
                        const isCurrentUser = member.id === currentUserId;
                        return (
                          <View key={playerId} style={[styles.playerRow, isCurrentUser && styles.currentUserRow]}>
                            <Text style={styles.playerName}>
                              {member.name}
                              {isCurrentUser && " (You)"}
                            </Text>
                            {member.handicap !== undefined && (
                              <Text style={styles.playerHandicapInfo}>
                                HI: {member.handicap} | PH: {ph ?? "-"}
                              </Text>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  );
                })}
                <Pressable
                  onPress={() => router.push("/tees-teesheet" as any)}
                  style={styles.secondaryButton}
                >
                  <Text style={styles.buttonText}>{canEnterResults ? "Edit Tee Sheet" : "View Tee Sheet"}</Text>
                </Pressable>
              </View>
            ) : canEnterResults ? (
              <Pressable
                onPress={() => router.push("/tees-teesheet" as any)}
                style={styles.secondaryButton}
              >
                <Text style={styles.buttonText}>Create Tee Sheet</Text>
              </Pressable>
            ) : null}
          </>
        )}

        {!isEditing && !showLeaderboard ? (
          <>
            {/* Published Results Section */}
            {event.resultsStatus === "published" && event.results && Object.keys(event.results).length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Results</Text>
                {(() => {
                  // Helper to get handicap (from snapshot or current)
                  const getHandicap = (memberId: string) => {
                    return event.handicapSnapshot?.[memberId] ?? members.find(m => m.id === memberId)?.handicap;
                  };

                  // Build Stableford table if format includes Stableford
                  const buildStablefordTable = () => {
                    const stablefordTable = members
                      .map((member) => {
                        const result = event.results?.[member.id];
                        if (!result || result.stableford === undefined) return null;
                        
                        return {
                          member,
                          score: result.stableford,
                          scoreLabel: `${result.stableford} pts`,
                          handicap: getHandicap(member.id),
                        };
                      })
                      .filter((item): item is NonNullable<typeof item> => item !== null)
                      .sort((a, b) => b.score - a.score); // Higher is better
                    
                    if (stablefordTable.length === 0) return null;
                    
                    const winningScore = stablefordTable[0].score;
                    const winners = stablefordTable.filter((r) => r.score === winningScore);
                    const isTie = winners.length > 1;
                    
                    return {
                      table: stablefordTable,
                      winners,
                      isTie,
                      winningScore,
                    };
                  };

                  // Build Strokeplay table if format includes Strokeplay
                  const buildStrokeplayTable = () => {
                    const strokeplayTable = members
                      .map((member) => {
                        const result = event.results?.[member.id];
                        if (!result || result.strokeplay === undefined) return null;
                        
                        const handicap = getHandicap(member.id);
                        const netScore = result.netScore ?? (handicap !== undefined ? result.strokeplay - handicap : undefined);
                        const scoreLabel = netScore !== undefined ? `${result.strokeplay} (${netScore} net)` : `${result.strokeplay}`;
                        
                        return {
                          member,
                          score: result.strokeplay,
                          netScore,
                          scoreLabel,
                          handicap,
                        };
                      })
                      .filter((item): item is NonNullable<typeof item> => item !== null)
                      .sort((a, b) => {
                        // Sort by net if available, otherwise gross
                        const aScore = a.netScore ?? a.score;
                        const bScore = b.netScore ?? b.score;
                        return aScore - bScore; // Lower is better
                      });
                    
                    if (strokeplayTable.length === 0) return null;
                    
                    const winningNet = strokeplayTable[0].netScore ?? strokeplayTable[0].score;
                    const winners = strokeplayTable.filter((r) => (r.netScore ?? r.score) === winningNet);
                    const isTie = winners.length > 1;
                    
                    return {
                      table: strokeplayTable,
                      winners,
                      isTie,
                      winningScore: winningNet,
                    };
                  };

                  // Render table component
                  const renderTable = (tableData: { table: any[]; winners: any[]; isTie: boolean; winningScore: number }, title: string) => {
                    if (!tableData) return null;
                    return (
                      <>
                        <Text style={styles.formatTitle}>{title}</Text>
                        <View style={styles.winnersCard}>
                          <Text style={styles.winnersTitle}>
                            {tableData.isTie 
                              ? `Tied 1st: ${tableData.winners.map((w) => w.member.name).join(", ")}` 
                              : `Winner: ${tableData.winners[0].member.name}`}
                          </Text>
                          <Text style={styles.winnersScore}>{tableData.table[0].scoreLabel}</Text>
                        </View>
                        <View style={styles.resultsTable}>
                          <View style={styles.tableHeader}>
                            <Text style={styles.tableHeaderText}>Pos</Text>
                            <Text style={[styles.tableHeaderText, { flex: 1 }]}>Player</Text>
                            <Text style={styles.tableHeaderText}>Score</Text>
                          </View>
                          {tableData.table.map((row, index) => {
                            const position = index + 1;
                            const isWinner = tableData.winners.some((w) => w.member.id === row.member.id);
                            return (
                              <View key={row.member.id} style={[styles.tableRow, isWinner && styles.tableRowWinner]}>
                                <Text style={styles.tableCell}>{position}</Text>
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.tableCell}>{row.member.name}</Text>
                                  {row.handicap !== undefined && (
                                    <Text style={styles.tableCellSmall}>HCP: {row.handicap}</Text>
                                  )}
                                </View>
                                <Text style={styles.tableCell}>{row.scoreLabel}</Text>
                              </View>
                            );
                          })}
                        </View>
                      </>
                    );
                  };

                  // Render based on format
                  if (event.format === "Stableford") {
                    const stablefordData = buildStablefordTable();
                    return stablefordData ? renderTable(stablefordData, "Stableford") : null;
                  } else if (event.format === "Strokeplay") {
                    const strokeplayData = buildStrokeplayTable();
                    return strokeplayData ? renderTable(strokeplayData, "Strokeplay") : null;
                  } else if (event.format === "Both") {
                    const stablefordData = buildStablefordTable();
                    const strokeplayData = buildStrokeplayTable();
                    return (
                      <>
                        {stablefordData && renderTable(stablefordData, "Stableford")}
                        {strokeplayData && renderTable(strokeplayData, "Strokeplay")}
                      </>
                    );
                  }
                  return null;
                })()}
              </View>
            )}
            
            {/* Scores Section (for draft/unpublished) */}
            {event.resultsStatus !== "published" && (
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
            )}

            {/* Save Scores Button - Handicapper/Captain/Admin only */}
            {canEnterResults && event.resultsStatus !== "published" && (
              <Pressable onPress={handleSaveScores} style={styles.primaryButton}>
                <Text style={styles.buttonText}>Save Scores</Text>
              </Pressable>
            )}

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
    marginTop: 6,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 28,
  },
  titleContainer: {
    flex: 1,
  },
  editButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
    marginTop: 4,
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0B6E4F",
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
  formatTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginTop: 16,
    marginBottom: 12,
  },
  winnersCard: {
    backgroundColor: "#f0fdf4",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: "#0B6E4F",
  },
  winnersTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0B6E4F",
    marginBottom: 4,
  },
  winnersScore: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  resultsTable: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  tableHeaderText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    minWidth: 50,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    alignItems: "center",
  },
  tableRowWinner: {
    backgroundColor: "#f0fdf4",
  },
  tableCell: {
    fontSize: 16,
    color: "#111827",
    minWidth: 50,
  },
  tableCellSmall: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 2,
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
  successMessage: {
    backgroundColor: "#d1fae5",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    alignItems: "center",
  },
  successText: {
    color: "#065f46",
    fontSize: 14,
    fontWeight: "600",
  },
  rsvpButtons: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  rsvpButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "#f9fafb",
    borderWidth: 2,
    borderColor: "transparent",
  },
  rsvpButtonLarge: {
    flex: 1,
    paddingVertical: 20,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#f9fafb",
    borderWidth: 3,
    borderColor: "transparent",
  },
  rsvpButtonActive: {
    backgroundColor: "#f0fdf4",
    borderColor: "#0B6E4F",
  },
  rsvpButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6b7280",
  },
  rsvpButtonTextLarge: {
    fontSize: 16,
    fontWeight: "700",
    color: "#6b7280",
  },
  rsvpButtonTextActive: {
    color: "#0B6E4F",
  },
  rsvpCounts: {
    marginTop: 8,
  },
  rsvpSummary: {
    backgroundColor: "#f3f4f6",
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  rsvpSummaryText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    textAlign: "center",
  },
  rsvpGroup: {
    marginBottom: 12,
  },
  rsvpGroupTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  rsvpMemberRow: {
    marginLeft: 8,
    marginBottom: 4,
  },
  rsvpMemberName: {
    fontSize: 13,
    color: "#6b7280",
    fontWeight: "600",
  },
  rsvpHandicapInfo: {
    fontSize: 11,
    color: "#9ca3af",
    marginTop: 2,
  },
  teeGroupCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  teeGroupTime: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
  },
  playerRow: {
    paddingVertical: 4,
  },
  currentUserRow: {
    backgroundColor: "#f0fdf4",
    padding: 6,
    borderRadius: 6,
    marginVertical: 2,
  },
  playerName: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "600",
  },
  playerHandicapInfo: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 2,
  },
  warningBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fef3c7",
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    flexWrap: "wrap",
  },
  warningText: {
    fontSize: 14,
    color: "#92400e",
    flex: 1,
  },
  linkButton: {
    marginLeft: 8,
  },
  linkText: {
    fontSize: 14,
    color: "#0B6E4F",
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  selectButton: {
    backgroundColor: "#f3f4f6",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginTop: 8,
  },
  selectButtonText: {
    fontSize: 16,
    color: "#111827",
  },
  allowanceButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  allowanceButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  allowanceButtonActive: {
    backgroundColor: "#f0fdf4",
    borderColor: "#0B6E4F",
  },
  allowanceButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6b7280",
  },
  allowanceButtonTextActive: {
    color: "#0B6E4F",
  },
});

