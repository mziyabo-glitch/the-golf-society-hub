import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import debounce from "lodash.debounce";
import { StyleSheet, View, Pressable, ScrollView, Modal, Share, Platform, useWindowDimensions } from "react-native";
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
  enrichEventsWithJointClassification,
  type EventDoc,
  type EventFormat,
  type EventClassification,
  EVENT_FORMATS,
  EVENT_CLASSIFICATIONS,
} from "@/lib/db_supabase/eventRepo";
import { getJointEventDetail, getJointMetaForEventIds, mapJointEventToEventDoc, updateJointEvent, validateJointEventInput } from "@/lib/db_supabase/jointEventRepo";
import { getMySocieties } from "@/lib/db_supabase/mySocietiesRepo";
import { ParticipatingSocietiesSection } from "@/components/event/ParticipatingSocietiesSection";
import type { EventSocietyInput } from "@/lib/db_supabase/jointEventTypes";
import type { JointEventEntry } from "@/lib/db_supabase/jointEventTypes";
import { getTeesByCourseId, getCourseByApiId, getCourseMetaById, upsertTeesFromApi, type CourseTee } from "@/lib/db_supabase/courseRepo";
import { searchCourses as searchCoursesApi, getCourseById, type ApiCourseSearchResult } from "@/lib/golfApi";
import { importCourse, type ImportedCourse } from "@/lib/importCourse";
import { CourseTeeSelector } from "@/components/CourseTeeSelector";
import { InlineNotice } from "@/components/ui/InlineNotice";
import {
  menAndLadiesTeeOptions,
  matchLadiesTeeFromEvent,
  hasManualLadiesTeeMinimum,
} from "@/lib/courseTeeGender";
import {
  getPermissionsForMember,
  canManageEventPaymentsForSociety,
  canManageEventRosterForSociety,
  canShareEventPaymentListsForSociety,
} from "@/lib/rbac";
import {
  getEventRegistrations,
  markMePaid,
  addMemberToEventAsAdmin,
  filterRegistrationsForActiveSocietyMembers,
  type EventRegistration,
} from "@/lib/db_supabase/eventRegistrationRepo";
import { getMembersBySocietyId, getMembersByIds, type MemberDoc } from "@/lib/db_supabase/memberRepo";
import { resolveAttendeeDisplayName } from "@/lib/eventAttendeeName";
import {
  partitionSocietyRegistrations,
  lineupMemberIdsPendingFee,
  memberIdsConfirmedIn,
  withdrawnRegsForDisplay,
} from "@/lib/eventPlayerStatus";
import { Toast } from "@/components/ui/Toast";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getColors, spacing, radius, iconSize } from "@/lib/ui/theme";
import { confirmDestructive, showAlert } from "@/lib/ui/alert";
import {
  JOINT_EVENT_CHIP_LONG,
  JOINT_EVENT_CHIP_SHORT,
  PaymentPill,
} from "@/lib/eventModuleUi";
import { getSocietyLogoUrl } from "@/lib/societyLogo";
import { getCache, invalidateCache, invalidateCachePrefix, setCache } from "@/lib/cache/clientCache";
import {
  isActiveSocietyParticipantForEvent,
  isJointEventFromMeta,
} from "@/lib/jointEventAccess";
import { getEventRsvpInviteShareMessage } from "@/lib/appConfig";
import { shareViaWhatsAppOrFallback } from "@/lib/eventInviteLink";
import { getEventGuests, setEventGuestPaid, type EventGuest } from "@/lib/db_supabase/eventGuestRepo";
import {
  formatRsvpDeadlineDisplay,
  getRsvpDeadlineDisplayTimeZone,
  rsvpDeadlineDateTimePartsFromIso,
  combineLocalDateTimeToRsvpIso,
} from "@/lib/eventInvitePublic";
import {
  countMembersWithNoSocietyRsvpRow,
  countExtraGuestRowsBeyondUniqueNames,
} from "@/lib/eventRsvpStats";
import {
  buildPaymentShareNameLists,
  formatSharePaymentHeader,
  formatWhatsAppFullPaymentStatus,
  formatWhatsAppPaidList,
  formatWhatsAppUnpaidList,
} from "@/lib/eventPaymentShare";
import { exportEventPaymentPdf } from "@/lib/pdf/eventPaymentPdf";

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
      <AppText variant="caption" color={selected ? "inverse" : "default"}>
        {label}
      </AppText>
    </Pressable>
  );
}

export default function EventDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const {
    societyId,
    society,
    member: currentMember,
    memberships,
    loading: bootstrapLoading,
  } = useBootstrap();
  const { guardPaidAction, modalVisible, setModalVisible, societyId: guardSocietyId } = usePaidAccess();
  const colors = getColors();

  // Get logo URL from society
  const logoUrl = getSocietyLogoUrl(society);

  // Permissions
  const permissions = getPermissionsForMember(currentMember);
  const canEnterPoints = permissions.canManageHandicaps;
  const canEditEvent = permissions.canCreateEvents;

  // Safely extract eventId (could be string or array from URL params)
  const eventId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [event, setEvent] = useState<EventDoc | null>(null);
  const [jointParticipatingSocieties, setJointParticipatingSocieties] = useState<EventSocietyInput[]>([]);
  const [, setJointEntries] = useState<JointEventEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const loadingRef = useRef(loading);
  const eventRef = useRef(event);
  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);
  useEffect(() => {
    eventRef.current = event;
  }, [event]);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state for editing
  const [formName, setFormName] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formFormat, setFormFormat] = useState<EventFormat>("stableford");
  const [formClassification, setFormClassification] = useState<EventClassification>("general");
  const [formEntryFeeDisplay, setFormEntryFeeDisplay] = useState("");
  const [formRsvpDeadlineDate, setFormRsvpDeadlineDate] = useState("");
  const [formRsvpDeadlineTime, setFormRsvpDeadlineTime] = useState("");
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
  const [selectedLadiesTee, setSelectedLadiesTee] = useState<CourseTee | null>(null);
  const [, setTeeStatus] = useState<"synced" | "manual" | "import_failed" | "pending_sync" | null>(null);
  const [, setTeeStatusMessage] = useState<string | null>(null);

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
    if (isJointEventFromMeta(event?.participant_society_ids, event?.linked_society_count)) return;
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
    event?.participant_society_ids,
    event?.linked_society_count,
    societyId,
    mySocieties,
    formEditParticipatingSocieties.length,
  ]);

  const { menOptions, ladiesOptions } = useMemo(() => menAndLadiesTeeOptions(tees), [tees]);

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
      setRefreshing(!loadingRef.current && !!eventRef.current);
      if (!eventRef.current) setLoading(true);
      setError(null);

      // (a) Fetch base event — enrich from event_societies so is_joint / participant ids are not raw-row lies.
      const baseEventRaw = await getEvent(eventId);
      const baseEvent = baseEventRaw
        ? (await enrichEventsWithJointClassification([baseEventRaw]))[0] ?? baseEventRaw
        : null;
      const jointMetaMap = await getJointMetaForEventIds([eventId]);
      const jointMeta = jointMetaMap.get(eventId);
      const isJointByMeta = jointMeta?.is_joint_event === true;

      if (baseEvent) {
        // (b) Use canonical joint classification from event_societies meta.
        const joint = isJointByMeta;
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
            await setCache(`event:${eventId}:detail`, {
              event: mapJointEventToEventDoc(jointPayload.event) as EventDoc,
              jointParticipatingSocieties: jointPayload.participating_societies,
              jointEntries: jointPayload.entries ?? [],
            }, { ttlMs: 1000 * 60 * 5 });
          } else {
            setEvent(baseEvent);
            setJointParticipatingSocieties([]);
            setJointEntries([]);
          }
        } else {
          setEvent(baseEvent);
          setJointParticipatingSocieties([]);
          setJointEntries([]);
          await setCache(`event:${eventId}:detail`, {
            event: baseEvent,
            jointParticipatingSocieties: [],
            jointEntries: [],
          }, { ttlMs: 1000 * 60 * 5 });
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
      setRefreshing(false);
    }
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      loadEvent();
    }, [loadEvent])
  );

  useEffect(() => {
    if (!eventId) return;
    void (async () => {
      const cached = await getCache<{
        event: EventDoc | null;
        jointParticipatingSocieties: EventSocietyInput[];
        jointEntries: JointEventEntry[];
      }>(`event:${eventId}:detail`, { maxAgeMs: 1000 * 60 * 60 });
      if (cached?.value?.event) {
        setEvent(cached.value.event);
        setJointParticipatingSocieties(cached.value.jointParticipatingSocieties ?? []);
        setJointEntries(cached.value.jointEntries ?? []);
        setLoading(false);
      }
    })();
  }, [eventId]);

  // ---- Paid Players dashboard ----
  /** Use per–active-society role from memberships (avoids wrong cap/treas when user is in multiple clubs). */
  const canManagePayments = useMemo(
    () => canManageEventPaymentsForSociety(memberships, societyId),
    [memberships, societyId],
  );
  const canManageEventRoster = useMemo(
    () => canManageEventRosterForSociety(memberships, societyId),
    [memberships, societyId],
  );
  const canSharePaymentLists = useMemo(
    () => canShareEventPaymentListsForSociety(memberships, societyId),
    [memberships, societyId],
  );
  const [registrations, setRegistrations] = useState<EventRegistration[]>([]);
  /** Members of the active society only — sole source for society-scoped attendance / payment / confirmed lists. */
  const [activeSocietyMembers, setActiveSocietyMembers] = useState<MemberDoc[]>([]);
  const [payBusy, setPayBusy] = useState<string | null>(null);
  const [paymentPdfBusy, setPaymentPdfBusy] = useState(false);
  const [payToast, setPayToast] = useState<{ visible: boolean; message: string; type: "success" | "error" }>({ visible: false, message: "", type: "success" });
  const [addMemberModalOpen, setAddMemberModalOpen] = useState(false);
  const [addMemberSearch, setAddMemberSearch] = useState("");
  const [addMemberBusy, setAddMemberBusy] = useState<string | null>(null);
  const [registrationsRefreshing, setRegistrationsRefreshing] = useState(false);
  const [societyGuestCount, setSocietyGuestCount] = useState(0);
  const [societyGuests, setSocietyGuests] = useState<EventGuest[]>([]);
  const [guestDuplicateExtraRows, setGuestDuplicateExtraRows] = useState(0);

  const hostSocietyId = event?.society_id ?? societyId ?? null;

  const participantSocietyIdsForAccess = useMemo(() => {
    const fromJoint = jointParticipatingSocieties.map((s) => s.society_id).filter(Boolean);
    if (fromJoint.length > 0) return [...new Set(fromJoint)];
    return [...new Set(event?.participant_society_ids ?? [])];
  }, [jointParticipatingSocieties, event?.participant_society_ids]);

  const detailIsJointEvent = useMemo(
    () =>
      isJointEventFromMeta(participantSocietyIdsForAccess, event?.linked_society_count) ||
      jointParticipatingSocieties.length >= 2,
    [participantSocietyIdsForAccess, event?.linked_society_count, jointParticipatingSocieties.length],
  );

  const sharePaymentHeader = useMemo(() => {
    let dateShort = "";
    if (event?.date?.trim()) {
      try {
        dateShort = new Date(event.date).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
        });
      } catch {
        dateShort = event.date.trim();
      }
    }
    return formatSharePaymentHeader({
      eventName: event?.name ?? "Event",
      dateShort,
      jointThisSocietyOnly: detailIsJointEvent,
    });
  }, [event?.name, event?.date, detailIsJointEvent]);

  const canShowMemberTeeSheetCta = useMemo(() => {
    if (!event?.society_id || !societyId) return false;
    return isActiveSocietyParticipantForEvent(
      societyId,
      event.society_id,
      participantSocietyIdsForAccess,
    );
  }, [event?.society_id, societyId, participantSocietyIdsForAccess]);

  useEffect(() => {
    if (!eventId || !event || !__DEV__) return;
    console.log("[joint-access] detail gate", {
      eventId,
      activeSocietyId: societyId,
      hostSocietyId: event.society_id,
      participantSocietyIds: participantSocietyIdsForAccess,
      canView: canShowMemberTeeSheetCta,
      detailIsJointEvent,
    });
  }, [
    eventId,
    event,
    societyId,
    participantSocietyIdsForAccess,
    canShowMemberTeeSheetCta,
    detailIsJointEvent,
  ]);

  const paymentsCacheKey = eventId && societyId ? `event:${eventId}:payments:${societyId}` : null;
  const confirmedCacheKey = eventId && societyId ? `event:${eventId}:confirmed-players:${societyId}` : null;

  const loadRegistrations = useCallback(async () => {
    if (!eventId || !societyId) return;
    try {
      setRegistrationsRefreshing(true);
      const [regs, mems, guests] = await Promise.all([
        getEventRegistrations(eventId),
        getMembersBySocietyId(societyId),
        getEventGuests(eventId),
      ]);
      setRegistrations(regs);
      setActiveSocietyMembers(mems);
      const sg = guests.filter((g) => String(g.society_id) === String(societyId));
      setSocietyGuests(sg);
      setSocietyGuestCount(sg.length);
      setGuestDuplicateExtraRows(countExtraGuestRowsBeyondUniqueNames(sg));
      await setCache(`event:${eventId}:registrations`, {
        registrations: regs,
        members: mems,
      }, { ttlMs: 1000 * 60 * 2 });
    } catch {
      /* non-critical */
    } finally {
      setRegistrationsRefreshing(false);
    }
  }, [eventId, societyId]);

  useEffect(() => {
    if (!eventId || !societyId) return;
    void (async () => {
      const cached = await getCache<{ registrations: EventRegistration[]; members: MemberDoc[] }>(
        `event:${eventId}:registrations`,
        { maxAgeMs: 1000 * 60 * 30 },
      );
      if (cached) {
        setRegistrations(cached.value.registrations ?? []);
        setActiveSocietyMembers(cached.value.members ?? []);
      }
      await loadRegistrations();
    })();
  }, [eventId, societyId, loadRegistrations]);

  const memberByIdForRegs = useMemo(
    () => new Map(activeSocietyMembers.map((m) => [m.id, m])),
    [activeSocietyMembers],
  );
  const activeMemberIdSet = useMemo(
    () => new Set(activeSocietyMembers.map((m) => m.id)),
    [activeSocietyMembers],
  );
  /**
   * Fee/RSVP rows for this page: registration.society_id === active society and member in activeSocietyMembers.
   */
  const societyPageRegistrations = useMemo(() => {
    if (!societyId) return [];
    return filterRegistrationsForActiveSocietyMembers(registrations, societyId, activeMemberIdSet);
  }, [registrations, societyId, activeMemberIdSet]);

  /** Display name per registration row. */
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

  /** Optional: fetch member docs for playerIds not yet in active society list (same society only). */
  useEffect(() => {
    if (!eventId || !societyId) return;
    const ids = [...new Set((event?.playerIds ?? []).map(String).filter(Boolean))];
    const need = ids.filter((id) => !memberByIdForRegs.has(id));
    if (need.length === 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const extra = await getMembersByIds(need);
        if (cancelled) return;
        setActiveSocietyMembers((prev) => {
          const m = new Map(prev.map((x) => [x.id, x]));
          for (const x of extra) {
            if (x?.id && x.society_id === societyId && !m.has(x.id)) m.set(x.id, x);
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
  }, [eventId, societyId, event?.playerIds, memberByIdForRegs]);

  /** Canonical buckets: paid ⇒ confirmed; tee sheet = paid + confirmed (see `eventPlayerStatus`). */
  const buckets = useMemo(
    () => partitionSocietyRegistrations(societyPageRegistrations),
    [societyPageRegistrations],
  );

  const regInMemberIds = useMemo(
    () => memberIdsConfirmedIn(societyPageRegistrations),
    [societyPageRegistrations],
  );

  /** Playing list (event.playerIds) in this society with no "in" registration row yet. */
  const captainPickMemberIds = useMemo(
    () =>
      lineupMemberIdsPendingFee({
        playerIds: event?.playerIds,
        societyMemberIds: activeMemberIdSet,
        regInMemberIds,
      }),
    [event?.playerIds, activeMemberIdSet, regInMemberIds],
  );

  const guestConfirmedPaid = useMemo(
    () => societyGuests.filter((g) => g.paid === true),
    [societyGuests],
  );
  const guestPendingPayment = useMemo(
    () => societyGuests.filter((g) => g.paid !== true),
    [societyGuests],
  );

  const paymentShareLists = useMemo(
    () =>
      buildPaymentShareNameLists({
        confirmedPaidRegs: buckets.confirmedPaid,
        pendingPaymentRegs: buckets.pendingPayment,
        captainPickMemberIds,
        paidGuestNames: guestConfirmedPaid.map((g) => g.name),
        unpaidGuestNames: guestPendingPayment.map((g) => g.name),
        nameForReg: registrationMemberDisplayName,
        nameForMemberId: memberNameForAttendeeId,
      }),
    [
      buckets.confirmedPaid,
      buckets.pendingPayment,
      captainPickMemberIds,
      guestConfirmedPaid,
      guestPendingPayment,
      registrationMemberDisplayName,
      memberNameForAttendeeId,
    ],
  );

  const handleSharePaidList = useCallback(async () => {
    try {
      await shareViaWhatsAppOrFallback(
        formatWhatsAppPaidList(sharePaymentHeader, paymentShareLists.paidNames),
      );
    } catch {
      /* share cancelled */
    }
  }, [sharePaymentHeader, paymentShareLists.paidNames]);

  const handleShareUnpaidList = useCallback(async () => {
    try {
      await shareViaWhatsAppOrFallback(
        formatWhatsAppUnpaidList(sharePaymentHeader, paymentShareLists.unpaidNames),
      );
    } catch {
      /* share cancelled */
    }
  }, [sharePaymentHeader, paymentShareLists.unpaidNames]);

  const handleShareFullPaymentStatus = useCallback(async () => {
    try {
      await shareViaWhatsAppOrFallback(
        formatWhatsAppFullPaymentStatus(
          sharePaymentHeader,
          paymentShareLists.paidNames,
          paymentShareLists.unpaidNames,
        ),
      );
    } catch {
      /* share cancelled */
    }
  }, [sharePaymentHeader, paymentShareLists.paidNames, paymentShareLists.unpaidNames]);

  const handleExportPaymentPdf = useCallback(async () => {
    if (!societyId || !event) return;
    setPaymentPdfBusy(true);
    try {
      await exportEventPaymentPdf({
        eventName: event.name ?? "Event",
        eventDate: event.date ?? null,
        societyId,
        society,
        paidNames: paymentShareLists.paidNames,
        unpaidNames: paymentShareLists.unpaidNames,
        paidEntries: paymentShareLists.entries
          .filter((e) => e.status === "paid")
          .map((e) => ({ name: e.name, type: e.type })),
        unpaidEntries: paymentShareLists.entries
          .filter((e) => e.status === "unpaid")
          .map((e) => ({ name: e.name, type: e.type })),
        isJointEvent: detailIsJointEvent,
      });
    } catch (e: unknown) {
      const label = Platform.OS === "web" ? "PNG" : "PDF";
      showAlert(`Could not export ${label}`, e instanceof Error ? e.message : "Try again.");
    } finally {
      setPaymentPdfBusy(false);
    }
  }, [
    societyId,
    event,
    society,
    paymentShareLists.paidNames,
    paymentShareLists.unpaidNames,
    paymentShareLists.entries,
    detailIsJointEvent,
  ]);

  /** Playing list is handled separately; these members are not yet on the event (incl. placeholders with no app account). */
  const playerIdSet = useMemo(
    () => new Set((event?.playerIds ?? []).map(String).filter(Boolean)),
    [event?.playerIds],
  );

  const manualAddCandidates = useMemo(() => {
    return activeSocietyMembers.filter((m) => {
      const id = String(m.id);
      if (regInMemberIds.has(id)) return false;
      if (playerIdSet.has(id)) return false;
      return true;
    });
  }, [activeSocietyMembers, regInMemberIds, playerIdSet]);

  const filteredManualAddCandidates = useMemo(() => {
    const q = addMemberSearch.trim().toLowerCase();
    if (!q) return manualAddCandidates;
    return manualAddCandidates.filter((m) => {
      const name = (m.display_name || m.name || "").toLowerCase();
      const email = (m.email || "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [manualAddCandidates, addMemberSearch]);

  const notPlayingRegs = useMemo(
    () =>
      withdrawnRegsForDisplay(
        societyPageRegistrations,
        activeMemberIdSet,
        regInMemberIds,
        captainPickMemberIds,
      ),
    [societyPageRegistrations, activeMemberIdSet, regInMemberIds, captainPickMemberIds],
  );

  const rsvpSummary = useMemo(() => {
    const inCount = societyPageRegistrations.filter((r) => r.status === "in").length;
    const outCount = societyPageRegistrations.filter((r) => r.status === "out").length;
    const noResponseCount = countMembersWithNoSocietyRsvpRow(
      activeSocietyMembers,
      societyPageRegistrations,
    );
    return {
      inCount,
      outCount,
      guestCount: societyGuestCount,
      noResponseCount,
    };
  }, [societyPageRegistrations, activeSocietyMembers, societyGuestCount]);

  const teeSheetEligibleCount = buckets.confirmedPaid.length + guestConfirmedPaid.length;
  const pendingPaymentCount =
    buckets.pendingPayment.length + captainPickMemberIds.length + guestPendingPayment.length;
  const activeRosterCount =
    buckets.confirmedPaid.length +
    buckets.pendingPayment.length +
    captainPickMemberIds.length +
    societyGuests.length;

  useEffect(() => {
    if (!paymentsCacheKey || !confirmedCacheKey || !societyId) return;
    void setCache(paymentsCacheKey, {
      societyId,
      pendingPayment: buckets.pendingPayment,
      confirmedPaid: buckets.confirmedPaid,
      pendingCount: pendingPaymentCount,
      eligibleCount: teeSheetEligibleCount,
    }, { ttlMs: 1000 * 60 * 2 });
    void setCache(confirmedCacheKey, {
      societyId,
      confirmedMemberIds: Array.from(regInMemberIds),
      captainPickMemberIds,
    }, { ttlMs: 1000 * 60 * 2 });
  }, [
    paymentsCacheKey,
    confirmedCacheKey,
    societyId,
    buckets.pendingPayment,
    buckets.confirmedPaid,
    pendingPaymentCount,
    teeSheetEligibleCount,
    regInMemberIds,
    captainPickMemberIds,
  ]);

  const handleTogglePaid = async (reg: EventRegistration) => {
    if (payBusy || !societyId) return;
    setPayBusy(reg.member_id);
    try {
      await markMePaid(reg.event_id, reg.member_id, !reg.paid, societyId);
      setPayToast({
        visible: true,
        message: reg.paid ? "Marked unpaid" : "Marked paid (also confirmed as attending)",
        type: "success",
      });
      await loadRegistrations();
      await invalidateCache(`event:${eventId}:detail`);
      if (societyId) await invalidateCachePrefix(`society:${societyId}:`);
    } catch (e: any) {
      setPayToast({ visible: true, message: e?.message || "Failed", type: "error" });
    } finally {
      setPayBusy(null);
    }
  };

  const handleToggleGuestPaid = async (guest: EventGuest) => {
    if (payBusy || !societyId) return;
    setPayBusy(`guest:${guest.id}`);
    try {
      await setEventGuestPaid(guest.id, !guest.paid);
      setPayToast({
        visible: true,
        message: guest.paid
          ? "Guest marked unpaid"
          : "Guest marked paid (confirmed attendee)",
        type: "success",
      });
      await loadRegistrations();
      await invalidateCache(`event:${eventId}:detail`);
      if (societyId) await invalidateCachePrefix(`society:${societyId}:`);
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
    if (payBusy || !eventId || !societyId) return;
    /** Society-scoped page: fee row is always for this member_id in the active society. */
    const targetMemberId = memberId;
    setPayBusy(memberId);
    try {
      await markMePaid(eventId, targetMemberId, paid, societyId);
      setPayToast({
        visible: true,
        message: paid
          ? "Marked paid — fee record created (confirmed as attending)"
          : "Fee record added (unpaid, confirmed as attending)",
        type: "success",
      });
      await loadRegistrations();
      await invalidateCache(`event:${eventId}:detail`);
      if (societyId) await invalidateCachePrefix(`society:${societyId}:`);
    } catch (e: any) {
      setPayToast({ visible: true, message: e?.message || "Failed", type: "error" });
    } finally {
      setPayBusy(null);
    }
  };

  const handleAdminAddMemberToEvent = async (memberId: string) => {
    if (addMemberBusy || !eventId || !societyId) return;
    setAddMemberBusy(memberId);
    try {
      await addMemberToEventAsAdmin({
        eventId,
        societyId,
        targetMemberId: memberId,
      });
      setPayToast({
        visible: true,
        message: "Added to event — pending payment until marked paid (tee sheet uses paid & confirmed only)",
        type: "success",
      });
      setAddMemberModalOpen(false);
      setAddMemberSearch("");
      await loadRegistrations();
      await invalidateCache(`event:${eventId}:detail`);
      if (societyId) await invalidateCachePrefix(`society:${societyId}:`);
    } catch (e: any) {
      setPayToast({ visible: true, message: e?.message || "Failed", type: "error" });
    } finally {
      setAddMemberBusy(null);
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
    setSelectedLadiesTee(null);
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
    } catch {
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
      setSelectedLadiesTee(null);
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
      if (savedEvent) {
        setSelectedLadiesTee(
          matchLadiesTeeFromEvent(list, {
            ladiesTeeName: savedEvent.ladiesTeeName,
            ladiesPar: savedEvent.ladiesPar,
            ladiesCourseRating: savedEvent.ladiesCourseRating,
            ladiesSlopeRating: savedEvent.ladiesSlopeRating,
          }),
        );
      } else {
        setSelectedLadiesTee(null);
      }
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
      setSelectedLadiesTee(null);
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
    setSelectedLadiesTee(null);
    setFormName(event.name || "");
    setFormDate(event.date || "");
    setFormFormat(event.format || "stableford");
    setFormClassification(event.classification || "general");
    setFormEntryFeeDisplay(event.entryFeeDisplay?.trim() || "");
    const rsvpParts = rsvpDeadlineDateTimePartsFromIso(event.rsvpDeadlineAt ?? event.rsvp_deadline_at);
    setFormRsvpDeadlineDate(rsvpParts.date);
    setFormRsvpDeadlineTime(rsvpParts.time);
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

    setFormEditIsJointEvent(detailIsJointEvent);
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

    let rsvpDeadlineAt: string | null = null;
    if (formRsvpDeadlineDate.trim()) {
      const iso = combineLocalDateTimeToRsvpIso(formRsvpDeadlineDate, formRsvpDeadlineTime);
      if (!iso) {
        showAlert(
          "RSVP deadline",
          "Use date YYYY-MM-DD and optional time HH:MM (24h). Leave the date empty to clear the deadline.",
        );
        return;
      }
      rsvpDeadlineAt = iso;
    }

    const courseForTee = selectedCourseEdit?.id ?? event?.course_id;
    if (courseForTee && tees.length > 0 && !showManualTee) {
      if (!selectedTee) {
        showAlert("Tee setup", "Select a men's tee for this course.");
        return;
      }
      if (ladiesOptions.length > 0) {
        if (!selectedLadiesTee) {
          showAlert("Tee setup", "Select a ladies' tee for this course.");
          return;
        }
      } else if (
        !hasManualLadiesTeeMinimum({
          manualLadiesTeeName,
          manualLadiesPar,
          manualLadiesCourseRating,
          manualLadiesSlopeRating,
        })
      ) {
        showAlert(
          "Tee setup",
          "No ladies' tees in course data — enter ladies' tee name, par, course rating, and slope.",
        );
        return;
      }
    }
    if (showManualTee) {
      const maleOk =
        selectedTee != null ||
        (manualTeeName.trim() &&
          manualPar.trim() &&
          manualCourseRating.trim() &&
          manualSlopeRating.trim());
      if (!maleOk) {
        showAlert(
          "Tee setup",
          "Enter men's tee details (name, par, course rating, slope) or select a men's tee above.",
        );
        return;
      }
      if (
        !hasManualLadiesTeeMinimum({
          manualLadiesTeeName,
          manualLadiesPar,
          manualLadiesCourseRating,
          manualLadiesSlopeRating,
        })
      ) {
        showAlert("Tee setup", "Enter ladies' tee name, par, course rating, and slope.");
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
    const ladiesTeeName =
      selectedLadiesTee?.tee_name ?? (manualLadiesTeeName.trim() || event?.ladiesTeeName || undefined);
    const ladiesPar = selectedLadiesTee
      ? selectedLadiesTee.par_total
      : parseOptionalNumber(manualLadiesPar, true) ?? event?.ladiesPar ?? undefined;
    const ladiesCourseRating = selectedLadiesTee
      ? selectedLadiesTee.course_rating
      : parseOptionalNumber(manualLadiesCourseRating) ?? event?.ladiesCourseRating ?? undefined;
    const ladiesSlopeRating = selectedLadiesTee
      ? selectedLadiesTee.slope_rating
      : parseOptionalNumber(manualLadiesSlopeRating, true) ?? event?.ladiesSlopeRating ?? undefined;
    const teeSource = selectedTee
      ? "imported"
      : teeName || par != null || courseRating != null || slopeRating != null
        ? "manual"
        : event?.teeSource ?? undefined;

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
          entryFeeDisplay: formEntryFeeDisplay.trim() || null,
          rsvpDeadlineAt,
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
          entryFeeDisplay: formEntryFeeDisplay.trim() || null,
          rsvpDeadlineAt,
        });
      }

      setIsEditing(false);
      loadEvent(); // Reload to get updated data
      await invalidateCache(`event:${eventId}:detail`);
      if (societyId) {
        await invalidateCachePrefix(`society:${societyId}:`);
      }
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
          await invalidateCache(`event:${eventId}:detail`);
          if (societyId) {
            await invalidateCachePrefix(`society:${societyId}:`);
          }
          router.replace("/(app)/(tabs)/events");
        } catch (e: any) {
          setSaving(false);
          showAlert("Error", e?.message || "Failed to delete event.");
        }
      },
    );
  };

  if (bootstrapLoading && loading) {
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
    router.push({ pathname: "/(app)/event/[id]/points", params: { id: eventId } });
  };

  const inviteShareMessage = getEventRsvpInviteShareMessage({
    eventId: event.id,
    eventName: event.name,
    date: event.date ?? undefined,
    societyName: society?.name ? String(society.name) : undefined,
  });

  const handleShareEventInvite = async () => {
    try {
      await Share.share({ message: inviteShareMessage });
    } catch {
      /* dismissed */
    }
  };

  const handleWhatsAppEventInvite = async () => {
    await shareViaWhatsAppOrFallback(inviteShareMessage);
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
              <View style={styles.jointBannerRow}>
                <Feather name="link" size={20} color={colors.primary} />
                <View style={styles.jointBannerTextCol}>
                  <AppText variant="captionBold" color="primary">{JOINT_EVENT_CHIP_LONG}</AppText>
                  <AppText variant="small" color="secondary" style={{ marginTop: 4 }}>
                    Fees are per society; shared attendance uses the Players screen.
                    {detailIsJointEvent
                      ? " Update participating societies below."
                      : " Add at least one other society below, then save."}
                  </AppText>
                  {formEditParticipatingSocieties.length > 0 ? (
                    <AppText variant="small" color="muted" style={{ marginTop: 6 }}>
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

            <View style={styles.formField}>
              <AppText variant="captionBold" style={styles.label}>Entry fee (optional)</AppText>
              <AppInput
                placeholder="e.g. £45 or £55 incl. food"
                value={formEntryFeeDisplay}
                onChangeText={setFormEntryFeeDisplay}
                autoCapitalize="none"
              />
              <AppText variant="small" color="muted" style={{ marginTop: 4 }}>
                Shown on the home screen and here.
              </AppText>
            </View>

            <View style={styles.formField}>
              <AppText variant="captionBold" style={styles.label}>Public RSVP deadline (optional)</AppText>
              <AppInput
                placeholder="YYYY-MM-DD"
                value={formRsvpDeadlineDate}
                onChangeText={setFormRsvpDeadlineDate}
                keyboardType="numbers-and-punctuation"
                autoCapitalize="none"
              />
              <View style={{ marginTop: spacing.xs }}>
                <AppInput
                  placeholder="Time HH:MM (24h), optional"
                  value={formRsvpDeadlineTime}
                  onChangeText={setFormRsvpDeadlineTime}
                  keyboardType="numbers-and-punctuation"
                  autoCapitalize="none"
                />
              </View>
              <AppText variant="small" color="muted" style={[styles.cardBodyText, { marginTop: 4 }]}>
                Empty date keeps the invite open. Date and time are saved using your device local timezone
                (not EXPO_PUBLIC_RSVP_DEADLINE_DISPLAY_TZ). Time defaults to 23:59 local if omitted.
              </AppText>
            </View>

            {/* Joint event toggle (always visible in edit — was previously only when already joint) */}
            {canEditEvent ? (
              <Pressable
                disabled={detailIsJointEvent}
                onPress={() => {
                  if (detailIsJointEvent) return;
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
                    opacity: detailIsJointEvent ? 0.75 : 1,
                  },
                ]}
              >
                <View style={styles.jointEventToggleText}>
                  <AppText variant="captionBold">{JOINT_EVENT_CHIP_LONG}</AppText>
                  <AppText variant="small" color="secondary">
                    {detailIsJointEvent
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
                    styles.jointEventTogglePill,
                    {
                      backgroundColor: formEditIsJointEvent ? colors.primary : colors.backgroundSecondary,
                      borderColor: formEditIsJointEvent ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <AppText variant="caption" color={formEditIsJointEvent ? "inverse" : "default"}>
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
              <View style={styles.teeSettingsToggleText}>
                <AppText variant="captionBold">Course / Tee Setup</AppText>
                <AppText variant="small" color="secondary">
                  For WHS handicap calculations
                </AppText>
              </View>
              <Feather
                name={showTeeSettings ? "chevron-up" : "chevron-down"}
                size={20}
                color={colors.textTertiary}
                style={styles.teeSettingsToggleChevron}
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
                    <AppText variant="small" color="muted" style={{ marginTop: 4 }}>Searching…</AppText>
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
                          style={({ pressed }) => [
                            styles.courseSearchResultRow,
                            {
                              borderBottomColor: "rgba(0,0,0,0.06)",
                              paddingVertical: spacing.sm,
                              paddingHorizontal: spacing.sm,
                              opacity: pressed ? 0.88 : 1,
                            },
                          ]}
                        >
                          <AppText variant="body" numberOfLines={1}>{hit.club_name || hit.name}</AppText>
                          {typeof hit.location === "string" && hit.location && (
                            <AppText variant="small" color="muted">{hit.location}</AppText>
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
                    <AppText variant="captionBold" style={styles.label}>Tees</AppText>
                    {teesLoading ? (
                      <AppText variant="small" color="muted">Importing course and tees…</AppText>
                    ) : tees.length > 0 ? (
                      !showManualTee ? (
                        <>
                          <CourseTeeSelector
                            sectionTitle="Men's tee (required)"
                            tees={menOptions}
                            selectedTee={selectedTee}
                            onSelectTee={(tee) => {
                              setSelectedTee(tee);
                              setShowManualTee(false);
                            }}
                          />
                          <CourseTeeSelector
                            sectionTitle="Ladies' tee (required)"
                            tees={ladiesOptions}
                            selectedTee={selectedLadiesTee}
                            onSelectTee={(tee) => setSelectedLadiesTee(tee)}
                          />
                          {ladiesOptions.length === 0 && (
                            <>
                              <InlineNotice
                                variant="info"
                                message="No ladies' tees found in course data. Enter ladies' tee ratings below (required)."
                                style={{ marginTop: spacing.sm }}
                              />
                              <AppText variant="captionBold" color="secondary" style={{ marginTop: spacing.sm }}>
                                Ladies&apos; tee — manual entry
                              </AppText>
                              <View style={styles.formField}>
                                <AppText variant="caption" style={styles.label}>Tee name</AppText>
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
                                <AppText variant="caption" style={styles.label}>Course rating</AppText>
                                <AppInput
                                  placeholder="e.g. 68.4"
                                  value={manualLadiesCourseRating}
                                  onChangeText={setManualLadiesCourseRating}
                                  keyboardType="decimal-pad"
                                />
                              </View>
                              <View style={styles.formField}>
                                <AppText variant="caption" style={styles.label}>Slope rating</AppText>
                                <AppInput
                                  placeholder="e.g. 120"
                                  value={manualLadiesSlopeRating}
                                  onChangeText={setManualLadiesSlopeRating}
                                  keyboardType="number-pad"
                                />
                              </View>
                            </>
                          )}
                        </>
                      ) : (
                        <AppText variant="small" color="muted" style={{ marginBottom: spacing.xs }}>
                          Using manual tee entry below.
                        </AppText>
                      )
                    ) : (
                      <AppText variant="small" color="muted" style={{ marginBottom: spacing.xs }}>
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
                    <View style={styles.manualTeeHeaderRow}>
                      <AppText variant="captionBold" style={styles.manualTeeHeaderTitle}>
                        Manual Tee Entry
                      </AppText>
                      {selectedTee ? (
                        <Pressable onPress={() => setShowManualTee(false)} style={styles.manualTeeHeaderLink}>
                          <AppText variant="small" color="primary">
                            Use selected tee instead
                          </AppText>
                        </Pressable>
                      ) : null}
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
                  <AppText variant="small" color="muted" style={{ marginTop: 4 }}>
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
    <Screen contentStyle={styles.screenContent}>
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

      {/* Joint Event — event_societies (≥2 societies); not raw events.is_joint_event */}
      {detailIsJointEvent && (
        <AppCard
          style={{
            marginBottom: spacing.base,
            borderWidth: 1,
            borderColor: colors.primary + "55",
            backgroundColor: colors.primary + "0C",
          }}
        >
          <View style={styles.jointBannerRow}>
            <Feather name="link" size={22} color={colors.primary} />
            <View style={styles.jointBannerTextCol}>
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
      {refreshing ? (
        <AppText variant="small" color="muted" style={{ marginBottom: spacing.xs }}>
          Refreshing...
        </AppText>
      ) : null}
      <AppText variant="title" style={[styles.eventDetailTitle, { marginBottom: spacing.sm }]}>
        {event.name}
      </AppText>

      {/* Details */}
      <AppCard style={styles.card}>
        <Row icon="calendar" label="Date" value={event.date ?? "TBC"} />
        <Row icon="map-pin" label="Course" value={event.courseName ?? "TBC"} />
        <Row icon="target" label="Format" value={formatLabel} />
        <Row icon="tag" label="Classification" value={classificationLabel} />
        {event.entryFeeDisplay?.trim() ? (
          <Row icon="credit-card" label="Entry" value={event.entryFeeDisplay.trim()} />
        ) : null}
        {formatRsvpDeadlineDisplay(event.rsvpDeadlineAt ?? event.rsvp_deadline_at) ? (
          <>
            <Row
              icon="clock"
              label="RSVP closes"
              value={formatRsvpDeadlineDisplay(event.rsvpDeadlineAt ?? event.rsvp_deadline_at) ?? ""}
            />
            <AppText variant="small" color="muted" style={[styles.cardBodyText, { marginTop: 4 }]}>
              {getRsvpDeadlineDisplayTimeZone()
                ? `Shown in ${getRsvpDeadlineDisplayTimeZone()} (set EXPO_PUBLIC_RSVP_DEADLINE_DISPLAY_TZ). Open/closed on the invite uses server UTC vs stored instant.`
                : "Shown in your device local timezone. Open/closed on the invite uses server time vs stored instant."}
            </AppText>
          </>
        ) : null}
      </AppCard>

      <AppCard style={styles.card}>
        <AppText variant="captionBold" color="secondary" style={{ marginBottom: spacing.xs }}>
          RSVP invite
        </AppText>
        <AppText variant="small" color="muted" style={[styles.cardBodyText, { marginBottom: spacing.sm }]}>
          Share a link — members or guests can respond in two taps (no app required for guests).
        </AppText>
        <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
          <SecondaryButton
            onPress={() => void handleShareEventInvite()}
            size="sm"
            style={{ flex: 1, minWidth: 120 }}
            icon={<Feather name="share-2" size={iconSize.sm} color={colors.primary} />}
          >
            Share link
          </SecondaryButton>
          <SecondaryButton
            onPress={() => void handleWhatsAppEventInvite()}
            size="sm"
            style={{ flex: 1, minWidth: 120 }}
            icon={<Feather name="message-circle" size={iconSize.sm} color={colors.primary} />}
          >
            WhatsApp
          </SecondaryButton>
        </View>
      </AppCard>

      {(canManageEventRoster || canEditEvent) && (
        <AppCard style={styles.card}>
          <AppText variant="captionBold" color="secondary" style={{ marginBottom: spacing.xs }}>
            RSVP snapshot (this society)
          </AppText>
          <AppText variant="body" color="secondary">
            {`${rsvpSummary.inCount} in · ${rsvpSummary.outCount} out · ${rsvpSummary.guestCount} guests · ${rsvpSummary.noResponseCount} no reply`}
          </AppText>
          <AppText variant="small" color="muted" style={[styles.cardBodyText, { marginTop: spacing.xs }]}>
            No reply = society members with no fee/RSVP row for this society on this event. Guests are counted
            separately.
          </AppText>
          {guestDuplicateExtraRows > 0 ? (
            <AppText variant="small" color="muted" style={{ marginTop: spacing.xs }}>
              {`${guestDuplicateExtraRows} guest row(s) share a name with another row (after normalising spaces and case). Remove extras on Players if needed.`}
            </AppText>
          ) : null}
        </AppCard>
      )}

      {/* Tee Settings - only show if configured */}
      {(event.teeName || event.par != null || event.slopeRating != null ||
        event.ladiesTeeName || event.ladiesPar != null || event.ladiesSlopeRating != null) && (
        <AppCard style={styles.card}>
          <AppText variant="captionBold" color="secondary" style={{ marginBottom: spacing.sm }}>
            Course / Tee Setup
          </AppText>
          {(event.teeName || event.par != null || event.courseRating != null || event.slopeRating != null) && (
            <>
              <AppText variant="caption" color="muted" style={{ marginBottom: spacing.xs }}>Male Tee</AppText>
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
              <AppText variant="caption" color="muted" style={{ marginTop: spacing.sm, marginBottom: spacing.xs }}>Female Tee</AppText>
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
            subtitle={detailIsJointEvent
              ? `${activeRosterCount} on roster (this society) · ${teeSheetEligibleCount} paid & confirmed (tee sheet) · ${pendingPaymentCount} payment pending · ${JOINT_EVENT_CHIP_SHORT}`
              : `${activeRosterCount} on roster · ${teeSheetEligibleCount} paid & confirmed (tee sheet) · ${pendingPaymentCount} payment pending`}
          />
        </AppCard>
      </Pressable>

      {canSharePaymentLists && societyId && event ? (
        <AppCard style={styles.card}>
          <AppText variant="h2" style={{ marginBottom: spacing.xs }}>
            Payments &amp; Share
          </AppText>
          <AppText variant="small" color="secondary" style={[styles.cardBodyText, { marginBottom: spacing.sm }]}>
            Lists are for this society only (no other club on joint events). Paid = confirmed &amp; paid — same as
            the tee sheet. Unpaid = payment still due or playing list without a fee row.
            {detailIsJointEvent ? ` ${JOINT_EVENT_CHIP_SHORT}` : ""}
          </AppText>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: spacing.md,
              marginBottom: spacing.base,
            }}
          >
            <AppText variant="bodyBold" style={{ color: colors.success }}>
              Paid {paymentShareLists.paidNames.length}
            </AppText>
            <AppText variant="bodyBold" style={{ color: colors.warning }}>
              Unpaid {paymentShareLists.unpaidNames.length}
            </AppText>
          </View>
          <SecondaryButton
            icon={<Feather name="share-2" size={16} color={colors.text} />}
            label="Share paid list"
            onPress={handleSharePaidList}
            style={{ marginBottom: spacing.sm }}
          />
          <SecondaryButton
            icon={<Feather name="share-2" size={16} color={colors.text} />}
            label="Share unpaid list"
            onPress={handleShareUnpaidList}
            style={{ marginBottom: spacing.sm }}
          />
          <SecondaryButton
            icon={<Feather name="share-2" size={16} color={colors.text} />}
            label="Share full status"
            onPress={handleShareFullPaymentStatus}
            style={{ marginBottom: spacing.sm }}
          />
          <SecondaryButton
            icon={<Feather name="file-text" size={16} color={colors.text} />}
            label={Platform.OS === "web" ? "Export PNG" : "Export PDF"}
            onPress={() => {
              void handleExportPaymentPdf();
            }}
            loading={paymentPdfBusy}
            disabled={paymentPdfBusy}
          />
        </AppCard>
      ) : null}

      {/* View Tee Sheet — published + active society is host or event_societies participant */}
      {event.teeTimePublishedAt && canShowMemberTeeSheetCta && (
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
                <AppText variant="bodyBold" style={styles.actionRowTitle}>View Tee Sheet</AppText>
                <AppText variant="caption" color="secondary" style={styles.actionRowSubtitle}>
                  Your tee time and full tee sheet
                </AppText>
              </View>
              <Feather name="chevron-right" size={20} color={colors.textTertiary} style={styles.actionRowChevron} />
            </View>
          </AppCard>
        </Pressable>
      )}

      {/* Society-scoped payment: paid = confirmed; tee sheet = paid + confirmed */}
      {(societyPageRegistrations.length > 0 ||
        societyGuests.length > 0 ||
        captainPickMemberIds.length > 0 ||
        notPlayingRegs.length > 0 ||
        (canManageEventRoster && manualAddCandidates.length > 0)) && (
        <AppCard style={styles.card}>
          {registrationsRefreshing ? (
            <AppText variant="small" color="muted" style={{ marginBottom: spacing.xs }}>
              Refreshing payment status...
            </AppText>
          ) : null}
          <View style={styles.paidHeader}>
            <View style={styles.paidHeaderMain}>
              <AppText variant="h2">Payment &amp; status</AppText>
              <AppText variant="small" color="secondary" style={styles.cardBodyText}>
                {detailIsJointEvent
                  ? "This list is only your society’s members/guests and fee rows. Switch society in the header to manage the other club. Marking paid confirms attendance."
                  : "Marking paid confirms attendance. Tee sheet (ManCo) uses only paid & confirmed players (including paid guests)."}
              </AppText>
              {detailIsJointEvent && societyId && hostSocietyId === societyId ? (
                <AppText variant="small" color="muted" style={[styles.cardBodyText, { marginTop: 4 }]}>
                  Host view: payment actions still apply only to members of the society selected above.
                </AppText>
              ) : null}
              <AppText variant="small" color="muted" style={[styles.cardBodyText, { marginTop: 4 }]}>
                {`${teeSheetEligibleCount} paid & confirmed · ${pendingPaymentCount} payment pending`}
                {captainPickMemberIds.length > 0
                  ? ` · ${captainPickMemberIds.length} on playing list without a fee row`
                  : ""}
              </AppText>
            </View>
            <View style={styles.paidHeaderBadgeWrap}>
              <StatusBadge
                label={
                  buckets.pendingPayment.length === 0 &&
                  captainPickMemberIds.length === 0 &&
                  guestPendingPayment.length === 0
                    ? "All paid"
                    : `${pendingPaymentCount} pending`
                }
                tone={
                  buckets.pendingPayment.length === 0 &&
                  captainPickMemberIds.length === 0 &&
                  guestPendingPayment.length === 0
                    ? "success"
                    : "warning"
                }
              />
            </View>
          </View>

          {canManageEventRoster && manualAddCandidates.length > 0 ? (
            <View style={{ marginBottom: spacing.sm }}>
              <SecondaryButton
                icon={<Feather name="user-plus" size={16} color={colors.text} />}
                label="Add society member to event…"
                onPress={() => {
                  setAddMemberSearch("");
                  setAddMemberModalOpen(true);
                }}
              />
              <AppText variant="small" color="muted" style={{ marginTop: spacing.xs }}>
                Includes members who have not joined the app yet. Mark them paid when ready — only paid &amp; confirmed
                players are used for the tee sheet.
              </AppText>
            </View>
          ) : null}

          {buckets.confirmedPaid.length > 0 ? (
            <AppText variant="subheading" color="secondary" style={{ marginTop: spacing.sm, marginBottom: spacing.xs }}>
              Confirmed &amp; paid (tee sheet)
            </AppText>
          ) : null}
          {buckets.confirmedPaid.map((reg) => (
            <View key={reg.id} style={[styles.paidRow, { borderBottomColor: colors.borderLight }]}>
              <View style={styles.paidLeftCol} pointerEvents="none">
                <AppText variant="body" numberOfLines={2} style={styles.paidNameText}>
                  {registrationMemberDisplayName(reg)}
                </AppText>
              </View>

              <View style={styles.paidRightCol}>
                <StatusBadge label={PaymentPill.paid} tone="success" />
                {canManagePayments && (
                  <Pressable
                    disabled={payBusy === reg.member_id}
                    onPress={() => {
                      void handleTogglePaid(reg);
                    }}
                    hitSlop={10}
                    style={({ pressed }) => [
                      styles.paidToggleBtn,
                      {
                        borderColor: colors.border,
                        opacity: pressed ? 0.6 : payBusy === reg.member_id ? 0.4 : 1,
                      },
                    ]}
                  >
                    <AppText variant="captionBold" color="primary">
                      Mark unpaid
                    </AppText>
                  </Pressable>
                )}
              </View>
            </View>
          ))}
          {guestConfirmedPaid.map((g) => (
            <View key={`guest-paid-${g.id}`} style={[styles.paidRow, { borderBottomColor: colors.borderLight }]}>
              <View style={styles.paidLeftCol} pointerEvents="none">
                <AppText variant="body" numberOfLines={2} style={styles.paidNameText}>
                  {g.name}
                </AppText>
                <View style={[styles.paidBadgeRow, { marginTop: 4 }]}>
                  <StatusBadge label="Guest" tone="info" />
                </View>
              </View>

              <View style={styles.paidRightCol}>
                <StatusBadge label={PaymentPill.paid} tone="success" />
                {canManagePayments && (
                  <Pressable
                    disabled={payBusy === `guest:${g.id}`}
                    onPress={() => {
                      void handleToggleGuestPaid(g);
                    }}
                    hitSlop={10}
                    style={({ pressed }) => [
                      styles.paidToggleBtn,
                      {
                        borderColor: colors.border,
                        opacity: pressed ? 0.6 : payBusy === `guest:${g.id}` ? 0.4 : 1,
                      },
                    ]}
                  >
                    <AppText variant="captionBold" color="primary">
                      Mark unpaid
                    </AppText>
                  </Pressable>
                )}
              </View>
            </View>
          ))}

          {(buckets.pendingPayment.length > 0 ||
            captainPickMemberIds.length > 0 ||
            guestPendingPayment.length > 0) ? (
            <AppText variant="subheading" color="secondary" style={{ marginTop: spacing.sm, marginBottom: spacing.xs }}>
              Pending payment
            </AppText>
          ) : null}
          {buckets.pendingPayment.map((reg) => (
            <View key={reg.id} style={[styles.paidRow, { borderBottomColor: colors.borderLight }]}>
              <View style={styles.paidLeftCol} pointerEvents="none">
                <AppText variant="body" numberOfLines={2} style={styles.paidNameText}>
                  {registrationMemberDisplayName(reg)}
                </AppText>
              </View>

              <View style={styles.paidRightCol}>
                <StatusBadge label={PaymentPill.unpaid} tone="warning" />
                {canManagePayments && (
                  <Pressable
                    disabled={payBusy === reg.member_id}
                    onPress={() => {
                      void handleTogglePaid(reg);
                    }}
                    hitSlop={10}
                    style={({ pressed }) => [
                      styles.paidToggleBtn,
                      {
                        borderColor: colors.border,
                        opacity: pressed ? 0.6 : payBusy === reg.member_id ? 0.4 : 1,
                      },
                    ]}
                  >
                    <AppText variant="captionBold" color="primary">
                      Mark paid
                    </AppText>
                  </Pressable>
                )}
              </View>
            </View>
          ))}
          {guestPendingPayment.map((g) => (
            <View key={`guest-unpaid-${g.id}`} style={[styles.paidRow, { borderBottomColor: colors.borderLight }]}>
              <View style={styles.paidLeftCol} pointerEvents="none">
                <AppText variant="body" numberOfLines={2} style={styles.paidNameText}>
                  {g.name}
                </AppText>
                <View style={[styles.paidBadgeRow, { marginTop: 4 }]}>
                  <StatusBadge label="Guest" tone="info" />
                </View>
              </View>

              <View style={styles.paidRightCol}>
                <StatusBadge label={PaymentPill.unpaid} tone="warning" />
                {canManagePayments && (
                  <Pressable
                    disabled={payBusy === `guest:${g.id}`}
                    onPress={() => {
                      void handleToggleGuestPaid(g);
                    }}
                    hitSlop={10}
                    style={({ pressed }) => [
                      styles.paidToggleBtn,
                      {
                        borderColor: colors.border,
                        opacity: pressed ? 0.6 : payBusy === `guest:${g.id}` ? 0.4 : 1,
                      },
                    ]}
                  >
                    <AppText variant="captionBold" color="primary">
                      Mark paid
                    </AppText>
                  </Pressable>
                )}
              </View>
            </View>
          ))}

          {captainPickMemberIds.map((mid) => (
            <View key={`lineup-${mid}`} style={[styles.paidRow, { borderBottomColor: colors.borderLight }]}>
              <View style={styles.paidLeftCol}>
                <AppText variant="body" numberOfLines={2} style={styles.paidNameText}>
                  {memberNameForAttendeeId(mid)}
                </AppText>
                <AppText
                  variant="caption"
                  color="muted"
                  style={styles.paidHelperText}
                  pointerEvents="none"
                >
                  Playing list · no fee row yet — actions create the fee record
                </AppText>
              </View>

              <View style={styles.paidRightCol}>
                <StatusBadge label={PaymentPill.unpaid} tone="warning" />
                {canManagePayments && (
                  <View style={styles.paidActionsStack}>
                    <Pressable
                      disabled={payBusy === mid}
                      onPress={() => {
                        void handleLineupMemberFeeAction(mid, true);
                      }}
                      hitSlop={10}
                      style={({ pressed }) => [
                        styles.paidToggleBtn,
                        {
                          borderColor: colors.border,
                          opacity: pressed ? 0.6 : payBusy === mid ? 0.4 : 1,
                        },
                      ]}
                    >
                      <AppText variant="captionBold" color="primary">
                        Mark paid
                      </AppText>
                    </Pressable>
                    <Pressable
                      disabled={payBusy === mid}
                      onPress={() => {
                        void handleLineupMemberFeeAction(mid, false);
                      }}
                      hitSlop={10}
                      style={({ pressed }) => [
                        styles.paidToggleBtn,
                        {
                          borderColor: colors.border,
                          opacity: pressed ? 0.6 : payBusy === mid ? 0.4 : 1,
                        },
                      ]}
                    >
                      <AppText variant="captionBold" color="secondary">
                        Record unpaid
                      </AppText>
                    </Pressable>
                  </View>
                )}
              </View>
            </View>
          ))}

          {notPlayingRegs.length > 0 && (
            <View
              style={{
                marginTop: spacing.sm,
                paddingTop: spacing.sm,
                borderTopWidth: 1,
                borderTopColor: colors.borderLight,
              }}
            >
              <AppText variant="subheading" color="muted" style={{ marginBottom: spacing.xs }}>
                Not playing / withdrawn
              </AppText>
              {notPlayingRegs.map((reg) => (
                <AppText key={reg.id} variant="small" color="muted" style={{ paddingVertical: 2 }}>
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
        <AppText variant="small" color="muted" style={styles.createdText}>
          Created {new Date(event.created_at).toLocaleDateString("en-GB")}
        </AppText>
      )}
      <Modal
        visible={addMemberModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => {
          if (!addMemberBusy) setAddMemberModalOpen(false);
        }}
      >
        <Pressable
          style={styles.addMemberModalBackdrop}
          onPress={() => {
            if (!addMemberBusy) setAddMemberModalOpen(false);
          }}
        >
          <Pressable style={[styles.addMemberModalCard, { backgroundColor: colors.background }]} onPress={(e) => e.stopPropagation()}>
            <AppText variant="h2" style={{ marginBottom: spacing.sm }}>
              Add to event
            </AppText>
            <AppText variant="small" color="secondary" style={{ marginBottom: spacing.sm }}>
              Choose a member of this society. They will appear under Pending payment until marked paid.
            </AppText>
            <AppInput
              placeholder="Search name or email"
              value={addMemberSearch}
              onChangeText={setAddMemberSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <ScrollView style={styles.searchResults} keyboardShouldPersistTaps="handled">
              {filteredManualAddCandidates.length === 0 ? (
                <AppText variant="small" color="muted" style={{ padding: spacing.sm }}>
                  {manualAddCandidates.length === 0
                    ? "All society members are already on this event."
                    : "No matching members"}
                </AppText>
              ) : (
                filteredManualAddCandidates.map((m) => {
                  const label = resolveAttendeeDisplayName(m, { memberId: m.id }).name;
                  const busy = addMemberBusy === m.id;
                  return (
                    <Pressable
                      key={m.id}
                      disabled={!!addMemberBusy}
                      onPress={() => {
                        void handleAdminAddMemberToEvent(m.id);
                      }}
                      style={({ pressed }) => [
                        styles.searchResultItem,
                        { opacity: pressed || busy ? 0.55 : 1 },
                      ]}
                    >
                      <AppText variant="body" numberOfLines={2}>
                        {label}
                      </AppText>
                      {!m.user_id ? (
                        <AppText variant="caption" color="muted">
                          No app account yet
                        </AppText>
                      ) : null}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
            {addMemberBusy ? (
              <AppText variant="small" color="muted" style={{ marginTop: spacing.xs }}>
                Adding member to event...
              </AppText>
            ) : null}
            <SecondaryButton
              disabled={!!addMemberBusy}
              style={{ marginTop: spacing.sm }}
              onPress={() => {
                setAddMemberModalOpen(false);
                setAddMemberSearch("");
              }}
            >
              Cancel
            </SecondaryButton>
          </Pressable>
        </Pressable>
      </Modal>

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
  const { width: windowWidth } = useWindowDimensions();
  const stackIcon = windowWidth < 360;

  const valueStr = safeValue(value);
  return (
    <View style={[styles.row, stackIcon && styles.rowStacked]}>
      <View style={styles.rowIconWrap}>
        <Feather name={icon} size={iconSize.sm} color={colors.primary} />
      </View>
      <View style={[styles.rowTextCol, stackIcon && styles.rowTextColWhenStacked]}>
        <AppText variant="caption" style={styles.rowLabel}>
          {label}
        </AppText>
        <AppText style={styles.rowValue}>{valueStr}</AppText>
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
      <View style={styles.actionRowIconWrap}>
        <Feather name={icon} size={iconSize.md} color={colors.primary} />
      </View>
      <View style={styles.actionRowTextCol}>
        <AppText variant="bodyBold" style={styles.actionRowTitle}>
          {title}
        </AppText>
        <AppText variant="caption" style={styles.actionRowSubtitle}>
          {subtitle}
        </AppText>
      </View>
      <Feather name="chevron-right" size={iconSize.md} color={colors.textTertiary} style={styles.actionRowChevron} />
    </View>
  );
}

/* ---------- Styles ---------- */

const styles = StyleSheet.create({
  screenContent: {
    // Keep lower attendance actions clear of any mobile bottom chrome/overlays.
    paddingBottom: spacing["3xl"] + 72,
  },
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
    width: "100%",
    maxWidth: "100%",
    alignSelf: "stretch",
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    width: "100%",
    minWidth: 0,
    marginBottom: spacing.md,
  },
  rowStacked: {
    flexDirection: "column",
    alignItems: "stretch",
  },
  rowIconWrap: {
    width: 24,
    alignItems: "center",
    paddingTop: 2,
    flexShrink: 0,
  },
  rowTextCol: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    marginLeft: spacing.sm,
  },
  rowTextColWhenStacked: {
    marginLeft: 0,
    marginTop: spacing.xs,
    width: "100%",
  },
  rowLabel: {
    flexShrink: 1,
  },
  rowValue: {
    marginTop: 2,
    flexShrink: 1,
  },
  actionCard: {
    marginBottom: spacing.sm,
    width: "100%",
    maxWidth: "100%",
    alignSelf: "stretch",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    width: "100%",
    minWidth: 0,
  },
  actionRowIconWrap: {
    paddingTop: 2,
    flexShrink: 0,
  },
  actionRowTextCol: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    marginLeft: spacing.sm,
    marginRight: spacing.xs,
  },
  actionRowTitle: {
    flexShrink: 1,
  },
  actionRowSubtitle: {
    marginTop: 2,
    flexShrink: 1,
  },
  actionRowChevron: {
    flexShrink: 0,
    marginTop: 2,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
    flexShrink: 0,
  },
  actionContent: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
  },
  paidHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginBottom: spacing.md,
    width: "100%",
    minWidth: 0,
  },
  paidHeaderMain: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
  },
  paidHeaderBadgeWrap: {
    flexShrink: 0,
    alignSelf: "flex-start",
  },
  cardBodyText: {
    width: "100%",
    maxWidth: "100%",
    flexShrink: 1,
  },
  jointBannerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    width: "100%",
    minWidth: 0,
  },
  jointBannerTextCol: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
  },
  paidRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    width: "100%",
    minWidth: 0,
  },
  paidLeftCol: {
    flex: 1,
    minWidth: 0,
    flexBasis: 0,
    overflow: "hidden",
    paddingRight: spacing.xs,
    zIndex: 1,
  },
  paidRightCol: {
    width: 152,
    minWidth: 132,
    maxWidth: "48%",
    alignItems: "flex-end",
    gap: 6,
    flexShrink: 0,
    zIndex: 3,
    elevation: 3,
    position: "relative",
  },
  paidActionsStack: {
    width: "100%",
    alignItems: "stretch",
    gap: 6,
  },
  paidNameText: {
    flexShrink: 1,
    minWidth: 0,
  },
  paidHelperText: {
    marginTop: 4,
    flexShrink: 1,
    minWidth: 0,
    maxWidth: "100%",
  },
  paidBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  paidToggleBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: radius.sm,
    width: "100%",
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
    width: "100%",
    minWidth: 0,
    gap: spacing.sm,
  },
  teeSettingsToggleText: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    paddingRight: spacing.xs,
  },
  teeSettingsToggleChevron: {
    flexShrink: 0,
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
  courseSearchResultRow: {
    borderBottomWidth: 1,
    gap: 2,
  },
  manualTeeContainer: {
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: "rgba(0,0,0,0.02)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    marginBottom: spacing.base,
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
  },
  manualTeeHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.sm,
    width: "100%",
    minWidth: 0,
    gap: spacing.sm,
  },
  manualTeeHeaderTitle: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
  },
  manualTeeHeaderLink: {
    flexShrink: 0,
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
    width: "100%",
    minWidth: 0,
    gap: spacing.sm,
  },
  jointEventToggleText: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    paddingRight: spacing.xs,
  },
  jointEventTogglePill: {
    flexShrink: 0,
    alignSelf: "flex-start",
  },
  eventDetailTitle: {
    width: "100%",
    maxWidth: "100%",
    flexShrink: 1,
  },
  addMemberModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
    padding: spacing.base,
  },
  addMemberModalCard: {
    borderRadius: radius.md,
    padding: spacing.base,
    maxHeight: "85%",
  },
});
