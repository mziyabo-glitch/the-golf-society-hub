// lib/sinbookEntitlement.ts
// Simple entitlement gate for Sinbook.
// Trial: unlimited rivalries. Pro (£10): season-long + private.
// Payments stubbed — flip isPro() when IAP is wired.

import { countMySinbooks } from "@/lib/db_supabase/sinbookRepo";

/** Trial allows unlimited sinbooks. Set to a number to enforce a limit later. */
const TRIAL_SINBOOK_LIMIT = 999;

/**
 * Stub: returns true if user has Pro entitlement.
 * Replace with real IAP / RevenueCat check later.
 */
export function isPro(): boolean {
  // TODO: wire to actual payment status
  return false;
}

/**
 * Can the user create a new sinbook?
 */
export async function canCreateSinbook(): Promise<{ allowed: boolean; reason?: string }> {
  if (isPro()) return { allowed: true };

  const count = await countMySinbooks();
  if (count >= TRIAL_SINBOOK_LIMIT) {
    return {
      allowed: false,
      reason: `Limit of ${TRIAL_SINBOOK_LIMIT} rivalries reached. Upgrade to Pro for more.`,
    };
  }

  return { allowed: true };
}

/**
 * Can the user use Pro features (season, private)?
 */
export function canUseProFeatures(): boolean {
  return isPro();
}
