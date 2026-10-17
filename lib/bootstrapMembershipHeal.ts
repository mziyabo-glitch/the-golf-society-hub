/**
 * Pure rules for bootstrap “self-heal” of profiles.active_society_id when membership list is loaded.
 * See useBootstrap Step 3 — must not heal away from a valid post-join society when the list lags.
 */

export function shouldBootstrapSelfHealActiveSociety(p: {
  membershipCount: number;
  activeMissing: boolean;
  /** Profile has active_society_id but it is not in the current membership list snapshot. */
  activeStaleInList: boolean;
  /** A members row exists for this user in profiles.active_society_id (list may lag). */
  userHasDirectMemberForActive: boolean;
}): boolean {
  if (p.membershipCount === 0) return false;
  if (p.activeMissing) return true;
  if (p.activeStaleInList && !p.userHasDirectMemberForActive) return true;
  return false;
}
