/**
 * ManCo Tee Sheet Screen
 *
 * Allows ManCo to:
 * - Select an event
 * - Configure NTP/LD holes
 * - Set start time and interval
 * - Edit player groups (move players between groups)
 * - Generate grouped tee sheet PDF with gender-based tee settings
 */

import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View, Alert, Pressable, ScrollView, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { useBootstrap } from "@/lib/useBootstrap";
import { getEventsBySocietyId, getEvent, updateEvent, type EventDoc } from "@/lib/db_supabase/eventRepo";
import { getMembersBySocietyId, getManCoRoleHolders, type MemberDoc, type Gender, type ManCoDetails } from "@/lib/db_supabase/memberRepo";
import { generateTeeSheetPdf, type TeeSheetPlayer } from "@/lib/teeSheetPdf";
import { getPermissionsForMember } from "@/lib/rbac";
import {
  type TeeBlock,
  calcCourseHandicap,
  calcPlayingHandicap,
  selectTeeByGender,
  formatHandicap,
  DEFAULT_ALLOWANCE,
} from "@/lib/whs";
import { parseHoleNumbers, formatHoleNumbers, calculateGroupSizes } from "@/lib/teeSheetGrouping";
import { getColors, spacing, radius } from "@/lib/ui/theme";

type EditablePlayer = {
  id: string;
  name: string;
  handicapIndex: number | null;
  playingHandicap: number | null;
  gender: Gender;
  groupIndex: number;
};

type PlayerGroup = {
  groupNumber: number;
  players: EditablePlayer[];
};

export default function TeeSheetScreen() {
  const router = useRouter();
  const { societyId, society, member, loading: bootstrapLoading } = useBootstrap();
  const colors = getColors();

  const [events, setEvents] = useState<EventDoc[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventDoc | null>(null);
  const [members, setMembers] = useState<MemberDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [ntpHolesInput, setNtpHolesInput] = useState("");
  const [ldHolesInput, setLdHolesInput] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [teeInterval, setTeeInterval] = useState("10");

  // Editable groups state
  const [groups, setGroups] = useState<PlayerGroup[]>([]);
  const [showGroupEditor, setShowGroupEditor] = useState(false);
  const [manCo, setManCo] = useState<ManCoDetails>({ captain: null, secretary: null, treasurer: null, handicapper: null });

  const permissions = getPermissionsForMember(member as any);
  const canGenerateTeeSheet = permissions.canGenerateTeeSheet;

  // Get logo URL from society
  const logoUrl = (society as any)?.logo_url || (society as any)?.logoUrl || null;

  // Load events and members
  const loadData = useCallback(async () => {
    if (!societyId) return;

    setLoading(true);
    try {
      const [eventsData, membersData, manCoData] = await Promise.all([
        getEventsBySocietyId(societyId),
        getMembersBySocietyId(societyId),
        getManCoRoleHolders(societyId),
      ]);

      // Filter to upcoming or recent events (not completed)
      const upcomingEvents = eventsData.filter((e) => !e.isCompleted);
      setEvents(upcomingEvents);
      setMembers(membersData);
      setManCo(manCoData);

      // Auto-select first event if none selected
      if (upcomingEvents.length > 0 && !selectedEventId) {
        setSelectedEventId(upcomingEvents[0].id);
      }
    } catch (err) {
      console.error("[TeeSheet] loadData error:", err);
    } finally {
      setLoading(false);
    }
  }, [societyId, selectedEventId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load selected event details and initialize groups
  useEffect(() => {
    const loadEventDetails = async () => {
      if (!selectedEventId) {
        setSelectedEvent(null);
        setGroups([]);
        return;
      }

      try {
        const event = await getEvent(selectedEventId);
        setSelectedEvent(event);

        // Populate form with existing values
        if (event) {
          setNtpHolesInput(formatHoleNumbers(event.nearestPinHoles));
          setLdHolesInput(formatHoleNumbers(event.longestDriveHoles));

          // Initialize groups from event players
          initializeGroups(event);
        }
      } catch (err) {
        console.error("[TeeSheet] loadEventDetails error:", err);
      }
    };

    loadEventDetails();
  }, [selectedEventId, members]);

  // Initialize groups from event players
  const initializeGroups = (event: EventDoc) => {
    const playerIds = event.playerIds || [];
    const eventMembers = members.filter((m) => playerIds.includes(m.id));

    if (eventMembers.length === 0) {
      setGroups([]);
      return;
    }

    // Build tee settings for handicap calculations
    const menTee: TeeBlock | null =
      event.par != null && event.courseRating != null && event.slopeRating != null
        ? { par: event.par, courseRating: event.courseRating, slopeRating: event.slopeRating }
        : null;
    const ladiesTee: TeeBlock | null =
      event.ladiesPar != null && event.ladiesCourseRating != null && event.ladiesSlopeRating != null
        ? { par: event.ladiesPar, courseRating: event.ladiesCourseRating, slopeRating: event.ladiesSlopeRating }
        : null;
    const allowance = event.handicapAllowance ?? DEFAULT_ALLOWANCE;

    // Sort by handicap (high to low, nulls last)
    const sorted = [...eventMembers].sort((a, b) => {
      const hiA = a.handicapIndex ?? a.handicap_index ?? null;
      const hiB = b.handicapIndex ?? b.handicap_index ?? null;
      if (hiA == null && hiB == null) return 0;
      if (hiA == null) return 1;
      if (hiB == null) return -1;
      return hiB - hiA;
    });

    // Calculate group sizes
    const groupSizes = calculateGroupSizes(sorted.length);

    // Create groups
    const newGroups: PlayerGroup[] = [];
    let playerIndex = 0;

    for (let i = 0; i < groupSizes.length; i++) {
      const groupPlayers: EditablePlayer[] = [];
      const size = groupSizes[i];

      for (let j = 0; j < size && playerIndex < sorted.length; j++) {
        const m = sorted[playerIndex];
        const gender = m.gender ?? null;
        const hi = m.handicapIndex ?? m.handicap_index ?? null;

        // Calculate playing handicap based on gender and tee settings
        const playerTee = selectTeeByGender(gender, menTee, ladiesTee);
        const courseHandicap = calcCourseHandicap(hi, playerTee);
        const playingHandicap = calcPlayingHandicap(courseHandicap, allowance);

        groupPlayers.push({
          id: m.id,
          name: m.name || m.displayName || "Member",
          handicapIndex: hi,
          playingHandicap,
          gender,
          groupIndex: i,
        });
        playerIndex++;
      }

      newGroups.push({
        groupNumber: i + 1,
        players: groupPlayers,
      });
    }

    setGroups(newGroups);
  };

  // Refresh on focus
  useFocusEffect(
    useCallback(() => {
      if (societyId) {
        loadData();
      }
      setGenerating(false);
    }, [societyId, loadData])
  );

  // Save NTP/LD settings to event
  const handleSaveSettings = async () => {
    if (!selectedEventId) return;

    const ntpHoles = parseHoleNumbers(ntpHolesInput === "-" ? "" : ntpHolesInput);
    const ldHoles = parseHoleNumbers(ldHolesInput === "-" ? "" : ldHolesInput);

    setSaving(true);
    try {
      await updateEvent(selectedEventId, {
        nearestPinHoles: ntpHoles,
        longestDriveHoles: ldHoles,
      });
      Alert.alert("Saved", "Competition holes updated successfully.");
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  // Move player to a different group
  const movePlayer = (playerId: string, fromGroup: number, toGroup: number) => {
    if (fromGroup === toGroup) return;

    setGroups((prev) => {
      const newGroups = prev.map((g) => ({
        ...g,
        players: [...g.players],
      }));

      // Find and remove player from source group
      const sourceGroup = newGroups[fromGroup];
      const playerIndex = sourceGroup.players.findIndex((p) => p.id === playerId);
      if (playerIndex === -1) return prev;

      const [player] = sourceGroup.players.splice(playerIndex, 1);

      // Add to target group
      const targetGroup = newGroups[toGroup];
      player.groupIndex = toGroup;
      targetGroup.players.push(player);

      return newGroups;
    });
  };

  // Add an empty group
  const addGroup = () => {
    setGroups((prev) => [
      ...prev,
      {
        groupNumber: prev.length + 1,
        players: [],
      },
    ]);
  };

  // Remove empty groups
  const cleanupGroups = () => {
    setGroups((prev) => {
      const nonEmpty = prev.filter((g) => g.players.length > 0);
      return nonEmpty.map((g, i) => ({
        ...g,
        groupNumber: i + 1,
        players: g.players.map((p) => ({ ...p, groupIndex: i })),
      }));
    });
  };

  // Share/export tee sheet as PDF
  const handleGenerateTeeSheet = async () => {
    if (!selectedEvent || !societyId) return;

    // Clean up empty groups first
    const cleanedGroups = groups.filter((g) => g.players.length > 0);
    if (cleanedGroups.length === 0) {
      Alert.alert("No Players", "Please add players to the event first.");
      return;
    }

    setGenerating(true);
    try {
      const interval = parseInt(teeInterval, 10) || 10;
      const ntpHoles = parseHoleNumbers(ntpHolesInput === "-" ? "" : ntpHolesInput);
      const ldHoles = parseHoleNumbers(ldHolesInput === "-" ? "" : ldHolesInput);

      // Build tee block settings from the event
      const menTee: TeeBlock | null =
        selectedEvent.par != null && selectedEvent.courseRating != null && selectedEvent.slopeRating != null
          ? { par: selectedEvent.par, courseRating: selectedEvent.courseRating, slopeRating: selectedEvent.slopeRating }
          : null;
      const ladiesTee: TeeBlock | null =
        selectedEvent.ladiesPar != null && selectedEvent.ladiesCourseRating != null && selectedEvent.ladiesSlopeRating != null
          ? { par: selectedEvent.ladiesPar, courseRating: selectedEvent.ladiesCourseRating, slopeRating: selectedEvent.ladiesSlopeRating }
          : null;

      // Flatten all players from groups with their gender for the PDF generator
      const allPlayers: TeeSheetPlayer[] = [];
      let groupNum = 1;
      for (const group of cleanedGroups) {
        for (const p of group.players) {
          allPlayers.push({
            id: p.id,
            name: p.name,
            handicapIndex: p.handicapIndex ?? null,
            gender: p.gender ?? null,
            group: groupNum,
          });
        }
        groupNum++;
      }

      await generateTeeSheetPdf({
        societyName: society?.name || "Golf Society",
        logoUrl,
        manCo,
        eventName: selectedEvent.name || "Event",
        eventDate: selectedEvent.date || null,
        courseName: selectedEvent.courseName || null,
        teeName: selectedEvent.teeName || null,
        ladiesTeeName: selectedEvent.ladiesTeeName || null,
        format: selectedEvent.format || null,
        teeSettings: menTee,
        ladiesTeeSettings: ladiesTee,
        handicapAllowance: selectedEvent.handicapAllowance ?? null,
        nearestPinHoles: ntpHoles.length > 0 ? ntpHoles : null,
        longestDriveHoles: ldHoles.length > 0 ? ldHoles : null,
        players: allPlayers,
        startTime: startTime || null,
        teeTimeInterval: interval,
        preGrouped: true,
      });
    } catch (err: any) {
      console.error("[TeeSheet] share tee sheet error:", err);
      Alert.alert("Error", err?.message || "Failed to share tee sheet.");
    } finally {
      setGenerating(false);
    }
  };

  if (bootstrapLoading || loading) {
    return (
      <Screen>
        <LoadingState message="Loading..." />
      </Screen>
    );
  }

  if (!canGenerateTeeSheet) {
    return (
      <Screen>
        <View style={styles.header}>
          <SecondaryButton onPress={() => router.back()} size="sm">
            <Feather name="arrow-left" size={16} color={colors.text} /> Back
          </SecondaryButton>
        </View>
        <EmptyState
          icon={<Feather name="lock" size={32} color={colors.textTertiary} />}
          title="Access Restricted"
          message="Only ManCo members (Captain, Secretary, Treasurer, Handicapper) can generate tee sheets."
        />
      </Screen>
    );
  }

  const selectedPlayerCount = groups.reduce((sum, g) => sum + g.players.length, 0);
  const groupCount = groups.filter((g) => g.players.length > 0).length;
  const womenCount = groups.reduce((sum, g) => sum + g.players.filter((p) => p.gender === "female").length, 0);

  // Check if we have tee settings configured
  const hasMenTees = selectedEvent?.par != null && selectedEvent?.slopeRating != null;
  const hasLadiesTees = selectedEvent?.ladiesPar != null && selectedEvent?.ladiesSlopeRating != null;

  return (
    <Screen>
      {/* Header */}
      <View style={styles.header}>
        <SecondaryButton onPress={() => router.back()} size="sm">
          <Feather name="arrow-left" size={16} color={colors.text} /> Back
        </SecondaryButton>
        <View style={{ flex: 1 }} />
      </View>

      <AppText variant="title" style={styles.title}>
        <Feather name="file-text" size={24} color={colors.primary} /> Tee Sheet
      </AppText>
      <AppText variant="body" color="secondary" style={{ marginBottom: spacing.lg }}>
        Generate grouped tee sheets with WHS handicaps for Men and Ladies.
      </AppText>

      {events.length === 0 ? (
        <EmptyState
          icon={<Feather name="calendar" size={32} color={colors.textTertiary} />}
          title="No Upcoming Events"
          message="Create an event first to generate a tee sheet."
          action={{ label: "Go to Events", onPress: () => router.push("/(app)/(tabs)/events") }}
        />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Event Selection */}
          <AppText variant="h2" style={styles.sectionTitle}>Select Event</AppText>
          <View style={styles.eventList}>
            {events.map((event) => {
              const isSelected = event.id === selectedEventId;
              const playerCount = event.playerIds?.length || 0;

              return (
                <Pressable
                  key={event.id}
                  onPress={() => setSelectedEventId(event.id)}
                >
                  <AppCard
                    style={[
                      styles.eventCard,
                      isSelected && { borderWidth: 2, borderColor: colors.primary },
                    ]}
                  >
                    <View style={styles.eventRow}>
                      <View style={styles.eventInfo}>
                        <AppText variant="bodyBold" numberOfLines={1}>
                          {event.name}
                        </AppText>
                        <AppText variant="caption" color="secondary">
                          {event.date
                            ? new Date(event.date).toLocaleDateString("en-GB", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })
                            : "Date TBC"}
                          {event.courseName ? ` • ${event.courseName}` : ""}
                        </AppText>
                        <AppText variant="small" color="tertiary">
                          {playerCount} player{playerCount !== 1 ? "s" : ""}
                        </AppText>
                      </View>
                      <Feather
                        name={isSelected ? "check-circle" : "circle"}
                        size={22}
                        color={isSelected ? colors.primary : colors.textTertiary}
                      />
                    </View>
                  </AppCard>
                </Pressable>
              );
            })}
          </View>

          {selectedEvent && (
            <>
              {/* Tee Time Settings */}
              <AppText variant="h2" style={styles.sectionTitle}>Tee Times</AppText>
              <AppCard>
                <View style={styles.formRow}>
                  <View style={{ flex: 1 }}>
                    <AppText variant="caption" style={styles.label}>Start Time</AppText>
                    <AppInput
                      placeholder="08:00"
                      value={startTime}
                      onChangeText={setStartTime}
                      keyboardType="numbers-and-punctuation"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="caption" style={styles.label}>Interval (min)</AppText>
                    <AppInput
                      placeholder="10"
                      value={teeInterval}
                      onChangeText={setTeeInterval}
                      keyboardType="number-pad"
                    />
                  </View>
                </View>
                <AppText variant="small" color="tertiary" style={{ marginTop: spacing.xs }}>
                  {selectedPlayerCount} players → {groupCount} group{groupCount !== 1 ? "s" : ""}
                </AppText>
              </AppCard>

              {/* Group Editor Toggle */}
              <View style={styles.sectionHeader}>
                <AppText variant="h2">Player Groups</AppText>
                <SecondaryButton
                  size="sm"
                  onPress={() => setShowGroupEditor(!showGroupEditor)}
                >
                  <Feather name={showGroupEditor ? "eye-off" : "edit-2"} size={14} color={colors.text} />
                  {showGroupEditor ? " Hide Editor" : " Edit Groups"}
                </SecondaryButton>
              </View>

              {showGroupEditor ? (
                /* Editable Group View */
                <View style={styles.groupEditor}>
                  {groups.map((group, groupIdx) => (
                    <AppCard key={groupIdx} style={styles.groupCard}>
                      <View style={styles.groupHeader}>
                        <AppText variant="bodyBold" color="primary">
                          Group {group.groupNumber}
                        </AppText>
                        <AppText variant="small" color="tertiary">
                          {group.players.length} player{group.players.length !== 1 ? "s" : ""}
                        </AppText>
                      </View>

                      {group.players.length === 0 ? (
                        <AppText variant="small" color="tertiary" style={{ fontStyle: "italic", paddingVertical: spacing.sm }}>
                          Empty group
                        </AppText>
                      ) : (
                        group.players.map((player) => (
                          <View key={player.id} style={styles.playerRow}>
                            <View style={styles.playerInfo}>
                              <AppText variant="body" numberOfLines={1}>
                                {player.name}
                              </AppText>
                              <AppText variant="caption" color="secondary">
                                HI: {player.handicapIndex != null ? player.handicapIndex.toFixed(1) : "-"}
                              </AppText>
                            </View>

                            {/* Move buttons */}
                            <View style={styles.moveButtons}>
                              {groupIdx > 0 && (
                                <Pressable
                                  style={({ pressed }) => [styles.moveBtn, pressed && { opacity: 0.6 }]}
                                  onPress={() => movePlayer(player.id, groupIdx, groupIdx - 1)}
                                >
                                  <Feather name="arrow-up" size={16} color={colors.primary} />
                                </Pressable>
                              )}
                              {groupIdx < groups.length - 1 && (
                                <Pressable
                                  style={({ pressed }) => [styles.moveBtn, pressed && { opacity: 0.6 }]}
                                  onPress={() => movePlayer(player.id, groupIdx, groupIdx + 1)}
                                >
                                  <Feather name="arrow-down" size={16} color={colors.primary} />
                                </Pressable>
                              )}
                            </View>
                          </View>
                        ))
                      )}
                    </AppCard>
                  ))}

                  <View style={styles.groupActions}>
                    <SecondaryButton size="sm" onPress={addGroup}>
                      <Feather name="plus" size={14} color={colors.text} /> Add Group
                    </SecondaryButton>
                    <SecondaryButton size="sm" onPress={cleanupGroups}>
                      <Feather name="trash-2" size={14} color={colors.text} /> Remove Empty
                    </SecondaryButton>
                    <SecondaryButton size="sm" onPress={() => selectedEvent && initializeGroups(selectedEvent)}>
                      <Feather name="refresh-cw" size={14} color={colors.text} /> Reset
                    </SecondaryButton>
                  </View>
                </View>
              ) : (
                /* Compact Group Summary - Table format */
                <View style={styles.groupsContainer}>
                  {groups.filter((g) => g.players.length > 0).map((group, idx) => (
                    <AppCard key={idx} style={styles.groupTableCard}>
                      <AppText variant="bodyBold" color="primary" style={styles.groupTitle}>
                        Group {group.groupNumber}
                      </AppText>
                      {/* Table Header */}
                      <View style={styles.tableHeader}>
                        <AppText variant="caption" color="secondary" style={styles.nameCol}>Name</AppText>
                        <AppText variant="caption" color="secondary" style={styles.hiCol}>HI</AppText>
                        <AppText variant="caption" color="secondary" style={styles.phCol}>PH</AppText>
                      </View>
                      {/* Table Rows */}
                      {group.players.map((player) => (
                        <View key={player.id} style={styles.tableRow}>
                          <AppText variant="body" numberOfLines={1} style={styles.nameCol}>
                            {player.name}
                          </AppText>
                          <AppText variant="body" color="secondary" style={styles.hiCol}>
                            {formatHandicap(player.handicapIndex, 1)}
                          </AppText>
                          <AppText variant="bodyBold" color="primary" style={styles.phCol}>
                            {formatHandicap(player.playingHandicap)}
                          </AppText>
                        </View>
                      ))}
                    </AppCard>
                  ))}
                </View>
              )}

              {/* Competition Holes */}
              <AppText variant="h2" style={styles.sectionTitle}>Competition Holes</AppText>
              <AppCard>
                <View style={styles.formField}>
                  <AppText variant="caption" style={styles.label}>
                    <Feather name="flag" size={12} color={colors.info} /> Nearest the Pin (holes 1-18)
                  </AppText>
                  <AppInput
                    placeholder="e.g. 3, 7, 14"
                    value={ntpHolesInput === "-" ? "" : ntpHolesInput}
                    onChangeText={setNtpHolesInput}
                    keyboardType="numbers-and-punctuation"
                  />
                  <AppText variant="small" color="tertiary">Comma-separated hole numbers</AppText>
                </View>

                <View style={styles.formField}>
                  <AppText variant="caption" style={styles.label}>
                    <Feather name="arrow-right" size={12} color={colors.warning} /> Longest Drive (holes 1-18)
                  </AppText>
                  <AppInput
                    placeholder="e.g. 10, 18"
                    value={ldHolesInput === "-" ? "" : ldHolesInput}
                    onChangeText={setLdHolesInput}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>

                <SecondaryButton
                  onPress={handleSaveSettings}
                  loading={saving}
                  size="sm"
                  style={{ marginTop: spacing.xs }}
                >
                  <Feather name="save" size={14} color={colors.text} /> Save to Event
                </SecondaryButton>
              </AppCard>

              {/* Course Setup Info */}
              {(hasMenTees || hasLadiesTees) && (
                <>
                  <AppText variant="h2" style={styles.sectionTitle}>Course Setup</AppText>
                  <AppCard>
                    {hasMenTees && (
                      <View style={styles.teeRow}>
                        <View style={[styles.teeColorDot, { backgroundColor: "#FFD700" }]} />
                        <AppText variant="bodyBold" style={{ minWidth: 60 }}>
                          {selectedEvent.teeName || "Men's"}
                        </AppText>
                        <AppText variant="small" color="secondary">
                          Par {selectedEvent.par} • CR {selectedEvent.courseRating} • Slope {selectedEvent.slopeRating}
                        </AppText>
                      </View>
                    )}
                    {hasLadiesTees && (
                      <View style={[styles.teeRow, { marginTop: spacing.xs }]}>
                        <View style={[styles.teeColorDot, { backgroundColor: "#E53935" }]} />
                        <AppText variant="bodyBold" style={{ minWidth: 60 }}>
                          {selectedEvent.ladiesTeeName || "Ladies'"}
                        </AppText>
                        <AppText variant="small" color="secondary">
                          Par {selectedEvent.ladiesPar} • CR {selectedEvent.ladiesCourseRating} • Slope {selectedEvent.ladiesSlopeRating}
                        </AppText>
                      </View>
                    )}
                    {selectedEvent.handicapAllowance != null && (
                      <AppText variant="small" color="tertiary" style={{ marginTop: spacing.sm }}>
                        Handicap Allowance: {Math.round(selectedEvent.handicapAllowance * 100)}%
                      </AppText>
                    )}
                    <AppText variant="small" color="tertiary" style={{ marginTop: spacing.xs }}>
                      WHS handicaps (HI, CH, PH) calculated per player's gender
                    </AppText>
                  </AppCard>
                </>
              )}

              {/* Warning if women but no ladies tees */}
              {womenCount > 0 && !hasLadiesTees && (
                <View style={[styles.warningBox, { backgroundColor: colors.warning + "20" }]}>
                  <Feather name="alert-triangle" size={16} color={colors.warning} />
                  <AppText variant="small" style={{ flex: 1, marginLeft: spacing.xs, color: colors.warning }}>
                    {womenCount} female player{womenCount !== 1 ? "s" : ""} but no Ladies' tee configured. They will use Men's tee settings.
                  </AppText>
                </View>
              )}

              {/* Generate Button */}
              <PrimaryButton
                onPress={handleGenerateTeeSheet}
                loading={generating}
                disabled={selectedPlayerCount === 0}
                style={{ marginTop: spacing.lg, marginBottom: spacing.xl }}
              >
                <Feather name="share-2" size={18} color={colors.textInverse} />
                {" Share Tee Sheet"}
              </PrimaryButton>

              {selectedPlayerCount === 0 && (
                <AppText variant="caption" color="error" style={{ textAlign: "center", marginBottom: spacing.lg }}>
                  Add players to the event before generating the tee sheet.
                </AppText>
              )}
            </>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  title: {
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    marginTop: spacing.base,
    marginBottom: spacing.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.base,
    marginBottom: spacing.sm,
  },
  eventList: {
    gap: spacing.xs,
  },
  eventCard: {
    marginBottom: 0,
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  eventInfo: {
    flex: 1,
  },
  formRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  formField: {
    marginBottom: spacing.base,
  },
  label: {
    marginBottom: spacing.xs,
  },
  groupEditor: {
    gap: spacing.sm,
  },
  groupCard: {
    marginBottom: 0,
  },
  groupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  playerInfo: {
    flex: 1,
  },
  moveButtons: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  moveBtn: {
    padding: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: "#F3F4F6",
  },
  groupActions: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
    marginTop: spacing.xs,
  },
  groupsContainer: {
    gap: spacing.sm,
  },
  groupTableCard: {
    marginBottom: 0,
  },
  groupTitle: {
    marginBottom: spacing.xs,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  nameCol: {
    flex: 1,
  },
  hiCol: {
    width: 50,
    textAlign: "right",
  },
  phCol: {
    width: 50,
    textAlign: "right",
  },
  teeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  teeColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  warningBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.sm,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
});
