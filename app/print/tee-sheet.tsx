/**
 * Printable Tee Sheet Route
 * 
 * This route renders a print-friendly tee sheet for web.
 * It auto-triggers window.print() after loading.
 * 
 * Usage: /print/tee-sheet?eventId=xxx
 */

import { STORAGE_KEYS } from "@/lib/storage";
import type { Course, TeeSet, EventData, MemberData } from "@/lib/models";
import { getPlayingHandicap } from "@/lib/handicap";
import { formatDateDDMMYYYY } from "@/utils/date";
import { getArray } from "@/lib/storage-helpers";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, router } from "expo-router";
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Platform, ImageStyle } from "react-native";
import { Image } from "expo-image";

type GuestData = {
  id: string;
  name: string;
  sex: "male" | "female";
  handicapIndex?: number;
  included: boolean;
};

type SocietyData = {
  name: string;
  logoUrl?: string | null;
};

export default function PrintTeeSheetScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [event, setEvent] = useState<EventData | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [maleTeeSet, setMaleTeeSet] = useState<TeeSet | null>(null);
  const [femaleTeeSet, setFemaleTeeSet] = useState<TeeSet | null>(null);
  const [members, setMembers] = useState<MemberData[]>([]);
  const [guests, setGuests] = useState<GuestData[]>([]);
  const [society, setSociety] = useState<SocietyData | null>(null);
  const [printTriggered, setPrintTriggered] = useState(false);

  useEffect(() => {
    loadData();
  }, [eventId]);

  // Auto-trigger print after data loads (web only)
  useEffect(() => {
    if (!loading && !error && event && Platform.OS === "web" && !printTriggered) {
      setPrintTriggered(true);
      // Use requestAnimationFrame + setTimeout for reliable rendering
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (typeof window !== "undefined" && window.print) {
            window.print();
          }
        }, 300);
      });
    }
  }, [loading, error, event, printTriggered]);

  const loadData = async () => {
    try {
      if (!eventId) {
        setError("No event ID provided");
        setLoading(false);
        return;
      }

      // Load society
      const societyData = await AsyncStorage.getItem(STORAGE_KEYS.SOCIETY_ACTIVE);
      if (societyData) {
        try {
          setSociety(JSON.parse(societyData));
        } catch (e) {
          console.error("Error parsing society:", e);
        }
      }

      // Load events
      const events = await getArray<EventData>(STORAGE_KEYS.EVENTS, []);
      const foundEvent = events.find((e) => e.id === eventId);
      
      if (!foundEvent) {
        setError("Event not found");
        setLoading(false);
        return;
      }
      
      if (!foundEvent.teeSheet || !foundEvent.teeSheet.groups || foundEvent.teeSheet.groups.length === 0) {
        setError("No tee sheet found for this event");
        setLoading(false);
        return;
      }

      setEvent(foundEvent);
      setGuests(foundEvent.guests || []);

      // Load courses
      const courses = await getArray<Course>(STORAGE_KEYS.COURSES, []);
      if (foundEvent.courseId) {
        const foundCourse = courses.find((c) => c.id === foundEvent.courseId);
        if (foundCourse) {
          setCourse(foundCourse);
          if (foundEvent.maleTeeSetId) {
            setMaleTeeSet(foundCourse.teeSets.find((t) => t.id === foundEvent.maleTeeSetId) || null);
          }
          if (foundEvent.femaleTeeSetId) {
            setFemaleTeeSet(foundCourse.teeSets.find((t) => t.id === foundEvent.femaleTeeSetId) || null);
          }
        }
      }

      // Load members
      const loadedMembers = await getArray<MemberData>(STORAGE_KEYS.MEMBERS, []);
      setMembers(loadedMembers);
      
    } catch (err) {
      console.error("Error loading tee sheet data:", err);
      setError("Failed to load tee sheet data");
    } finally {
      setLoading(false);
    }
  };

  // Get ManCo members
  const getManCo = () => {
    const captain = members.find((m) => 
      m.roles?.some((r) => r.toLowerCase() === "captain" || r.toLowerCase() === "admin")
    );
    const secretary = members.find((m) => 
      m.roles?.some((r) => r.toLowerCase() === "secretary")
    );
    const treasurer = members.find((m) => 
      m.roles?.some((r) => r.toLowerCase() === "treasurer")
    );
    const handicapper = members.find((m) => 
      m.roles?.some((r) => r.toLowerCase() === "handicapper")
    );
    return { captain, secretary, treasurer, handicapper };
  };

  const handleBack = () => {
    router.back();
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.loadingText}>Loading tee sheet...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={handleBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!event || !event.teeSheet) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>No tee sheet found</Text>
          <Pressable onPress={handleBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const manCo = getManCo();
  const teeGroups = event.teeSheet.groups || [];
  const handicapAllowancePct = event.handicapAllowancePct ?? (event.handicapAllowance === 1.0 ? 100 : 90);
  const nearestToPinHoles = event.nearestToPinHoles || [];
  const longestDriveHoles = event.longestDriveHoles || [];
  const teeSheetNotes = event.teeSheetNotes || "";

  return (
    <View style={styles.container}>
      {/* Print CSS - only rendered on web */}
      {Platform.OS === "web" && (
        <style
          dangerouslySetInnerHTML={{
            __html: `
              @media print {
                body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                .no-print { display: none !important; }
                .print-container { padding: 0 !important; margin: 0 !important; }
                .tee-group { break-inside: avoid; page-break-inside: avoid; }
              }
              @page {
                size: A4;
                margin: 15mm;
              }
            `,
          }}
        />
      )}

      {/* Back button - hidden in print */}
      <View style={[styles.noPrint, styles.topBar]}>
        <Pressable onPress={handleBack} style={styles.backLink}>
          <Text style={styles.backLinkText}>← Back to Tee Sheet</Text>
        </Pressable>
        <Pressable 
          onPress={() => {
            if (Platform.OS === "web" && typeof window !== "undefined") {
              window.print();
            }
          }} 
          style={styles.printAgainButton}
        >
          <Text style={styles.printAgainText}>Print Again</Text>
        </Pressable>
      </View>

      {/* Printable Content */}
      <View style={styles.printContainer}>
        {/* Header */}
        <View style={styles.header}>
          {society?.logoUrl && (
            <View style={styles.logoContainer}>
              <Image
                source={{ uri: society.logoUrl }}
                style={styles.logo as ImageStyle}
                contentFit="contain"
              />
            </View>
          )}
          <View style={styles.headerCenter}>
            <Text style={styles.eventTitle}>{event.name || "Tee Sheet"}</Text>
            <Text style={styles.eventDetails}>
              {event.date ? formatDateDDMMYYYY(event.date) : "Date TBD"} — {course?.name || event.courseName || "Course TBD"}
            </Text>
            
            {/* ManCo Details */}
            <View style={styles.manCoRow}>
              {manCo.captain && <Text style={styles.manCoText}>Captain: {manCo.captain.name}</Text>}
              {manCo.secretary && <Text style={styles.manCoText}>Secretary: {manCo.secretary.name}</Text>}
              {manCo.treasurer && <Text style={styles.manCoText}>Treasurer: {manCo.treasurer.name}</Text>}
              {manCo.handicapper && <Text style={styles.manCoText}>Handicapper: {manCo.handicapper.name}</Text>}
            </View>
            
            <Text style={styles.brandingText}>Produced by The Golf Society Hub</Text>
          </View>

          {/* Tee Info Box */}
          <View style={styles.teeInfoBox}>
            <Text style={styles.teeInfoTitle}>Tee Information</Text>
            {maleTeeSet && (
              <Text style={styles.teeInfoText}>
                Male: {maleTeeSet.teeColor}{"\n"}
                Par {maleTeeSet.par} | CR {maleTeeSet.courseRating} | SR {maleTeeSet.slopeRating}
              </Text>
            )}
            {femaleTeeSet && (
              <Text style={styles.teeInfoText}>
                Female: {femaleTeeSet.teeColor}{"\n"}
                Par {femaleTeeSet.par} | CR {femaleTeeSet.courseRating} | SR {femaleTeeSet.slopeRating}
              </Text>
            )}
            <Text style={styles.teeInfoText}>Allowance: {handicapAllowancePct}%</Text>
          </View>
        </View>

        {/* Notes Section */}
        {teeSheetNotes.trim() && (
          <View style={styles.notesBox}>
            <Text style={styles.notesLabel}>Notes:</Text>
            <Text style={styles.notesText}>{teeSheetNotes}</Text>
          </View>
        )}

        {/* Competitions Section */}
        {(nearestToPinHoles.length > 0 || longestDriveHoles.length > 0) && (
          <View style={styles.competitionsBox}>
            {nearestToPinHoles.length > 0 && (
              <Text style={styles.competitionText}>
                <Text style={styles.competitionLabel}>Nearest to Pin: </Text>
                Hole {nearestToPinHoles.join(", Hole ")}
              </Text>
            )}
            {longestDriveHoles.length > 0 && (
              <Text style={styles.competitionText}>
                <Text style={styles.competitionLabel}>Longest Drive: </Text>
                Hole {longestDriveHoles.join(", Hole ")}
              </Text>
            )}
          </View>
        )}

        {/* Table Header */}
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderCell, styles.timeCol]}>Time</Text>
          <Text style={[styles.tableHeaderCell, styles.groupCol]}>Group</Text>
          <Text style={[styles.tableHeaderCell, styles.nameCol]}>Player Name</Text>
          <Text style={[styles.tableHeaderCell, styles.hiCol]}>HI</Text>
          <Text style={[styles.tableHeaderCell, styles.phCol]}>PH</Text>
        </View>

        {/* Table Body - Tee Groups */}
        {teeGroups.map((group, groupIdx) => {
          const timeStr = new Date(group.timeISO).toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });

          if (group.players.length === 0) {
            return (
              <View key={groupIdx} style={[styles.tableRow, styles.teeGroup]}>
                <Text style={[styles.tableCell, styles.timeCol]}>{timeStr}</Text>
                <Text style={[styles.tableCell, styles.groupCol]}>{groupIdx + 1}</Text>
                <Text style={[styles.tableCell, styles.nameCol, styles.emptyText]}>Empty group</Text>
                <Text style={[styles.tableCell, styles.hiCol]}>-</Text>
                <Text style={[styles.tableCell, styles.phCol]}>-</Text>
              </View>
            );
          }

          return (
            <View key={groupIdx} style={styles.teeGroup}>
              {group.players.map((playerId, playerIdx) => {
                const member = members.find((m) => m.id === playerId);
                const guest = guests.find((g) => g.id === playerId);
                
                if (!member && !guest) {
                  return null;
                }

                const player = member || {
                  id: guest!.id,
                  name: guest!.name,
                  handicap: guest!.handicapIndex,
                  sex: guest!.sex,
                };

                const ph = getPlayingHandicap(
                  player,
                  event,
                  course,
                  maleTeeSet,
                  femaleTeeSet
                );

                const displayName = guest 
                  ? `${player.name || "Guest"} (Guest)` 
                  : (player.name || "Unknown");

                return (
                  <View 
                    key={playerId} 
                    style={[
                      styles.tableRow,
                      playerIdx === group.players.length - 1 && styles.lastInGroup,
                    ]}
                  >
                    {playerIdx === 0 ? (
                      <>
                        <Text style={[styles.tableCell, styles.timeCol]}>{timeStr}</Text>
                        <Text style={[styles.tableCell, styles.groupCol]}>{groupIdx + 1}</Text>
                      </>
                    ) : (
                      <>
                        <Text style={[styles.tableCell, styles.timeCol, styles.hiddenCell]} />
                        <Text style={[styles.tableCell, styles.groupCol, styles.hiddenCell]} />
                      </>
                    )}
                    <Text style={[styles.tableCell, styles.nameCol]}>{displayName}</Text>
                    <Text style={[styles.tableCell, styles.hiCol]}>{player.handicap ?? "-"}</Text>
                    <Text style={[styles.tableCell, styles.phCol]}>{ph ?? "-"}</Text>
                  </View>
                );
              })}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  loadingText: {
    fontSize: 16,
    color: "#6b7280",
  },
  errorText: {
    fontSize: 16,
    color: "#dc2626",
    marginBottom: 16,
    textAlign: "center",
  },
  backButton: {
    backgroundColor: "#0B6E4F",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  backButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  noPrint: {},
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
  },
  backLink: {
    padding: 8,
  },
  backLinkText: {
    fontSize: 14,
    color: "#0B6E4F",
    fontWeight: "600",
  },
  printAgainButton: {
    backgroundColor: "#0B6E4F",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  printAgainText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  printContainer: {
    padding: 20,
    maxWidth: 800,
    marginHorizontal: "auto",
  },
  header: {
    flexDirection: "row",
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: "#0B6E4F",
  },
  logoContainer: {
    width: 80,
    marginRight: 16,
  },
  logo: {
    width: 70,
    height: 70,
  },
  headerCenter: {
    flex: 1,
  },
  eventTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0B6E4F",
    marginBottom: 4,
  },
  eventDetails: {
    fontSize: 14,
    color: "#333",
    marginBottom: 8,
  },
  manCoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 6,
  },
  manCoText: {
    fontSize: 10,
    color: "#555",
  },
  brandingText: {
    fontSize: 9,
    color: "#888",
  },
  teeInfoBox: {
    width: 180,
    borderWidth: 1,
    borderColor: "#0B6E4F",
    borderRadius: 6,
    padding: 10,
    backgroundColor: "#f9fafb",
  },
  teeInfoTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0B6E4F",
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#0B6E4F",
    paddingBottom: 4,
  },
  teeInfoText: {
    fontSize: 10,
    color: "#333",
    marginBottom: 4,
  },
  notesBox: {
    backgroundColor: "#f0fdf4",
    borderLeftWidth: 4,
    borderLeftColor: "#0B6E4F",
    padding: 12,
    marginBottom: 12,
    borderRadius: 4,
  },
  notesLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0B6E4F",
    marginBottom: 4,
  },
  notesText: {
    fontSize: 11,
    color: "#333",
  },
  competitionsBox: {
    backgroundColor: "#fef3c7",
    borderWidth: 1,
    borderColor: "#fcd34d",
    padding: 10,
    marginBottom: 12,
    borderRadius: 6,
  },
  competitionText: {
    fontSize: 11,
    color: "#333",
    marginVertical: 2,
  },
  competitionLabel: {
    fontWeight: "700",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#0B6E4F",
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  tableHeaderCell: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
    paddingVertical: 8,
    paddingHorizontal: 6,
    textAlign: "center",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderLeftColor: "#333",
    borderRightColor: "#333",
    backgroundColor: "#fff",
  },
  lastInGroup: {
    borderBottomWidth: 2,
    borderBottomColor: "#333",
  },
  teeGroup: {},
  tableCell: {
    fontSize: 10,
    color: "#111",
    paddingVertical: 6,
    paddingHorizontal: 6,
    textAlign: "center",
  },
  hiddenCell: {
    borderTopWidth: 0,
  },
  timeCol: {
    width: 55,
    textAlign: "center",
  },
  groupCol: {
    width: 45,
    textAlign: "center",
  },
  nameCol: {
    flex: 1,
    textAlign: "left",
    minWidth: 140,
  },
  hiCol: {
    width: 45,
    textAlign: "center",
  },
  phCol: {
    width: 45,
    textAlign: "center",
  },
  emptyText: {
    fontStyle: "italic",
    color: "#6b7280",
  },
});
