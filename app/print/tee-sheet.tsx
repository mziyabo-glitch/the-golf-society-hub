/**
 * Tee Sheet Print Route (Web Only)
 * 
 * This route renders the tee sheet HTML and provides a user-initiated print button.
 * 
 * Data loading priority:
 * 1. First try to parse payload param (passed from tee sheet screen)
 * 2. If no payload, load from Firestore using societyId + eventId
 * 3. Only show error if both methods fail
 * 
 * Usage: /print/tee-sheet?eventId=xxx&payload=xxx
 */

import { STORAGE_KEYS } from "@/lib/storage";
import type { Course, TeeSet, EventData, MemberData, GuestData } from "@/lib/models";
import { getArray } from "@/lib/storage-helpers";
import { 
  buildTeeSheetDataModel, 
  renderTeeSheetHtml, 
  validateTeeSheetData,
  type TeeSheetDataModel,
} from "@/lib/teeSheetPrint";
import { decodeTeeSheetPayload, type TeeSheetPayload } from "@/lib/teeSheetPayload";
// Firestore read helpers
import { getSociety, getMembers, getEvents, getCourse } from "@/lib/firestore/society";
import { useLocalSearchParams, router } from "expo-router";
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";

export default function PrintTeeSheetScreen() {
  const { eventId, payload } = useLocalSearchParams<{ eventId: string; payload?: string }>();

  const [loading, setLoading] = useState(true);
  const [dataReady, setDataReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teeSheetHtml, setTeeSheetHtml] = useState<string>("");

  useEffect(() => {
    loadDataAndGenerateHtml();
  }, [eventId, payload]);

  const loadDataAndGenerateHtml = async () => {
    setLoading(true);
    setDataReady(false);
    setError(null);
    
    console.log("[Print Route] Loading with eventId:", eventId, "payload:", payload ? "present" : "absent");

    try {
      // STEP 1: Try to use payload if present
      if (payload) {
        const decodedPayload = decodeTeeSheetPayload(payload);
        if (decodedPayload && decodedPayload.teeSheet?.groups?.length > 0) {
          console.log("[Print Route] Using payload data");
          await renderFromPayload(decodedPayload);
          return;
        }
        console.log("[Print Route] Payload invalid or empty, falling back to Firestore");
      }

      // STEP 2: Load from Firestore
      if (!eventId) {
        setError("No event ID provided");
        setLoading(false);
        return;
      }

      await renderFromFirestore(eventId);
    } catch (err) {
      console.error("[Print Route] Error:", err);
      setError("Failed to load tee sheet data. Please try again.");
      setLoading(false);
    }
  };

  /**
   * Render from payload (passed from tee sheet screen)
   */
  const renderFromPayload = async (payload: TeeSheetPayload) => {
    try {
      // Load members from Firestore (needed for player names)
      const members = await getMembers();
      console.log("[Print Route] Loaded", members.length, "members for payload render");

      // Build society info from payload
      const society = payload.societyName 
        ? { name: payload.societyName, logoUrl: payload.societyLogoUrl }
        : null;

      // Build course info from payload
      const course: Course | null = payload.courseId ? {
        id: payload.courseId,
        name: payload.courseName || "",
        teeSets: [],
      } : null;

      // Build tee sets from payload
      const maleTeeSet: TeeSet | null = payload.maleTeeSet ? {
        id: payload.maleTeeSet.id,
        courseId: payload.courseId || "",
        teeColor: payload.maleTeeSet.teeColor,
        par: payload.maleTeeSet.par,
        courseRating: payload.maleTeeSet.courseRating,
        slopeRating: payload.maleTeeSet.slopeRating,
        appliesTo: "male",
      } : null;

      const femaleTeeSet: TeeSet | null = payload.femaleTeeSet ? {
        id: payload.femaleTeeSet.id,
        courseId: payload.courseId || "",
        teeColor: payload.femaleTeeSet.teeColor,
        par: payload.femaleTeeSet.par,
        courseRating: payload.femaleTeeSet.courseRating,
        slopeRating: payload.femaleTeeSet.slopeRating,
        appliesTo: "female",
      } : null;

      // Build event-like object from payload
      const event: EventData = {
        id: payload.eventId,
        name: payload.eventName,
        date: payload.eventDate,
        courseName: payload.courseName,
        courseId: payload.courseId,
        maleTeeSetId: payload.maleTeeSetId,
        femaleTeeSetId: payload.femaleTeeSetId,
        handicapAllowancePct: payload.handicapAllowancePct,
        format: "Stableford",
        teeSheet: payload.teeSheet,
        teeSheetNotes: payload.teeSheetNotes,
        nearestToPinHoles: payload.nearestToPinHoles,
        longestDriveHoles: payload.longestDriveHoles,
        guests: payload.guests,
      };

      // Build and render
      const teeSheetData = buildTeeSheetDataModel({
        society,
        event,
        course,
        maleTeeSet,
        femaleTeeSet,
        members,
        guests: payload.guests || [],
        teeGroups: payload.teeSheet.groups,
        teeSheetNotes: payload.teeSheetNotes,
        nearestToPinHoles: payload.nearestToPinHoles,
        longestDriveHoles: payload.longestDriveHoles,
      });

      const validation = validateTeeSheetData(teeSheetData);
      if (!validation.valid) {
        console.error("[Print Route] Payload validation failed:", validation.errors);
        setError(`Cannot generate PDF:\n${validation.errors.join("\n")}`);
        setLoading(false);
        return;
      }

      const html = renderTeeSheetHtml(teeSheetData);
      setTeeSheetHtml(html);
      setDataReady(true);
      setLoading(false);
      console.log("[Print Route] Rendered from payload successfully");
    } catch (err) {
      console.error("[Print Route] Error rendering from payload:", err);
      // Fall back to Firestore
      if (payload.eventId) {
        await renderFromFirestore(payload.eventId);
      } else {
        setError("Failed to render tee sheet from payload");
        setLoading(false);
      }
    }
  };

  /**
   * Render from Firestore
   */
  const renderFromFirestore = async (eventId: string) => {
    try {
      // Load society
      const societyData = await getSociety();
      const society = societyData ? { 
        name: societyData.name, 
        logoUrl: societyData.logoUrl 
      } : null;

      // Load events and find the one we need
      const events = await getEvents();
      const event = events.find((e) => e.id === eventId);

      if (!event) {
        setError("Event not found in Firestore");
        setLoading(false);
        return;
      }

      console.log("[Print Route] Loaded event:", event.id, "teeSheet groups:", event.teeSheet?.groups?.length || 0);

      if (!event.teeSheet || !event.teeSheet.groups || event.teeSheet.groups.length === 0) {
        setError("No tee sheet found for this event. Please generate and save a tee sheet first.");
        setLoading(false);
        return;
      }

      // Load course and tee sets
      let course: Course | null = null;
      let maleTeeSet: TeeSet | null = null;
      let femaleTeeSet: TeeSet | null = null;

      if (event.courseId) {
        course = await getCourse(event.courseId);
        if (course) {
          if (event.maleTeeSetId) {
            maleTeeSet = course.teeSets.find((t) => t.id === event.maleTeeSetId) || null;
          }
          if (event.femaleTeeSetId) {
            femaleTeeSet = course.teeSets.find((t) => t.id === event.femaleTeeSetId) || null;
          }
        }
      }

      // Load members
      const members = await getMembers();
      console.log("[Print Route] Loaded", members.length, "members");

      // Get guests from event
      const guests: GuestData[] = (event.guests || []).map((g) => ({
        ...g,
        included: g.included ?? true,
      }));

      // Build data model
      const teeSheetData = buildTeeSheetDataModel({
        society,
        event,
        course,
        maleTeeSet,
        femaleTeeSet,
        members,
        guests,
        teeGroups: event.teeSheet.groups,
        teeSheetNotes: event.teeSheetNotes,
        nearestToPinHoles: event.nearestToPinHoles,
        longestDriveHoles: event.longestDriveHoles,
      });

      // Validate
      const validation = validateTeeSheetData(teeSheetData);
      if (!validation.valid) {
        console.error("[Print Route] Firestore validation failed:", validation.errors);
        setError(`Cannot generate PDF:\n${validation.errors.join("\n")}`);
        setLoading(false);
        return;
      }

      // Render
      const html = renderTeeSheetHtml(teeSheetData);
      setTeeSheetHtml(html);
      setDataReady(true);
      setLoading(false);
      console.log("[Print Route] Rendered from Firestore successfully");
    } catch (err) {
      console.error("[Print Route] Error loading from Firestore:", err);
      setError("Failed to load tee sheet from Firestore. Please try again.");
      setLoading(false);
    }
  };

  const handleBack = () => {
    router.back();
  };

  const handlePrint = () => {
    if (Platform.OS === "web" && typeof window !== "undefined" && window.print) {
      window.print();
    }
  };

  // Loading state
  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.loadingText}>Loading tee sheet...</Text>
        </View>
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.errorTitle}>Unable to Load Tee Sheet</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={handleBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back to Tee Sheet</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Web: Render HTML with dangerouslySetInnerHTML and user-initiated print button
  if (Platform.OS === "web") {
    return (
      <View style={styles.webContainer}>
        {/* Print-specific CSS - hide action bar when printing */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
              @media print {
                .print-action-bar { display: none !important; }
                .no-print { display: none !important; }
                body { margin: 0; padding: 0; }
                @page { size: A4; margin: 10mm; }
              }
              @media screen {
                .print-action-bar {
                  position: sticky;
                  top: 0;
                  z-index: 100;
                  background: #f9fafb;
                  border-bottom: 1px solid #e5e7eb;
                  padding: 16px;
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  gap: 12px;
                }
                .print-action-bar .button-row {
                  display: flex;
                  gap: 12px;
                  align-items: center;
                  flex-wrap: wrap;
                  justify-content: center;
                }
                .print-btn {
                  background-color: #0B6E4F;
                  color: white;
                  font-size: 18px;
                  font-weight: 700;
                  padding: 16px 32px;
                  border: none;
                  border-radius: 8px;
                  cursor: pointer;
                  min-width: 220px;
                }
                .print-btn:hover { background-color: #095c42; }
                .print-btn:active { background-color: #074a35; }
                .print-btn:disabled { background-color: #9ca3af; cursor: not-allowed; }
                .back-btn {
                  background-color: #e5e7eb;
                  color: #374151;
                  font-size: 14px;
                  font-weight: 600;
                  padding: 12px 20px;
                  border: none;
                  border-radius: 6px;
                  cursor: pointer;
                }
                .back-btn:hover { background-color: #d1d5db; }
                .help-text {
                  font-size: 13px;
                  color: #6b7280;
                  text-align: center;
                  margin: 0;
                }
              }
            `,
          }}
        />

        {/* Action bar with print button - hidden in print */}
        <div className="print-action-bar">
          <div className="button-row">
            <button 
              className="print-btn" 
              onClick={handlePrint}
              disabled={!dataReady}
            >
              🖨️ Print / Save as PDF
            </button>
            <button className="back-btn" onClick={handleBack}>
              ← Back
            </button>
          </div>
          <p className="help-text">
            If the print dialog doesn&apos;t open, tap the button again.
          </p>
        </div>

        {/* Tee Sheet HTML Content - rendered into DOM */}
        <div
          dangerouslySetInnerHTML={{ __html: teeSheetHtml }}
          style={{ flex: 1 }}
        />
      </View>
    );
  }

  // Native: Show message (this route is primarily for web)
  return (
    <View style={styles.container}>
      <View style={styles.centerContent}>
        <Text style={styles.errorText}>
          This print view is designed for web browsers.
          On mobile, please use the Share PDF button from the Tee Sheet screen.
        </Text>
        <Pressable onPress={handleBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  webContainer: {
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
  errorTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#dc2626",
    marginBottom: 12,
    textAlign: "center",
  },
  errorText: {
    fontSize: 16,
    color: "#6b7280",
    marginBottom: 24,
    textAlign: "center",
    maxWidth: 400,
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
});
