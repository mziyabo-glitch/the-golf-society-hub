import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { handleCreateEventCheckoutSession } from "@/lib/payments/createCheckoutSessionHandler";
import { handleCreateGuestCheckoutSession } from "@/lib/payments/guestCheckout";
import { refundCreateParams } from "@/lib/payments/refundEventPayment";
import { sessionParams, type PendingPaymentInsert } from "@/lib/payments/runEventCheckout";
import {
  STAGING_PLATFORM_CHARGE_METADATA_KEY,
  STAGING_PLATFORM_CHARGE_METADATA_VALUE,
  STAGING_PLATFORM_CHARGE_ROUTE,
  stagingPlatformChargeDecision,
  stagingPlatformChargePermitted,
} from "@/lib/payments/stagingPlatformCharge";
import { connectedDestinationAccountId, handleStripeWebhook } from "@/lib/payments/stripeWebhookHandler";
import { verifyPaidCheckout } from "@/lib/payments/webhookVerification";

const txId = "00000000-0000-4000-8000-000000000010";
const eventId = "00000000-0000-4000-8000-000000000011";
const societyId = "00000000-0000-4000-8000-000000000012";
const memberId = "00000000-0000-4000-8000-000000000014";
const guestId = "00000000-0000-4000-8000-000000000071";
const token = "ab".repeat(32);
const safeEnv = {
  STAGING_PLATFORM_ONLY_PAYMENTS: "true",
  SUPABASE_URL: "http://127.0.0.1:54321",
  EXPO_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NODE_ENV: "test",
  STRIPE_SECRET_KEY: "sk_test_unit",
};
const offEnv = { ...safeEnv, STAGING_PLATFORM_ONLY_PAYMENTS: "false" };

function memberDeps(opts: {
  env: Record<string, string | undefined>;
  chargesEnabled: boolean;
  connectAccountId: string | null;
  created: Stripe.Checkout.SessionCreateParams[];
  inserted: PendingPaymentInsert[];
}) {
  return {
    stripeKey: "sk_test_unit",
    env: opts.env,
    prepare: async () => ({
      ok: true as const,
      checkout: {
        amountPence: 2500,
        idempotencyKey: "idem-1234",
        payerType: "member" as const,
        memberId,
        guestId: null,
        eventId,
        societyId,
        beneficiarySocietyId: societyId,
        societyName: "Staging M4",
        beneficiarySocietyName: "Staging M4",
        eventName: "Staging M4 v ZGS",
        eventDateSnapshot: null,
        payerDisplayName: "Player",
        connectAccountId: opts.connectAccountId,
        beneficiaryChargesEnabled: opts.chargesEnabled,
        successUrl: "http://127.0.0.1:8081/event/ok?payment=success",
        cancelUrl: "http://127.0.0.1:8081/event/ok?payment=canceled",
        rows: [],
        keyed: null,
      },
    }),
    stripe: {
      retrieveSession: async () => {
        throw new Error("should not retrieve");
      },
      expireSession: async () => undefined,
      createSession: async (params: Stripe.Checkout.SessionCreateParams) => {
        opts.created.push(params);
        return { id: "cs_platform", url: "https://checkout.stripe.test/c/pay" };
      },
    },
    store: {
      cancelPending: async () => undefined,
      insertPending: async (row: PendingPaymentInsert) => {
        opts.inserted.push(row);
        return txId;
      },
      saveSessionId: async () => undefined,
    },
  };
}

function guestContext(chargesEnabled: boolean, connectAccountId: string | null) {
  return {
    invitation: {
      eventId,
      societyId,
      guestId,
      expiresAt: "2099-01-01T00:00:00.000Z",
      consumedAt: null,
    },
    guest: { id: guestId, event_id: eventId, society_id: societyId, paid: false, name: "Guest" },
    event: { id: eventId, society_id: societyId, name: "Staging M4 v ZGS", date: "2026-11-20", guest_entry_fee_pence: 2500 },
    society: {
      id: societyId,
      name: "Staging M4",
      online_payments_enabled: true,
      stripe_connect_account_id: connectAccountId,
      stripe_connect_charges_enabled: chargesEnabled,
    },
    rows: [],
    keyed: null,
  };
}

function guestDeps(opts: {
  env: Record<string, string | undefined>;
  chargesEnabled: boolean;
  connectAccountId: string | null;
  created: Stripe.Checkout.SessionCreateParams[];
  inserted: PendingPaymentInsert[];
}) {
  return {
    stripeKey: "sk_test_unit",
    env: opts.env,
    markInvitationUsed: async () => undefined,
    loadContext: async () => guestContext(opts.chargesEnabled, opts.connectAccountId),
    stripe: {
      retrieveSession: async () => {
        throw new Error("should not retrieve");
      },
      expireSession: async () => undefined,
      createSession: async (params: Stripe.Checkout.SessionCreateParams) => {
        opts.created.push(params);
        return { id: "cs_guest_platform", url: "https://checkout.stripe.test/c/guest" };
      },
    },
    store: {
      cancelPending: async () => undefined,
      insertPending: async (row: PendingPaymentInsert) => {
        opts.inserted.push(row);
        return txId;
      },
      saveSessionId: async () => undefined,
    },
  };
}

describe("staging platform charges", () => {
  it("is off unless the flag is exactly true, and refuses production", () => {
    expect(stagingPlatformChargeDecision({ chargesEnabled: false, connectAccountId: null }).mode).toBe("off");
    expect(stagingPlatformChargeDecision({
      env: { ...safeEnv, STAGING_PLATFORM_ONLY_PAYMENTS: "TRUE" },
      chargesEnabled: false,
      connectAccountId: null,
    }).mode).toBe("off");
    expect(stagingPlatformChargePermitted({ ...safeEnv, NODE_ENV: "production" })).toBe(false);
    expect(stagingPlatformChargePermitted({
      ...safeEnv,
      SUPABASE_URL: "https://eaenzjwecrrbhibrvgsb.supabase.co",
    })).toBe(false);
    expect(stagingPlatformChargePermitted(safeEnv, "sk_live_secret")).toBe(false);
    expect(stagingPlatformChargePermitted(safeEnv)).toBe(true);
    expect(connectedDestinationAccountId({ on_behalf_of: "acct_behalf" })).toBe("acct_behalf");
    expect(connectedDestinationAccountId({})).toBeNull();
    expect(refundCreateParams("pi_platform", null)).toEqual({ payment_intent: "pi_platform" });
    expect(refundCreateParams("pi_connect", "acct_ready")).toEqual({
      payment_intent: "pi_connect",
      reverse_transfer: true,
    });
  });

  it("flag off still requires a charges-enabled Connect account", async () => {
    const created: Stripe.Checkout.SessionCreateParams[] = [];
    const inserted: PendingPaymentInsert[] = [];
    const member = await handleCreateEventCheckoutSession(
      {
        authorizationHeader: "Bearer token",
        idempotencyKey: "idem-1234",
        rawBody: { eventId, societyId, payerType: "member" },
      },
      memberDeps({ env: offEnv, chargesEnabled: false, connectAccountId: "acct_stored", created, inserted }),
    );
    expect(member.status).toBe(403);
    const ready = await handleCreateEventCheckoutSession(
      {
        authorizationHeader: "Bearer token",
        idempotencyKey: "idem-1234",
        rawBody: { eventId, societyId, payerType: "member" },
      },
      memberDeps({ env: offEnv, chargesEnabled: true, connectAccountId: "acct_ready", created, inserted }),
    );
    expect(ready.status).toBe(200);
    expect(created).toHaveLength(1);
    expect(created[0]?.payment_intent_data?.transfer_data?.destination).toBe("acct_ready");
    expect(created[0]?.payment_intent_data?.on_behalf_of).toBeUndefined();
    expect(created[0]?.metadata?.[STAGING_PLATFORM_CHARGE_METADATA_KEY]).toBeUndefined();
    expect(inserted[0]?.stripeConnectAccountId).toBe("acct_ready");

    const guestCreated: Stripe.Checkout.SessionCreateParams[] = [];
    const guestOff = await handleCreateGuestCheckoutSession(
      { idempotencyKey: "idem-1234", rawBody: { paymentToken: token, eventId, societyId, guestId, amountPence: 2500 } },
      guestDeps({ env: offEnv, chargesEnabled: false, connectAccountId: "acct_stored", created: guestCreated, inserted: [] }),
    );
    expect(guestOff.status).toBe(403);
    expect(guestCreated).toHaveLength(0);
  });

  it("flag on without charges creates a platform session and keeps Connect when charges are enabled", async () => {
    const created: Stripe.Checkout.SessionCreateParams[] = [];
    const inserted: PendingPaymentInsert[] = [];
    const platform = await handleCreateEventCheckoutSession(
      {
        authorizationHeader: "Bearer token",
        idempotencyKey: "idem-1234",
        rawBody: { eventId, societyId, payerType: "member" },
      },
      memberDeps({ env: safeEnv, chargesEnabled: false, connectAccountId: "acct_stored", created, inserted }),
    );
    expect(platform.status).toBe(200);
    expect(created[0]?.payment_intent_data).toBeUndefined();
    expect(created[0]?.metadata?.[STAGING_PLATFORM_CHARGE_METADATA_KEY]).toBe(STAGING_PLATFORM_CHARGE_METADATA_VALUE);
    expect(created[0]?.metadata?.charge_route).toBe(STAGING_PLATFORM_CHARGE_ROUTE);
    expect(JSON.stringify(created[0])).not.toContain("transfer_data");
    expect(JSON.stringify(created[0])).not.toContain("on_behalf_of");
    expect(JSON.stringify(created[0])).not.toContain("application_fee_amount");
    expect(inserted[0]?.stripeConnectAccountId).toBeNull();
    expect(inserted[0]?.eventName).toContain("staging platform charge");

    const guestCreated: Stripe.Checkout.SessionCreateParams[] = [];
    const guestInserted: PendingPaymentInsert[] = [];
    const guest = await handleCreateGuestCheckoutSession(
      { idempotencyKey: "idem-1234", rawBody: { paymentToken: token, eventId, societyId, guestId, amountPence: 2500 } },
      guestDeps({ env: safeEnv, chargesEnabled: false, connectAccountId: "acct_stored", created: guestCreated, inserted: guestInserted }),
    );
    expect(guest.status).toBe(200);
    expect(guestCreated[0]?.payment_intent_data).toBeUndefined();
    expect(guestCreated[0]?.metadata?.[STAGING_PLATFORM_CHARGE_METADATA_KEY]).toBe("true");
    expect(guestInserted[0]?.stripeConnectAccountId).toBeNull();
    expect(guestInserted[0]?.societyId).toBe(societyId);
    expect(guestInserted[0]?.beneficiarySocietyId).toBe(societyId);

    const connectCreated: Stripe.Checkout.SessionCreateParams[] = [];
    const connect = await handleCreateEventCheckoutSession(
      {
        authorizationHeader: "Bearer token",
        idempotencyKey: "idem-5678",
        rawBody: { eventId, societyId, payerType: "member" },
      },
      memberDeps({ env: safeEnv, chargesEnabled: true, connectAccountId: "acct_ready", created: connectCreated, inserted: [] }),
    );
    expect(connect.status).toBe(200);
    expect(connectCreated[0]?.payment_intent_data?.transfer_data?.destination).toBe("acct_ready");
    expect(connectCreated[0]?.metadata?.[STAGING_PLATFORM_CHARGE_METADATA_KEY]).toBeUndefined();
    expect(sessionParams({
      amountPence: 2500,
      idempotencyKey: "idem-1234",
      payerType: "member",
      memberId,
      guestId: null,
      eventId,
      societyId,
      beneficiarySocietyId: societyId,
      societyName: "Staging M4",
      beneficiarySocietyName: "Staging M4",
      eventName: "Staging M4 v ZGS",
      eventDateSnapshot: null,
      payerDisplayName: "Player",
      connectAccountId: null,
      platformCharge: true,
      successUrl: "http://127.0.0.1:8081/ok",
      cancelUrl: "http://127.0.0.1:8081/cancel",
      rows: [],
      keyed: null,
      stripe: {
        retrieveSession: async () => {
          throw new Error("unused");
        },
        expireSession: async () => undefined,
        createSession: async () => ({ id: "cs", url: null }),
      },
      store: {
        cancelPending: async () => undefined,
        insertPending: async () => txId,
        saveSessionId: async () => undefined,
      },
    }, txId).payment_intent_data).toBeUndefined();
  });

  it("refuses the flag against the production project and does not create Checkout", async () => {
    const created: Stripe.Checkout.SessionCreateParams[] = [];
    const production = await handleCreateEventCheckoutSession(
      {
        authorizationHeader: "Bearer token",
        idempotencyKey: "idem-1234",
        rawBody: { eventId, societyId, payerType: "member" },
      },
      memberDeps({
        env: { ...safeEnv, SUPABASE_URL: "https://eaenzjwecrrbhibrvgsb.supabase.co" },
        chargesEnabled: true,
        connectAccountId: "acct_ready",
        created,
        inserted: [],
      }),
    );
    expect(production.status).toBe(403);
    if ("error" in production.body) expect(production.body.error).toMatch(/eaenzjwecrrbhibrvgsb/);
    const nodeProduction = await handleCreateEventCheckoutSession(
      {
        authorizationHeader: "Bearer token",
        idempotencyKey: "idem-1234",
        rawBody: { eventId, societyId, payerType: "member" },
      },
      memberDeps({
        env: { ...safeEnv, NODE_ENV: "production" },
        chargesEnabled: false,
        connectAccountId: null,
        created,
        inserted: [],
      }),
    );
    expect(nodeProduction.status).toBe(403);
    const guest = await handleCreateGuestCheckoutSession(
      { idempotencyKey: "idem-1234", rawBody: { paymentToken: token, eventId, societyId, guestId, amountPence: 2500 } },
      guestDeps({
        env: { ...safeEnv, DATABASE_URL: "postgres://eaenzjwecrrbhibrvgsb" },
        chargesEnabled: false,
        connectAccountId: null,
        created,
        inserted: [],
      }),
    );
    expect(guest.status).toBe(403);
    expect(created).toHaveLength(0);
  });

  it("accepts one signed staging platform webhook and a duplicate stays one ledger row", async () => {
    const previous = {
      flag: process.env.STAGING_PLATFORM_ONLY_PAYMENTS,
      key: process.env.STRIPE_SECRET_KEY,
      url: process.env.SUPABASE_URL,
      node: process.env.NODE_ENV,
      secret: process.env.STRIPE_WEBHOOK_SECRET,
    };
    process.env.STAGING_PLATFORM_ONLY_PAYMENTS = "true";
    process.env.STRIPE_SECRET_KEY = "sk_test_unit";
    process.env.SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NODE_ENV = "test";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
    const ledger: { eventId: string; connectAccountId: string }[] = [];
    const paidEvent = {
      id: "evt_platform",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_platform",
          mode: "payment",
          status: "complete",
          payment_status: "paid",
          currency: "gbp",
          amount_total: 2500,
          payment_intent: "pi_platform",
          metadata: {
            payment_transaction_id: txId,
            event_id: eventId,
            society_id: societyId,
            beneficiary_society_id: societyId,
            payer_type: "member",
            member_id: memberId,
            guest_id: "",
            [STAGING_PLATFORM_CHARGE_METADATA_KEY]: STAGING_PLATFORM_CHARGE_METADATA_VALUE,
            charge_route: STAGING_PLATFORM_CHARGE_ROUTE,
          },
        },
      },
    };
    const deps = {
      constructEvent: () => paidEvent as never,
      loadTransaction: async () => ({
        id: txId,
        status: "pending",
        amount_pence: 2500,
        currency: "gbp",
        event_id: eventId,
        society_id: societyId,
        beneficiary_society_id: societyId,
        payer_type: "member",
        member_id: memberId,
        guest_id: null,
        stripe_checkout_session_id: "cs_platform",
        stripe_payment_intent_id: null,
        stripe_connect_account_id: null,
      }),
      loadBeneficiaryConnectAccount: async () => "acct_stored",
      retrievePaymentIntent: async () => ({
        id: "pi_platform",
        amount: 2500,
        currency: "gbp",
        status: "succeeded",
        destinationAccountId: null,
        applicationFeeAmount: null,
        receiptUrl: null,
      }),
      applyPayment: async (payment: { stripeEventId: string; connectAccountId: string; paymentTransactionId: string }) => {
        const existing = ledger.find((row) => row.eventId === payment.stripeEventId);
        if (existing) return;
        if (ledger.some((row) => row.connectAccountId === payment.connectAccountId && ledger.length > 0)) {
          throw new Error("payment_already_applied");
        }
        ledger.push({ eventId: payment.stripeEventId, connectAccountId: payment.connectAccountId });
      },
      syncConnectAccount: async () => undefined,
    };
    try {
      const first = await handleStripeWebhook({ rawBody: "{}", signatureHeader: "t=1,v1=ok" }, deps);
      const duplicate = await handleStripeWebhook({ rawBody: "{}", signatureHeader: "t=1,v1=ok" }, deps);
      expect(first.status).toBe(200);
      expect(duplicate.status).toBe(200);
      expect(ledger).toEqual([{ eventId: "evt_platform", connectAccountId: "" }]);

      const mismatch = await handleStripeWebhook({ rawBody: "{}", signatureHeader: "t=1,v1=ok" }, {
        ...deps,
        constructEvent: () => ({
          ...paidEvent,
          id: "evt_bad_amount",
          data: { object: { ...paidEvent.data.object, amount_total: 100 } },
        }) as never,
        applyPayment: async () => {
          ledger.push({ eventId: "should-not", connectAccountId: "x" });
        },
      });
      expect(mismatch.status).toBe(422);
      expect(ledger).toHaveLength(1);

      process.env.STRIPE_SECRET_KEY = "sk_live_secret";
      const live = await handleStripeWebhook({ rawBody: "{}", signatureHeader: "t=1,v1=ok" }, deps);
      expect(live.status).toBe(422);
      expect(ledger).toHaveLength(1);

      const unsigned = await handleStripeWebhook(
        { rawBody: "{}", signatureHeader: "t=1,v1=deadbeef" },
        {
          ...deps,
          constructEvent: (raw, signature, secret) => new Stripe("sk_test_unit").webhooks.constructEvent(raw, signature, secret),
        },
      );
      expect(unsigned.status).toBe(400);
      expect(ledger).toHaveLength(1);

      const refused = verifyPaidCheckout({
        stripeEventId: "evt_platform",
        session: {
          id: "cs_platform",
          mode: "payment",
          status: "complete",
          payment_status: "paid",
          currency: "gbp",
          amount_total: 2500,
          payment_intent_id: "pi_platform",
          metadata: paidEvent.data.object.metadata,
        },
        paymentIntent: {
          id: "pi_platform",
          amount: 2500,
          currency: "gbp",
          status: "succeeded",
          destinationAccountId: "acct_stored",
          applicationFeeAmount: null,
          receiptUrl: null,
        },
        transaction: {
          id: txId,
          status: "pending",
          amount_pence: 2500,
          currency: "gbp",
          event_id: eventId,
          society_id: societyId,
          beneficiary_society_id: societyId,
          payer_type: "member",
          member_id: memberId,
          guest_id: null,
          stripe_checkout_session_id: "cs_platform",
          stripe_payment_intent_id: null,
          stripe_connect_account_id: null,
        },
        beneficiaryConnectAccountId: "acct_stored",
        allowStagingPlatformCharge: true,
      });
      expect(refused.ok).toBe(false);
    } finally {
      if (previous.flag == null) delete process.env.STAGING_PLATFORM_ONLY_PAYMENTS;
      else process.env.STAGING_PLATFORM_ONLY_PAYMENTS = previous.flag;
      if (previous.key == null) delete process.env.STRIPE_SECRET_KEY;
      else process.env.STRIPE_SECRET_KEY = previous.key;
      if (previous.url == null) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = previous.url;
      if (previous.node == null) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous.node;
      if (previous.secret == null) delete process.env.STRIPE_WEBHOOK_SECRET;
      else process.env.STRIPE_WEBHOOK_SECRET = previous.secret;
    }
  });
});
