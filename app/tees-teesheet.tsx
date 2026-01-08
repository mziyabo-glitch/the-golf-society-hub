/**
 * Tees & Tee Sheet Management Screen
 * 
 * FULLY MIGRATED TO FIRESTORE - NO AsyncStorage
 * 
 * - Handicapper/Captain/Secretary can manage tee sets and create tee sheets
 * - Members can view tee sheet
 * - All data loaded from Firestore
 * - Tee sheet saved to Firestore
 */

import type { Course, TeeSet, EventData, MemberData, GuestData } from "@/lib/models";
import { getPlayingHandicap } from "@/lib/handicap";
import { formatDateDDMMYYYY } from "@/utils/date";
import { getPermissions, type Permissions } from "@/lib/rbac";
import { guard } from "@/lib/guards";
import { 
  buildTeeSheetDataModel, 
  renderTeeSheetHtml, 
  validateTeeSheetData,
  type TeeSheetDataModel,
} from "@/lib/teeSheetPrint";
import { getActiveSocietyId } from "@/lib/firebase";
// Firestore helpers - NO AsyncStorage fallback for tee sheet
import { 
  getSociety, 
  getMembers, 
  getEvents, 
  getEvent,
  getCourses,
  getCourse,
  saveAndVerifyTeeSheet,
  findTeeSetById,
  findTeeSetsForEvent,
  type TeeSheetSaveResult,
} from "@/lib/firestore/society";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { useCallback, useState, useRef } from "react";
import { Alert, Pressable, StyleSheet, TextInput, View, Modal, Platform, ActivityIndicator, Text, ScrollView } from "react-native";
import { Screen } from "@/components/ui/Screen";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { Badge } from "@/components/ui/Badge";
import { SecondaryButton, PrimaryButton } from "@/components/ui/Button";
import { SocietyHeader } from "@/components/ui/SocietyHeader";
import { getColors, spacing } from "@/lib/ui/theme";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

type TabType = "tees" | "teesheet";

export default function TeesTeeSheetScreen() {
  // Permissions
  const [permissions, setPermissions] = useState<Permissions | null>(null);
  const [permissionsLoading, setPermissionsLoading] = useState(true);
  
  // UI state
  const [activeTab, setActiveTab] = useState<TabType>("tees");
  
  // Data from Firestore
  const [courses, setCourses] = useState<Course[]>([]);
  const [events, setEvents] = useState<EventData[]>([]);
  const [members, setMembers] = useState<MemberData[]>([]);
  const [society, setSociety] = useState<{ name: string; logoUrl?: string } | null>(null);
  
  // Selected entities (resolved from Firestore)
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventData | null>(null);
  const [selectedMaleTeeSet, setSelectedMaleTeeSet] = useState<TeeSet | null>(null);
  const [selectedFemaleTeeSet, setSelectedFemaleTeeSet] = useState<TeeSet | null>(null);
  const [handicapAllowancePct, setHandicapAllowancePct] = useState<number>(100);

  // Tee Sheet fields
  const [startTime, setStartTime] = useState("08:00");
  const [intervalMins, setIntervalMins] = useState<number>(8);
  const [teeGroups, setTeeGroups] = useState<Array<{ timeISO: string; players: string[] }>>([]);
  const [teeSheetNotes, setTeeSheetNotes] = useState<string>("");
  const [nearestToPinHoles, setNearestToPinHoles] = useState<number[]>([]);
  const [longestDriveHoles, setLongestDriveHoles] = useState<number[]>([]);
  const [newNTPHole, setNewNTPHole] = useState<string>("");
  const [newLDHole, setNewLDHole] = useState<string>("");
  
  // Player selection
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());
  const [guests, setGuests] = useState<GuestData[]>([]);

  // Add Guest Modal state
  const [showAddGuestModal, setShowAddGuestModal] = useState(false);
  const [newGuestName, setNewGuestName] = useState("");
  const [newGuestHI, setNewGuestHI] = useState("");
  const [newGuestSex, setNewGuestSex] = useState<"male" | "female">("male");

  // Edit Mode state - View mode by default when tee sheet exists
  const [isEditing, setIsEditing] = useState(false);
  const [hasSavedTeeSheet, setHasSavedTeeSheet] = useState(false);
  const [movePlayerData, setMovePlayerData] = useState<{ playerId: string; fromGroup: number } | null>(null);
  const [unassignedPlayers, setUnassignedPlayers] = useState<string[]>([]);

  // Loading states
  const [dataReady, setDataReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  // PDF sharing guard
  const isSharing = useRef(false);

  // Derived permission flag
  const canManageTeeSheet = permissions?.canManageTeeSheet ?? false;

  // Check if all required data is loaded for tee sheet generation
  const canGenerateTeeSheet = Boolean(
    dataReady &&
    selectedCourse &&
    selectedMaleTeeSet &&
    selectedFemaleTeeSet &&
    handicapAllowancePct > 0 &&
    members.length > 0
  );

  useFocusEffect(
    useCallback(() => {
      loadPermissions();
      loadData();
    }, [])
  );

  const loadPermissions = async () => {
    try {
      setPermissionsLoading(true);
      const perms = await getPermissions();
      setPermissions(perms);
    } catch (error) {
      console.error("[Permissions] Error loading:", error);
      setPermissions(null);
    } finally {
      setPermissionsLoading(false);
    }
  };

  /**
   * Load ALL data from Firestore
   * NO AsyncStorage is used
   */
  const loadData = async () => {
    setLoading(true);
    setDataReady(false);
    setLoadError(null);

    try {
      console.log("[Firestore] Loading all data...");

      // Load society
      const loadedSociety = await getSociety();
      if (loadedSociety) {
        setSociety({ name: loadedSociety.name, logoUrl: loadedSociety.logoUrl || undefined });
        console.log("[Firestore] Society loaded:", loadedSociety.name);
      }

      // Load courses from Firestore
      const loadedCourses = await getCourses();
      setCourses(loadedCourses);
      console.log("[Firestore] Courses loaded:", loadedCourses.length);

      // Load events from Firestore
      const loadedEvents = await getEvents();
      setEvents(loadedEvents);
      console.log("[Firestore] Events loaded:", loadedEvents.length);

      // Load members from Firestore
      const loadedMembers = await getMembers();
      setMembers(loadedMembers);
      console.log("[Firestore] Members loaded:", loadedMembers.length);

      // Data is now ready
      setDataReady(true);
      console.log("[Firestore] All data loaded successfully");
    } catch (error) {
      console.error("[Firestore] Error loading data:", error);
      setLoadError("Failed to load data from Firestore. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handle event selection - load course, tee sets, and existing tee sheet from Firestore
   */
  const handleSelectEvent = async (event: EventData) => {
    setSelectedEvent(event);
    console.log("[Event Selected]", event.id, event.name);

    // Reset state
    setTeeGroups([]);
    setSelectedCourse(null);
    setSelectedMaleTeeSet(null);
    setSelectedFemaleTeeSet(null);
    setIsEditing(false); // Default to view mode

    // Check if tee sheet exists in Firestore
    const hasTeeSheet = Boolean(
      event.teeSheet && 
      event.teeSheet.groups && 
      event.teeSheet.groups.length > 0
    );
    setHasSavedTeeSheet(hasTeeSheet);

    // Load tee sheet data if exists
    if (hasTeeSheet && event.teeSheet) {
      console.log("[Tee Sheet] Loading existing tee sheet with", event.teeSheet.groups.length, "groups");
      
      // Parse start time from saved data
      try {
        const savedTime = new Date(event.teeSheet.startTimeISO);
        setStartTime(savedTime.toLocaleTimeString("en-US", { 
          hour: "2-digit", 
          minute: "2-digit", 
          hour12: false 
        }));
      } catch {
        setStartTime("08:00");
      }
      
      setIntervalMins(event.teeSheet.intervalMins || 8);
      setTeeGroups(event.teeSheet.groups);
    } else {
      console.log("[Tee Sheet] No existing tee sheet found, allowing generation");
      setStartTime("08:00");
      setIntervalMins(8);
      setIsEditing(true); // No tee sheet, so allow editing
    }

    // Load allowance
    if (event.handicapAllowancePct !== undefined) {
      setHandicapAllowancePct(event.handicapAllowancePct);
    } else if (event.handicapAllowance !== undefined) {
      setHandicapAllowancePct(event.handicapAllowance === 1.0 ? 100 : 90);
    } else {
      setHandicapAllowancePct(100);
    }

    // Load course and tee sets from Firestore
    if (event.courseId) {
      console.log("[Loading Course]", event.courseId);
      const course = await getCourse(event.courseId);
      
      if (course) {
        setSelectedCourse(course);
        console.log("[Course Loaded]", course.name, "with", course.teeSets.length, "tee sets");

        // Find tee sets using case-insensitive matching
        const { maleTeeSet, femaleTeeSet } = findTeeSetsForEvent(course, event);
        
        setSelectedMaleTeeSet(maleTeeSet);
        if (maleTeeSet) {
          console.log("[Male Tee Set]", `${maleTeeSet.teeColor} (SR: ${maleTeeSet.slopeRating}, CR: ${maleTeeSet.courseRating})`);
        } else if (event.maleTeeSetId) {
          console.warn("[Male Tee Set] NOT FOUND:", event.maleTeeSetId);
        }

        setSelectedFemaleTeeSet(femaleTeeSet);
        if (femaleTeeSet) {
          console.log("[Female Tee Set]", `${femaleTeeSet.teeColor} (SR: ${femaleTeeSet.slopeRating}, CR: ${femaleTeeSet.courseRating})`);
        } else if (event.femaleTeeSetId) {
          console.warn("[Female Tee Set] NOT FOUND:", event.femaleTeeSetId);
        }
      } else {
        console.warn("[Course Not Found]", event.courseId);
      }
    }

    // Load notes and competitions
    setTeeSheetNotes(event.teeSheetNotes || "");
    setNearestToPinHoles(event.nearestToPinHoles || []);
    setLongestDriveHoles(event.longestDriveHoles || []);
    
    // Initialize player selection from RSVPs
    const includedIds = new Set<string>();
    members.forEach((member) => {
      const rsvp = event.rsvps?.[member.id];
      if (rsvp !== "no") {
        includedIds.add(member.id);
      }
    });
    setSelectedPlayerIds(includedIds);
    
    // Load guests
    setGuests(event.guests || []);

    console.log("=== Event Selection Complete ===");
    console.log("Has saved tee sheet:", hasTeeSheet);
    console.log("Edit mode:", !hasTeeSheet);
  };

  /**
   * Generate tee sheet - BLOCKED unless all data is loaded
   * Shows confirmation if groups already exist
   */
  const handleGenerateTeeSheet = () => {
    if (!guard(canManageTeeSheet, "Only Captain or Handicapper can generate tee sheets.")) {
      return;
    }

    // CONFIRMATION if tee sheet already exists
    if (teeGroups.length > 0) {
      Alert.alert(
        "Regenerate Tee Sheet?",
        "This will replace your current tee groups. Any unsaved changes will be lost.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Regenerate", style: "destructive", onPress: doGenerateTeeSheet },
        ]
      );
      return;
    }

    doGenerateTeeSheet();
  };

  /**
   * Actually generate the tee sheet (called after confirmation if needed)
   */
  const doGenerateTeeSheet = () => {
    // Defensive logging before generation
    console.log("=== Generating Tee Sheet ===");
    console.log("Course:", selectedCourse);
    console.log("Male tee:", selectedMaleTeeSet);
    console.log("Female tee:", selectedFemaleTeeSet);
    console.log("Allowance:", handicapAllowancePct);

    // BLOCK if data is not ready
    if (!canGenerateTeeSheet) {
      const missing: string[] = [];
      if (!selectedCourse) missing.push("Course");
      if (!selectedMaleTeeSet) missing.push("Male Tee Set");
      if (!selectedFemaleTeeSet) missing.push("Female Tee Set");
      if (!handicapAllowancePct) missing.push("Handicap Allowance");
      if (members.length === 0) missing.push("Members");

      Alert.alert(
        "Cannot Generate Tee Sheet",
        `Missing required data:\n• ${missing.join("\n• ")}\n\nPlease ensure all data is loaded from Firestore.`
      );
      console.error("[Generate Tee Sheet] Missing data:", missing);
      return;
    }

    // Get players who are selected
    const playerIds: string[] = [];
    
    // Add members who are selected
    members.forEach((m) => {
      if (selectedPlayerIds.has(m.id)) {
        playerIds.push(m.id);
      }
    });
    
    // Add guests who are included
    guests.forEach((g) => {
      if (g.included) {
        playerIds.push(g.id);
      }
    });

    if (playerIds.length === 0) {
      Alert.alert("Error", "Please select at least one player");
      return;
    }

    // Parse start time
    const [hours, minutes] = startTime.split(":").map(Number);
    if (isNaN(hours) || isNaN(minutes)) {
      Alert.alert("Error", "Invalid start time format. Use HH:MM");
      return;
    }

    // Create groups
    const startDate = new Date();
    startDate.setHours(hours, minutes, 0, 0);

    const groups: Array<{ timeISO: string; players: string[] }> = [];
    let currentTime = startDate.getTime();
    let currentGroup: string[] = [];

    playerIds.forEach((playerId, idx) => {
      currentGroup.push(playerId);
      
      if (currentGroup.length === 4 || idx === playerIds.length - 1) {
        groups.push({
          timeISO: new Date(currentTime).toISOString(),
          players: [...currentGroup],
        });
        currentGroup = [];
        currentTime += intervalMins * 60 * 1000;
      }
    });

    setUnassignedPlayers([]);
    setTeeGroups(groups);
    setIsEditing(true); // Enable editing after generation
    setHasSavedTeeSheet(false); // Mark as not yet saved
    console.log("[Tee Sheet Generated]", groups.length, "groups with", playerIds.length, "players");
  };

  /**
   * Save tee sheet to Firestore with verification
   * Returns detailed result for error handling
   */
  const saveTeeSheetToFirestore = async (): Promise<TeeSheetSaveResult> => {
    if (!selectedEvent) {
      return { success: false, verified: false, error: "No event selected" };
    }
    
    if (teeGroups.length === 0) {
      return { success: false, verified: false, error: "No tee groups to save" };
    }

    // Validate all players - ensure we're saving IDs not names
    const validatedGroups = teeGroups.map((group) => {
      const validPlayers = group.players.filter((playerId) => {
        // Sanity check: player ID should not contain spaces (names do)
        if (playerId.includes(" ")) {
          console.error("[Save] Invalid player ID (looks like a name):", playerId);
          return false;
        }
        const memberExists = members.some((m) => m.id === playerId);
        const guestExists = guests.some((g) => g.id === playerId && g.included);
        return memberExists || guestExists;
      });
      return { ...group, players: validPlayers };
    });

    // Check if we have any valid players
    const totalPlayers = validatedGroups.reduce((sum, g) => sum + g.players.length, 0);
    if (totalPlayers === 0) {
      return { success: false, verified: false, error: "No valid players in tee sheet" };
    }

    const [hours, mins] = startTime.split(":").map(Number);
    const startDate = new Date();
    startDate.setHours(hours, mins, 0, 0);

    // Build playing handicap snapshot
    const playingHandicapSnapshot: Record<string, number> = {};
    validatedGroups.forEach((group) => {
      group.players.forEach((playerId) => {
        const member = members.find((m) => m.id === playerId);
        const guest = guests.find((g) => g.id === playerId);
        
        if (member) {
          const ph = getPlayingHandicap(member, selectedEvent, selectedCourse, selectedMaleTeeSet, selectedFemaleTeeSet);
          if (ph !== null) playingHandicapSnapshot[playerId] = ph;
        } else if (guest) {
          const guestAsMember = { id: guest.id, name: guest.name, handicap: guest.handicapIndex, sex: guest.sex };
          const ph = getPlayingHandicap(guestAsMember, selectedEvent, selectedCourse, selectedMaleTeeSet, selectedFemaleTeeSet);
          if (ph !== null) playingHandicapSnapshot[playerId] = ph;
        }
      });
    });

    // Save with verification
    const result = await saveAndVerifyTeeSheet(
      selectedEvent.id,
      { startTimeISO: startDate.toISOString(), intervalMins, groups: validatedGroups },
      guests,
      {
        teeSheetNotes: teeSheetNotes.trim() || undefined,
        nearestToPinHoles: nearestToPinHoles.length > 0 ? [...nearestToPinHoles].sort((a, b) => a - b) : undefined,
        longestDriveHoles: longestDriveHoles.length > 0 ? [...longestDriveHoles].sort((a, b) => a - b) : undefined,
        playingHandicapSnapshot,
      }
    );

    if (result.success && result.verified) {
      const societyId = getActiveSocietyId();
      console.log("TEE_SHEET_SAVED", { 
        societyId, 
        eventId: selectedEvent.id,
        groups: result.savedGroupCount,
        players: result.savedPlayerCount,
      });
    } else {
      console.error("TEE_SHEET_SAVE_FAILED", result);
    }

    return result;
  };

  /**
   * Save tee sheet to Firestore (with UI feedback and verification)
   * After save, immediately verifies the tee sheet was persisted
   */
  const handleSaveTeeSheet = async () => {
    if (!guard(canManageTeeSheet, "Only Captain or Handicapper can save tee sheets.")) {
      return;
    }
    if (!selectedEvent) {
      Alert.alert("Error", "Please select an event first");
      return;
    }
    if (teeGroups.length === 0) {
      Alert.alert("Error", "Please generate or create tee groups first");
      return;
    }

    setSaving(true);

    try {
      // Save with verification
      const result = await saveTeeSheetToFirestore();

      if (result.success && result.verified) {
        // Reload the specific event to confirm and update state
        const reloadedEvent = await getEvent(selectedEvent.id);
        
        if (reloadedEvent && reloadedEvent.teeSheet?.groups) {
          // Update local state with confirmed data from Firestore
          setTeeGroups(reloadedEvent.teeSheet.groups);
          setSelectedEvent(reloadedEvent);
          setHasSavedTeeSheet(true);
          setIsEditing(false); // Switch to view mode after save
          
          Alert.alert(
            "Success", 
            `Tee sheet saved!\n${result.savedGroupCount} groups, ${result.savedPlayerCount} players`
          );
        } else {
          // Edge case: verification passed but reload failed
          Alert.alert(
            "Warning",
            "Tee sheet saved but reload failed. Please refresh the page."
          );
        }
      } else if (result.success && !result.verified) {
        // Save returned success but verification failed
        Alert.alert(
          "Error",
          `Save completed but verification failed:\n${result.error}\n\nPlease try again.`
        );
        console.error("[Save Tee Sheet] Verification failed:", result);
      } else {
        // Save itself failed
        Alert.alert("Error", result.error || "Failed to save tee sheet");
        console.error("[Save Tee Sheet] Save failed:", result);
      }
    } catch (error) {
      console.error("[Firestore] Error saving tee sheet:", error);
      Alert.alert("Error", "Failed to save tee sheet. Please check your connection.");
    } finally {
      setSaving(false);
    }
  };

  /**
   * Export tee sheet as PDF
   * 
   * IMPORTANT: Reads ONLY from saved Firestore teeSheet (single source of truth)
   * NOT from in-memory state. This matches the Leaderboard architecture.
   * 
   * - Web: window.open + document.write + print()
   * - Native: expo-print + expo-sharing
   */
  const handleExportTeeSheet = async () => {
    if (!selectedEvent) {
      Alert.alert("Error", "Please select an event first");
      return;
    }

    if (isSharing.current || exporting) {
      return;
    }
    isSharing.current = true;
    setExporting(true);

    try {
      console.log("[PDF Export] Loading tee sheet from Firestore (single source of truth)...");
      
      // ==========================================
      // STEP 1: Reload event from Firestore (single source of truth)
      // ==========================================
      const firestoreEvent = await getEvent(selectedEvent.id);
      
      if (!firestoreEvent) {
        Alert.alert("Error", "Event not found in Firestore. Please try again.");
        return;
      }

      // Check if tee sheet exists in Firestore
      if (!firestoreEvent.teeSheet || !firestoreEvent.teeSheet.groups || firestoreEvent.teeSheet.groups.length === 0) {
        Alert.alert(
          "No Saved Tee Sheet",
          "Please save the tee sheet first before exporting to PDF.",
          [{ text: "OK" }]
        );
        return;
      }

      console.log("[PDF Export] Loaded tee sheet from Firestore:", {
        groups: firestoreEvent.teeSheet.groups.length,
        players: firestoreEvent.teeSheet.groups.reduce((sum, g) => sum + g.players.length, 0),
      });

      // ==========================================
      // STEP 2: Load related data from Firestore
      // ==========================================
      let course: Course | null = null;
      let maleTeeSet: TeeSet | null = null;
      let femaleTeeSet: TeeSet | null = null;

      if (firestoreEvent.courseId) {
        course = await getCourse(firestoreEvent.courseId);
        if (course) {
          const teeSets = findTeeSetsForEvent(course, firestoreEvent);
          maleTeeSet = teeSets.maleTeeSet;
          femaleTeeSet = teeSets.femaleTeeSet;
        }
      }

      // Load fresh members list
      const firestoreMembers = await getMembers();
      
      // Load society for branding
      const firestoreSociety = await getSociety();
      const societyInfo = firestoreSociety 
        ? { name: firestoreSociety.name, logoUrl: firestoreSociety.logoUrl }
        : null;

      // ==========================================
      // STEP 3: Build data model from Firestore data
      // ==========================================
      const teeSheetData: TeeSheetDataModel = buildTeeSheetDataModel({
        society: societyInfo,
        event: firestoreEvent,
        course,
        maleTeeSet,
        femaleTeeSet,
        members: firestoreMembers,
        guests: (firestoreEvent.guests || []).filter((g) => g.included),
        teeGroups: firestoreEvent.teeSheet.groups,
        teeSheetNotes: firestoreEvent.teeSheetNotes,
        nearestToPinHoles: firestoreEvent.nearestToPinHoles,
        longestDriveHoles: firestoreEvent.longestDriveHoles,
      });

      // Validate data model
      const validation = validateTeeSheetData(teeSheetData);
      if (!validation.valid) {
        const errorMsg = validation.errors.join("\n");
        console.error("[PDF Export] Validation failed:", validation.errors);
        Alert.alert("Error", `Cannot generate PDF:\n${errorMsg}`);
        return;
      }

      // Render HTML from data model
      const html = renderTeeSheetHtml(teeSheetData);

      if (!html || html.trim().length === 0) {
        console.error("[PDF Export] Generated HTML is empty!");
        Alert.alert("Error", "Failed to generate PDF content");
        return;
      }

      console.log("[PDF Export] HTML generated from Firestore data, length:", html.length);

      // ==========================================
      // WEB: Use window.open + document.write + print() (like Leaderboard)
      // ==========================================
      if (Platform.OS === "web") {
        try {
          if (typeof window !== "undefined" && window.open) {
            const printWindow = window.open("", "_blank");
            if (printWindow) {
              printWindow.document.write(html);
              printWindow.document.close();
              printWindow.focus();
              setTimeout(() => {
                printWindow.print();
              }, 250);
            } else {
              // Fallback: create downloadable blob
              const blob = new Blob([html], { type: "text/html" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `tee-sheet-${firestoreEvent.name.replace(/\s+/g, "-")}.html`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
              Alert.alert("Success", "Tee sheet downloaded as HTML. Open and print to save as PDF.");
            }
          } else {
            Alert.alert("Error", "PDF export not supported on this web build");
          }
        } catch (webError) {
          console.error("[PDF Export] Web print error:", webError);
          Alert.alert("Error", "Failed to generate PDF on web. Please try again.");
        }
        return;
      }

      // ==========================================
      // NATIVE: Use expo-print + expo-sharing
      // ==========================================
      try {
        const { uri } = await Print.printToFileAsync({ html });
        console.log("[PDF Export] PDF created:", uri);
        
        const sharingAvailable = await Sharing.isAvailableAsync();
        if (sharingAvailable) {
          await Sharing.shareAsync(uri);
        } else {
          Alert.alert("Success", `PDF saved to: ${uri}`);
        }
      } catch (printError) {
        console.error("[PDF Export] Print/sharing error:", printError);
        Alert.alert("Error", "Failed to generate or share PDF. Please try again.");
      }
    } catch (error) {
      console.error("[PDF Export] Error:", error);
      Alert.alert("Error", "Failed to generate tee sheet. Please try again.");
    } finally {
      isSharing.current = false;
      setExporting(false);
    }
  };

  // Helper handlers
  const handleMovePlayer = (playerId: string, fromGroupIndex: number, toGroupIndex: number) => {
    if (!guard(canManageTeeSheet, "Only Captain or Handicapper can modify groups.")) return;
    
    if (toGroupIndex === -1) {
      const newGroups = [...teeGroups];
      newGroups[fromGroupIndex].players = newGroups[fromGroupIndex].players.filter((p) => p !== playerId);
      setTeeGroups(newGroups);
      setUnassignedPlayers((prev) => [...prev, playerId]);
      setMovePlayerData(null);
      return;
    }

    const newGroups = [...teeGroups];
    
    if (fromGroupIndex === -1) {
      if (newGroups[toGroupIndex].players.length >= 4) {
        Alert.alert("Error", "Group is full (max 4 players)");
        return;
      }
      newGroups[toGroupIndex].players.push(playerId);
      setUnassignedPlayers((prev) => prev.filter((p) => p !== playerId));
      setTeeGroups(newGroups);
      setMovePlayerData(null);
      return;
    }

    if (newGroups[toGroupIndex].players.length >= 4) {
      Alert.alert("Error", "Group is full (max 4 players)");
      return;
    }

    newGroups[fromGroupIndex].players = newGroups[fromGroupIndex].players.filter((p) => p !== playerId);
    newGroups[toGroupIndex].players.push(playerId);
    setTeeGroups(newGroups);
    setMovePlayerData(null);
  };

  const handleAddGroup = () => {
    if (teeGroups.length === 0) return;
    const lastGroup = teeGroups[teeGroups.length - 1];
    const lastTime = new Date(lastGroup.timeISO);
    const newTime = new Date(lastTime.getTime() + intervalMins * 60000);
    setTeeGroups([...teeGroups, { timeISO: newTime.toISOString(), players: [] }]);
  };

  const handleDeleteGroup = (groupIndex: number) => {
    if (!guard(canManageTeeSheet, "Only Captain or Handicapper can delete groups.")) return;
    
    const group = teeGroups[groupIndex];
    const playerCount = group.players.length;
    
    // Confirm if group has players
    if (playerCount > 0) {
      Alert.alert(
        "Delete Group?",
        `This group has ${playerCount} player(s). They will be moved to unassigned.`,
        [
          { text: "Cancel", style: "cancel" },
          { 
            text: "Delete", 
            style: "destructive", 
            onPress: () => {
              setUnassignedPlayers((prev) => [...prev, ...group.players]);
              setTeeGroups(teeGroups.filter((_, idx) => idx !== groupIndex));
            }
          },
        ]
      );
      return;
    }
    
    setTeeGroups(teeGroups.filter((_, idx) => idx !== groupIndex));
  };

  /**
   * Update the tee time for a specific group
   */
  const handleUpdateGroupTime = (groupIndex: number, newTime: string) => {
    if (!guard(canManageTeeSheet, "Only Captain or Handicapper can modify groups.")) return;
    
    const [hours, minutes] = newTime.split(":").map(Number);
    if (isNaN(hours) || isNaN(minutes)) return;
    
    const newDate = new Date();
    newDate.setHours(hours, minutes, 0, 0);
    
    const newGroups = [...teeGroups];
    newGroups[groupIndex] = {
      ...newGroups[groupIndex],
      timeISO: newDate.toISOString(),
    };
    setTeeGroups(newGroups);
  };

  /**
   * Move a player up within their group
   */
  const handleMovePlayerUp = (groupIndex: number, playerIndex: number) => {
    if (!guard(canManageTeeSheet, "Only Captain or Handicapper can modify groups.")) return;
    if (playerIndex === 0) return; // Already at top
    
    const newGroups = [...teeGroups];
    const players = [...newGroups[groupIndex].players];
    [players[playerIndex - 1], players[playerIndex]] = [players[playerIndex], players[playerIndex - 1]];
    newGroups[groupIndex] = { ...newGroups[groupIndex], players };
    setTeeGroups(newGroups);
  };

  /**
   * Move a player down within their group
   */
  const handleMovePlayerDown = (groupIndex: number, playerIndex: number) => {
    if (!guard(canManageTeeSheet, "Only Captain or Handicapper can modify groups.")) return;
    const players = teeGroups[groupIndex].players;
    if (playerIndex >= players.length - 1) return; // Already at bottom
    
    const newGroups = [...teeGroups];
    const newPlayers = [...newGroups[groupIndex].players];
    [newPlayers[playerIndex], newPlayers[playerIndex + 1]] = [newPlayers[playerIndex + 1], newPlayers[playerIndex]];
    newGroups[groupIndex] = { ...newGroups[groupIndex], players: newPlayers };
    setTeeGroups(newGroups);
  };

  /**
   * Remove a guest from a group (members protected)
   */
  const handleRemoveGuest = (guestId: string, groupIndex: number) => {
    if (!guard(canManageTeeSheet, "Only Captain or Handicapper can modify groups.")) return;
    
    const newGroups = [...teeGroups];
    newGroups[groupIndex].players = newGroups[groupIndex].players.filter((p) => p !== guestId);
    setTeeGroups(newGroups);
    
    // Also remove from guests list
    setGuests(guests.filter((g) => g.id !== guestId));
  };

  /**
   * Show move player picker
   */
  const [showMovePlayerModal, setShowMovePlayerModal] = useState(false);
  const [movePlayerContext, setMovePlayerContext] = useState<{ playerId: string; fromGroup: number; playerName: string } | null>(null);

  const handleShowMovePlayer = (playerId: string, fromGroup: number, playerName: string) => {
    setMovePlayerContext({ playerId, fromGroup, playerName });
    setShowMovePlayerModal(true);
  };

  const handleConfirmMovePlayer = (toGroup: number) => {
    if (!movePlayerContext) return;
    handleMovePlayer(movePlayerContext.playerId, movePlayerContext.fromGroup, toGroup);
    setShowMovePlayerModal(false);
    setMovePlayerContext(null);
  };

  const handleRemovePlayerFromGroup = (playerId: string, groupIndex: number) => {
    const newGroups = [...teeGroups];
    newGroups[groupIndex].players = newGroups[groupIndex].players.filter((p) => p !== playerId);
    setTeeGroups(newGroups);
    setUnassignedPlayers((prev) => [...prev, playerId]);
  };

  const handleAddGuestSubmit = () => {
    if (!newGuestName.trim()) {
      Alert.alert("Error", "Guest name is required");
      return;
    }
    const hi = parseFloat(newGuestHI);
    if (isNaN(hi) || hi < 0 || hi > 54) {
      Alert.alert("Error", "Valid handicap index (0-54) is required");
      return;
    }
    const newGuest: GuestData = {
      id: Date.now().toString(),
      name: newGuestName.trim(),
      sex: newGuestSex,
      handicapIndex: hi,
      included: true,
    };
    setGuests((prev) => [...prev, newGuest]);
    setShowAddGuestModal(false);
    setNewGuestName("");
    setNewGuestHI("");
    setNewGuestSex("male");
  };

  const handleSelectCourse = (course: Course) => {
    setSelectedCourse(course);
    const maleTee = course.teeSets.find((t) => t.appliesTo === "male");
    const femaleTee = course.teeSets.find((t) => t.appliesTo === "female");
    setSelectedMaleTeeSet(maleTee || null);
    setSelectedFemaleTeeSet(femaleTee || null);
    
    console.log("[Course Selected]", course.name);
    console.log("[Male Tee]", maleTee);
    console.log("[Female Tee]", femaleTee);
  };

  // Get player display info with Playing Handicap
  const getPlayerDisplay = (playerId: string): { name: string; hi: string; ph: string } => {
    const member = members.find((m) => m.id === playerId);
    const guest = guests.find((g) => g.id === playerId);

    if (member) {
      const ph = canGenerateTeeSheet
        ? getPlayingHandicap(member, selectedEvent, selectedCourse, selectedMaleTeeSet, selectedFemaleTeeSet)
        : null;
      return {
        name: member.name,
        hi: member.handicap !== undefined ? member.handicap.toString() : "-",
        ph: ph !== null ? ph.toString() : "-",
      };
    }

    if (guest) {
      const guestAsMember = { id: guest.id, name: guest.name, handicap: guest.handicapIndex, sex: guest.sex };
      const ph = canGenerateTeeSheet
        ? getPlayingHandicap(guestAsMember, selectedEvent, selectedCourse, selectedMaleTeeSet, selectedFemaleTeeSet)
        : null;
      return {
        name: `${guest.name} (G)`,
        hi: guest.handicapIndex !== undefined ? guest.handicapIndex.toString() : "-",
        ph: ph !== null ? ph.toString() : "-",
      };
    }

    return { name: "Unknown", hi: "-", ph: "-" };
  };

  const colors = getColors();
  const isReadOnly = !canManageTeeSheet;

  // Loading state
  if (loading || permissionsLoading) {
    return (
      <Screen scrollable={false}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.primary} />
          <AppText style={{ marginTop: 12 }}>Loading from Firestore...</AppText>
        </View>
      </Screen>
    );
  }

  // Error state
  if (loadError) {
    return (
      <Screen scrollable={false}>
        <View style={styles.centerContent}>
          <Text style={{ fontSize: 18, fontWeight: "700", color: colors.error, marginBottom: 12 }}>
            Error Loading Data
          </Text>
          <AppText style={{ textAlign: "center", marginBottom: 20 }}>{loadError}</AppText>
          <PrimaryButton onPress={loadData}>Retry</PrimaryButton>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      {society && (
        <SocietyHeader
          societyName={society.name}
          logoUrl={society.logoUrl}
          subtitle="Tees & Tee Sheet"
        />
      )}
      <SectionHeader title="Tees & Tee Sheet" />
      
      {isReadOnly && (
        <AppCard style={styles.readOnlyCard}>
          <Badge label="View Only" variant="status" />
          <AppText variant="small" color="secondary" style={styles.readOnlyText}>
            You do not have permission to edit tee sheets
          </AppText>
        </AppCard>
      )}

      {/* Data Status - PH Calculation Warning */}
      {!canGenerateTeeSheet && selectedEvent && (
        <AppCard style={styles.warningCard}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: "#b45309" }}>
            ⚠️ Select course + tee sets to calculate PH
          </Text>
          <Text style={{ fontSize: 12, color: "#78716c", marginTop: 6 }}>
            Playing Handicap (PH) requires:
          </Text>
          <Text style={{ fontSize: 12, color: selectedCourse ? "#059669" : "#b45309", marginTop: 2 }}>
            {selectedCourse ? "✓" : "•"} Course: {selectedCourse?.name || "Not selected"}
          </Text>
          <Text style={{ fontSize: 12, color: selectedMaleTeeSet ? "#059669" : "#b45309", marginTop: 2 }}>
            {selectedMaleTeeSet ? "✓" : "•"} Male tee set: {selectedMaleTeeSet ? `${selectedMaleTeeSet.teeColor} (SR: ${selectedMaleTeeSet.slopeRating}, CR: ${selectedMaleTeeSet.courseRating})` : "Not selected"}
          </Text>
          <Text style={{ fontSize: 12, color: selectedFemaleTeeSet ? "#059669" : "#b45309", marginTop: 2 }}>
            {selectedFemaleTeeSet ? "✓" : "•"} Female tee set: {selectedFemaleTeeSet ? `${selectedFemaleTeeSet.teeColor} (SR: ${selectedFemaleTeeSet.slopeRating}, CR: ${selectedFemaleTeeSet.courseRating})` : "Not selected"}
          </Text>
          <Text style={{ fontSize: 11, fontStyle: "italic", color: "#78716c", marginTop: 8 }}>
            WHS Formula: PH = round(HI × (SR/113) + (CR−Par)) × Allowance%
          </Text>
        </AppCard>
      )}
      
      {/* PH Ready Indicator */}
      {canGenerateTeeSheet && selectedEvent && (
        <AppCard style={styles.successCard}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: "#059669" }}>
            ✓ Playing Handicaps (PH) will be calculated using WHS formula
          </Text>
          <Text style={{ fontSize: 12, color: "#78716c", marginTop: 4 }}>
            Male: {selectedMaleTeeSet?.teeColor} (SR: {selectedMaleTeeSet?.slopeRating}, CR: {selectedMaleTeeSet?.courseRating}) | 
            Female: {selectedFemaleTeeSet?.teeColor} (SR: {selectedFemaleTeeSet?.slopeRating}, CR: {selectedFemaleTeeSet?.courseRating}) | 
            Allowance: {handicapAllowancePct}%
          </Text>
        </AppCard>
      )}

      {/* Tabs */}
      <View style={styles.tabs}>
        <Pressable
          onPress={() => setActiveTab("tees")}
          style={[styles.tab, activeTab === "tees" && styles.tabActive]}
        >
          <AppText variant="button" style={activeTab === "tees" ? styles.tabTextActive : styles.tabText}>
            Tees
          </AppText>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab("teesheet")}
          style={[styles.tab, activeTab === "teesheet" && styles.tabActive]}
        >
          <AppText variant="button" style={activeTab === "teesheet" ? styles.tabTextActive : styles.tabText}>
            Tee Sheet
          </AppText>
        </Pressable>
      </View>

      {activeTab === "tees" ? (
        <View style={styles.tabContent}>
          <Text style={styles.sectionTitle}>Select Event</Text>
          {events.length === 0 ? (
            <Text style={styles.emptyText}>No events found in Firestore.</Text>
          ) : (
            <ScrollView style={styles.selectContainer} horizontal={false}>
              {events.map((event) => (
                <Pressable
                  key={event.id}
                  onPress={() => handleSelectEvent(event)}
                  style={[
                    styles.selectButton,
                    selectedEvent?.id === event.id && styles.selectButtonActive,
                  ]}
                >
                  <Text style={[
                    styles.selectButtonText,
                    selectedEvent?.id === event.id && styles.selectButtonTextActive,
                  ]}>
                    {event.name} ({formatDateDDMMYYYY(event.date)})
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          {selectedEvent && (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Select Course</Text>
              {courses.length === 0 ? (
                <Text style={styles.emptyText}>No courses found in Firestore.</Text>
              ) : (
                <ScrollView style={styles.selectContainer} horizontal={false}>
                  {courses.map((course) => (
                    <Pressable
                      key={course.id}
                      onPress={() => handleSelectCourse(course)}
                      style={[
                        styles.selectButton,
                        selectedCourse?.id === course.id && styles.selectButtonActive,
                      ]}
                    >
                      <Text style={[
                        styles.selectButtonText,
                        selectedCourse?.id === course.id && styles.selectButtonTextActive,
                      ]}>
                        {course.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}

              {selectedCourse && (
                <>
                  <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Tee Sets</Text>
                  <View style={styles.teeSetInfo}>
                    <Text style={styles.teeSetLabel}>
                      Male: {selectedMaleTeeSet ? `${selectedMaleTeeSet.teeColor} (SR: ${selectedMaleTeeSet.slopeRating}, CR: ${selectedMaleTeeSet.courseRating})` : "None"}
                    </Text>
                    <Text style={styles.teeSetLabel}>
                      Female: {selectedFemaleTeeSet ? `${selectedFemaleTeeSet.teeColor} (SR: ${selectedFemaleTeeSet.slopeRating}, CR: ${selectedFemaleTeeSet.courseRating})` : "None"}
                    </Text>
                  </View>

                  <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Handicap Allowance</Text>
                  <View style={styles.allowanceRow}>
                    <TextInput
                      style={styles.allowanceInput}
                      value={handicapAllowancePct.toString()}
                      onChangeText={(v) => setHandicapAllowancePct(parseInt(v) || 100)}
                      keyboardType="numeric"
                      editable={!isReadOnly}
                    />
                    <Text style={styles.allowanceLabel}>%</Text>
                  </View>
                </>
              )}
            </>
          )}
        </View>
      ) : (
        <View style={styles.tabContent}>
          {!selectedEvent ? (
            <Text style={styles.emptyText}>Please select an event from the Tees tab first.</Text>
          ) : (
            <>
              {/* View/Edit Mode Indicator */}
              {hasSavedTeeSheet && (
                <AppCard style={isEditing ? styles.editModeCard : styles.viewModeCard}>
                  <View style={styles.modeHeader}>
                    <Badge 
                      label={isEditing ? "Edit Mode" : "View Mode"} 
                      variant={isEditing ? "status" : "paid"} 
                    />
                    {canManageTeeSheet && !isEditing && (
                      <Pressable 
                        onPress={() => setIsEditing(true)} 
                        style={styles.editToggleButton}
                      >
                        <Text style={styles.editToggleButtonText}>Edit Tee Sheet</Text>
                      </Pressable>
                    )}
                    {canManageTeeSheet && isEditing && (
                      <Pressable 
                        onPress={() => setIsEditing(false)} 
                        style={styles.cancelEditButton}
                      >
                        <Text style={styles.cancelEditButtonText}>Cancel</Text>
                      </Pressable>
                    )}
                  </View>
                  {!isEditing && (
                    <Text style={styles.modeDescription}>
                      Tee sheet loaded from Firestore. Tap Edit to make changes.
                    </Text>
                  )}
                </AppCard>
              )}

              {/* Time Settings - only in edit mode or when no saved tee sheet */}
              {(isEditing || !hasSavedTeeSheet) && (
                <View style={styles.timeRow}>
                  <View style={styles.timeField}>
                    <Text style={styles.fieldLabel}>Start Time</Text>
                    <TextInput
                      style={styles.timeInput}
                      value={startTime}
                      onChangeText={setStartTime}
                      placeholder="08:00"
                      editable={!isReadOnly && isEditing}
                    />
                  </View>
                  <View style={styles.timeField}>
                    <Text style={styles.fieldLabel}>Interval (mins)</Text>
                    <TextInput
                      style={styles.timeInput}
                      value={intervalMins.toString()}
                      onChangeText={(v) => setIntervalMins(parseInt(v) || 8)}
                      keyboardType="numeric"
                      editable={!isReadOnly && isEditing}
                    />
                  </View>
                </View>
              )}

              {/* Player Selection - only in edit mode */}
              {(isEditing || !hasSavedTeeSheet) && (
                <>
                  <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Players ({selectedPlayerIds.size + guests.filter(g => g.included).length})</Text>
                  <ScrollView style={styles.playerList} nestedScrollEnabled>
                    {members.map((member) => {
                      const isSelected = selectedPlayerIds.has(member.id);
                      return (
                        <Pressable
                          key={member.id}
                          onPress={() => {
                            if (isReadOnly || !isEditing) return;
                            const newSet = new Set(selectedPlayerIds);
                            if (isSelected) {
                              newSet.delete(member.id);
                            } else {
                              newSet.add(member.id);
                            }
                            setSelectedPlayerIds(newSet);
                          }}
                          style={[styles.playerRow, isSelected && styles.playerRowSelected]}
                        >
                          <Text style={styles.playerName}>{member.name}</Text>
                          <Text style={styles.playerHI}>HI: {member.handicap ?? "-"}</Text>
                        </Pressable>
                      );
                    })}
                    {guests.map((guest) => (
                      <Pressable
                        key={guest.id}
                        onPress={() => {
                          if (isReadOnly || !isEditing) return;
                          setGuests(guests.map((g) => 
                            g.id === guest.id ? { ...g, included: !g.included } : g
                          ));
                        }}
                        style={[styles.playerRow, guest.included && styles.playerRowSelected]}
                      >
                        <Text style={styles.playerName}>{guest.name} (Guest)</Text>
                        <Text style={styles.playerHI}>HI: {guest.handicapIndex ?? "-"}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>

                  {!isReadOnly && isEditing && (
                    <Pressable onPress={() => setShowAddGuestModal(true)} style={styles.addGuestButton}>
                      <Text style={styles.addGuestButtonText}>+ Add Guest</Text>
                    </Pressable>
                  )}

                  {/* Generate Button - only when no saved tee sheet or in edit mode */}
                  {!isReadOnly && isEditing && (
                    <Pressable 
                      onPress={handleGenerateTeeSheet} 
                      style={[styles.generateButton, !canGenerateTeeSheet && styles.buttonDisabled]}
                      disabled={!canGenerateTeeSheet}
                    >
                      <Text style={styles.generateButtonText}>
                        {hasSavedTeeSheet ? "Regenerate Tee Sheet" : "Generate Tee Sheet"}
                      </Text>
                    </Pressable>
                  )}
                </>
              )}

              {/* Tee Groups - always shown when they exist */}
              {teeGroups.length > 0 && (
                <View style={styles.teeGroupsContainer}>
                  <View style={styles.teeGroupsHeader}>
                    <Text style={[styles.sectionTitle, { marginTop: 16, marginBottom: 0 }]}>
                      Tee Groups {hasSavedTeeSheet && !isEditing && "(Saved)"}
                    </Text>
                    {isEditing && (
                      <Text style={styles.editHint}>Tap players to move or reorder</Text>
                    )}
                  </View>
                  
                  {teeGroups.map((group, groupIdx) => {
                    const teeTime = new Date(group.timeISO).toLocaleTimeString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    });

                    return (
                      <View key={groupIdx} style={styles.groupCard}>
                        <View style={styles.groupHeader}>
                          {/* Editable tee time in edit mode */}
                          {isEditing && canManageTeeSheet ? (
                            <TextInput
                              style={styles.groupTimeInput}
                              value={teeTime}
                              onChangeText={(value) => handleUpdateGroupTime(groupIdx, value)}
                              placeholder="HH:MM"
                              keyboardType="numbers-and-punctuation"
                            />
                          ) : (
                            <Text style={styles.groupTime}>{teeTime}</Text>
                          )}
                          <View style={styles.groupHeaderRight}>
                            <Text style={styles.groupNumber}>Group {groupIdx + 1}</Text>
                            {/* Delete group button in edit mode */}
                            {isEditing && canManageTeeSheet && (
                              <Pressable 
                                onPress={() => handleDeleteGroup(groupIdx)}
                                style={styles.deleteGroupButton}
                              >
                                <Text style={styles.deleteGroupButtonText}>✕</Text>
                              </Pressable>
                            )}
                          </View>
                        </View>
                        
                        {group.players.length === 0 ? (
                          <Text style={styles.emptyGroup}>No players - add from unassigned or delete group</Text>
                        ) : (
                          group.players.map((playerId, playerIdx) => {
                            const display = getPlayerDisplay(playerId);
                            const isGuest = guests.some((g) => g.id === playerId);
                            const isFirst = playerIdx === 0;
                            const isLast = playerIdx === group.players.length - 1;

                            return (
                              <View key={playerId} style={styles.groupPlayer}>
                                <View style={styles.groupPlayerInfo}>
                                  <Text style={styles.groupPlayerName}>
                                    {display.name}
                                    {isGuest && <Text style={styles.guestTag}> (G)</Text>}
                                  </Text>
                                  <View style={styles.groupPlayerStats}>
                                    <Text style={styles.groupPlayerHI}>HI: {display.hi}</Text>
                                    <Text style={styles.groupPlayerPH}>PH: {display.ph}</Text>
                                  </View>
                                </View>
                                
                                {/* Edit controls when in edit mode */}
                                {isEditing && canManageTeeSheet && (
                                  <View style={styles.playerEditControls}>
                                    {/* Move up */}
                                    <Pressable
                                      onPress={() => handleMovePlayerUp(groupIdx, playerIdx)}
                                      style={[styles.playerControlBtn, isFirst && styles.playerControlBtnDisabled]}
                                      disabled={isFirst}
                                    >
                                      <Text style={styles.playerControlBtnText}>↑</Text>
                                    </Pressable>
                                    
                                    {/* Move down */}
                                    <Pressable
                                      onPress={() => handleMovePlayerDown(groupIdx, playerIdx)}
                                      style={[styles.playerControlBtn, isLast && styles.playerControlBtnDisabled]}
                                      disabled={isLast}
                                    >
                                      <Text style={styles.playerControlBtnText}>↓</Text>
                                    </Pressable>
                                    
                                    {/* Move to another group */}
                                    <Pressable
                                      onPress={() => handleShowMovePlayer(playerId, groupIdx, display.name)}
                                      style={styles.playerControlBtn}
                                    >
                                      <Text style={styles.playerControlBtnText}>→</Text>
                                    </Pressable>
                                    
                                    {/* Remove guest (only for guests) */}
                                    {isGuest && (
                                      <Pressable
                                        onPress={() => handleRemoveGuest(playerId, groupIdx)}
                                        style={[styles.playerControlBtn, styles.playerControlBtnDanger]}
                                      >
                                        <Text style={[styles.playerControlBtnText, styles.playerControlBtnTextDanger]}>✕</Text>
                                      </Pressable>
                                    )}
                                  </View>
                                )}
                              </View>
                            );
                          })
                        )}
                      </View>
                    );
                  })}
                  
                  {/* Unassigned players section */}
                  {isEditing && unassignedPlayers.length > 0 && (
                    <View style={styles.unassignedSection}>
                      <Text style={styles.unassignedTitle}>Unassigned Players ({unassignedPlayers.length})</Text>
                      {unassignedPlayers.map((playerId) => {
                        const display = getPlayerDisplay(playerId);
                        return (
                          <View key={playerId} style={styles.unassignedPlayer}>
                            <Text style={styles.unassignedPlayerName}>{display.name}</Text>
                            <Pressable
                              onPress={() => handleShowMovePlayer(playerId, -1, display.name)}
                              style={styles.assignButton}
                            >
                              <Text style={styles.assignButtonText}>Assign to Group</Text>
                            </Pressable>
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {/* Action Buttons */}
                  <View style={styles.actionButtons}>
                    {/* Edit mode actions */}
                    {!isReadOnly && isEditing && (
                      <>
                        <Pressable onPress={handleAddGroup} style={styles.addGroupButton}>
                          <Text style={styles.addGroupButtonText}>+ Add Group</Text>
                        </Pressable>

                        <Pressable 
                          onPress={handleSaveTeeSheet} 
                          style={[styles.saveButton, saving && styles.buttonDisabled]}
                          disabled={saving}
                        >
                          <Text style={styles.saveButtonText}>
                            {saving ? "Saving..." : "Save Tee Sheet"}
                          </Text>
                        </Pressable>
                      </>
                    )}

                    {/* PDF Export - always available when tee sheet exists (reads from Firestore) */}
                    <Pressable 
                      onPress={handleExportTeeSheet} 
                      style={[styles.pdfButton, exporting && styles.buttonDisabled]}
                      disabled={exporting}
                    >
                      <Text style={styles.pdfButtonText}>
                        {exporting 
                          ? "Loading..." 
                          : Platform.OS === "web" 
                            ? "Print / Download PDF" 
                            : "Share PDF"
                        }
                      </Text>
                    </Pressable>
                    
                    {/* Reminder to save in edit mode */}
                    {isEditing && !hasSavedTeeSheet && (
                      <Text style={styles.saveReminder}>
                        ⚠️ Save the tee sheet before exporting PDF
                      </Text>
                    )}
                  </View>
                </View>
              )}
            </>
          )}
        </View>
      )}

      <SecondaryButton onPress={() => router.back()}>Back</SecondaryButton>

      {/* Add Guest Modal */}
      <Modal
        visible={showAddGuestModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowAddGuestModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Guest</Text>
            
            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Name *</Text>
              <TextInput
                value={newGuestName}
                onChangeText={setNewGuestName}
                placeholder="Guest name"
                style={styles.modalInput}
                autoFocus
              />
            </View>

            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Handicap Index *</Text>
              <TextInput
                value={newGuestHI}
                onChangeText={setNewGuestHI}
                placeholder="0-54"
                keyboardType="numeric"
                style={styles.modalInput}
              />
            </View>

            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Sex *</Text>
              <View style={styles.sexToggle}>
                <Pressable
                  onPress={() => setNewGuestSex("male")}
                  style={[styles.sexToggleButton, newGuestSex === "male" && styles.sexToggleButtonActive]}
                >
                  <Text style={[styles.sexToggleText, newGuestSex === "male" && styles.sexToggleTextActive]}>Male</Text>
                </Pressable>
                <Pressable
                  onPress={() => setNewGuestSex("female")}
                  style={[styles.sexToggleButton, newGuestSex === "female" && styles.sexToggleButtonActive]}
                >
                  <Text style={[styles.sexToggleText, newGuestSex === "female" && styles.sexToggleTextActive]}>Female</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => {
                  setShowAddGuestModal(false);
                  setNewGuestName("");
                  setNewGuestHI("");
                  setNewGuestSex("male");
                }}
                style={styles.modalCancelButton}
              >
                <Text style={styles.modalCancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleAddGuestSubmit} style={styles.modalSubmitButton}>
                <Text style={styles.modalSubmitButtonText}>Add</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Move Player Modal */}
      <Modal
        visible={showMovePlayerModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowMovePlayerModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Move Player</Text>
            <Text style={styles.movePlayerName}>{movePlayerContext?.playerName}</Text>
            
            <Text style={styles.modalLabel}>Select destination group:</Text>
            
            <ScrollView style={styles.groupSelectList}>
              {teeGroups.map((group, idx) => {
                const isFull = group.players.length >= 4;
                const isCurrent = idx === movePlayerContext?.fromGroup;
                const teeTime = new Date(group.timeISO).toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                });
                
                return (
                  <Pressable
                    key={idx}
                    onPress={() => !isFull && !isCurrent && handleConfirmMovePlayer(idx)}
                    style={[
                      styles.groupSelectItem,
                      isCurrent && styles.groupSelectItemCurrent,
                      isFull && styles.groupSelectItemDisabled,
                    ]}
                    disabled={isFull || isCurrent}
                  >
                    <Text style={styles.groupSelectItemText}>
                      Group {idx + 1} • {teeTime}
                    </Text>
                    <Text style={styles.groupSelectItemCount}>
                      {group.players.length}/4 {isFull ? "(Full)" : isCurrent ? "(Current)" : ""}
                    </Text>
                  </Pressable>
                );
              })}
              
              {/* Option to move to unassigned */}
              {movePlayerContext?.fromGroup !== -1 && (
                <Pressable
                  onPress={() => {
                    if (movePlayerContext) {
                      handleMovePlayer(movePlayerContext.playerId, movePlayerContext.fromGroup, -1);
                      setShowMovePlayerModal(false);
                      setMovePlayerContext(null);
                    }
                  }}
                  style={[styles.groupSelectItem, styles.groupSelectItemUnassigned]}
                >
                  <Text style={styles.groupSelectItemText}>Move to Unassigned</Text>
                </Pressable>
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => {
                  setShowMovePlayerModal(false);
                  setMovePlayerContext(null);
                }}
                style={styles.modalCancelButton}
              >
                <Text style={styles.modalCancelButtonText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  readOnlyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    backgroundColor: "#fef3c7",
    borderColor: "#fcd34d",
    borderWidth: 1,
  },
  readOnlyText: {
    flex: 1,
  },
  warningCard: {
    backgroundColor: "#fef3c7",
    borderColor: "#fcd34d",
    borderWidth: 1,
    marginBottom: 12,
    padding: 12,
  },
  successCard: {
    backgroundColor: "#d1fae5",
    borderColor: "#10b981",
    borderWidth: 1,
    marginBottom: 12,
    padding: 12,
  },
  tabs: {
    flexDirection: "row",
    marginBottom: 16,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 6,
  },
  tabActive: {
    backgroundColor: "#0B6E4F",
  },
  tabText: {
    color: "#6b7280",
  },
  tabTextActive: {
    color: "#fff",
  },
  tabContent: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1f2937",
    marginBottom: 8,
  },
  emptyText: {
    color: "#6b7280",
    fontStyle: "italic",
    textAlign: "center",
    padding: 20,
  },
  selectContainer: {
    maxHeight: 150,
    marginBottom: 8,
  },
  selectButton: {
    padding: 12,
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  selectButtonActive: {
    backgroundColor: "#0B6E4F",
    borderColor: "#0B6E4F",
  },
  selectButtonText: {
    color: "#1f2937",
  },
  selectButtonTextActive: {
    color: "#fff",
  },
  teeSetInfo: {
    padding: 12,
    backgroundColor: "#f9fafb",
    borderRadius: 8,
  },
  teeSetLabel: {
    fontSize: 14,
    color: "#374151",
    marginBottom: 4,
  },
  allowanceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  allowanceInput: {
    width: 80,
    padding: 10,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    backgroundColor: "#fff",
    textAlign: "center",
  },
  allowanceLabel: {
    fontSize: 16,
    color: "#374151",
  },
  timeRow: {
    flexDirection: "row",
    gap: 16,
  },
  timeField: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 4,
  },
  timeInput: {
    padding: 10,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  playerList: {
    maxHeight: 200,
    marginBottom: 12,
  },
  playerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 10,
    backgroundColor: "#f9fafb",
    borderRadius: 6,
    marginBottom: 6,
  },
  playerRowSelected: {
    backgroundColor: "#d1fae5",
    borderColor: "#10b981",
    borderWidth: 1,
  },
  playerName: {
    flex: 1,
    fontSize: 14,
  },
  playerHI: {
    fontSize: 14,
    color: "#6b7280",
  },
  addGuestButton: {
    padding: 10,
    borderWidth: 1,
    borderColor: "#0B6E4F",
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 12,
  },
  addGuestButtonText: {
    color: "#0B6E4F",
    fontWeight: "600",
  },
  generateButton: {
    backgroundColor: "#0B6E4F",
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 16,
  },
  generateButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  teeGroupsContainer: {
    marginTop: 8,
  },
  groupCard: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  groupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  groupTime: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0B6E4F",
  },
  groupNumber: {
    fontSize: 14,
    color: "#6b7280",
  },
  emptyGroup: {
    color: "#9ca3af",
    fontStyle: "italic",
  },
  groupPlayer: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
  },
  groupPlayerName: {
    flex: 1,
    fontSize: 14,
  },
  groupPlayerHI: {
    width: 60,
    fontSize: 12,
    color: "#6b7280",
    textAlign: "center",
  },
  groupPlayerPH: {
    width: 50,
    fontSize: 14,
    fontWeight: "600",
    color: "#0B6E4F",
    textAlign: "center",
  },
  actionButtons: {
    gap: 10,
    marginTop: 16,
  },
  addGroupButton: {
    padding: 10,
    borderWidth: 1,
    borderColor: "#0B6E4F",
    borderRadius: 8,
    alignItems: "center",
  },
  addGroupButtonText: {
    color: "#0B6E4F",
    fontWeight: "600",
  },
  saveButton: {
    backgroundColor: "#0B6E4F",
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  saveButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  pdfButton: {
    backgroundColor: "#1e40af",
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  pdfButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    width: "100%",
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 16,
    textAlign: "center",
  },
  modalField: {
    marginBottom: 16,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 6,
    color: "#374151",
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  sexToggle: {
    flexDirection: "row",
    gap: 12,
  },
  sexToggleButton: {
    flex: 1,
    padding: 12,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    alignItems: "center",
  },
  sexToggleButtonActive: {
    backgroundColor: "#0B6E4F",
    borderColor: "#0B6E4F",
  },
  sexToggleText: {
    color: "#374151",
  },
  sexToggleTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  modalCancelButton: {
    flex: 1,
    padding: 12,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    alignItems: "center",
  },
  modalCancelButtonText: {
    color: "#6b7280",
    fontWeight: "600",
  },
  modalSubmitButton: {
    flex: 1,
    padding: 12,
    backgroundColor: "#0B6E4F",
    borderRadius: 8,
    alignItems: "center",
  },
  modalSubmitButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  // View/Edit Mode Styles
  viewModeCard: {
    backgroundColor: "#d1fae5",
    borderColor: "#10b981",
    borderWidth: 1,
    marginBottom: 16,
  },
  editModeCard: {
    backgroundColor: "#fef3c7",
    borderColor: "#f59e0b",
    borderWidth: 1,
    marginBottom: 16,
  },
  modeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modeDescription: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 8,
  },
  editToggleButton: {
    backgroundColor: "#0B6E4F",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  editToggleButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  cancelEditButton: {
    backgroundColor: "#6b7280",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  cancelEditButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  saveReminder: {
    fontSize: 12,
    color: "#b45309",
    textAlign: "center",
    marginTop: 8,
    fontStyle: "italic",
  },
  // Tee Groups Header
  teeGroupsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  editHint: {
    fontSize: 11,
    color: "#6b7280",
    fontStyle: "italic",
  },
  // Editable Group Time
  groupTimeInput: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0B6E4F",
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 70,
  },
  groupHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  deleteGroupButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#fee2e2",
    justifyContent: "center",
    alignItems: "center",
  },
  deleteGroupButtonText: {
    color: "#dc2626",
    fontWeight: "700",
    fontSize: 12,
  },
  // Player Info Layout
  groupPlayerInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  groupPlayerStats: {
    flexDirection: "row",
    gap: 8,
  },
  guestTag: {
    color: "#6b7280",
    fontSize: 12,
  },
  // Player Edit Controls
  playerEditControls: {
    flexDirection: "row",
    gap: 4,
    marginLeft: 8,
  },
  playerControlBtn: {
    width: 28,
    height: 28,
    borderRadius: 4,
    backgroundColor: "#e5e7eb",
    justifyContent: "center",
    alignItems: "center",
  },
  playerControlBtnDisabled: {
    opacity: 0.3,
  },
  playerControlBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  playerControlBtnDanger: {
    backgroundColor: "#fee2e2",
  },
  playerControlBtnTextDanger: {
    color: "#dc2626",
  },
  // Unassigned Players
  unassignedSection: {
    backgroundColor: "#fef3c7",
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#fcd34d",
  },
  unassignedTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#b45309",
    marginBottom: 8,
  },
  unassignedPlayer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#fcd34d",
  },
  unassignedPlayerName: {
    fontSize: 14,
    color: "#374151",
  },
  assignButton: {
    backgroundColor: "#0B6E4F",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 4,
  },
  assignButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  // Move Player Modal
  movePlayerName: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 16,
    color: "#0B6E4F",
  },
  groupSelectList: {
    maxHeight: 250,
    marginBottom: 16,
  },
  groupSelectItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#f9fafb",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  groupSelectItemCurrent: {
    backgroundColor: "#d1fae5",
    borderColor: "#10b981",
  },
  groupSelectItemDisabled: {
    backgroundColor: "#f3f4f6",
    opacity: 0.6,
  },
  groupSelectItemUnassigned: {
    backgroundColor: "#fef3c7",
    borderColor: "#fcd34d",
  },
  groupSelectItemText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
  },
  groupSelectItemCount: {
    fontSize: 12,
    color: "#6b7280",
  },
});
