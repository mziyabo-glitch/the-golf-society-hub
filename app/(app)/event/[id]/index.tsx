import { useCallback, useEffect, useMemo, useState } from "react";
import debounce from "lodash.debounce";
import { StyleSheet, View, Pressable, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { goBack } from "@/lib/navigation";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { SocietyBadge } from "@/components/ui/SocietyHeader";
import { LicenceRequiredModal } from "@/components/LicenceRequiredModal";
import { useBootstrap } from "@/lib/useBootstrap";
import { usePaidAccess } from "@/lib/access/usePaidAccess";
import {
  getEvent,
  updateEvent,
  deleteEvent,
  type EventDoc,
  type EventFormat,
  type EventClassification,
  EVENT_FORMATS,
  EVENT_CLASSIFICATIONS,
} from "@/lib/db_supabase/eventRepo";
import { getJointEventDetail, mapJointEventToEventDoc, updateJointEvent, validateJointEventInput } from "@/lib/db_supabase/jointEventRepo";
import { getMySocieties } from "@/lib/db_supabase/mySocietiesRepo";
import { ParticipatingSocietiesSection } from "@/components/event/ParticipatingSocietiesSection";
import type { EventSocietyInput } from "@/lib/db_supabase/jointEventTypes";
import type { JointEventEntry } from "@/lib/db_supabase/jointEventTypes";
import { getTeesByCourseId, getCourseByApiId, getCourseMetaById, upsertTeesFromApi, type CourseTee } from "@/lib/db_supabase/courseRepo";
import { searchCourses as searchCoursesApi, getCourseById, type ApiCourseSearchResult } from "@/lib/golfApi";
import { importCourse, type ImportedCourse } from "@/lib/importCourse";
import { CourseTeeSelector } from "@/components/CourseTeeSelector";
import { getPermissionsForMember } from "@/lib/rbac";
import {
  getEventRegistrations,
  markMePaid,
  summarizeEventRegistrations,
  type EventRegistration,
} from "@/lib/db_supabase/eventRegistrationRepo";
import { getMembersBySocietyId, getMembersByIds, type MemberDoc } from "@/lib/db_supabase/memberRepo";
import { resolveAttendeeDisplayName } from "@/lib/eventAttendeeName";
import { buildSocietyIdToNameMap } from "@/lib/jointEventSocietyLabel";
import {
  canonicalJointPersonKey,
  mergeJointAttendingDisplayRows,
} from "@/lib/jointPersonDedupe";
import { Toast } from "@/components/ui/Toast";
import { getColors, spacing, radius, typography } from "@/lib/ui/theme";
import { confirmDestructive, showAlert } from "@/lib/ui/alert";
import {
  JOINT_EVENT_CHIP_LONG,
  JOINT_EVENT_CHIP_SHORT,
  JOINT_EVENT_DETAIL_ATTENDANCE_NOTE,
  PaymentPill,
} from "@/lib/eventModuleUi";
import { getSocietyLogoUrl } from "@/lib/societyLogo";

// Picker option component
function PickerOption({
  label,
  selected,
  onPress,
  colors,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  colors: ReturnType<typeof getColors>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.pickerOption,
        {
          backgroundColor: selected ? colors.primary : colors.backgroundSecondary,
          borderColor: selected ? colors.primary : colors.border,
        },
      ]}
    >
      <AppText
        variant="caption"
        style={{ color: selected ? "#fff" : colors.text }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

export default function EventDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const { societyId, society, member: currentMember, loading: bootstrapLoading } = useBootstrap();
  const { guardPaidAction, modalVisible, setModalVisible, societyId: guardSocietyId } = usePaidAccess();
  const colors = getColors();

  // Get logo URL from society
  const logoUrl = getSocietyLogoUrl(society);

  // Permissions
  const permissions = getPermissionsForMember(currentMember as any);
  const canEnterPoints = permissions.canManageHandicaps;
  const canEditEvent = permissions.canCreateEvents;

  // Safely extract eventId (could be string or array from URL params)
  const eventId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [event, setEvent] = useState<EventDoc | null>(null);
  const [jointParticipatingSocieties, setJointParticipatingSocieties] = useState<EventSocietyInput[]>([]);
  const [jointEntries, setJointEntries] = useState<JointEventEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state for editing
  const [formName, setFormName] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formFormat, setFormFormat] = useState<EventFormat>("stableford");
  const [formClassification, setFormClassification] = useState<EventClassification>("general");
  const [formCourseName, setFormCourseName] = useState("");

  // Course search (GolfCourseAPI) for edit mode
  const [courseSearchQuery, setCourseSearchQuery] = useState("");
  const [courseSearchResults, setCourseSearchResults] = useState<ApiCourseSearchResult[]>([]);
  const [courseSearching, setCourseSearching] = useState(false);
  const [courseSearchError, setCourseSearchError] = useState<string | null>(null);
  const [selectedCourseEdit, setSelectedCourseEdit] = useState<{ id: string; name: string } | null>(null);

  // Tee from course_tees (when event has course_id)
  const [tees, setTees] = useState<CourseTee[]>([]);
  const [teesLoading, setTeesLoading] = useState(false);
  const [selectedTee, setSelectedTee] = useState<CourseTee | null>(null);
  const [teeStatus, setTeeStatus] = useState<"synced" | "manual" | "import_failed" | "pending_sync" | null>(null);
  const [teeStatusMessage, setTeeStatusMessage] = useState<string | null>(null);

  // Manual tee entry (fallback when no tees from API)
  const [manualTeeName, setManualTeeName] = useState("");
  const [manualPar, setManualPar] = useState("");
  const [manualCourseRating, setManualCourseRating] = useState("");
  const [manualSlopeRating, setManualSlopeRating] = useState("");
  const [manualLadiesTeeName, setManualLadiesTeeName] = useState("");
  const [manualLadiesPar, setManualLadiesPar] = useState("");
  const [manualLadiesCourseRating, setManualLadiesCourseRating] = useState("");
  const [manualLadiesSlopeRating, setManualLadiesSlopeRating] = useState("");
  const [showManualTee, setShowManualTee] = useState(false);

  // Handicap allowance
  const [formHandicapAllowance, setFormHandicapAllowance] = useState("95");

  // Tee settings toggle
  const [showTeeSettings, setShowTeeSettings] = useState(false);

  // Joint event edit (Phase 3)
  const [formEditIsJointEvent, setFormEditIsJointEvent] = useState(false);
  const [formEditHostSocietyId, setFormEditHostSocietyId] = useState("");
  const [formEditParticipatingSocieties, setFormEditParticipatingSocieties] = useState<EventSocietyInput[]>([]);
  const [mySocieties, setMySocieties] = useState<Awaited<ReturnType<typeof getMySocieties>>>([]);

  /** When enabling joint on a standard event, seed host society (same as Create Event on Events tab). */
  useEffect(() => {
    if (!isEditing || !formEditIsJointEvent) return;
    if (event?.is_joint_event === true) return;
    if (!societyId || formEditParticipatingSocieties.length > 0 || mySocieties.length === 0) return;
    const current = mySocieties.find((s) => s.societyId === societyId);
    if (!current) return;
    setFormEditHostSocietyId(current.societyId);
    setFormEditParticipatingSocieties([
      {
        society_id: current.societyId,
        society_name: current.societyName,
        role: "host",
        has_society_oom: true,
      },
    ]);
  }, [
    isEditing,
    formEditIsJointEvent,
    event?.is_joint_event,
    societyId,
    mySocieties,
    formEditParticipatingSocieties.length,
  ]);

  const parseOptionalNumber = (value: string, round = false): number | undefined => {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const num = Number(trimmed);
    if (!Number.isFinite(num)) return undefined;
    return round ? Math.round(num) : num;
  };

  const loadEvent = useCallback(async () => {
    if (!eventId) {
      setError("Missing event");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // (a) Fetch base event
      const baseEvent = await getEvent(eventId);

      if (baseEvent) {
        // (b) If base exists and is joint, load joint payload; (c) else keep standard path
        const joint = baseEvent.is_joint_event === true;
        if (joint) {
          const jointPayload = await getJointEventDetail(eventId);
          if (jointPayload) {
            setEvent(mapJointEventToEventDoc(jointPayload.event) as EventDoc);
            setJointParticipatingSocieties(
              jointPayload.participating_societies.map((s) => ({
                society_id: s.society_id,
                society_name: s.society_name,
                role: s.role,
                has_society_oom: s.has_society_oom,
                society_oom_name: s.society_oom_name || null,
              }))
            );
            setJointEntries(jointPayload.entries ?? []);
            if (__DEV__) {
              console.log("[EventDetail] Joint path (base event + joint payload):", {
                eventId,
                societies: jointPayload.participating_societies?.length ?? 0,
                entries: jointPayload.entries?.length ?? 0,
                legacyPlayerIdsCount: baseEvent?.playerIds?.length ?? 0,
              });
            }
          } else {
            setEvent(baseEvent);
            setJointParticipatingSocieties([]);
            setJointEntries([]);
          }
        } else {
          setEvent(baseEvent);
          setJointParticipatingSocieties([]);
          setJointEntries([]);
        }
      } else {
        // (d) Base event not found: try joint payload as fallback (e.g. access via participating society)
        // (RLS blocks direct events read for non-host societies)
        const jointPayload = await getJointEventDetail(eventId);
        if (jointPayload) {
          setEvent(mapJointEventToEventDoc(jointPayload.event) as EventDoc);
          setJointParticipatingSocieties(
            jointPayload.participating_societies.map((s) => ({
              society_id: s.society_id,
              society_name: s.society_name,
              role: s.role,
              has_society_oom: s.has_society_oom,
              society_oom_name: s.society_oom_name || null,
            }))
          );
          setJointEntries(jointPayload.entries ?? []);
          if (__DEV__) {
            console.log("[EventDetail] Joint path (fallback, participating-society access):", {
              eventId,
              societies: jointPayload.participating_societies?.length ?? 0,
              entries: jointPayload.entries?.length ?? 0,
            });
          }
        } else {
          setError("Event not found");
        }
      }
    } catch (err: any) {
      console.error("[EventDetail] loadEvent error:", err?.message ?? err);
      setError(err?.message ?? "Failed to load event");
      setEvent(null);
      setJointEntries([]);
    } finally {
      setLoading(false);
    }
  }, [eventId, societyId]);

  useFocusEffect(
    useCallback(() => {
      loadEvent();
    }, [loadEvent])
  );

  // ---- Paid Players dashboard ----
  const canManagePayments = permissions.canManageEventPayments;
  const [registrations, setRegistrations] = useState<EventRegistration[]>([]);
  const [regMembers, setRegMembers] = useState<MemberDoc[]>([]);
  const [payBusy, setPayBusy] = useState<string | null>(null);
  const [payToast, setPayToast] = useState<{ visible: boolean; message: string; type: "success" | "error" }>({ visible: false, message: "", type: "success" });

  const loadRegistrations = useCallback(async () => {
    if (!eventId || !societyId) return;
    try {
      const [regs, mems] = await Promise.all([
        getEventRegistrations(eventId),
        getMembersBySocietyId(societyId),
      ]);
      setRegistrations(regs);
      const byId = new Map<string, MemberDoc>();
      for (const m of mems) byId.set(m.id, m);
      const regMemberIds = [...new Set(regs.map((r) => r.member_id).filter(Boolean))];
      const missing = regMemberIds.filter((id) => !byId.has(id));
      if (missing.length > 0) {
        const extra = await getMembersByIds(missing);
        for (const m of extra) {
          if (m?.id && !byId.has(m.id)) byId.set(m.id, m);
        }
      }
      setRegMembers(Array.from(byId.values()));
    } catch { /* non-critical */ }
  }, [eventId, societyId]);

  useEffect(() => {
    if (eventId && societyId) loadRegistrations();
  }, [eventId, societyId, loadRegistrations]);

  const memberByIdForRegs = useMemo(() => new Map(regMembers.map((m) => [m.id, m])), [regMembers]);

  /** Display name per registration row (hydrates cross-society players for joint events). */
  const registrationMemberDisplayName = useCallback(
    (reg: EventRegistration) => {
      const m = memberByIdForRegs.get(reg.member_id);
      const snap = (reg as { member_display_name?: string | null }).member_display_name;
      return resolveAttendeeDisplayName(m, {
        registrationId: reg.id,
        memberId: reg.member_id,
        snapshotName: snap,
      }).name;
    },
    [memberByIdForRegs],
  );

  const memberNameForAttendeeId = useCallback(
    (memberId: string) =>
      resolveAttendeeDisplayName(memberByIdForRegs.get(memberId), { memberId }).name,
    [memberByIdForRegs],
  );

  /** Hydrate display names for captain line-up (playerIds) and joint entry player ids. */
  useEffect(() => {
    if (!eventId || !societyId) return;
    const ids = [...(event?.playerIds ?? []), ...jointEntries.map((e) => e.player_id)]
      .filter(Boolean)
      .map(String);
    const unique = [...new Set(ids)];
    const need = unique.filter((id) => !memberByIdForRegs.has(id));
    if (need.length === 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const extra = await getMembersByIds(need);
        if (cancelled) return;
        setRegMembers((prev) => {
          const m = new Map(prev.map((x) => [x.id, x]));
          for (const x of extra) {
            if (x?.id && !m.has(x.id)) m.set(x.id, x);
          }
          return Array.from(m.values());
        });
      } catch {
        /* non-critical */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId, societyId, event?.playerIds, jointEntries, memberByIdForRegs]);

  const attendingRegs = useMemo(
    () => registrations.filter((r) => r.status === "in"),
    [registrations],
  );

  const captainPickMemberIds = useMemo(() => {
    const regIn = new Set(attendingRegs.map((r) => String(r.member_id)));
    return (event?.playerIds ?? []).map(String).filter((id) => id && !regIn.has(id));
  }, [attendingRegs, event?.playerIds]);

  const standardAttendingTotalCount = useMemo(() => {
    const s = new Set<string>();
    attendingRegs.forEach((r) => s.add(String(r.member_id)));
    captainPickMemberIds.forEach((id) => s.add(id));
    return s.size;
  }, [attendingRegs, captainPickMemberIds]);

  const regSummary = useMemo(
    () => summarizeEventRegistrations(registrations),
    [registrations],
  );
  const {
    attendingCount,
    outstandingCount,
    paidAmongAttendingCount,
  } = regSummary;

  const jointConfirmedCount = useMemo(() => {
    if (event?.is_joint_event !== true) return 0;
    const memberIds: string[] = [];
    jointEntries.forEach((e) => {
      if (e.player_id) memberIds.push(String(e.player_id));
    });
    (event.playerIds ?? []).forEach((id) => {
      if (id) memberIds.push(String(id));
    });
    registrations.filter((r) => r.status === "in").forEach((r) => memberIds.push(String(r.member_id)));
    const keys = new Set<string>();
    for (const id of memberIds) {
      const m = memberByIdForRegs.get(id);
      keys.add(
        canonicalJointPersonKey(
          m ?? ({ id, society_id: "" } as MemberDoc),
        ),
      );
    }
    return keys.size;
  }, [
    event?.is_joint_event,
    event?.playerIds,
    jointEntries,
    registrations,
    memberByIdForRegs,
  ]);

  const jointSocietyIdToName = useMemo(
    () => buildSocietyIdToNameMap(jointParticipatingSocieties),
    [jointParticipatingSocieties],
  );

  const jointAttendingRows = useMemo(() => {
    if (event?.is_joint_event !== true) return [];

    const items: {
      memberId: string;
      primary: string;
      sourceNote?: string;
      priority: number;
    }[] = [];

    for (const entry of jointEntries) {
      const pid = String(entry.player_id);
      if (!pid) continue;
      const fromEntry = entry.player_name?.trim();
      const primary =
        fromEntry ||
        resolveAttendeeDisplayName(memberByIdForRegs.get(pid), { memberId: pid }).name;
      items.push({ memberId: pid, primary, sourceNote: "Event entry", priority: 0 });
    }

    for (const raw of event?.playerIds ?? []) {
      const pid = String(raw);
      if (!pid) continue;
      const mem = memberByIdForRegs.get(pid);
      items.push({
        memberId: pid,
        primary: resolveAttendeeDisplayName(mem, { memberId: pid }).name,
        sourceNote: "Players list",
        priority: 1,
      });
    }

    for (const r of registrations) {
      if (r.status !== "in") continue;
      items.push({
        memberId: String(r.member_id),
        primary: registrationMemberDisplayName(r),
        sourceNote: "RSVP",
        priority: 2,
      });
    }

    return mergeJointAttendingDisplayRows(
      items,
      (id) => memberByIdForRegs.get(id),
      jointSocietyIdToName,
    );
  }, [
    event?.is_joint_event,
    event?.playerIds,
    jointEntries,
    jointSocietyIdToName,
    registrations,
    memberByIdForRegs,
    registrationMemberDisplayName,
  ]);

  const handleTogglePaid = async (reg: EventRegistration) => {
    if (payBusy) return;
    setPayBusy(reg.member_id);
    try {
      await markMePaid(reg.event_id, reg.member_id, !reg.paid);
      setPayToast({
        visible: true,
        message: reg.paid ? "Marked unpaid" : "Marked paid (also confirmed as attending)",
        type: "success",
      });
      await loadRegistrations();
    } catch (e: any) {
      setPayToast({ visible: true, message: e?.message || "Failed", type: "error" });
    } finally {
      setPayBusy(null);
    }
  };

  /**
   * Playing-list-only members (no `event_registrations` row yet). RPC inserts the row.
   * @param paid - target state: true = paid + confirmed; false = fee row, attending, unpaid.
   */
  const handleLineupMemberFeeAction = async (memberId: string, paid: boolean) => {
    if (payBusy || !eventId) return;
    setPayBusy(memberId);
    try {
      await markMePaid(eventId, memberId, paid);
      setPayToast({
        visible: true,
        message: paid
          ? "Marked paid — fee record created (confirmed as attending)"
          : "Fee record added (unpaid, confirmed as attending)",
        type: "success",
      });
      await loadRegistrations();
    } catch (e: any) {
      setPayToast({ visible: true, message: e?.message || "Failed", type: "error" });
    } finally {
      setPayBusy(null);
    }
  };

  // Debounced course search (400ms - only fires after typing stops to avoid API quota burn)
  const debouncedSearch = useMemo(
    () =>
      debounce(async (q: string) => {
        setCourseSearching(true);
        setCourseSearchError(null);
        try {
          const hits = await searchCoursesApi(q);
          setCourseSearchResults(hits);
        } catch (e: any) {
          setCourseSearchError(e?.message || "Search failed");
          setCourseSearchResults([]);
        } finally {
          setCourseSearching(false);
        }
      }, 400),
    []
  );

  useEffect(() => {
    if (!isEditing) return;
    const q = courseSearchQuery.trim();
    if (!q || q.length < 2) {
      setCourseSearchResults([]);
      setCourseSearchError(null);
      return;
    }
    debouncedSearch(q);
    return () => debouncedSearch.cancel();
  }, [courseSearchQuery, isEditing, debouncedSearch]);

  const handleEditSelectCourse = useCallback(async (hit: ApiCourseSearchResult) => {
    setCourseSearchResults([]);
    setCourseSearchQuery("");
    setSelectedTee(null);
    setTees([]);
    setTeesLoading(true);
    setTeeStatus(null);
    setTeeStatusMessage(null);
    setShowManualTee(true);
    try {
      const cached = await getCourseByApiId(hit.id);
      if (cached && cached.tees.length > 0) {
        setSelectedCourseEdit({ id: cached.courseId, name: cached.courseName });
        setFormCourseName(cached.courseName);
        setTees(cached.tees);
        setTeeStatus("synced");
        setTeeStatusMessage("Synced tee data loaded.");
      } else {
        const full = await getCourseById(hit.id);
        const result: ImportedCourse = await importCourse(full);
        setSelectedCourseEdit({ id: result.courseId, name: result.courseName });
        setFormCourseName(result.courseName);

        let teesList: CourseTee[];
        if (result.tees.length > 0) {
          teesList = result.tees.map((t) => ({
            id: t.id,
            course_id: result.courseId,
            tee_name: t.teeName,
            tee_color: null,
            course_rating: t.courseRating ?? 0,
            slope_rating: t.slopeRating ?? 0,
            par_total: t.parTotal ?? 0,
          }));
        } else {
          const apiTees = full.tees;
          if (apiTees) {
            await upsertTeesFromApi(result.courseId, apiTees as any);
            teesList = await getTeesByCourseId(result.courseId);
          } else {
            teesList = [];
          }
        }
        setTees(teesList);
        if (teesList.length === 0) {
          setTeeStatus("pending_sync");
          setTeeStatusMessage("Tee data is still syncing. You can select a tee manually below.");
          setShowManualTee(true);
        } else {
          setTeeStatus("synced");
          setTeeStatusMessage("Synced tee data loaded.");
          setShowManualTee(false);
        }
      }
    } catch (e: any) {
      setSelectedCourseEdit({ id: "", name: hit.name });
      setFormCourseName(hit.name);
      setTees([]);
      setTeeStatus("import_failed");
      setTeeStatusMessage("Import failed. You can still save manual tee details below.");
      setShowManualTee(true);
    } finally {
      setTeesLoading(false);
    }
  }, []);

  // Load tees when event has course_id
  const loadTeesForEvent = useCallback(async (courseId: string | undefined, teeId: string | undefined, savedEvent?: EventDoc | null) => {
    if (!courseId) {
      setTees([]);
      setSelectedTee(null);
      setTeeStatus(null);
      setTeeStatusMessage(null);
      return;
    }
    setTeesLoading(true);
    try {
      const list = await getTeesByCourseId(courseId);
      setTees(list);
      const match = teeId ? list.find((t) => t.id === teeId) : null;
      setSelectedTee(match ?? null);
      if (list.length > 0) {
        setTeeStatus("synced");
        setTeeStatusMessage("Synced tee data loaded.");
        if (match) {
          setShowManualTee(false);
        } else if (savedEvent?.teeName || savedEvent?.par != null || savedEvent?.courseRating != null || savedEvent?.slopeRating != null) {
          setShowManualTee(true);
          setTeeStatus("manual");
          setTeeStatusMessage("Saved tee setup loaded from this event. You can edit it below.");
        }
        return;
      }

      setShowManualTee(true);
      setTeeStatus("pending_sync");
      setTeeStatusMessage("Tee data is still syncing. You can select a tee manually below.");

      const meta = await getCourseMetaById(courseId);
      if (!meta?.api_id) {
        setTeeStatus(savedEvent?.teeName ? "manual" : "import_failed");
        setTeeStatusMessage(savedEvent?.teeName
          ? "Saved tee setup loaded from this event. You can edit it below."
          : "No imported tees found yet. Enter tee details manually below.");
        return;
      }

      try {
        const full = await getCourseById(meta.api_id);
        const result = await importCourse(full);
        const refreshed = await getTeesByCourseId(result.courseId);
        setTees(refreshed);
        const refreshedMatch = teeId ? refreshed.find((t) => t.id === teeId) : null;
        setSelectedTee(refreshedMatch ?? null);
        if (refreshed.length > 0) {
          setTeeStatus("synced");
          setTeeStatusMessage("Tee data synced.");
          if (refreshedMatch) setShowManualTee(false);
        } else {
          setTeeStatus(savedEvent?.teeName ? "manual" : "pending_sync");
          setTeeStatusMessage(savedEvent?.teeName
            ? "Saved tee setup loaded from this event. You can edit it below."
            : "No imported tees found yet. Enter tee details manually below.");
        }
      } catch (syncErr: any) {
        console.error("[event] background tee sync failed:", syncErr?.message || syncErr);
        setTeeStatus(savedEvent?.teeName ? "manual" : "import_failed");
        setTeeStatusMessage(savedEvent?.teeName
          ? "Saved tee setup loaded from this event. You can edit it below."
          : "Import failed. You can still save manual tee details below.");
      }
    } catch {
      setTees([]);
      setSelectedTee(null);
      setShowManualTee(true);
      setTeeStatus(savedEvent?.teeName ? "manual" : "import_failed");
      setTeeStatusMessage(savedEvent?.teeName
        ? "Saved tee setup loaded from this event. You can edit it below."
        : "Import failed. You can still save manual tee details below.");
    } finally {
      setTeesLoading(false);
    }
  }, []);

  // Populate form when entering edit mode
  const startEditing = async () => {
    if (!event) return;
    setFormName(event.name || "");
    setFormDate(event.date || "");
    setFormFormat(event.format || "stableford");
    setFormClassification(event.classification || "general");
    setFormCourseName(event.courseName || "");

    // Handicap allowance
    setFormHandicapAllowance(
      event.handicapAllowance != null
        ? String(Math.round(event.handicapAllowance * 100))
        : "95"
    );

    // Manual tee fields (pre-fill from existing event data)
    setManualTeeName(event.teeName || "");
    setManualPar(event.par != null ? String(event.par) : "");
    setManualCourseRating(event.courseRating != null ? String(event.courseRating) : "");
    setManualSlopeRating(event.slopeRating != null ? String(event.slopeRating) : "");
    setManualLadiesTeeName(event.ladiesTeeName || "");
    setManualLadiesPar(event.ladiesPar != null ? String(event.ladiesPar) : "");
    setManualLadiesCourseRating(event.ladiesCourseRating != null ? String(event.ladiesCourseRating) : "");
    setManualLadiesSlopeRating(event.ladiesSlopeRating != null ? String(event.ladiesSlopeRating) : "");

    const hasTeeSettings =
      event.teeName != null || event.par != null || event.slopeRating != null ||
      event.courseName != null;
    setShowTeeSettings(!!hasTeeSettings);

    // Course search state
    setCourseSearchQuery("");
    setCourseSearchResults([]);
    setSelectedCourseEdit(event.course_id ? { id: event.course_id, name: event.courseName || "" } : null);
    setTeeStatus(event.teeSource === "imported" ? "synced" : event.teeSource === "manual" ? "manual" : null);
    setTeeStatusMessage(
      event.teeName || event.par != null || event.courseRating != null || event.slopeRating != null
        ? "Saved tee setup loaded from this event."
        : null
    );

    const hasSavedTeeData = !!(event.teeName || event.par != null || event.courseRating != null || event.slopeRating != null);
    if (event.course_id) {
      setShowManualTee(!!(event.teeName || event.par != null || event.courseRating != null || event.slopeRating != null));
      loadTeesForEvent(event.course_id, event.tee_id ?? undefined, event);
    } else {
      setTees([]);
      setSelectedTee(null);
      setTeeStatus(event.teeName ? "manual" : null);
      setTeeStatusMessage(event.teeName ? "Saved tee setup loaded from this event." : null);
      setShowManualTee(!!(event.teeName || event.par != null));
    }

    setFormEditIsJointEvent(event.is_joint_event === true);
    setFormEditHostSocietyId(
      jointParticipatingSocieties.find((s) => s.role === "host")?.society_id ?? event.society_id ?? ""
    );
    setFormEditParticipatingSocieties(jointParticipatingSocieties);
    const societies = await getMySocieties();
    setMySocieties(societies);

    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
  };

  const handleSaveEvent = async () => {
    if (!guardPaidAction()) return;
    if (!eventId) return;

    if (!formName.trim()) {
      showAlert("Missing Name", "Please enter an event name.");
      return;
    }

    if (formEditIsJointEvent) {
      if (formEditParticipatingSocieties.length < 2) {
        showAlert(
          "Joint event",
          "Add at least two participating societies (host + another society) to save as a joint event.",
        );
        return;
      }
      const jointErrors = validateJointEventInput({
        is_joint_event: true,
        host_society_id: formEditHostSocietyId,
        participating_societies: formEditParticipatingSocieties,
      });
      if (jointErrors.length > 0) {
        showAlert("Validation", jointErrors[0].message);
        return;
      }
    }

    // Validate date format if provided
    if (formDate.trim()) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(formDate.trim())) {
        showAlert("Invalid Date", "Please enter date in YYYY-MM-DD format.");
        return;
      }
    }

    const handicapAllowance = formHandicapAllowance.trim()
      ? parseFloat(formHandicapAllowance.trim()) / 100
      : 0.95;

    // Determine tee values: selected from DB or manual entry
    let courseId = (selectedCourseEdit?.id) ?? event?.course_id ?? undefined;
    const courseChanged = courseId && event?.course_id && courseId !== event.course_id;
    let teeId: string | null | undefined = selectedTee
      ? selectedTee.id
      : showManualTee
        ? null
        : courseChanged
          ? null
          : event?.tee_id ?? undefined;

    // Validate tee_id: must exist in loaded tees for current course (events.tee_id FK → course_tees.id)
    let teeValidationMessage: string | null = null;
    if (teeId && courseId && tees.length > 0) {
      const teeExists = tees.some((t) => t.id === teeId);
      if (!teeExists) {
        console.warn("[event] tee_id not in loaded tees, saving null:", {
          teeId,
          courseId,
          loadedTeeIds: tees.map((t) => t.id),
          selectedTee: selectedTee ? { id: selectedTee.id, tee_name: selectedTee.tee_name } : null,
        });
        teeId = null;
        setSelectedTee(null);
        teeValidationMessage = "Selected tee no longer available for this course. Saving without tee selection.";
      }
    }
    if (teeId && courseId && tees.length === 0) {
      teeId = null;
    }

    // API-only IDs (api-course-*, api-tee-*) are not real DB UUIDs — don't save as FK
    if (courseId?.startsWith("api-course-")) courseId = undefined;
    if (teeId?.startsWith?.("api-tee-")) teeId = null;

    const teeName = selectedTee?.tee_name ?? (manualTeeName.trim() || event?.teeName || undefined);
    const par = selectedTee?.par_total ?? parseOptionalNumber(manualPar, true) ?? event?.par ?? undefined;
    const courseRating = selectedTee?.course_rating ?? parseOptionalNumber(manualCourseRating) ?? event?.courseRating ?? undefined;
    const slopeRating = selectedTee?.slope_rating ?? parseOptionalNumber(manualSlopeRating, true) ?? event?.slopeRating ?? undefined;
    const ladiesTeeName = manualLadiesTeeName.trim() || undefined;
    const ladiesPar = parseOptionalNumber(manualLadiesPar, true);
    const ladiesCourseRating = parseOptionalNumber(manualLadiesCourseRating);
    const ladiesSlopeRating = parseOptionalNumber(manualLadiesSlopeRating, true);
    const teeSource = selectedTee
      ? "imported"
      : teeName || par != null || courseRating != null || slopeRating != null
        ? "manual"
        : event?.teeSource ?? undefined;

    console.log("[event] handleSaveEvent before update:", {
      course_id: courseId,
      tee_id: teeId,
      selectedTeeId: selectedTee?.id ?? null,
      selectedTee: selectedTee ? { id: selectedTee.id, tee_name: selectedTee.tee_name } : null,
      loadedTeeIds: tees.map((t) => t.id),
    });

    setSaving(true);
    try {
      if (formEditIsJointEvent) {
        await updateJointEvent(eventId, {
          name: formName.trim(),
          date: formDate.trim() || undefined,
          format: formFormat,
          classification: formClassification,
          courseName: formCourseName.trim() || undefined,
          courseId: courseId || undefined,
          teeId,
          teeName,
          par,
          courseRating,
          slopeRating,
          ladiesTeeName,
          ladiesPar,
          ladiesCourseRating,
          ladiesSlopeRating,
          handicapAllowance,
          teeSource,
          is_joint_event: true,
          host_society_id: formEditHostSocietyId,
          participating_societies: formEditParticipatingSocieties,
        });
      } else {
        await updateEvent(eventId, {
          name: formName.trim(),
          date: formDate.trim() || undefined,
          format: formFormat,
          classification: formClassification,
          courseName: formCourseName.trim() || undefined,
          courseId: courseId || undefined,
          teeId,
          teeName,
          par,
          courseRating,
          slopeRating,
          ladiesTeeName,
          ladiesPar,
          ladiesCourseRating,
          ladiesSlopeRating,
          handicapAllowance,
          teeSource,
        });
      }

      setIsEditing(false);
      loadEvent(); // Reload to get updated data
      showAlert("Saved", teeValidationMessage ?? "Event updated successfully.");
    } catch (e: any) {
      showAlert("Error", e?.message || "Failed to update event.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEvent = () => {
    if (saving) return;
    confirmDestructive(
      "Delete Event",
      `Are you sure you want to delete "${event?.name}"? This cannot be undone.`,
      "Delete",
      async () => {
        if (!eventId) return;
        setSaving(true);
        try {
          await deleteEvent(eventId);
          router.replace("/(app)/(tabs)/events");
        } catch (e: any) {
          setSaving(false);
          showAlert("Error", e?.message || "Failed to delete event.");
        }
      },
    );
  };

  if (bootstrapLoading || loading) {
    return (
      <Screen>
        <LoadingState message="Loading event..." />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <SecondaryButton onPress={() => goBack(router, "/(app)/(tabs)/events")} size="sm">
          <Feather name="arrow-left" size={16} color={colors.text} /> Back
        </SecondaryButton>
        <EmptyState title="Error" message={error} />
      </Screen>
    );
  }

  if (!event) {
    return (
      <Screen>
        <EmptyState title="Not found" message="Event not available." />
      </Screen>
    );
  }

  const formatLabel =
    EVENT_FORMATS.find((f) => f.value === event.format)?.label ??
    event.format;

  const classificationLabel =
    EVENT_CLASSIFICATIONS.find((c) => c.value === event.classification)
      ?.label ?? event.classification;

  const handleOpenPoints = () => {
    if (!eventId) {
      console.error("[EventDetail] Cannot open points: eventId is undefined");
      return;
    }
    console.log("[EventDetail] opening points for event:", eventId);
    router.push({ pathname: "/(app)/event/[id]/points", params: { id: eventId } });
  };

  // Edit mode view
  if (isEditing) {
    return (
      <Screen>
        <View style={styles.formHeader}>
          <SecondaryButton onPress={cancelEditing} size="sm">
            Cancel
          </SecondaryButton>
          <AppText variant="h2">Edit Event</AppText>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {formEditIsJointEvent && (
            <AppCard
              style={{
                marginBottom: spacing.base,
                borderWidth: 1,
                borderColor: colors.primary + "50",
                backgroundColor: colors.primary + "0D",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.sm }}>
                <Feather name="link" size={20} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <AppText variant="captionBold" color="primary">{JOINT_EVENT_CHIP_LONG}</AppText>
                  <AppText variant="small" color="secondary" style={{ marginTop: 4 }}>
                    Fees are per society; shared attendance uses the Players screen.
                    {event?.is_joint_event === true
                      ? " Update participating societies below."
                      : " Add at least one other society below, then save."}
                  </AppText>
                  {formEditParticipatingSocieties.length > 0 ? (
                    <AppText variant="small" color="tertiary" style={{ marginTop: 6 }}>
                      {formEditParticipatingSocieties.map((s) => s.society_name?.trim() || s.society_id).filter(Boolean).join(" · ")}
                    </AppText>
                  ) : null}
                </View>
              </View>
            </AppCard>
          )}
          <AppCard>
            <View style={styles.formField}>
              <AppText variant="captionBold" style={styles.label}>Event Name</AppText>
              <AppInput
                placeholder="e.g. Monthly Medal"
                value={formName}
                onChangeText={setFormName}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.formField}>
              <AppText variant="captionBold" style={styles.label}>Date (YYYY-MM-DD)</AppText>
              <AppInput
                placeholder="e.g. 2025-02-15"
                value={formDate}
                onChangeText={setFormDate}
                keyboardType="numbers-and-punctuation"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.formField}>
              <AppText variant="captionBold" style={styles.label}>Format</AppText>
              <View style={styles.pickerRow}>
                {EVENT_FORMATS.map((f) => (
                  <PickerOption
                    key={f.value}
                    label={f.label}
                    selected={formFormat === f.value}
                    onPress={() => setFormFormat(f.value)}
                    colors={colors}
                  />
                ))}
              </View>
            </View>

            <View style={styles.formField}>
              <AppText variant="captionBold" style={styles.label}>Classification</AppText>
              <View style={styles.pickerRow}>
                {EVENT_CLASSIFICATIONS.map((c) => (
                  <PickerOption
                    key={c.value}
                    label={c.label}
                    selected={formClassification === c.value}
                    onPress={() => setFormClassification(c.value)}
                    colors={colors}
                  />
                ))}
              </View>
            </View>

            {/* Joint event toggle (always visible in edit — was previously only when already joint) */}
            {canEditEvent ? (
              <Pressable
                disabled={event?.is_joint_event === true}
                onPress={() => {
                  if (event?.is_joint_event === true) return;
                  const next = !formEditIsJointEvent;
                  setFormEditIsJointEvent(next);
                  if (!next) {
                    setFormEditHostSocietyId("");
                    setFormEditParticipatingSocieties([]);
                  }
                }}
                style={[
                  styles.jointEventToggle,
                  {
                    borderColor: colors.border,
                    opacity: event?.is_joint_event === true ? 0.75 : 1,
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <AppText variant="captionBold">{JOINT_EVENT_CHIP_LONG}</AppText>
                  <AppText variant="small" color="secondary">
                    {event?.is_joint_event === true
                      ? "This event is joint. Participating societies can be updated below. Turning joint off is not supported yet."
                      : formEditIsJointEvent
                        ? mySocieties.length < 2
                          ? "Join another society in the app to add a second participant."
                          : "On — add host + another society below, then save."
                        : "Off — single society. Turn on to link another society."}
                  </AppText>
                </View>
                <View
                  style={[
                    styles.pickerOption,
                    {
                      backgroundColor: formEditIsJointEvent ? colors.primary : colors.backgroundSecondary,
                      borderColor: formEditIsJointEvent ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <AppText variant="caption" style={{ color: formEditIsJointEvent ? "#fff" : colors.text }}>
                    {formEditIsJointEvent ? "On" : "Off"}
                  </AppText>
                </View>
              </Pressable>
            ) : null}

            {formEditIsJointEvent && (
              <ParticipatingSocietiesSection
                hostSocietyId={formEditHostSocietyId}
                participatingSocieties={formEditParticipatingSocieties}
                availableSocieties={mySocieties}
                onHostChange={setFormEditHostSocietyId}
                onSocietiesChange={setFormEditParticipatingSocieties}
              />
            )}

            {/* Course / Tee Setup Toggle */}
            <Pressable
              onPress={() => setShowTeeSettings(!showTeeSettings)}
              style={styles.teeSettingsToggle}
            >
              <View style={{ flex: 1 }}>
                <AppText variant="captionBold">Course / Tee Setup</AppText>
                <AppText variant="small" color="secondary">
                  For WHS handicap calculations
                </AppText>
              </View>
              <Feather
                name={showTeeSettings ? "chevron-up" : "chevron-down"}
                size={20}
                color={colors.textTertiary}
              />
            </Pressable>

            {/* Course / Tee Setup body */}
            {showTeeSettings && (
              <View style={styles.teeSettingsContainer}>
                {/* Course search */}
                <View style={styles.formField}>
                  <AppText variant="caption" style={styles.label}>Search Course</AppText>
                  <AppInput
                    placeholder="Search courses…"
                    value={courseSearchQuery}
                    onChangeText={setCourseSearchQuery}
                    autoCapitalize="none"
                  />
                  {courseSearching && (
                    <AppText variant="small" color="tertiary" style={{ marginTop: 4 }}>Searching…</AppText>
                  )}
                  {courseSearchError && (
                    <AppText variant="small" style={{ color: colors.error, marginTop: 4 }}>{courseSearchError}</AppText>
                  )}
                  {courseSearchResults.length > 0 && (
                    <View style={styles.searchResults}>
                      {courseSearchResults.slice(0, 8).map((hit) => (
                        <Pressable
                          key={hit.id}
                          onPress={() => handleEditSelectCourse(hit)}
                          style={({ pressed }) => [styles.searchResultItem, { backgroundColor: pressed ? colors.backgroundSecondary : "transparent" }]}
                        >
                          <AppText variant="body" numberOfLines={1}>{hit.club_name || hit.name}</AppText>
                          {typeof hit.location === "string" && hit.location && (
                            <AppText variant="small" color="tertiary">{hit.location}</AppText>
                          )}
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>

                {/* Selected course name (editable) */}
                <View style={styles.formField}>
                  <AppText variant="caption" style={styles.label}>Course Name</AppText>
                  <AppInput
                    placeholder="e.g. Forest of Arden"
                    value={formCourseName}
                    onChangeText={setFormCourseName}
                    autoCapitalize="words"
                  />
                </View>

                {/* Tee selector from imported tees */}
                {(selectedCourseEdit?.id || event.course_id) && (
                  <View style={styles.formField}>
                    <AppText variant="captionBold" style={styles.label}>Select Tee</AppText>
                    {teesLoading ? (
                      <AppText variant="small" color="tertiary">Importing course and tees…</AppText>
                    ) : tees.length > 0 ? (
                      <CourseTeeSelector
                        tees={tees}
                        selectedTee={selectedTee}
                        onSelectTee={(tee) => { setSelectedTee(tee); setShowManualTee(false); }}
                      />
                    ) : (
                      <AppText variant="small" color="tertiary" style={{ marginBottom: spacing.xs }}>
                        No tees found for this course.
                      </AppText>
                    )}
                    {tees.length === 0 && !teesLoading && !showManualTee && (
                      <Pressable onPress={() => setShowManualTee(true)}>
                        <AppText variant="caption" color="primary" style={{ marginTop: spacing.xs }}>
                          + Enter tee details manually
                        </AppText>
                      </Pressable>
                    )}
                  </View>
                )}

                {/* Manual tee link when no course selected at all */}
                {!selectedCourseEdit?.id && !event.course_id && !showManualTee && (
                  <Pressable onPress={() => setShowManualTee(true)} style={{ marginBottom: spacing.base }}>
                    <AppText variant="caption" color="primary">
                      + Enter tee details manually
                    </AppText>
                  </Pressable>
                )}

                {/* Manual tee entry fallback */}
                {showManualTee && (
                  <View style={styles.manualTeeContainer}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
                      <AppText variant="captionBold">Manual Tee Entry</AppText>
                      {selectedTee && (
                        <Pressable onPress={() => setShowManualTee(false)}>
                          <AppText variant="small" color="primary">Use selected tee instead</AppText>
                        </Pressable>
                      )}
                    </View>

                    <AppText variant="captionBold" color="secondary" style={{ marginBottom: spacing.xs }}>Male Tee</AppText>
                    <View style={styles.formField}>
                      <AppText variant="caption" style={styles.label}>Tee Name</AppText>
                      <AppInput
                        placeholder="e.g. Yellow"
                        value={manualTeeName}
                        onChangeText={(v) => { setManualTeeName(v); setSelectedTee(null); }}
                        autoCapitalize="words"
                      />
                    </View>
                    <View style={styles.formField}>
                      <AppText variant="caption" style={styles.label}>Par</AppText>
                      <AppInput
                        placeholder="e.g. 72"
                        value={manualPar}
                        onChangeText={(v) => { setManualPar(v); setSelectedTee(null); }}
                        keyboardType="number-pad"
                      />
                    </View>
                    <View style={styles.formField}>
                      <AppText variant="caption" style={styles.label}>Course Rating</AppText>
                      <AppInput
                        placeholder="e.g. 70.1"
                        value={manualCourseRating}
                        onChangeText={(v) => { setManualCourseRating(v); setSelectedTee(null); }}
                        keyboardType="decimal-pad"
                      />
                    </View>
                    <View style={styles.formField}>
                      <AppText variant="caption" style={styles.label}>Slope Rating</AppText>
                      <AppInput
                        placeholder="e.g. 128"
                        value={manualSlopeRating}
                        onChangeText={(v) => { setManualSlopeRating(v); setSelectedTee(null); }}
                        keyboardType="number-pad"
                      />
                    </View>

                    <AppText variant="captionBold" color="secondary" style={{ marginTop: spacing.sm, marginBottom: spacing.xs }}>Female Tee</AppText>
                    <View style={styles.formField}>
                      <AppText variant="caption" style={styles.label}>Tee Name</AppText>
                      <AppInput
                        placeholder="e.g. Red"
                        value={manualLadiesTeeName}
                        onChangeText={setManualLadiesTeeName}
                        autoCapitalize="words"
                      />
                    </View>
                    <View style={styles.formField}>
                      <AppText variant="caption" style={styles.label}>Par</AppText>
                      <AppInput
                        placeholder="e.g. 72"
                        value={manualLadiesPar}
                        onChangeText={setManualLadiesPar}
                        keyboardType="number-pad"
                      />
                    </View>
                    <View style={styles.formField}>
                      <AppText variant="caption" style={styles.label}>Course Rating</AppText>
                      <AppInput
                        placeholder="e.g. 68.4"
                        value={manualLadiesCourseRating}
                        onChangeText={setManualLadiesCourseRating}
                        keyboardType="decimal-pad"
                      />
                    </View>
                    <View style={styles.formField}>
                      <AppText variant="caption" style={styles.label}>Slope Rating</AppText>
                      <AppInput
                        placeholder="e.g. 120"
                        value={manualLadiesSlopeRating}
                        onChangeText={setManualLadiesSlopeRating}
                        keyboardType="number-pad"
                      />
                    </View>
                  </View>
                )}

                <View style={styles.formField}>
                  <AppText variant="caption" style={styles.label}>
                    Handicap Allowance (%)
                  </AppText>
                  <AppInput
                    placeholder="95"
                    value={formHandicapAllowance}
                    onChangeText={setFormHandicapAllowance}
                    keyboardType="number-pad"
                  />
                  <AppText variant="small" color="tertiary" style={{ marginTop: 4 }}>
                    Default 95% for individual stroke play
                  </AppText>
                </View>
              </View>
            )}

            <PrimaryButton
              onPress={handleSaveEvent}
              loading={saving}
              style={{ marginTop: spacing.sm }}
            >
              Save Changes
            </PrimaryButton>

            {permissions.canDeleteEvents && (
              <SecondaryButton
                onPress={handleDeleteEvent}
                loading={saving}
                style={{ marginTop: spacing.sm }}
              >
                <Feather name="trash-2" size={16} color={colors.error} />
                <AppText style={{ color: colors.error, marginLeft: spacing.xs }}>Delete Event</AppText>
              </SecondaryButton>
            )}
          </AppCard>
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      {/* Header with Back, Edit, and Society Badge */}
      <View style={styles.header}>
        <SecondaryButton onPress={() => goBack(router, "/(app)/(tabs)/events")} size="sm">
          <Feather name="arrow-left" size={16} color={colors.text} /> Back
        </SecondaryButton>
        <View style={styles.headerRight}>
          {canEditEvent && (
            <SecondaryButton onPress={startEditing} size="sm">
              <Feather name="edit-2" size={14} color={colors.text} /> Edit
            </SecondaryButton>
          )}
          <SocietyBadge
            societyName={society?.name || "Golf Society"}
            logoUrl={logoUrl}
            size="md"
            showName={false}
          />
        </View>
      </View>

      {/* Joint Event — canonical `event.is_joint_event` from event_societies (2+ societies) */}
      {event.is_joint_event === true && (
        <AppCard
          style={{
            marginBottom: spacing.base,
            borderWidth: 1,
            borderColor: colors.primary + "55",
            backgroundColor: colors.primary + "0C",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.sm }}>
            <Feather name="link" size={22} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <AppText variant="captionBold" color="primary">{JOINT_EVENT_CHIP_LONG}</AppText>
              <AppText variant="small" color="secondary" style={{ marginTop: 4 }}>
                {jointParticipatingSocieties.length > 0
                  ? jointParticipatingSocieties.map((s) => s.society_name?.trim() || s.society_id).filter(Boolean).join(" · ")
                  : "Multiple societies participate — open Players to manage shared entries."}
              </AppText>
            </View>
          </View>
        </AppCard>
      )}

      {/* Title */}
      <AppText variant="title" style={{ marginBottom: spacing.sm }}>
        {event.name}
      </AppText>

      {/* Details */}
      <AppCard style={styles.card}>
        <Row icon="calendar" label="Date" value={event.date ?? "TBC"} />
        <Row icon="map-pin" label="Course" value={event.courseName ?? "TBC"} />
        <Row icon="target" label="Format" value={formatLabel} />
        <Row icon="tag" label="Classification" value={classificationLabel} />
      </AppCard>

      {/* Tee Settings - only show if configured */}
      {(event.teeName || event.par != null || event.slopeRating != null ||
        event.ladiesTeeName || event.ladiesPar != null || event.ladiesSlopeRating != null) && (
        <AppCard style={styles.card}>
          <AppText variant="captionBold" color="secondary" style={{ marginBottom: spacing.sm }}>
            Course / Tee Setup
          </AppText>
          {(event.teeName || event.par != null || event.courseRating != null || event.slopeRating != null) && (
            <>
              <AppText variant="caption" color="tertiary" style={{ marginBottom: spacing.xs }}>Male Tee</AppText>
              {event.teeName && <Row icon="flag" label="Tee" value={event.teeName} />}
              {event.par != null && <Row icon="hash" label="Par" value={String(event.par)} />}
              {event.courseRating != null && (
                <Row icon="activity" label="Course Rating" value={String(event.courseRating)} />
              )}
              {event.slopeRating != null && (
                <Row icon="trending-up" label="Slope Rating" value={String(event.slopeRating)} />
              )}
            </>
          )}
          {(event.ladiesTeeName || event.ladiesPar != null || event.ladiesCourseRating != null || event.ladiesSlopeRating != null) && (
            <>
              <AppText variant="caption" color="tertiary" style={{ marginTop: spacing.sm, marginBottom: spacing.xs }}>Female Tee</AppText>
              {event.ladiesTeeName && <Row icon="flag" label="Tee" value={event.ladiesTeeName} />}
              {event.ladiesPar != null && <Row icon="hash" label="Par" value={String(event.ladiesPar)} />}
              {event.ladiesCourseRating != null && (
                <Row icon="activity" label="Course Rating" value={String(event.ladiesCourseRating)} />
              )}
              {event.ladiesSlopeRating != null && (
                <Row icon="trending-up" label="Slope Rating" value={String(event.ladiesSlopeRating)} />
              )}
            </>
          )}
          {event.handicapAllowance != null && (
            <Row
              icon="percent"
              label="Handicap Allowance"
              value={`${Math.round(event.handicapAllowance * 100)}%`}
            />
          )}
        </AppCard>
      )}

      {/* Players link */}
      <Pressable
        onPress={() =>
          router.push({
            pathname: "/(app)/event/[id]/players",
            params: { id: eventId },
          })
        }
      >
        <AppCard style={styles.actionCard}>
          <ActionRow
            icon="users"
            title="Players"
            subtitle={event.is_joint_event === true
              ? `${jointConfirmedCount} confirmed · ${JOINT_EVENT_CHIP_SHORT} (fees per society)`
              : `${standardAttendingTotalCount} confirmed · ${paidAmongAttendingCount} paid · ${outstandingCount} payment due`}
          />
        </AppCard>
      </Pressable>

      {/* View Tee Sheet — when tee times published */}
      {event.teeTimePublishedAt && (
        <Pressable
          onPress={() =>
            router.push({
              pathname: "/(app)/event/[id]/tee-sheet",
              params: { id: eventId },
            })
          }
        >
          <AppCard style={styles.actionCard}>
            <View style={styles.actionRow}>
              <View style={[styles.iconContainer, { backgroundColor: colors.success + "20" }]}>
                <Feather name="flag" size={18} color={colors.success} />
              </View>
              <View style={styles.actionContent}>
                <AppText variant="bodyBold">View Tee Sheet</AppText>
                <AppText variant="caption" color="secondary">
                  Your tee time and full tee sheet
                </AppText>
              </View>
              <Feather name="chevron-right" size={20} color={colors.textTertiary} />
            </View>
          </AppCard>
        </Pressable>
      )}

      {/* Confirmed players (joint: event entries + Players line-up + visible RSVPs) */}
      {event.is_joint_event === true && jointAttendingRows.length > 0 && (
        <AppCard style={styles.card}>
          <AppText variant="h2" style={{ marginBottom: spacing.sm }}>Confirmed Players</AppText>
          <AppText variant="small" color="secondary" style={{ marginBottom: spacing.sm }}>
            {jointConfirmedCount} player{jointConfirmedCount !== 1 ? "s" : ""} · add or remove via Players
          </AppText>
          <AppText variant="small" color="tertiary" style={{ marginBottom: spacing.sm }}>
            {JOINT_EVENT_DETAIL_ATTENDANCE_NOTE}
          </AppText>
          {jointAttendingRows.map((row) => (
            <View key={row.key} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" }}>
              <AppText variant="body" numberOfLines={2} style={{ fontWeight: "600" }}>
                {row.primary}
              </AppText>
              <AppText variant="caption" color="secondary" style={{ marginTop: 4 }}>
                {row.societyLine}
              </AppText>
              {row.sourceNote ? (
                <AppText variant="small" color="tertiary" style={{ marginTop: 2 }}>
                  {row.sourceNote}
                </AppText>
              ) : null}
            </View>
          ))}
        </AppCard>
      )}

      {/* Attendance & payment (standard: RSVP rows + captain Players list line-up) */}
      {event.is_joint_event !== true &&
        (registrations.length > 0 || standardAttendingTotalCount > 0) && (
        <AppCard style={styles.card}>
          <View style={styles.paidHeader}>
            <View style={{ flex: 1 }}>
              <AppText variant="h2">Attendance &amp; payment</AppText>
              <AppText variant="small" color="secondary">
                Confirmed = playing. Marking paid also confirms attendance. Unpaid confirmed players show as payment due.
              </AppText>
              <AppText variant="small" color="tertiary" style={{ marginTop: 4 }}>
                {standardAttendingTotalCount} playing · {paidAmongAttendingCount} paid · {outstandingCount} payment due
                {captainPickMemberIds.length > 0 ? (
                  <AppText variant="small" color="tertiary">
                    {" "}
                    · {captainPickMemberIds.length} on playing list without a fee row — use Mark paid / Record unpaid below
                  </AppText>
                ) : null}
              </AppText>
            </View>
            <View
              style={[
                styles.paidSummaryPill,
                {
                  backgroundColor:
                    attendingCount === 0 && captainPickMemberIds.length > 0
                      ? colors.textTertiary + "18"
                      : outstandingCount === 0 && attendingCount > 0
                        ? colors.success + "14"
                        : colors.warning + "14",
                },
              ]}
            >
              <Feather
                name={
                  attendingCount === 0 && captainPickMemberIds.length > 0
                    ? "info"
                    : outstandingCount === 0 && attendingCount > 0
                      ? "check-circle"
                      : "alert-circle"
                }
                size={14}
                color={
                  attendingCount === 0 && captainPickMemberIds.length > 0
                    ? colors.textTertiary
                    : outstandingCount === 0 && attendingCount > 0
                      ? colors.success
                      : colors.warning
                }
              />
              <AppText
                variant="small"
                style={{
                  color:
                    attendingCount === 0 && captainPickMemberIds.length > 0
                      ? colors.textSecondary
                      : outstandingCount === 0 && attendingCount > 0
                        ? colors.success
                        : colors.warning,
                  fontWeight: "700",
                }}
              >
                {attendingCount === 0 && captainPickMemberIds.length > 0
                  ? "Line-up only"
                  : outstandingCount === 0 && attendingCount > 0
                    ? "All paid"
                    : `${outstandingCount} due`}
              </AppText>
            </View>
          </View>

          {attendingRegs.map((reg) => (
            <View key={reg.id} style={styles.paidRow}>
              <AppText variant="body" numberOfLines={1} style={{ flex: 1 }}>
                {registrationMemberDisplayName(reg)}
              </AppText>
              <View style={[styles.paidPill, { backgroundColor: reg.paid ? colors.success : colors.warning + "35" }]}>
                <AppText style={[styles.paidPillText, !reg.paid && { color: colors.warning }]}>
                  {reg.paid ? PaymentPill.paid : PaymentPill.unpaid}
                </AppText>
              </View>
              {canManagePayments && (
                <Pressable
                  disabled={payBusy === reg.member_id}
                  onPress={() => handleTogglePaid(reg)}
                  hitSlop={8}
                  style={({ pressed }) => [styles.paidToggleBtn, { borderColor: colors.border, opacity: pressed ? 0.6 : payBusy === reg.member_id ? 0.4 : 1 }]}
                >
                  <AppText variant="small" color="primary" style={{ fontWeight: "600" }}>
                    {reg.paid ? "Mark unpaid" : "Mark paid"}
                  </AppText>
                </Pressable>
              )}
            </View>
          ))}

          {captainPickMemberIds.map((mid) => (
            <View key={`lineup-${mid}`} style={styles.paidRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText variant="body" numberOfLines={1}>
                  {memberNameForAttendeeId(mid)}
                </AppText>
                <AppText variant="caption" color="tertiary">
                  Playing list · no fee row yet — actions create the fee record
                </AppText>
              </View>
              <View style={[styles.paidPill, { backgroundColor: colors.warning + "35" }]}>
                <AppText style={[styles.paidPillText, { color: colors.warning }]}>{PaymentPill.unpaid}</AppText>
              </View>
              {canManagePayments && (
                <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, maxWidth: 220 }}>
                  <Pressable
                    disabled={payBusy === mid}
                    onPress={() => handleLineupMemberFeeAction(mid, true)}
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.paidToggleBtn,
                      { borderColor: colors.border, opacity: pressed ? 0.6 : payBusy === mid ? 0.4 : 1 },
                    ]}
                  >
                    <AppText variant="small" color="primary" style={{ fontWeight: "600" }}>
                      Mark paid
                    </AppText>
                  </Pressable>
                  <Pressable
                    disabled={payBusy === mid}
                    onPress={() => handleLineupMemberFeeAction(mid, false)}
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.paidToggleBtn,
                      { borderColor: colors.border, opacity: pressed ? 0.6 : payBusy === mid ? 0.4 : 1 },
                    ]}
                  >
                    <AppText variant="small" color="secondary" style={{ fontWeight: "600" }}>
                      Record unpaid
                    </AppText>
                  </Pressable>
                </View>
              )}
            </View>
          ))}

          {registrations.filter((r) => r.status === "out").length > 0 && (
            <View style={{ marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: "#F3F4F6" }}>
              <AppText variant="captionBold" color="tertiary" style={{ marginBottom: spacing.xs }}>Not playing</AppText>
              {registrations.filter((r) => r.status === "out").map((reg) => (
                <AppText key={reg.id} variant="small" color="tertiary" style={{ paddingVertical: 2 }}>
                  {registrationMemberDisplayName(reg)}
                </AppText>
              ))}
            </View>
          )}
        </AppCard>
      )}

      {/* Enter Points Section - Captain/Handicapper only */}
      {canEnterPoints && (
        <Pressable
          onPress={handleOpenPoints}
          style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
        >
          <AppCard style={styles.actionCard}>
            <View style={styles.actionRow}>
              <View style={[styles.iconContainer, { backgroundColor: colors.warning + "20" }]}>
                <Feather name="edit-3" size={18} color={colors.warning} />
              </View>
              <View style={styles.actionContent}>
                <AppText variant="bodyBold">Enter Points</AppText>
                <AppText variant="caption" color="secondary">
                  Add Order of Merit points for players
                </AppText>
              </View>
              <Feather name="chevron-right" size={20} color={colors.textTertiary} />
            </View>
          </AppCard>
        </Pressable>
      )}

      {/* Delete Event - Captain/Secretary/Treasurer */}
      {permissions.canDeleteEvents && (
        <SecondaryButton
          onPress={handleDeleteEvent}
          loading={saving}
          style={{ marginTop: spacing.sm }}
        >
          <Feather name="trash-2" size={16} color={colors.error} />
          <AppText style={{ color: colors.error, marginLeft: spacing.xs }}>Delete Event</AppText>
        </SecondaryButton>
      )}

      {/* Created info */}
      {event.created_at && (
        <AppText variant="small" color="tertiary" style={styles.createdText}>
          Created {new Date(event.created_at).toLocaleDateString("en-GB")}
        </AppText>
      )}
      <LicenceRequiredModal visible={modalVisible} onClose={() => setModalVisible(false)} societyId={guardSocietyId} />
      <Toast visible={payToast.visible} message={payToast.message} type={payToast.type} onHide={() => setPayToast((t) => ({ ...t, visible: false }))} />
    </Screen>
  );
}

/* ---------- Helpers ---------- */

function safeValue(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (typeof v === "object" && "address" in (v as object)) {
    const o = v as { address?: string; city?: string; country?: string };
    return [o.address, o.city, o.country].filter(Boolean).join(", ") || "";
  }
  return String(v);
}

function Row({
  icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: string | unknown;
}) {
  const colors = getColors();
  return (
    <View style={styles.row}>
      <Feather name={icon} size={16} color={colors.primary} />
      <View style={{ marginLeft: spacing.sm }}>
        <AppText variant="caption">{label}</AppText>
        <AppText>{safeValue(value)}</AppText>
      </View>
    </View>
  );
}

function ActionRow({
  icon,
  title,
  subtitle,
}: {
  icon: any;
  title: string;
  subtitle: string;
}) {
  const colors = getColors();
  return (
    <View style={styles.actionRow}>
      <Feather name={icon} size={18} color={colors.primary} />
      <View style={{ flex: 1, marginLeft: spacing.sm }}>
        <AppText variant="bodyBold">{title}</AppText>
        <AppText variant="caption">{subtitle}</AppText>
      </View>
      <Feather name="chevron-right" size={18} color={colors.textTertiary} />
    </View>
  );
}

/* ---------- Styles ---------- */

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  card: {
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  actionCard: {
    marginBottom: spacing.sm,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  actionContent: {
    flex: 1,
  },
  paidHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  paidSummaryPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  paidRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  paidPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  paidPillText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: typography.small.fontSize,
  },
  paidToggleBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderRadius: radius.sm,
    marginLeft: spacing.xs,
  },
  createdText: {
    marginTop: spacing.lg,
    textAlign: "center",
  },
  // Form styles
  formHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  formField: {
    marginBottom: spacing.base,
  },
  label: {
    marginBottom: spacing.xs,
  },
  pickerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  pickerOption: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  teeSettingsToggle: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.06)",
    marginTop: spacing.sm,
  },
  teeSettingsContainer: {
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.04)",
  },
  readOnlyTee: {
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: "rgba(0,0,0,0.04)",
    gap: 2,
  },
  searchResults: {
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    borderRadius: radius.sm,
    maxHeight: 240,
  },
  searchResultItem: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  manualTeeContainer: {
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: "rgba(0,0,0,0.02)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    marginBottom: spacing.base,
  },
  jointEventToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.06)",
  },
});
