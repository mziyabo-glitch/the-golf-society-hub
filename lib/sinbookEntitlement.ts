// lib/sinbookEntitlement.ts
// Simple entitlement gate for Sinbook.
// Free: 1 rivalry. Pro (£10): unlimited + season-long + private.
// Payments stubbed — flip isPro() when IAP is wired.

import { countMySinbooks } from "@/lib/db_supabase/sinbookRepo";

const FREE_LIMIT = 1;

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
  if (count >= FREE_LIMIT) {
    return {
      allowed: false,
      reason: `Free accounts are limited to ${FREE_LIMIT} rivalry. Upgrade to Pro for unlimited rivalries, season-long tracking, and private rivalries.`,
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
