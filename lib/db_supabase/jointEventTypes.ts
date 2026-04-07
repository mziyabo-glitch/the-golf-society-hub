/**
 * Phase 2 Joint Events: TypeScript types for the normalized joint event detail payload.
 * Matches the structure returned by get_joint_event_detail RPC.
 *
 * These types are additive; they do not replace EventDoc or existing event types.
 */

import type { EventFormat, EventClassification } from "@/lib/db_supabase/eventRepo";

/** Core event fields in the joint event payload (snake_case from RPC) */
export interface JointEventDetailEvent {
  id: string;
  title: string;
  event_date: string | null;
  format: string;
  classification: string;
  host_society_id: string;
  society_id: string;
  is_joint_event: boolean;
  status: string;
  course_id: string | null;
  course_name: string | null;
  created_by: string | null;
  created_at: string | null;
  tee_id: string | null;
  tee_name: string | null;
  par: number | null;
  course_rating: number | null;
  slope_rating: number | null;
  handicap_allowance: number | null;
  ladies_tee_name: string | null;
  ladies_par: number | null;
  ladies_course_rating: number | null;
  ladies_slope_rating: number | null;
  tee_time_start: string | null;
  tee_time_interval: number | null;
  tee_time_published_at: string | null;
  nearest_pin_holes: number[] | null;
  longest_drive_holes: number[] | null;
  tee_source: string | null;
  income_pence: number | null;
  costs_pence: number | null;
  is_completed: boolean | null;
  is_oom: boolean | null;
  /** Public invite RSVP cutoff (timestamptz ISO from API) */
  rsvp_deadline_at: string | null;
}

/** Participating society in a joint event */
export interface JointEventSociety {
  event_society_id: string;
  society_id: string;
  society_name: string;
  role: "host" | "participant";
  has_society_oom: boolean;
  society_oom_name: string;
}

/** Per-society eligibility for an entry */
export interface JointEventEntryEligibility {
  society_id: string;
  is_eligible_for_society_results: boolean;
  is_eligible_for_society_oom: boolean;
  manual_override_reason: string | null;
}

/** Single entry (player) in a joint event */
export interface JointEventEntry {
  event_entry_id: string;
  player_id: string;
  player_name: string;
  tee_id: string | null;
  tee_name: string;
  status: string;
  pairing_group: number | null;
  pairing_position: number | null;
  is_scoring: boolean;
  society_memberships: string[];
  eligibility: JointEventEntryEligibility[];
}

/** Leaderboard scope (overall or per-society) */
export interface JointEventLeaderboardScope {
  scope_type: "overall" | "society";
  society_id: string | null;
  label: string;
  has_oom: boolean;
}

/** Meta/permissions in the payload */
export interface JointEventDetailMeta {
  can_manage_event: boolean;
  can_score_event: boolean;
  can_publish_results: boolean;
  generated_at: string;
  has_entries: boolean;
  has_participating_societies: boolean;
}

/** Full normalized payload from get_joint_event_detail RPC */
export interface JointEventDetail {
  event: JointEventDetailEvent;
  participating_societies: JointEventSociety[];
  entries: JointEventEntry[];
  leaderboard_scopes: JointEventLeaderboardScope[];
  meta: JointEventDetailMeta;
}

// =============================================================================
// Phase 3: Create/Edit input types
// =============================================================================

/** Single participating society for create/update */
export interface EventSocietyInput {
  society_id: string;
  society_name?: string; // for display; not persisted to event_societies
  role: "host" | "participant";
  has_society_oom: boolean;
  society_oom_name?: string | null;
}

/** Base event fields shared by create and update */
export interface JointEventBaseInput {
  name: string;
  date?: string;
  format: EventFormat;
  classification: EventClassification;
  courseId?: string;
  courseName?: string;
  teeId?: string | null;
  teeName?: string;
  par?: number;
  courseRating?: number;
  slopeRating?: number;
  handicapAllowance?: number;
  ladiesTeeName?: string;
  ladiesPar?: number;
  ladiesCourseRating?: number;
  ladiesSlopeRating?: number;
  teeSource?: "imported" | "manual";
  /** Optional entry fee label for members */
  entryFeeDisplay?: string | null;
  /** Public invite RSVP cutoff (ISO timestamptz); null clears */
  rsvpDeadlineAt?: string | null;
}

/** Input for creating a joint event */
export interface JointEventCreateInput extends JointEventBaseInput {
  is_joint_event: boolean;
  host_society_id: string;
  participating_societies: EventSocietyInput[];
  createdBy?: string;
}

/** Input for updating a joint event */
export interface JointEventUpdateInput extends JointEventBaseInput {
  is_joint_event?: boolean;
  host_society_id?: string;
  participating_societies?: EventSocietyInput[];
}

/**
 * Form state for the joint-event section of create/edit UI.
 * Holds only the joint-specific fields; base event fields live in screen state.
 */
export interface JointEventFormState {
  /** Whether the event is a joint event (2+ societies). */
  isJointEvent: boolean;
  /** Society designated as host. */
  hostSocietyId: string;
  /** All participating societies (host + participants). */
  participatingSocieties: EventSocietyInput[];
}

// =============================================================================
// Phase 4: Joint event tee sheet read model
// =============================================================================

/** One player row in the joint event tee sheet (no duplicates; one per event_entry) */
export interface JointEventTeeSheetEntry {
  event_entry_id: string;
  player_id: string;
  player_name: string;
  tee_id: string | null;
  tee_name: string;
  tee_time: string | null;
  pairing_group: number | null;
  pairing_position: number | null;
  status: string;
  society_memberships: string[];
  /** Primary society for display (e.g. first in list or host); optional badge label */
  primary_display_society: string | null;
  /** Handicap index if available from member data */
  handicap_index: number | null;
  /**
   * When one real person had multiple `event_entries` (e.g. dual society membership),
   * all row ids that must receive the same pairing on save/publish.
   */
  all_event_entry_ids?: string[];
}

/** One group in the tee sheet (event-wide; may contain mixed societies) */
export interface JointEventTeeSheetGroup {
  group_number: number;
  tee_time: string | null;
  entries: JointEventTeeSheetEntry[];
}

/** Normalized tee-sheet-ready payload for joint events */
export interface JointEventTeeSheet {
  event: JointEventDetailEvent;
  participating_societies: JointEventSociety[];
  groups: JointEventTeeSheetGroup[];
  /** Flat list of all entries (one per player); empty array if none */
  entries: JointEventTeeSheetEntry[];
  is_joint_event: boolean;
  is_published: boolean;
  generated_at: string;
}
