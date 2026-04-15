/** Domain types for Event Prize Pools (prize allocation after official results). */

export type PrizePoolPayoutMode = "overall" | "division";
export type PrizePoolDivisionSource = "none" | "event";
export type PrizePoolStatus = "draft" | "calculated" | "finalised";
export type PrizePoolCompetitionType = "standard" | "splitter";
export type PrizePoolTotalAmountMode = "manual" | "per_entrant";

export type EventPrizePoolRow = {
  id: string;
  event_id: string;
  host_society_id: string | null;
  name: string;
  competition_name: string;
  competition_type: PrizePoolCompetitionType;
  description: string | null;
  total_amount_pence: number;
  total_amount_mode: PrizePoolTotalAmountMode;
  pot_entry_value_pence: number | null;
  birdie_fallback_to_overall: boolean;
  payout_mode: PrizePoolPayoutMode;
  division_source: PrizePoolDivisionSource;
  places_paid: number;
  status: PrizePoolStatus;
  include_guests: boolean;
  require_paid: boolean;
  require_confirmed: boolean;
  notes: string | null;
  last_calculated_at: string | null;
  finalised_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type EventPrizePoolRuleRow = {
  id: string;
  pool_id: string;
  position: number;
  percentage_basis_points: number;
  created_at: string;
};

export type EventPrizePoolResultRow = {
  id: string;
  pool_id: string;
  event_id: string;
  member_id: string | null;
  event_guest_id: string | null;
  event_registration_id: string | null;
  division_name: string | null;
  finishing_position: number;
  tie_size: number;
  payout_amount_pence: number;
  calculation_note: string | null;
  score_display: string | null;
  created_at: string;
};

export type EventDivisionRow = {
  id: string;
  event_id: string;
  name: string;
  sort_order: number;
  min_handicap: number | null;
  max_handicap: number | null;
  created_at: string;
};

export type PrizePoolRuleInput = {
  position: number;
  percentage_basis_points: number;
};

export type CreateEventPrizePoolInput = {
  eventId: string;
  hostSocietyId: string | null;
  name: string;
  competitionName: string;
  competitionType: PrizePoolCompetitionType;
  description?: string | null;
  totalAmountPence: number;
  totalAmountMode: PrizePoolTotalAmountMode;
  potEntryValuePence?: number | null;
  birdieFallbackToOverall: boolean;
  payoutMode: PrizePoolPayoutMode;
  divisionSource: PrizePoolDivisionSource;
  placesPaid: number;
  includeGuests: boolean;
  requirePaid: boolean;
  requireConfirmed: boolean;
  notes?: string | null;
  rules: PrizePoolRuleInput[];
};

export type UpdateEventPrizePoolPatch = Partial<{
  name: string;
  competitionName: string;
  competitionType: PrizePoolCompetitionType;
  description: string | null;
  totalAmountPence: number;
  totalAmountMode: PrizePoolTotalAmountMode;
  potEntryValuePence: number | null;
  birdieFallbackToOverall: boolean;
  payoutMode: PrizePoolPayoutMode;
  divisionSource: PrizePoolDivisionSource;
  placesPaid: number;
  includeGuests: boolean;
  requirePaid: boolean;
  requireConfirmed: boolean;
  notes: string | null;
}>;

/** One participant row used in ranking (tests + engine). */
export type PrizePoolEntrant = {
  /** Member id, or `guest:${event_guests.id}` for guests */
  participantKey: string;
  memberId: string | null;
  guestId: string | null;
  displayName: string;
  societyId: string;
  registrationId: string | null;
  divisionName: string | null;
  /** stableford points or net/gross strokes from official results */
  dayValue: number;
  /** Detailed official result fields required for splitter calculation. */
  front9Value: number | null;
  back9Value: number | null;
  birdieCount: number | null;
  /** Sort helper: lower is better for stroke formats */
  sortOrder: "high_wins" | "low_wins";
};

export type PrizePoolCalculationResultRow = {
  participantKey: string;
  memberId: string | null;
  guestId: string | null;
  eventRegistrationId: string | null;
  divisionName: string | null;
  finishingPosition: number;
  tieSize: number;
  payoutAmountPence: number;
  calculationNote: string | null;
  scoreDisplay: string | null;
};

export const PRIZE_POOL_PAYOUT_TEMPLATES: Record<number, number[]> = {
  1: [100],
  2: [60, 40],
  3: [50, 30, 20],
  4: [40, 30, 20, 10],
  5: [35, 25, 20, 12, 8],
};

export type PrizePoolParticipantType = "member" | "guest";

/**
 * Row shape for `public.event_prize_pool_entries`.
 *
 * Canonical entrant state:
 * - **Member:** `participant_type = 'member'`, `member_id` set, `guest_id` null.
 *   `opted_in` = home-card request; `confirmed_by_pot_master` = Pot Master confirmed for pool math.
 * - **Guest:** `participant_type = 'guest'`, `guest_id` set, `member_id` null.
 *   Guests are added by Pot Master (`opted_in` is typically true from RPC).
 *
 * `pool_id` scopes opt-in and confirmation to one prize pool (competition) on the event.
 */
export type EventPrizePoolEntryRow = {
  id: string;
  event_id: string;
  pool_id: string;
  member_id: string | null;
  guest_id: string | null;
  participant_name: string | null;
  participant_type: PrizePoolParticipantType;
  opted_in: boolean;
  confirmed_by_pot_master: boolean;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
};

/** PostgREST `select=` fragment — columns after migration 104. */
export const EVENT_PRIZE_POOL_ENTRY_COLUMNS =
  "id,event_id,pool_id,member_id,guest_id,participant_name,participant_type,opted_in,confirmed_by_pot_master,confirmed_at,created_at,updated_at" as const;

/** Home dashboard: one prize pool with the signed-in member’s entry, rules, and optional published result. */
export type HomePrizePoolRowVm = {
  pool: EventPrizePoolRow;
  entry: EventPrizePoolEntryRow | null;
  rules: EventPrizePoolRuleRow[];
  hasPublishedResults: boolean;
  myResult: EventPrizePoolResultRow | null;
};
