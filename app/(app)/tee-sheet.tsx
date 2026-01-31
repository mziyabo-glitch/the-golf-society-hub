/**
 * ManCo Tee Sheet Screen
 *
 * Allows ManCo to:
 * - Select an event
 * - Configure NTP/LD holes
 * - Set start time and interval
 * - Generate grouped tee sheet PDF
 */

import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View, Alert, Pressable, ScrollView } from "react-native";
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
import { getMembersBySocietyId, getManCoRoleHolders, type MemberDoc } from "@/lib/db_supabase/memberRepo";
import { getPermissionsForMember } from "@/lib/rbac";
import { generateTeeSheetPdf, type TeeSheetPlayer } from "@/lib/teeSheetPdf";
import { type TeeSettings } from "@/lib/handicapUtils";
import { parseHoleNumbers, formatHoleNumbers } from "@/lib/teeSheetGrouping";
import { getColors, spacing, radius } from "@/lib/ui/theme";

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

  const permissions = getPermissionsForMember(member as any);
  const canGenerateTeeSheet = permissions.canGenerateTeeSheet;

  // Get logo URL from society
  const logoUrl = (society as any)?.logo_url || (society as any)?.logoUrl || null;

  // Load events and members
  const loadData = useCallback(async () => {
    if (!societyId) return;

    setLoading(true);
    try {
      const [eventsData, membersData] = await Promise.all([
        getEventsBySocietyId(societyId),
        getMembersBySocietyId(societyId),
      ]);

      // Filter to upcoming or recent events (not completed)
      const upcomingEvents = eventsData.filter((e) => !e.isCompleted);
      setEvents(upcomingEvents);
      setMembers(membersData);

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

  // Load selected event details
  useEffect(() => {
    const loadEventDetails = async () => {
      if (!selectedEventId) {
        setSelectedEvent(null);
        return;
      }

      try {
        const event = await getEvent(selectedEventId);
        setSelectedEvent(event);

        // Populate form with existing values
        if (event) {
          setNtpHolesInput(formatHoleNumbers(event.nearestPinHoles));
          setLdHolesInput(formatHoleNumbers(event.longestDriveHoles));
        }
      } catch (err) {
        console.error("[TeeSheet] loadEventDetails error:", err);
      }
    };

    loadEventDetails();
  }, [selectedEventId]);

  // Refresh on focus
  useFocusEffect(
    useCallback(() => {
      if (societyId) {
        loadData();
      }
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

  // Generate tee sheet
  const handleGenerateTeeSheet = async () => {
    if (!selectedEvent || !societyId) return;

    setGenerating(true);
    try {
      // Get ManCo details
      const manCo = await getManCoRoleHolders(societyId);

      // Get players for this event
      const playerIds = selectedEvent.playerIds || [];
      const eventMembers = members.filter((m) => playerIds.includes(m.id));

      if (eventMembers.length === 0) {
        Alert.alert("No Players", "Please add players to the event first.");
        setGenerating(false);
        return;
      }

      // Build player list
      const players: TeeSheetPlayer[] = eventMembers.map((m) => ({
        id: m.id,
        name: m.name || m.displayName || "Member",
        handicapIndex: m.handicapIndex ?? m.handicap_index ?? null,
      }));

      // Build tee settings
      const teeSettings: TeeSettings | null =
        selectedEvent.par != null &&
        selectedEvent.courseRating != null &&
        selectedEvent.slopeRating != null
          ? {
              par: selectedEvent.par,
              courseRating: selectedEvent.courseRating,
              slopeRating: selectedEvent.slopeRating,
              handicapAllowance: selectedEvent.handicapAllowance ?? null,
            }
          : null;

      // Parse interval
      const interval = parseInt(teeInterval, 10) || 10;

      // Generate PDF
      await generateTeeSheetPdf({
        societyName: society?.name || "Golf Society",
        logoUrl,
        manCo,
        eventName: selectedEvent.name || "Event",
        eventDate: selectedEvent.date || null,
        courseName: selectedEvent.courseName || null,
        teeName: selectedEvent.teeName || null,
        format: selectedEvent.format || null,
        teeSettings,
        nearestPinHoles: selectedEvent.nearestPinHoles,
        longestDriveHoles: selectedEvent.longestDriveHoles,
        players,
        startTime: startTime || null,
        teeTimeInterval: interval,
      });

      console.log("[TeeSheet] PDF generated successfully");
    } catch (err: any) {
      console.error("[TeeSheet] generateTeeSheet error:", err);
      Alert.alert("Error", err?.message || "Failed to generate tee sheet.");
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

  const selectedPlayerCount = selectedEvent?.playerIds?.length || 0;
  const groupCount = Math.ceil(selectedPlayerCount / 4);

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
        Generate grouped tee sheets with WHS handicaps, NTP/LD holes.
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
                  {selectedPlayerCount} players → ~{groupCount} group{groupCount !== 1 ? "s" : ""} (max 4 per group)
                </AppText>
              </AppCard>

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
              {selectedEvent.par != null && selectedEvent.slopeRating != null && (
                <>
                  <AppText variant="h2" style={styles.sectionTitle}>Course Setup</AppText>
                  <AppCard>
                    <View style={styles.courseInfo}>
                      {selectedEvent.teeName && (
                        <View style={styles.courseInfoItem}>
                          <AppText variant="caption" color="secondary">Tee</AppText>
                          <AppText variant="bodyBold">{selectedEvent.teeName}</AppText>
                        </View>
                      )}
                      <View style={styles.courseInfoItem}>
                        <AppText variant="caption" color="secondary">Par</AppText>
                        <AppText variant="bodyBold">{selectedEvent.par}</AppText>
                      </View>
                      {selectedEvent.courseRating != null && (
                        <View style={styles.courseInfoItem}>
                          <AppText variant="caption" color="secondary">CR</AppText>
                          <AppText variant="bodyBold">{selectedEvent.courseRating}</AppText>
                        </View>
                      )}
                      <View style={styles.courseInfoItem}>
                        <AppText variant="caption" color="secondary">Slope</AppText>
                        <AppText variant="bodyBold">{selectedEvent.slopeRating}</AppText>
                      </View>
                      {selectedEvent.handicapAllowance != null && (
                        <View style={styles.courseInfoItem}>
                          <AppText variant="caption" color="secondary">Allow.</AppText>
                          <AppText variant="bodyBold">
                            {Math.round(selectedEvent.handicapAllowance * 100)}%
                          </AppText>
                        </View>
                      )}
                    </View>
                    <AppText variant="small" color="tertiary" style={{ marginTop: spacing.sm }}>
                      WHS handicaps will be calculated (HI, CH, PH)
                    </AppText>
                  </AppCard>
                </>
              )}

              {/* Generate Button */}
              <PrimaryButton
                onPress={handleGenerateTeeSheet}
                loading={generating}
                disabled={selectedPlayerCount === 0}
                style={{ marginTop: spacing.lg, marginBottom: spacing.xl }}
              >
                <Feather name="file-text" size={18} color={colors.textInverse} />
                {" Generate Tee Sheet PDF"}
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
  courseInfo: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  courseInfoItem: {
    alignItems: "center",
    minWidth: 50,
  },
});
