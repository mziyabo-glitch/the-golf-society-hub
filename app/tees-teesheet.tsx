/**
 * Tees & Tee Sheet Management Screen
 * - Handicapper/Captain/Secretary can manage tee sets and create tee sheets
 * - Members can view tee sheet
 */

import { STORAGE_KEYS } from "@/lib/storage";
import type { Course, TeeSet, EventData, MemberData } from "@/lib/models";
import { getPlayingHandicap, getCourseHandicap } from "@/lib/handicap";
import { formatDateDDMMYYYY } from "@/utils/date";
import { getPermissions, type Permissions } from "@/lib/rbac";
import { guard } from "@/lib/guards";
import { getArray, ensureArray } from "@/lib/storage-helpers";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { useCallback, useState, useRef } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View, Modal, Platform, ActivityIndicator } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

const COURSES_KEY = STORAGE_KEYS.COURSES;
const EVENTS_KEY = STORAGE_KEYS.EVENTS;
const MEMBERS_KEY = STORAGE_KEYS.MEMBERS;

type TabType = "tees" | "teesheet";

export default function TeesTeeSheetScreen() {
  const [permissions, setPermissions] = useState<Permissions | null>(null);
  const [permissionsLoading, setPermissionsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>("tees");
  const [courses, setCourses] = useState<Course[]>([]);
  const [events, setEvents] = useState<EventData[]>([]);
  const [members, setMembers] = useState<MemberData[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventData | null>(null);
  const [selectedMaleTeeSet, setSelectedMaleTeeSet] = useState<TeeSet | null>(null);
  const [selectedFemaleTeeSet, setSelectedFemaleTeeSet] = useState<TeeSet | null>(null);
  const [handicapAllowancePct, setHandicapAllowancePct] = useState<number>(100);

  // Tee Sheet fields
  const [startTime, setStartTime] = useState("08:00");
  const [intervalMins, setIntervalMins] = useState<number>(8);
  const [teeGroups, setTeeGroups] = useState<Array<{ timeISO: string; players: string[] }>>([]);
  
  // Player selection (assume all coming by default)
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());
  const [guests, setGuests] = useState<Array<{ id: string; name: string; sex: "male" | "female"; handicapIndex?: number; included: boolean }>>([]);

  // Add Guest Modal state
  const [showAddGuestModal, setShowAddGuestModal] = useState(false);
  const [newGuestName, setNewGuestName] = useState("");
  const [newGuestHI, setNewGuestHI] = useState("");
  const [newGuestSex, setNewGuestSex] = useState<"male" | "female">("male");

  // Manual Edit Mode state
  const [editMode, setEditMode] = useState(false);
  const [movePlayerData, setMovePlayerData] = useState<{ playerId: string; fromGroup: number } | null>(null);
  const [unassignedPlayers, setUnassignedPlayers] = useState<string[]>([]);

  // PDF sharing guard
  const isSharing = useRef(false);

  const [society, setSociety] = useState<{ name: string; logoUrl?: string } | null>(null);

  // Derived permission flag
  const canManageTeeSheet = permissions?.canManageTeeSheet ?? false;

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
      console.error("Error loading permissions:", error);
      setPermissions(null);
    } finally {
      setPermissionsLoading(false);
    }
  };

  const loadData = async () => {
    try {
      // Load society (for logo and name)
      const societyData = await AsyncStorage.getItem(STORAGE_KEYS.SOCIETY_ACTIVE);
      if (societyData) {
        try {
          const loaded = JSON.parse(societyData);
          setSociety(loaded);
        } catch (e) {
          console.error("Error parsing society data:", e);
        }
      }

      // Load courses
      const loadedCourses = await getArray<Course>(COURSES_KEY, []);
      setCourses(loadedCourses);

      // Load events
      const loadedEvents = await getArray<EventData>(EVENTS_KEY, []);
      setEvents(loadedEvents);

      // Load members
      const loadedMembers = await getArray<MemberData>(MEMBERS_KEY, []);
      setMembers(loadedMembers);
    } catch (error) {
      console.error("Error loading data:", error);
    }
  };

  const handleSelectCourse = (course: Course) => {
    setSelectedCourse(course);
    // Find tee sets for this course
    const maleTee = course.teeSets.find((t) => t.appliesTo === "male");
    const femaleTee = course.teeSets.find((t) => t.appliesTo === "female");
    setSelectedMaleTeeSet(maleTee || null);
    setSelectedFemaleTeeSet(femaleTee || null);
  };

  const handleSelectEvent = (event: EventData) => {
    setSelectedEvent(event);
    // Load event's tee sheet if exists
    if (event.teeSheet) {
      setStartTime(new Date(event.teeSheet.startTimeISO).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }));
      setIntervalMins(event.teeSheet.intervalMins);
      setTeeGroups(event.teeSheet.groups);
    } else {
      setTeeGroups([]);
    }

    // Load course and tee sets for this event
    if (event.courseId) {
      const course = courses.find((c) => c.id === event.courseId);
      if (course) {
        setSelectedCourse(course);
        if (event.maleTeeSetId) {
          const maleTee = course.teeSets.find((t) => t.id === event.maleTeeSetId);
          setSelectedMaleTeeSet(maleTee || null);
        }
        if (event.femaleTeeSetId) {
          const femaleTee = course.teeSets.find((t) => t.id === event.femaleTeeSetId);
          setSelectedFemaleTeeSet(femaleTee || null);
        }
      }
    }

    // Load allowance
    if (event.handicapAllowancePct !== undefined) {
      setHandicapAllowancePct(event.handicapAllowancePct);
    } else if (event.handicapAllowance !== undefined) {
      setHandicapAllowancePct(event.handicapAllowance === 1.0 ? 100 : 90);
    }
    
    // Initialize player selection: assume all coming unless RSVP says otherwise
    const includedIds = new Set<string>();
    members.forEach((member) => {
      const rsvp = event.rsvps?.[member.id];
      // Default to true (coming) unless RSVP explicitly says "no"
      if (rsvp !== "no") {
        includedIds.add(member.id);
      }
    });
    setSelectedPlayerIds(includedIds);
    
    // Load guests if they exist
    if (event.guests && Array.isArray(event.guests)) {
      setGuests(event.guests);
    } else {
      setGuests([]);
    }
  };

  const handleSaveTees = async () => {
    if (!guard(canManageTeeSheet, "Only Captain or Handicapper can save tee sets.")) {
      return;
    }
    if (!selectedEvent || !selectedCourse) {
      Alert.alert("Error", "Please select an event and course first");
      return;
    }

    if (!selectedMaleTeeSet || !selectedFemaleTeeSet) {
      Alert.alert("Error", "Both male and female tee sets must be selected");
      return;
    }

    try {
      const updatedEvents = events.map((e) =>
        e.id === selectedEvent.id
          ? {
              ...e,
              courseId: selectedCourse.id,
              maleTeeSetId: selectedMaleTeeSet.id,
              femaleTeeSetId: selectedFemaleTeeSet.id,
              handicapAllowancePct: handicapAllowancePct,
              handicapAllowance: handicapAllowancePct === 100 ? 1.0 : 0.9,
              courseName: selectedCourse.name, // Keep for backward compat
            }
          : e
      );

      await AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(updatedEvents));
      await loadData();
      Alert.alert("Success", "Tee sets saved for event");
    } catch (error) {
      console.error("Error saving tees:", error);
      Alert.alert("Error", "Failed to save tee sets");
    }
  };

  const handleGenerateTeeSheet = () => {
    if (!guard(canManageTeeSheet, "Only Captain or Handicapper can generate tee sheets.")) {
      return;
    }
    if (!selectedEvent) {
      Alert.alert("Error", "Please select an event first");
      return;
    }

    // Get selected players (members + guests that are included)
    const selectedMembers = members.filter((m) => selectedPlayerIds.has(m.id));
    const selectedGuests = guests.filter((g) => g.included && g.handicapIndex !== undefined);
    
    // Combine members and guests
    const allPlayers = [
      ...selectedMembers.map((m) => ({ id: m.id, name: m.name, sex: m.sex || "male", handicap: m.handicap, isGuest: false })),
      ...selectedGuests.map((g) => ({ id: g.id, name: g.name, sex: g.sex, handicap: g.handicapIndex, isGuest: true })),
    ];

    if (allPlayers.length === 0) {
      Alert.alert("Error", "No players selected. Please include at least one player.");
      return;
    }

    // Calculate playing handicaps and sort by PH descending (for snake draft)
    const playersWithPH = allPlayers
      .map((player) => {
        const memberData: MemberData = {
          id: player.id,
          name: player.name,
          handicap: player.handicap,
          sex: player.sex as "male" | "female",
        };
        const ph = getPlayingHandicap(
          memberData,
          selectedEvent,
          selectedCourse,
          selectedMaleTeeSet,
          selectedFemaleTeeSet
        );
        return { ...player, playingHandicap: ph ?? 0 };
      })
      .sort((a, b) => b.playingHandicap - a.playingHandicap); // Sort by PH descending

    // Calculate number of groups needed
    const maxPerGroup = 4;
    const playerCount = playersWithPH.length;
    const groupCount = Math.ceil(playerCount / maxPerGroup);

    // Parse start time
    const [hours, minutes] = startTime.split(":").map(Number);
    const startDate = new Date();
    startDate.setHours(hours || 8, minutes || 0, 0, 0);

    // Generate groups using snake draft
    const groups: Array<{ timeISO: string; players: string[] }> = [];
    for (let groupIdx = 0; groupIdx < groupCount; groupIdx++) {
      groups.push({
        timeISO: new Date(startDate.getTime() + groupIdx * intervalMins * 60000).toISOString(),
        players: [],
      });
    }

    // Snake draft: fill groups 0..n-1 then n-1..0 repeating
    let direction = 1; // 1 = forward, -1 = backward
    let currentGroup = 0;
    
    for (const player of playersWithPH) {
      groups[currentGroup].players.push(player.id);
      
      // Move to next group
      currentGroup += direction;
      
      // Reverse direction at boundaries
      if (currentGroup >= groupCount) {
        currentGroup = groupCount - 1;
        direction = -1;
      } else if (currentGroup < 0) {
        currentGroup = 0;
        direction = 1;
      }
    }

    // RULE: No 3-ball (or smaller) BEHIND a 4-ball
    // Sort groups so smaller groups go first, then 4-balls
    groups.sort((a, b) => a.players.length - b.players.length);

    // Recalculate tee times after reordering
    for (let i = 0; i < groups.length; i++) {
      groups[i].timeISO = new Date(startDate.getTime() + i * intervalMins * 60000).toISOString();
    }

    // Debug guard: verify all players are included
    const totalInGroups = groups.reduce((sum, g) => sum + g.players.length, 0);
    if (totalInGroups !== playersWithPH.length) {
      Alert.alert("Warning", `Player count mismatch: ${totalInGroups} in groups vs ${playersWithPH.length} selected`);
    }

    // Clear unassigned when generating new groups
    setUnassignedPlayers([]);
    setTeeGroups(groups);
  };

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

    try {
      const [hours, minutes] = startTime.split(":").map(Number);
      const startDate = new Date();
      startDate.setHours(hours, minutes, 0, 0);

      const updatedEvents = events.map((e) =>
        e.id === selectedEvent.id
          ? {
              ...e,
              teeSheet: {
                startTimeISO: startDate.toISOString(),
                intervalMins: intervalMins,
                groups: teeGroups,
              },
              guests: guests, // Save guests with event
            }
          : e
      );

      await AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(updatedEvents));
      await loadData();
      Alert.alert("Success", "Tee sheet saved");
    } catch (error) {
      console.error("Error saving tee sheet:", error);
      Alert.alert("Error", "Failed to save tee sheet");
    }
  };

  const handleMovePlayer = (playerId: string, fromGroupIndex: number, toGroupIndex: number) => {
    if (!guard(canManageTeeSheet, "Only Captain or Handicapper can modify groups.")) {
      return;
    }
    if (toGroupIndex === -1) {
      // Move to unassigned
      const newGroups = [...teeGroups];
      newGroups[fromGroupIndex].players = newGroups[fromGroupIndex].players.filter((p) => p !== playerId);
      setTeeGroups(newGroups);
      setUnassignedPlayers((prev) => [...prev, playerId]);
      setMovePlayerData(null);
      return;
    }

    // Moving to a group
    const newGroups = [...teeGroups];
    
    // Check if coming from unassigned
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

    const player = newGroups[fromGroupIndex].players.find((p) => p === playerId);
    if (!player) return;

    // Check if destination is full
    if (newGroups[toGroupIndex].players.length >= 4) {
      Alert.alert("Error", "Group is full (max 4 players)");
      return;
    }

    // Remove from old group
    newGroups[fromGroupIndex].players = newGroups[fromGroupIndex].players.filter((p) => p !== playerId);
    // Add to new group
    newGroups[toGroupIndex].players.push(player);

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
    if (!guard(canManageTeeSheet, "Only Captain or Handicapper can delete groups.")) {
      return;
    }
    const group = teeGroups[groupIndex];
    if (group.players.length > 0) {
      // Move players to unassigned
      setUnassignedPlayers((prev) => [...prev, ...group.players]);
    }
    setTeeGroups(teeGroups.filter((_, idx) => idx !== groupIndex));
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
    const newGuest = {
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

  const handleSaveRsvps = async () => {
    if (!guard(canManageTeeSheet, "Only Captain or Handicapper can save RSVPs.")) {
      return;
    }
    if (!selectedEvent) return;
    try {
      // Update RSVPs for selected members
      const newRsvps: Record<string, string> = { ...selectedEvent.rsvps };
      members.forEach((member) => {
        if (selectedPlayerIds.has(member.id)) {
          newRsvps[member.id] = "yes"; // Coming
        }
      });
      const updatedEvents = events.map((e) =>
        e.id === selectedEvent.id ? { ...e, rsvps: newRsvps, guests } : e
      );
      await AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(updatedEvents));
      setEvents(updatedEvents);
    } catch (error) {
      console.error("Error saving RSVPs:", error);
    }
  };

  const handleGeneratePDF = async () => {
    if (!selectedEvent || !selectedCourse || teeGroups.length === 0) {
      Alert.alert("Error", "Please ensure event, course, and tee sheet are set");
      return;
    }

    // Guard against double-tap
    if (isSharing.current) {
      return;
    }
    isSharing.current = true;

    try {
      // Get ManCo members
      const captain = members.find((m) => m.roles?.includes("captain") || m.roles?.includes("admin"));
      const secretary = members.find((m) => m.roles?.includes("secretary"));
      const treasurer = members.find((m) => m.roles?.includes("treasurer"));
      const handicapper = members.find((m) => m.roles?.includes("handicapper"));

      const manCoDetails: string[] = [];
      if (captain) manCoDetails.push(`Captain: ${captain.name}`);
      if (secretary) manCoDetails.push(`Secretary: ${secretary.name}`);
      if (treasurer) manCoDetails.push(`Treasurer: ${treasurer.name}`);
      if (handicapper) manCoDetails.push(`Handicapper: ${handicapper.name}`);

      const logoHtml = society?.logoUrl 
        ? `<img src="${society.logoUrl}" alt="Society Logo" style="max-width: 80px; max-height: 80px; margin-bottom: 10px;" />`
        : "";

      // Build HTML for PDF
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; font-size: 10px; padding: 10px; }
            .top-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px; }
            .logo-container { flex-shrink: 0; }
            .header { flex: 1; text-align: center; }
            .header h1 { margin: 0; font-size: 18px; font-weight: bold; }
            .header p { margin: 5px 0; font-size: 12px; }
            .manco { margin-top: 10px; font-size: 9px; color: #555; }
            .manco p { margin: 2px 0; }
            .produced-by { text-align: right; font-size: 8px; color: #666; margin-top: 5px; }
            .tee-info { float: right; width: 200px; border: 1px solid #000; padding: 8px; font-size: 9px; }
            .tee-info h3 { margin: 0 0 8px 0; font-size: 11px; }
            .tee-info p { margin: 3px 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 9px; }
            th, td { border: 1px solid #000; padding: 4px; text-align: left; }
            th { background-color: #f0f0f0; font-weight: bold; }
            .group-col { width: 60px; }
            .name-col { width: 150px; }
            .hi-col, .ph-col { width: 40px; text-align: center; }
            @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
          </style>
        </head>
        <body>
          <div class="top-header">
            <div class="logo-container">
              ${logoHtml}
            </div>
            <div class="header">
              <h1>${selectedEvent.name || "Tee Sheet"}</h1>
              <p>${selectedEvent.date || "Date TBD"} | ${selectedCourse?.name || "Course TBD"}</p>
              ${manCoDetails.length > 0 ? `<div class="manco">${manCoDetails.map(d => `<p>${d}</p>`).join("")}</div>` : ""}
              <div class="produced-by">Produced by The Golf Society Hub</div>
            </div>
            <div style="width: 80px;"></div>
          </div>
          <div class="tee-info">
            <h3>Tee Information</h3>
            ${selectedMaleTeeSet ? `<p><strong>Male:</strong> ${selectedMaleTeeSet.teeColor}<br>
              Par: ${selectedMaleTeeSet.par} | CR: ${selectedMaleTeeSet.courseRating} | SR: ${selectedMaleTeeSet.slopeRating}</p>` : ""}
            ${selectedFemaleTeeSet ? `<p><strong>Female:</strong> ${selectedFemaleTeeSet.teeColor}<br>
              Par: ${selectedFemaleTeeSet.par} | CR: ${selectedFemaleTeeSet.courseRating} | SR: ${selectedFemaleTeeSet.slopeRating}</p>` : ""}
            <p><strong>Allowance:</strong> ${handicapAllowancePct}%</p>
          </div>
          <table>
            <thead>
              <tr>
                <th class="group-col">Time</th>
                <th class="group-col">Group</th>
                <th class="name-col">Player Name</th>
                <th class="hi-col">HI</th>
                <th class="ph-col">PH</th>
              </tr>
            </thead>
            <tbody>
              ${teeGroups
                .map((group, groupIdx) => {
                  const timeStr = new Date(group.timeISO).toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  });
                  if (group.players.length === 0) {
                    return `<tr><td>${timeStr}</td><td>${groupIdx + 1}</td><td colspan="3" style="font-style:italic;color:#666;">Empty group</td></tr>`;
                  }
                  return group.players
                    .map((playerId, playerIdx) => {
                      const member = members.find((m) => m.id === playerId);
                      const guest = guests.find((g) => g.id === playerId);
                      if (!member && !guest) return "";
                      
                      const player = member || {
                        id: guest!.id,
                        name: guest!.name,
                        handicap: guest!.handicapIndex,
                        sex: guest!.sex,
                      };
                      const ph = getPlayingHandicap(
                        player,
                        selectedEvent!,
                        selectedCourse,
                        selectedMaleTeeSet,
                        selectedFemaleTeeSet
                      );
                      const displayName = guest ? `${player.name || "Guest"} (Guest)` : (player.name || "Unknown");
                      return `
                        <tr>
                          ${playerIdx === 0 ? `<td rowspan="${group.players.length}">${timeStr}</td>` : ""}
                          ${playerIdx === 0 ? `<td rowspan="${group.players.length}">${groupIdx + 1}</td>` : ""}
                          <td>${displayName}</td>
                          <td style="text-align: center;">${player.handicap ?? "-"}</td>
                          <td style="text-align: center;">${ph ?? "-"}</td>
                        </tr>
                      `;
                    })
                    .join("");
                })
                .join("")}
            </tbody>
          </table>
        </body>
        </html>
      `;

      // Web platform: open in new window for print
      if (Platform.OS === "web") {
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
          a.download = `tee-sheet-${selectedEvent.name || "export"}.html`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          Alert.alert("Success", "Tee sheet downloaded as HTML");
        }
        isSharing.current = false;
        return;
      }

      // Mobile: use expo-print + expo-sharing
      try {
        const { uri } = await Print.printToFileAsync({ html });
        const sharingAvailable = await Sharing.isAvailableAsync();
        if (sharingAvailable) {
          await Sharing.shareAsync(uri);
        } else {
          Alert.alert("Success", `PDF saved to: ${uri}`);
        }
      } catch (printError) {
        console.error("Error with print/sharing:", printError);
        Alert.alert("Error", "Failed to generate or share PDF. Please try again.");
      }
    } catch (error) {
      console.error("Error generating PDF:", error);
      Alert.alert("Error", "Failed to generate PDF");
    } finally {
      isSharing.current = false;
    }
  };

  if (permissionsLoading) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color="#0B6E4F" />
      </View>
    );
  }

  // Members can view but not edit
  const isReadOnly = !canManageTeeSheet;


  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Tees & Tee Sheet</Text>

        {/* Tabs */}
        <View style={styles.tabs}>
          <Pressable
            onPress={() => setActiveTab("tees")}
            style={[styles.tab, activeTab === "tees" && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeTab === "tees" && styles.tabTextActive]}>Tees</Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab("teesheet")}
            style={[styles.tab, activeTab === "teesheet" && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeTab === "teesheet" && styles.tabTextActive]}>Tee Sheet</Text>
          </Pressable>
        </View>

        {activeTab === "tees" ? (
          <View style={styles.tabContent}>
            <Text style={styles.sectionTitle}>Select Event</Text>
            {events.length === 0 ? (
              <Text style={styles.emptyText}>No events found. Create an event first.</Text>
            ) : (
              <View style={styles.selectContainer}>
                {events.map((event) => (
                  <Pressable
                    key={event.id}
                    onPress={() => handleSelectEvent(event)}
                    style={[
                      styles.selectButton,
                      selectedEvent?.id === event.id && styles.selectButtonActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.selectButtonText,
                        selectedEvent?.id === event.id && styles.selectButtonTextActive,
                      ]}
                    >
                      {event.name} ({formatDateDDMMYYYY(event.date)})
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            {selectedEvent && (
              <View>
                <Text style={styles.sectionTitle}>Select Course</Text>
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
                  <View style={styles.selectContainer}>
                    {courses.map((course) => (
                      <Pressable
                        key={course.id}
                        onPress={() => handleSelectCourse(course)}
                        style={[
                          styles.selectButton,
                          selectedCourse?.id === course.id && styles.selectButtonActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.selectButtonText,
                            selectedCourse?.id === course.id && styles.selectButtonTextActive,
                          ]}
                        >
                          {course.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}

                {selectedCourse && (
                  <View>
                    <Text style={styles.sectionTitle}>Male Tee Set</Text>
                    {selectedCourse.teeSets.filter((t) => t.appliesTo === "male").length === 0 ? (
                      <Text style={styles.warningText}>No male tee sets. Add in Venue Info.</Text>
                    ) : (
                      <View style={styles.selectContainer}>
                        {selectedCourse.teeSets
                          .filter((t) => t.appliesTo === "male")
                          .map((tee) => (
                            <Pressable
                              key={tee.id}
                              onPress={() => setSelectedMaleTeeSet(tee)}
                              style={[
                                styles.selectButton,
                                selectedMaleTeeSet?.id === tee.id && styles.selectButtonActive,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.selectButtonText,
                                  selectedMaleTeeSet?.id === tee.id && styles.selectButtonTextActive,
                                ]}
                              >
                                {tee.teeColor} (Par {tee.par}, CR {tee.courseRating}, SR {tee.slopeRating})
                              </Text>
                            </Pressable>
                          ))}
                      </View>
                    )}

                    <Text style={styles.sectionTitle}>Female Tee Set</Text>
                    {selectedCourse.teeSets.filter((t) => t.appliesTo === "female").length === 0 ? (
                      <Text style={styles.warningText}>No female tee sets. Add in Venue Info.</Text>
                    ) : (
                      <View style={styles.selectContainer}>
                        {selectedCourse.teeSets
                          .filter((t) => t.appliesTo === "female")
                          .map((tee) => (
                            <Pressable
                              key={tee.id}
                              onPress={() => setSelectedFemaleTeeSet(tee)}
                              style={[
                                styles.selectButton,
                                selectedFemaleTeeSet?.id === tee.id && styles.selectButtonActive,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.selectButtonText,
                                  selectedFemaleTeeSet?.id === tee.id && styles.selectButtonTextActive,
                                ]}
                              >
                                {tee.teeColor} (Par {tee.par}, CR {tee.courseRating}, SR {tee.slopeRating})
                              </Text>
                            </Pressable>
                          ))}
                      </View>
                    )}

                    <Text style={styles.sectionTitle}>Handicap Allowance (%)</Text>
                    <TextInput
                      value={handicapAllowancePct.toString()}
                      onChangeText={(value) => {
                        // Sanitize: trim, replace commas with dots, parseFloat, clamp 0-100
                        const sanitized = value.trim().replace(/,/g, ".");
                        const parsed = parseFloat(sanitized);
                        if (!isNaN(parsed)) {
                          const clamped = Math.max(0, Math.min(100, parsed));
                          setHandicapAllowancePct(clamped);
                        } else if (sanitized === "") {
                          // Allow empty for user to type
                          setHandicapAllowancePct(100); // Will be set on blur if empty
                        }
                      }}
                      onBlur={() => {
                        // Fallback to 100 if empty
                        if (isNaN(handicapAllowancePct) || handicapAllowancePct === 0) {
                          setHandicapAllowancePct(100);
                        }
                      }}
                      placeholder="100"
                      keyboardType="numeric"
                      style={styles.input}
                    />
                    <Text style={styles.helperText}>Common: 95% / 100%</Text>

                    <Pressable onPress={handleSaveTees} style={styles.saveButton}>
                      <Text style={styles.saveButtonText}>Save Tee Sets for Event</Text>
                    </Pressable>

                    <Pressable
                      onPress={() => router.push("/venue-info" as any)}
                      style={styles.secondaryButton}
                    >
                      <Text style={styles.secondaryButtonText}>Edit Tee Sets in Venue Info</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            )}
          </View>
        ) : (
          <View style={styles.tabContent} key="teesheet-tab">
            <Text style={styles.sectionTitle}>Select Event</Text>
            {events.length === 0 ? (
              <Text style={styles.emptyText}>No events found. Create an event first.</Text>
            ) : (
              <View style={styles.selectContainer}>
                {events.map((event) => (
                  <Pressable
                    key={event.id}
                    onPress={() => handleSelectEvent(event)}
                    style={[
                      styles.selectButton,
                      selectedEvent?.id === event.id && styles.selectButtonActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.selectButtonText,
                        selectedEvent?.id === event.id && styles.selectButtonTextActive,
                      ]}
                    >
                      {event.name} ({formatDateDDMMYYYY(event.date)})
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            {selectedEvent && (
              <View>
                {/* Players Included Section */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Players Included</Text>
                  <View style={styles.quickActions}>
                    <Pressable
                      onPress={() => {
                        const allIds = new Set(members.map((m) => m.id));
                        setSelectedPlayerIds(allIds);
                      }}
                      style={styles.quickActionButton}
                    >
                      <Text style={styles.quickActionText}>Select All</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setSelectedPlayerIds(new Set())}
                      style={styles.quickActionButton}
                    >
                      <Text style={styles.quickActionText}>Select None</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.countText}>
                    Included: {selectedPlayerIds.size + guests.filter((g) => g.included).length} of {members.length + guests.length}
                  </Text>
                  
                  {/* Members List */}
                  {members.map((member) => {
                    const isIncluded = selectedPlayerIds.has(member.id);
                    return (
                      <Pressable
                        key={member.id}
                        onPress={() => {
                          if (canManageTeeSheet) {
                            const newSet = new Set(selectedPlayerIds);
                            if (isIncluded) {
                              newSet.delete(member.id);
                            } else {
                              newSet.add(member.id);
                            }
                            setSelectedPlayerIds(newSet);
                          }
                        }}
                        style={[styles.playerSelectRow, !canManageTeeSheet && styles.playerSelectRowReadOnly]}
                      >
                        <View style={styles.checkbox}>
                          {isIncluded && <View style={styles.checkmark} />}
                        </View>
                        <Text style={styles.playerSelectName}>{member.name}</Text>
                        {member.handicap !== undefined && (
                          <Text style={styles.playerSelectHandicap}>HI: {member.handicap}</Text>
                        )}
                      </Pressable>
                    );
                  })}
                  
                  {/* Guests List */}
                  {guests.map((guest) => {
                    const isIncluded = guest.included;
                    return (
                      <View key={guest.id} style={styles.guestRow}>
                        <Pressable
                          onPress={() => {
                            if (canManageTeeSheet) {
                              setGuests((prev) =>
                                prev.map((g) =>
                                  g.id === guest.id ? { ...g, included: !g.included } : g
                                )
                              );
                            }
                          }}
                          style={[styles.playerSelectRow, !canManageTeeSheet && styles.playerSelectRowReadOnly, { flex: 1 }]}
                        >
                          <View style={styles.checkbox}>
                            {isIncluded && <View style={styles.checkmark} />}
                          </View>
                          {canManageTeeSheet ? (
                            <View>
                              <TextInput
                                value={guest.name}
                                onChangeText={(text) => {
                                  setGuests((prev) =>
                                    prev.map((g) => (g.id === guest.id ? { ...g, name: text } : g))
                                  );
                                }}
                                style={[styles.guestNameInput, { flex: 1 }]}
                                placeholder="Guest name"
                              />
                              <TextInput
                                value={guest.handicapIndex?.toString() || ""}
                                onChangeText={(text) => {
                                  const hi = parseFloat(text);
                                  if (!isNaN(hi) && hi >= 0 && hi <= 54) {
                                    setGuests((prev) =>
                                      prev.map((g) => (g.id === guest.id ? { ...g, handicapIndex: hi } : g))
                                    );
                                  } else if (text === "") {
                                    setGuests((prev) =>
                                      prev.map((g) => (g.id === guest.id ? { ...g, handicapIndex: undefined } : g))
                                    );
                                  }
                                }}
                                keyboardType="numeric"
                                style={styles.guestHIInput}
                                placeholder="HI"
                              />
                              <Pressable
                                onPress={() => {
                                  Alert.alert(
                                    "Select Sex",
                                    "",
                                    [
                                      { text: "Cancel", style: "cancel" },
                                      {
                                        text: "Male",
                                        onPress: () => {
                                          setGuests((prev) =>
                                            prev.map((g) => (g.id === guest.id ? { ...g, sex: "male" } : g))
                                          );
                                        },
                                      },
                                      {
                                        text: "Female",
                                        onPress: () => {
                                          setGuests((prev) =>
                                            prev.map((g) => (g.id === guest.id ? { ...g, sex: "female" } : g))
                                          );
                                        },
                                      },
                                    ],
                                    { cancelable: true }
                                  );
                                }}
                                style={styles.sexButton}
                              >
                                <Text style={styles.sexButtonText}>{guest.sex === "male" ? "M" : "F"}</Text>
                              </Pressable>
                              <Pressable
                                onPress={() => {
                                  Alert.alert("Delete Guest", `Remove ${guest.name}?`, [
                                    { text: "Cancel", style: "cancel" },
                                    {
                                      text: "Delete",
                                      style: "destructive",
                                      onPress: () => {
                                        setGuests((prev) => prev.filter((g) => g.id !== guest.id));
                                      },
                                    },
                                  ]);
                                }}
                                style={styles.deleteGuestButton}
                              >
                                <Text style={styles.deleteGuestButtonText}>×</Text>
                              </Pressable>
                            </View>
                          ) : (
                            <View>
                              <Text style={styles.playerSelectName}>
                                {guest.name} <Text style={styles.guestLabel}>(Guest)</Text>
                              </Text>
                              {guest.handicapIndex !== undefined ? (
                                <Text style={styles.playerSelectHandicap}>HI: {guest.handicapIndex}</Text>
                              ) : (
                                <Text style={styles.warningTextSmall}>HI required</Text>
                              )}
                            </View>
                          )}
                        </Pressable>
                      </View>
                    );
                  })}
                  
                  {/* Add Guest Button */}
                  {canManageTeeSheet && (
                    <Pressable
                      onPress={() => setShowAddGuestModal(true)}
                      style={styles.addGuestButton}
                    >
                      <Text style={styles.addGuestButtonText}>+ Add Guest</Text>
                    </Pressable>
                  )}
                  
                  {/* Save RSVP Button */}
                  {canManageTeeSheet && selectedPlayerIds.size > 0 && (
                    <Pressable
                      onPress={handleSaveRsvps}
                      style={styles.saveRsvpButton}
                    >
                      <Text style={styles.saveRsvpButtonText}>Save Attendees</Text>
                    </Pressable>
                  )}
                </View>
                
                <Text style={styles.sectionTitle}>Tee Sheet Settings</Text>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>Start Time</Text>
                      <TextInput
                        value={startTime}
                        onChangeText={setStartTime}
                        placeholder="HH:MM (e.g., 08:00)"
                        style={styles.input}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>Interval (minutes)</Text>
                      <View style={styles.intervalButtons}>
                        {[7, 8, 9, 10, 12].map((mins) => (
                          <Pressable
                            key={mins}
                            onPress={() => setIntervalMins(mins)}
                            style={[
                              styles.intervalButton,
                              intervalMins === mins && styles.intervalButtonActive,
                            ]}
                          >
                            <Text
                              style={[
                                styles.intervalButtonText,
                                intervalMins === mins && styles.intervalButtonTextActive,
                              ]}
                            >
                              {mins}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>

                    <Pressable onPress={handleGenerateTeeSheet} style={styles.generateButton}>
                      <Text style={styles.generateButtonText}>Generate Draft Tee Sheet</Text>
                    </Pressable>

                    {teeGroups.length > 0 && (
                      <View>
                        <View style={styles.sectionHeader}>
                          <Text style={styles.sectionTitle}>Tee Times</Text>
                          {canManageTeeSheet && (
                            <Pressable
                              onPress={() => setEditMode(!editMode)}
                              style={[styles.editModeButton, editMode && styles.editModeButtonActive]}
                            >
                              <Text style={[styles.editModeButtonText, editMode && styles.editModeButtonTextActive]}>
                                {editMode ? "Done Editing" : "Edit Groups"}
                              </Text>
                            </Pressable>
                          )}
                        </View>

                        {/* Unassigned Players */}
                        {editMode && unassignedPlayers.length > 0 && (
                          <View style={styles.unassignedCard}>
                            <Text style={styles.unassignedTitle}>Unassigned Players</Text>
                            {unassignedPlayers.map((playerId) => {
                              const member = members.find((m) => m.id === playerId);
                              const guest = guests.find((g) => g.id === playerId);
                              const playerName = member?.name || guest?.name || "Unknown";
                              return (
                                <View key={playerId} style={styles.unassignedPlayerRow}>
                                  <Text style={styles.unassignedPlayerName}>{playerName}</Text>
                                  <View style={styles.moveToGroupButtons}>
                                    {teeGroups.map((_, gIdx) => (
                                      <Pressable
                                        key={gIdx}
                                        onPress={() => handleMovePlayer(playerId, -1, gIdx)}
                                        style={[
                                          styles.moveToGroupButton,
                                          teeGroups[gIdx].players.length >= 4 && styles.moveToGroupButtonDisabled,
                                        ]}
                                        disabled={teeGroups[gIdx].players.length >= 4}
                                      >
                                        <Text style={styles.moveToGroupButtonText}>→G{gIdx + 1}</Text>
                                      </Pressable>
                                    ))}
                                  </View>
                                </View>
                              );
                            })}
                          </View>
                        )}

                        {teeGroups.map((group, groupIdx) => {
                          const timeStr = new Date(group.timeISO).toLocaleTimeString("en-US", {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          });
                          return (
                            <View key={groupIdx} style={styles.teeGroupCard}>
                              <View style={styles.teeGroupHeader}>
                                <Text style={styles.teeGroupTime}>
                                  {timeStr} - Group {groupIdx + 1}
                                </Text>
                                {editMode && canManageTeeSheet && group.players.length === 0 && (
                                  <Pressable
                                    onPress={() => handleDeleteGroup(groupIdx)}
                                    style={styles.deleteGroupButton}
                                  >
                                    <Text style={styles.deleteGroupButtonText}>×</Text>
                                  </Pressable>
                                )}
                              </View>
                              {group.players.map((playerId) => {
                                const member = members.find((m) => m.id === playerId);
                                const guest = guests.find((g) => g.id === playerId);
                                if (!member && !guest) return null;
                                
                                const player = member || {
                                  id: guest!.id,
                                  name: guest!.name,
                                  handicap: guest!.handicapIndex,
                                  sex: guest!.sex,
                                };
                                const ph = getPlayingHandicap(
                                  player,
                                  selectedEvent,
                                  selectedCourse,
                                  selectedMaleTeeSet,
                                  selectedFemaleTeeSet
                                );
                                return (
                                  <View key={playerId} style={styles.playerRow}>
                                    <View style={styles.playerInfo}>
                                      <Text style={styles.playerName} numberOfLines={1}>
                                        {player.name || "Unknown"}
                                        {guest && <Text style={styles.guestLabel}> (Guest)</Text>}
                                      </Text>
                                      <Text style={styles.playerHandicaps}>
                                        HI: {player.handicap ?? "-"} | PH: {ph ?? "-"}
                                      </Text>
                                    </View>
                                    {editMode && canManageTeeSheet && (
                                      <View style={styles.playerEditActions}>
                                        <Pressable
                                          onPress={() => {
                                            if (movePlayerData?.playerId === playerId) {
                                              setMovePlayerData(null);
                                            } else {
                                              setMovePlayerData({ playerId, fromGroup: groupIdx });
                                            }
                                          }}
                                          style={[
                                            styles.moveButton,
                                            movePlayerData?.playerId === playerId && styles.moveButtonActive,
                                          ]}
                                        >
                                          <Text style={styles.moveButtonText}>
                                            {movePlayerData?.playerId === playerId ? "Cancel" : "Move"}
                                          </Text>
                                        </Pressable>
                                        <Pressable
                                          onPress={() => handleRemovePlayerFromGroup(playerId, groupIdx)}
                                          style={styles.removeButton}
                                        >
                                          <Text style={styles.removeButtonText}>×</Text>
                                        </Pressable>
                                      </View>
                                    )}
                                  </View>
                                );
                              })}
                              
                              {/* Move target buttons when a player is selected */}
                              {editMode && movePlayerData && movePlayerData.fromGroup !== groupIdx && group.players.length < 4 && (
                                <Pressable
                                  onPress={() => handleMovePlayer(movePlayerData.playerId, movePlayerData.fromGroup, groupIdx)}
                                  style={styles.moveTargetButton}
                                >
                                  <Text style={styles.moveTargetButtonText}>Move Here</Text>
                                </Pressable>
                              )}
                              
                              {group.players.length < 4 && !editMode && (
                                <Text style={styles.emptySlot}>
                                  {4 - group.players.length} slot(s) available
                                </Text>
                              )}
                              {group.players.length >= 4 && editMode && (
                                <Text style={styles.fullSlot}>Group full (4/4)</Text>
                              )}
                            </View>
                          );
                        })}

                        {/* Add Group Button */}
                        {editMode && canManageTeeSheet && (
                          <Pressable onPress={handleAddGroup} style={styles.addGroupButton}>
                            <Text style={styles.addGroupButtonText}>+ Add Group</Text>
                          </Pressable>
                        )}

                        <Pressable onPress={handleSaveTeeSheet} style={styles.saveButton}>
                          <Text style={styles.saveButtonText}>Save Tee Sheet</Text>
                        </Pressable>

                        <Pressable onPress={handleGeneratePDF} style={styles.pdfButton}>
                          <Text style={styles.pdfButtonText}>
                            {Platform.OS === "web" ? "Print / Download PDF" : "Share PDF"}
                          </Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                )}
          </View>
        )}

        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.buttonText}>Back</Text>
        </Pressable>
      </View>

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
              <Pressable
                onPress={handleAddGuestSubmit}
                style={styles.modalSubmitButton}
              >
                <Text style={styles.modalSubmitButtonText}>Add Guest</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  section: {
    marginTop: 16,
    marginBottom: 16,
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
  tabs: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: "#0B6E4F",
  },
  tabText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6b7280",
  },
  tabTextActive: {
    color: "#0B6E4F",
  },
  tabContent: {
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 12,
    marginTop: 24,
    color: "#111827",
  },
  selectContainer: {
    gap: 8,
    marginBottom: 16,
  },
  selectButton: {
    backgroundColor: "#f3f4f6",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "transparent",
  },
  selectButtonActive: {
    backgroundColor: "#f0fdf4",
    borderColor: "#0B6E4F",
  },
  selectButtonText: {
    fontSize: 16,
    color: "#111827",
  },
  selectButtonTextActive: {
    color: "#0B6E4F",
    fontWeight: "600",
  },
  field: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 6,
    color: "#111827",
  },
  input: {
    backgroundColor: "#f9fafb",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  allowanceButtons: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
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
  intervalButtons: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  intervalButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
    borderWidth: 2,
    borderColor: "transparent",
  },
  intervalButtonActive: {
    backgroundColor: "#f0fdf4",
    borderColor: "#0B6E4F",
  },
  intervalButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6b7280",
  },
  intervalButtonTextActive: {
    color: "#0B6E4F",
  },
  generateButton: {
    backgroundColor: "#0B6E4F",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 24,
  },
  generateButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
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
  playerName: {
    fontSize: 14,
    color: "#111827",
  },
  emptySlot: {
    fontSize: 12,
    color: "#9ca3af",
    fontStyle: "italic",
    marginTop: 4,
  },
  saveButton: {
    backgroundColor: "#0B6E4F",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 16,
    marginBottom: 12,
  },
  saveButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    backgroundColor: "#f3f4f6",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 12,
  },
  secondaryButtonText: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "600",
  },
  pdfButton: {
    backgroundColor: "#059669",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 12,
  },
  pdfButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
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
  emptyText: {
    fontSize: 14,
    color: "#6b7280",
    fontStyle: "italic",
    marginTop: 8,
  },
  backButton: {
    backgroundColor: "#111827",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 24,
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  quickActions: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  quickActionButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
  },
  quickActionText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  countText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6b7280",
    marginBottom: 12,
  },
  playerSelectRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    marginBottom: 6,
  },
  playerSelectRowReadOnly: {
    opacity: 0.7,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#d1d5db",
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  checkmark: {
    width: 6,
    height: 10,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderColor: "#0B6E4F",
    transform: [{ rotate: "45deg" }],
  },
  playerSelectName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  playerSelectHandicap: {
    fontSize: 12,
    color: "#6b7280",
    marginLeft: 8,
  },
  guestLabel: {
    fontSize: 12,
    color: "#059669",
    fontStyle: "italic",
  },
  warningTextSmall: {
    fontSize: 12,
    color: "#ef4444",
    marginLeft: 8,
  },
  addGuestButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "#0B6E4F",
    alignItems: "center",
    marginTop: 8,
  },
  addGuestButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  helperText: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 4,
    fontStyle: "italic",
  },
  guestRow: {
    marginBottom: 6,
  },
  guestNameInput: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: "#fff",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    minWidth: 100,
  },
  guestHIInput: {
    fontSize: 12,
    color: "#6b7280",
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: "#fff",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    width: 50,
    textAlign: "center",
    marginLeft: 8,
  },
  sexButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: "#f3f4f6",
    marginLeft: 8,
  },
  sexButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#111827",
  },
  deleteGuestButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: "#ef4444",
    marginLeft: 8,
  },
  deleteGuestButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "white",
  },
  // Save RSVP Button
  saveRsvpButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "#059669",
    alignItems: "center",
    marginTop: 12,
  },
  saveRsvpButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  // Edit Mode
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 24,
    marginBottom: 12,
  },
  editModeButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
  editModeButtonActive: {
    backgroundColor: "#0B6E4F",
    borderColor: "#0B6E4F",
  },
  editModeButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
  },
  editModeButtonTextActive: {
    color: "white",
  },
  // Tee Group Header
  teeGroupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  deleteGroupButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#ef4444",
    justifyContent: "center",
    alignItems: "center",
  },
  deleteGroupButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
  },
  // Player Row Updates
  playerInfo: {
    flex: 1,
  },
  playerHandicaps: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 2,
  },
  playerEditActions: {
    flexDirection: "row",
    gap: 6,
    marginLeft: 8,
  },
  moveButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: "#3b82f6",
  },
  moveButtonActive: {
    backgroundColor: "#1d4ed8",
  },
  moveButtonText: {
    color: "white",
    fontSize: 11,
    fontWeight: "600",
  },
  removeButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: "#ef4444",
  },
  removeButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "700",
  },
  moveTargetButton: {
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: "#dbeafe",
    borderWidth: 2,
    borderColor: "#3b82f6",
    borderStyle: "dashed",
    alignItems: "center",
    marginTop: 8,
  },
  moveTargetButtonText: {
    color: "#3b82f6",
    fontSize: 13,
    fontWeight: "600",
  },
  fullSlot: {
    fontSize: 12,
    color: "#059669",
    fontWeight: "600",
    marginTop: 4,
  },
  // Unassigned Players
  unassignedCard: {
    backgroundColor: "#fef3c7",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#fcd34d",
  },
  unassignedTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#92400e",
    marginBottom: 8,
  },
  unassignedPlayerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#fcd34d",
  },
  unassignedPlayerName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
  },
  moveToGroupButtons: {
    flexDirection: "row",
    gap: 4,
  },
  moveToGroupButton: {
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 4,
    backgroundColor: "#0B6E4F",
  },
  moveToGroupButtonDisabled: {
    backgroundColor: "#9ca3af",
  },
  moveToGroupButtonText: {
    color: "white",
    fontSize: 10,
    fontWeight: "600",
  },
  // Add Group Button
  addGroupButton: {
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
    borderWidth: 2,
    borderColor: "#d1d5db",
    borderStyle: "dashed",
    alignItems: "center",
    marginBottom: 16,
  },
  addGroupButtonText: {
    color: "#6b7280",
    fontSize: 14,
    fontWeight: "600",
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 20,
    textAlign: "center",
  },
  modalField: {
    marginBottom: 16,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: "#f9fafb",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  sexToggle: {
    flexDirection: "row",
    gap: 12,
  },
  sexToggleButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  sexToggleButtonActive: {
    backgroundColor: "#f0fdf4",
    borderColor: "#0B6E4F",
  },
  sexToggleText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6b7280",
  },
  sexToggleTextActive: {
    color: "#0B6E4F",
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
  },
  modalCancelButtonText: {
    color: "#374151",
    fontSize: 16,
    fontWeight: "600",
  },
  modalSubmitButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#0B6E4F",
    alignItems: "center",
  },
  modalSubmitButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
});

