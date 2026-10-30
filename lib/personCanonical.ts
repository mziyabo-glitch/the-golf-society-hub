/**
 * Canonical data boundaries (single source of truth)
 *
 * **Global profile (`profiles` row, keyed by auth user id)**  
 * Identity and cross-society fields: `full_name`, `sex`, `email` (mirror of auth), `whs_index` when the user
 * has no society membership row yet, `active_society_id` / `active_member_id`, `profile_complete`.
 *
 * **Society membership (`members` row)**  
 * Society-scoped fields: `handicap_index`, `handicap_lock`, `whs_number`, `role`, fees/paid flags,
 * `gender` (playing / tee), `has_seat`, and the denormalized **`name`** used in lists, tee sheets, and
 * `resolveAttendeeDisplayName` (member.name is checked before profile-style fallbacks).
 *
 * **Consistency rule**  
 * When a linked user updates their global name via My Profile, the app should call the server RPC
 * `sync_my_membership_names_from_profile()` so `members.name` is updated across all linked societies.
 * When they edit their own name on the member detail screen, mirror `full_name` on `profiles` so
 * Settings / onboarding stay aligned.
 *
 * Helpers below are optional conveniences; repository calls remain the source of writes.
 */

export type GlobalPersonFields = {
  full_name: string | null;
  sex: string | null;
  email: string | null;
  whs_index: number | null;
};

export type SocietyMembershipFields = {
  name: string | null | undefined;
  handicap_index: number | null | undefined;
  whs_number: string | null | undefined;
  role: string | null | undefined;
  gender: string | null | undefined;
};

/** Prefer member handicap when in a society; otherwise profile WHS. */
export function canonicalHandicapIndex(opts: {
  memberHandicap: number | null | undefined;
  profileWhs: number | null | undefined;
  hasMemberRow: boolean;
}): number | null {
  if (opts.hasMemberRow) {
    const m = opts.memberHandicap;
    return m != null && Number.isFinite(Number(m)) ? Number(m) : null;
  }
  const p = opts.profileWhs;
  return p != null && Number.isFinite(Number(p)) ? Number(p) : null;
}
