/**
 * Venue Info / Course Management Screen
 * - Captain/Secretary can create/edit courses and tee sets
 * - Members can view courses only
 */

import { canEditVenueInfo, canEditHandicaps, normalizeMemberRoles, normalizeSessionRole } from "@/lib/permissions";
import { getCurrentUserRoles } from "@/lib/roles";
import { getSession } from "@/lib/session";
import { STORAGE_KEYS } from "@/lib/storage";
import type { Course, TeeSet } from "@/lib/models";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Linking } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

const COURSES_KEY = STORAGE_KEYS.COURSES;

export default function VenueInfoScreen() {
  const [hasEditAccess, setHasEditAccess] = useState(false);
  const [canEditCourses, setCanEditCourses] = useState(false);
  const [canEditTeeSets, setCanEditTeeSets] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [isEditingCourse, setIsEditingCourse] = useState(false);
  const [isEditingTeeSet, setIsEditingTeeSet] = useState(false);
  const [editingTeeSet, setEditingTeeSet] = useState<TeeSet | null>(null);
  
  // Course form fields
  const [courseName, setCourseName] = useState("");
  const [courseAddress, setCourseAddress] = useState("");
  const [coursePostcode, setCoursePostcode] = useState("");
  const [courseNotes, setCourseNotes] = useState("");
  
  // TeeSet form fields
  const [teeColor, setTeeColor] = useState("");
  const [teePar, setTeePar] = useState("");
  const [teeCourseRating, setTeeCourseRating] = useState("");
  const [teeSlopeRating, setTeeSlopeRating] = useState("");
  const [teeAppliesTo, setTeeAppliesTo] = useState<"male" | "female">("male");

  useFocusEffect(
    useCallback(() => {
      checkAccess();
      loadCourses();
    }, [])
  );

  const checkAccess = async () => {
    const session = await getSession();
    const sessionRole = normalizeSessionRole(session.role);
    const roles = normalizeMemberRoles(await getCurrentUserRoles());
    const canEditCourse = canEditVenueInfo(sessionRole, roles); // Captain/Secretary
    const canEditTees = canEditHandicaps(sessionRole, roles); // Captain/Handicapper
    const hasAccess = canEditCourse || canEditTees; // Allow if can edit either
    setHasEditAccess(hasAccess);
    setCanEditCourses(canEditCourse);
    setCanEditTeeSets(canEditTees);
    
    if (!hasAccess) {
      Alert.alert("Access Denied", "Only Captain, Secretary, or Handicapper can access venue info", [
        { text: "OK", onPress: () => router.back() },
      ]);
    }
  };

  const loadCourses = async () => {
    try {
      const coursesData = await AsyncStorage.getItem(COURSES_KEY);
      if (coursesData) {
        const loaded: Course[] = JSON.parse(coursesData);
        setCourses(loaded);
      }
    } catch (error) {
      console.error("Error loading courses:", error);
    }
  };

  const handleSaveCourse = async () => {
    if (!courseName.trim()) {
      Alert.alert("Error", "Course name is required");
      return;
    }

    try {
      let updatedCourses: Course[];
      if (selectedCourse) {
        // Update existing
        updatedCourses = courses.map((c) =>
          c.id === selectedCourse.id
            ? {
                ...c,
                name: courseName.trim(),
                address: courseAddress.trim() || undefined,
                postcode: coursePostcode.trim() || undefined,
                notes: courseNotes.trim() || undefined,
                mapsUrl: c.mapsUrl, // Preserve existing
              }
            : c
        );
      } else {
        // Create new
        const newCourse: Course = {
          id: Date.now().toString(),
          name: courseName.trim(),
          address: courseAddress.trim() || undefined,
          postcode: coursePostcode.trim() || undefined,
          notes: courseNotes.trim() || undefined,
          teeSets: [],
        };
        updatedCourses = [...courses, newCourse];
      }

      await AsyncStorage.setItem(COURSES_KEY, JSON.stringify(updatedCourses));
      await loadCourses();
      setIsEditingCourse(false);
      setSelectedCourse(null);
      resetCourseForm();
      Alert.alert("Success", selectedCourse ? "Course updated" : "Course created");
    } catch (error) {
      console.error("Error saving course:", error);
      Alert.alert("Error", "Failed to save course");
    }
  };

  const handleDeleteCourse = async () => {
    if (!selectedCourse) return;
    
    Alert.alert(
      "Delete Course",
      `Are you sure you want to delete "${selectedCourse.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const updatedCourses = courses.filter((c) => c.id !== selectedCourse.id);
              await AsyncStorage.setItem(COURSES_KEY, JSON.stringify(updatedCourses));
              await loadCourses();
              setSelectedCourse(null);
              resetCourseForm();
            } catch (error) {
              console.error("Error deleting course:", error);
              Alert.alert("Error", "Failed to delete course");
            }
          },
        },
      ]
    );
  };

  const handleSaveTeeSet = async () => {
    if (!selectedCourse) {
      Alert.alert("Error", "Please select a course first");
      return;
    }

    if (!teeColor.trim() || !teePar || !teeCourseRating || !teeSlopeRating) {
      Alert.alert("Error", "All tee set fields are required");
      return;
    }

    const par = parseInt(teePar, 10);
    const courseRating = parseFloat(teeCourseRating);
    const slopeRating = parseInt(teeSlopeRating, 10);

    if (isNaN(par) || par < 60 || par > 80) {
      Alert.alert("Error", "Par must be between 60 and 80");
      return;
    }
    if (isNaN(courseRating) || courseRating < 60 || courseRating > 80) {
      Alert.alert("Error", "Course Rating must be between 60 and 80");
      return;
    }
    if (isNaN(slopeRating) || slopeRating < 55 || slopeRating > 155) {
      Alert.alert("Error", "Slope Rating must be between 55 and 155");
      return;
    }

    try {
      const updatedCourses = courses.map((c) => {
        if (c.id !== selectedCourse.id) return c;
        
        let updatedTeeSets: TeeSet[];
        if (editingTeeSet) {
          // Update existing
          updatedTeeSets = c.teeSets.map((t) =>
            t.id === editingTeeSet.id
              ? {
                  ...t,
                  teeColor: teeColor.trim(),
                  par,
                  courseRating,
                  slopeRating,
                  appliesTo: teeAppliesTo,
                }
              : t
          );
        } else {
          // Create new
          const newTeeSet: TeeSet = {
            id: Date.now().toString(),
            courseId: c.id,
            teeColor: teeColor.trim(),
            par,
            courseRating,
            slopeRating,
            appliesTo: teeAppliesTo,
          };
          updatedTeeSets = [...c.teeSets, newTeeSet];
        }
        
        return { ...c, teeSets: updatedTeeSets };
      });

      await AsyncStorage.setItem(COURSES_KEY, JSON.stringify(updatedCourses));
      await loadCourses();
      const updated = updatedCourses.find((c) => c.id === selectedCourse.id);
      if (updated) setSelectedCourse(updated);
      setIsEditingTeeSet(false);
      setEditingTeeSet(null);
      resetTeeSetForm();
      Alert.alert("Success", editingTeeSet ? "Tee set updated" : "Tee set created");
    } catch (error) {
      console.error("Error saving tee set:", error);
      Alert.alert("Error", "Failed to save tee set");
    }
  };

  const handleDeleteTeeSet = async (teeSetId: string) => {
    if (!selectedCourse) return;
    
    Alert.alert("Delete Tee Set", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const updatedCourses = courses.map((c) => {
              if (c.id !== selectedCourse.id) return c;
              return { ...c, teeSets: c.teeSets.filter((t) => t.id !== teeSetId) };
            });
            await AsyncStorage.setItem(COURSES_KEY, JSON.stringify(updatedCourses));
            await loadCourses();
            const updated = updatedCourses.find((c) => c.id === selectedCourse.id);
            if (updated) setSelectedCourse(updated);
          } catch (error) {
            console.error("Error deleting tee set:", error);
            Alert.alert("Error", "Failed to delete tee set");
          }
        },
      },
    ]);
  };

  const resetCourseForm = () => {
    setCourseName("");
    setCourseAddress("");
    setCoursePostcode("");
    setCourseNotes("");
  };

  const resetTeeSetForm = () => {
    setTeeColor("");
    setTeePar("");
    setTeeCourseRating("");
    setTeeSlopeRating("");
    setTeeAppliesTo("male");
  };

  const startEditCourse = (course: Course) => {
    setSelectedCourse(course);
    setCourseName(course.name);
    setCourseAddress(course.address || "");
    setCoursePostcode(course.postcode || "");
    setCourseNotes(course.notes || "");
    setIsEditingCourse(true);
  };

  const startEditTeeSet = (teeSet: TeeSet) => {
    setEditingTeeSet(teeSet);
    setTeeColor(teeSet.teeColor);
    setTeePar(teeSet.par.toString());
    setTeeCourseRating(teeSet.courseRating.toString());
    setTeeSlopeRating(teeSet.slopeRating.toString());
    setTeeAppliesTo(teeSet.appliesTo);
    setIsEditingTeeSet(true);
  };

  const openGoogleMaps = (course: Course) => {
    const query = encodeURIComponent(
      `${course.name}${course.address ? ` ${course.address}` : ""}${course.postcode ? ` ${course.postcode}` : ""}`
    );
    const url = `https://www.google.com/maps/search/?api=1&query=${query}`;
    Linking.openURL(url).catch(() => {
      Alert.alert("Error", "Could not open Google Maps");
    });
  };

  const openDirections = (course: Course) => {
    if (course.mapsUrl) {
      Linking.openURL(course.mapsUrl).catch(() => {
        Alert.alert("Error", "Could not open directions");
      });
    } else {
      openGoogleMaps(course);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Venue Info</Text>
        <Text style={styles.subtitle}>
          {canEditCourses && canEditTeeSets
            ? "Manage courses and tee sets"
            : canEditCourses
            ? "Manage courses (Captain/Secretary)"
            : canEditTeeSets
            ? "Manage tee sets (Captain/Handicapper) - Tap 'Manage Tees' on a course"
            : "View courses"}
        </Text>

        {/* Course List */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Courses</Text>
          {courses.length === 0 ? (
            <View>
              <Text style={styles.emptyText}>No courses added yet</Text>
              {canEditCourses && (
                <Text style={styles.emptySubtext}>
                  Create a course first, then add tee sets.
                </Text>
              )}
              {canEditTeeSets && !canEditCourses && (
                <Text style={styles.emptySubtext}>
                  Ask Captain or Secretary to create a course first.
                </Text>
              )}
            </View>
          ) : (
            courses.map((course) => (
              <View key={course.id} style={styles.courseCard}>
                <View style={styles.courseHeader}>
                  <Text style={styles.courseName}>{course.name}</Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {canEditCourses && (
                      <Pressable
                        onPress={() => startEditCourse(course)}
                        style={styles.editButton}
                      >
                        <Text style={styles.editButtonText}>Edit Course</Text>
                      </Pressable>
                    )}
                    {canEditTeeSets && (
                      <Pressable
                        onPress={() => {
                          setSelectedCourse(course);
                          setIsEditingCourse(false);
                        }}
                        style={styles.editButton}
                      >
                        <Text style={styles.editButtonText}>Manage Tees</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
                {(course.address || course.postcode) && (
                  <Text style={styles.courseAddress}>
                    {[course.address, course.postcode].filter(Boolean).join(", ")}
                  </Text>
                )}
                {course.notes && (
                  <Text style={styles.courseNotes}>{course.notes}</Text>
                )}
                <View style={styles.courseActions}>
                  <Pressable
                    onPress={() => openGoogleMaps(course)}
                    style={styles.actionButton}
                  >
                    <Text style={styles.actionButtonText}>Search Maps</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => openDirections(course)}
                    style={styles.actionButton}
                  >
                    <Text style={styles.actionButtonText}>Directions</Text>
                  </Pressable>
                </View>
                <Text style={styles.teeSetsLabel}>
                  Tee Sets: {course.teeSets.length} ({course.teeSets.filter((t) => t.appliesTo === "male").length} male, {course.teeSets.filter((t) => t.appliesTo === "female").length} female)
                </Text>
              </View>
            ))
          )}
        </View>

        {/* Add/Edit Course Form */}
        {canEditCourses && (
          <>
            {isEditingCourse ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  {selectedCourse ? "Edit Course" : "Add Course"}
                </Text>
                <TextInput
                  value={courseName}
                  onChangeText={setCourseName}
                  placeholder="Course name *"
                  style={styles.input}
                />
                <TextInput
                  value={courseAddress}
                  onChangeText={setCourseAddress}
                  placeholder="Address"
                  style={styles.input}
                />
                <TextInput
                  value={coursePostcode}
                  onChangeText={setCoursePostcode}
                  placeholder="Postcode"
                  style={styles.input}
                />
                <TextInput
                  value={courseNotes}
                  onChangeText={setCourseNotes}
                  placeholder="Notes"
                  multiline
                  style={[styles.input, styles.textArea]}
                />
                <View style={styles.formActions}>
                  <Pressable
                    onPress={() => {
                      setIsEditingCourse(false);
                      setSelectedCourse(null);
                      resetCourseForm();
                    }}
                    style={styles.cancelButton}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </Pressable>
                  <Pressable onPress={handleSaveCourse} style={styles.saveButton}>
                    <Text style={styles.saveButtonText}>Save</Text>
                  </Pressable>
                </View>
                {selectedCourse && (
                  <Pressable
                    onPress={handleDeleteCourse}
                    style={styles.deleteButton}
                  >
                    <Text style={styles.deleteButtonText}>Delete Course</Text>
                  </Pressable>
                )}
              </View>
            ) : (
              <Pressable
                onPress={() => {
                  setSelectedCourse(null);
                  resetCourseForm();
                  setIsEditingCourse(true);
                }}
                style={styles.addButton}
              >
                <Text style={styles.addButtonText}>+ Add Course</Text>
              </Pressable>
            )}

            {/* Tee Set Management */}
            {selectedCourse && !isEditingCourse && canEditTeeSets && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  Tee Sets for {selectedCourse.name}
                </Text>
                {selectedCourse.teeSets.length === 0 ? (
                  <Text style={styles.emptyText}>No tee sets added</Text>
                ) : (
                  selectedCourse.teeSets.map((teeSet) => (
                    <View key={teeSet.id} style={styles.teeSetCard}>
                      <View style={styles.teeSetHeader}>
                        <Text style={styles.teeSetName}>
                          {teeSet.teeColor} ({teeSet.appliesTo})
                        </Text>
                        {canEditTeeSets && (
                          <Pressable
                            onPress={() => startEditTeeSet(teeSet)}
                            style={styles.editButton}
                          >
                            <Text style={styles.editButtonText}>Edit</Text>
                          </Pressable>
                        )}
                      </View>
                      <Text style={styles.teeSetDetails}>
                        Par: {teeSet.par} | CR: {teeSet.courseRating} | SR: {teeSet.slopeRating}
                      </Text>
                      {canEditTeeSets && (
                        <Pressable
                          onPress={() => handleDeleteTeeSet(teeSet.id)}
                          style={styles.deleteTeeSetButton}
                        >
                          <Text style={styles.deleteTeeSetButtonText}>Delete</Text>
                        </Pressable>
                      )}
                    </View>
                  ))
                )}

                {isEditingTeeSet ? (
                  <View style={styles.teeSetForm}>
                    <Text style={styles.formLabel}>Tee Color *</Text>
                    <TextInput
                      value={teeColor}
                      onChangeText={setTeeColor}
                      placeholder="e.g., White, Yellow, Red"
                      style={styles.input}
                    />
                    <Text style={styles.formLabel}>Par *</Text>
                    <TextInput
                      value={teePar}
                      onChangeText={setTeePar}
                      placeholder="e.g., 72"
                      keyboardType="numeric"
                      style={styles.input}
                    />
                    <Text style={styles.formLabel}>Course Rating *</Text>
                    <TextInput
                      value={teeCourseRating}
                      onChangeText={setTeeCourseRating}
                      placeholder="e.g., 72.0"
                      keyboardType="numeric"
                      style={styles.input}
                    />
                    <Text style={styles.formLabel}>Slope Rating *</Text>
                    <TextInput
                      value={teeSlopeRating}
                      onChangeText={setTeeSlopeRating}
                      placeholder="e.g., 113"
                      keyboardType="numeric"
                      style={styles.input}
                    />
                    <Text style={styles.formLabel}>Applies To *</Text>
                    <View style={styles.sexButtons}>
                      <Pressable
                        onPress={() => setTeeAppliesTo("male")}
                        style={[
                          styles.sexButton,
                          teeAppliesTo === "male" && styles.sexButtonActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.sexButtonText,
                            teeAppliesTo === "male" && styles.sexButtonTextActive,
                          ]}
                        >
                          Male
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setTeeAppliesTo("female")}
                        style={[
                          styles.sexButton,
                          teeAppliesTo === "female" && styles.sexButtonActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.sexButtonText,
                            teeAppliesTo === "female" && styles.sexButtonTextActive,
                          ]}
                        >
                          Female
                        </Text>
                      </Pressable>
                    </View>
                    <View style={styles.formActions}>
                      <Pressable
                        onPress={() => {
                          setIsEditingTeeSet(false);
                          setEditingTeeSet(null);
                          resetTeeSetForm();
                        }}
                        style={styles.cancelButton}
                      >
                        <Text style={styles.cancelButtonText}>Cancel</Text>
                      </Pressable>
                      <Pressable onPress={handleSaveTeeSet} style={styles.saveButton}>
                        <Text style={styles.saveButtonText}>Save</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  canEditTeeSets && (
                    <Pressable
                      onPress={() => {
                        setEditingTeeSet(null);
                        resetTeeSetForm();
                        setIsEditingTeeSet(true);
                      }}
                      style={styles.addButton}
                    >
                      <Text style={styles.addButtonText}>+ Add Tee Set</Text>
                    </Pressable>
                  )
                )}
              </View>
            )}
          </>
        )}

        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Back</Text>
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
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 16,
    color: "#111827",
  },
  courseCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  courseHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  courseName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
  },
  courseAddress: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 4,
  },
  courseNotes: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 12,
    fontStyle: "italic",
  },
  courseActions: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#0B6E4F",
  },
  actionButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  teeSetsLabel: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 8,
  },
  teeSetCard: {
    backgroundColor: "#f3f4f6",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  teeSetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  teeSetName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  teeSetDetails: {
    fontSize: 14,
    color: "#6b7280",
  },
  input: {
    backgroundColor: "#f9fafb",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 12,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  formLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 6,
    color: "#111827",
  },
  formActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "#f3f4f6",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  saveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "#0B6E4F",
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "white",
  },
  addButton: {
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "#0B6E4F",
    marginTop: 8,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "white",
  },
  editButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: "#0B6E4F",
  },
  editButtonText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  },
  deleteButton: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "#ef4444",
    marginTop: 8,
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "white",
  },
  deleteTeeSetButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: "#ef4444",
    alignSelf: "flex-start",
    marginTop: 8,
  },
  deleteTeeSetButtonText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  },
  sexButtons: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  sexButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  sexButtonActive: {
    backgroundColor: "#f0fdf4",
    borderColor: "#0B6E4F",
  },
  sexButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6b7280",
  },
  sexButtonTextActive: {
    color: "#0B6E4F",
  },
  teeSetForm: {
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: "#6b7280",
    fontStyle: "italic",
  },
  backButton: {
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 24,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6b7280",
  },
  emptySubtext: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 4,
    textAlign: "center",
  },
});
