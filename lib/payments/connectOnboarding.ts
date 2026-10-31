import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { getServiceRoleSupabase } from "@/lib/server/supabaseServiceRole";
import { assertStripeTestMode, serverAppBaseUrl } from "@/lib/payments/checkoutAttempt";
import { assertUuid } from "@/lib/payments/checkoutValidation";

export type ConnectOnboardingResult =
  | { status: number; body: { url: string; accountId: string } }
  | { status: number; body: { error: string } };

type ConnectDeps = {
  stripeKey: string;
  loadCallerRole: (userId: string, societyId: string) => Promise<string | null>;
  loadAccountId: (societyId: string) => Promise<string | null>;
  saveAccountId: (societyId: string, accountId: string) => Promise<void>;
  confirmAccountExclusive: (societyId: string, accountId: string) => Promise<void>;
  createExpressAccount: () => Promise<string>;
  createAccountLink: (accountId: string, refreshUrl: string, returnUrl: string) => Promise<string>;
  getUserId: (accessToken: string) => Promise<string | null>;
};

function connectOwnershipConflict(err: unknown): string | null {
  const message = err instanceof Error ? err.message : String(err);
  if (/stripe_connect_account_already_bound|stripe_connect_account_society_mismatch|societies_stripe_connect_account_id_uq|duplicate key/i.test(message)) {
    return "That Stripe account is already connected to another society";
  }
  return null;
}

function userClient(accessToken: string) {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
  const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) throw new Error("Supabase URL/anon key missing");
  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function defaultDeps(): ConnectDeps {
  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim() || "";
  const stripe = stripeKey ? new Stripe(stripeKey) : null;
  const admin = getServiceRoleSupabase();
  return {
    stripeKey,
    async getUserId(accessToken) {
      const client = userClient(accessToken);
      const { data, error } = await client.auth.getUser(accessToken);
      if (error || !data.user) return null;
      return data.user.id;
    },
    async loadCallerRole(userId, societyId) {
      const { data } = await admin
        .from("members")
        .select("role")
        .eq("user_id", userId)
        .eq("society_id", societyId)
        .maybeSingle();
      return (data?.role as string | null) ?? null;
    },
    async loadAccountId(societyId) {
      const { data } = await admin
        .from("societies")
        .select("stripe_connect_account_id")
        .eq("id", societyId)
        .maybeSingle();
      return (data?.stripe_connect_account_id as string | null) ?? null;
    },
    async saveAccountId(societyId, accountId) {
      const { error } = await admin.rpc("assign_society_stripe_connect_account", {
        p_society_id: societyId,
        p_account_id: accountId,
      });
      if (error) throw new Error(error.message);
    },
    async confirmAccountExclusive(societyId, accountId) {
      const { data, error } = await admin
        .from("societies")
        .select("id")
        .eq("stripe_connect_account_id", accountId)
        .neq("id", societyId)
        .limit(1);
      if (error) throw new Error(error.message);
      if ((data ?? []).length > 0) throw new Error("stripe_connect_account_already_bound");
    },
    async createExpressAccount() {
      if (!stripe) throw new Error("STRIPE_SECRET_KEY is not configured");
      const account = await stripe.accounts.create({
        type: "express",
        country: "GB",
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      });
      return account.id;
    },
    async createAccountLink(accountId, refreshUrl, returnUrl) {
      if (!stripe) throw new Error("STRIPE_SECRET_KEY is not configured");
      const link = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: "account_onboarding",
      });
      return link.url;
    },
  };
}

export async function handleConnectOnboarding(
  input: { authorizationHeader: string | null | undefined; rawBody: unknown },
  deps?: ConnectDeps,
): Promise<ConnectOnboardingResult> {
  const runtime = deps ?? defaultDeps();
  const testModeError = assertStripeTestMode(runtime.stripeKey);
  if (testModeError) return { status: 403, body: { error: testModeError } };

  const token = input.authorizationHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { status: 401, body: { error: "Missing authorization" } };
  const body = input.rawBody as { societyId?: string } | null;
  const societyId = body?.societyId?.trim() || "";
  try {
    assertUuid(societyId, "societyId");
  } catch (err) {
    return { status: 400, body: { error: (err as Error).message } };
  }

  const userId = await runtime.getUserId(token);
  if (!userId) return { status: 401, body: { error: "Invalid session" } };
  const role = (await runtime.loadCallerRole(userId, societyId))?.toUpperCase() ?? "";
  if (role !== "CAPTAIN" && role !== "TREASURER") {
    return { status: 403, body: { error: "Only a Captain or Treasurer can connect Stripe" } };
  }

  let accountId = await runtime.loadAccountId(societyId);
  if (!accountId) {
    accountId = await runtime.createExpressAccount();
    try {
      await runtime.saveAccountId(societyId, accountId);
    } catch (err) {
      const owned = connectOwnershipConflict(err);
      if (owned) return { status: 409, body: { error: owned } };
      throw err;
    }
  }
  try {
    await runtime.confirmAccountExclusive(societyId, accountId);
  } catch (err) {
    const owned = connectOwnershipConflict(err);
    if (owned) return { status: 409, body: { error: owned } };
    throw err;
  }
  const base = serverAppBaseUrl(process.env.EXPO_PUBLIC_WEB_APP_URL);
  const url = await runtime.createAccountLink(
    accountId,
    `${base}/treasurer?connect=refresh`,
    `${base}/treasurer?connect=return`,
  );
  return { status: 200, body: { url, accountId } };
}
