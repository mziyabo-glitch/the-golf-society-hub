import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import Stripe from "stripe";
import { afterAll, beforeAll, expect, it } from "vitest";
import { handleStripeWebhook } from "@/lib/payments/stripeWebhookHandler";
import type { PaymentTransactionCheck } from "@/lib/payments/webhookVerification";

const root = path.resolve(__dirname, "../..");
const foundationSql = readFileSync(
  path.join(root, "supabase/migrations/20261030180000_stripe_event_payments_foundation.sql"),
  "utf8",
);
const repairSql = readFileSync(
  path.join(root, "supabase/migrations/20261030240000_stripe_payment_integrity.sql"),
  "utf8",
);

const M4 = "10000000-0000-4000-8000-000000000001";
const JOINT = "10000000-0000-4000-8000-000000000002";
const EVENT = "10000000-0000-4000-8000-000000000003";
const TREASURER_USER = "10000000-0000-4000-8000-000000000011";
const HANDICAPPER_USER = "10000000-0000-4000-8000-000000000012";
const CAPTAIN_USER = "10000000-0000-4000-8000-000000000013";
const JOINT_TREASURER_USER = "10000000-0000-4000-8000-000000000014";
const TREASURER_MEMBER = "10000000-0000-4000-8000-000000000021";
const HANDICAPPER_MEMBER = "10000000-0000-4000-8000-000000000022";
const PLAYER = "10000000-0000-4000-8000-000000000023";
const PLAYER_USER = "10000000-0000-4000-8000-000000000015";
const WITHDRAWN = "10000000-0000-4000-8000-000000000024";
const JOINT_PLAYER = "10000000-0000-4000-8000-000000000025";
const JOINT_TREASURER = "10000000-0000-4000-8000-000000000026";
const GUEST = "10000000-0000-4000-8000-000000000031";
const TX = "10000000-0000-4000-8000-000000000041";
const TX_WITHDRAWN = "10000000-0000-4000-8000-000000000042";
const TX_GUEST = "10000000-0000-4000-8000-000000000043";
const TX_DUP = "10000000-0000-4000-8000-000000000044";

const socket = { host: "/var/run/postgresql", user: "ubuntu" };

function db(database: string) {
  return new Client({ ...socket, database });
}

const fixtureSql = `
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $uid$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$uid$;

DO $roles$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN CREATE ROLE authenticator NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $roles$;

CREATE TABLE public.societies (
  id uuid PRIMARY KEY,
  name text NOT NULL
);
CREATE TABLE public.members (
  id uuid PRIMARY KEY,
  society_id uuid NOT NULL REFERENCES public.societies(id) ON DELETE CASCADE,
  user_id uuid,
  role text NOT NULL,
  display_name text
);
CREATE TABLE public.events (
  id uuid PRIMARY KEY,
  society_id uuid NOT NULL REFERENCES public.societies(id) ON DELETE CASCADE,
  name text NOT NULL,
  date text
);
CREATE TABLE public.event_societies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  society_id uuid NOT NULL REFERENCES public.societies(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'participant',
  UNIQUE (event_id, society_id)
);
CREATE TABLE public.event_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES public.societies(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'in',
  paid boolean NOT NULL DEFAULT false,
  amount_paid_pence integer NOT NULL DEFAULT 0,
  paid_at timestamptz,
  marked_by_member_id uuid,
  removed_from_event_at timestamptz,
  removed_by_member_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, member_id)
);
CREATE TABLE public.event_guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES public.societies(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name text NOT NULL,
  sex text NOT NULL,
  paid boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $upd$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$upd$;
`;

async function recreate(database: string) {
  const admin = db("postgres");
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${database}`);
  await admin.end();
  const client = db(database);
  await client.connect();
  return client;
}

async function asUser(client: Client, userId: string, sql: string, params: unknown[] = []) {
  await client.query("BEGIN");
  await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [userId]);
  await client.query("SET LOCAL ROLE authenticated");
  try {
    const result = await client.query(sql, params);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

async function expectUserError(client: Client, userId: string, sql: string, params: unknown[], pattern: RegExp) {
  await client.query("BEGIN");
  await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [userId]);
  await client.query("SET LOCAL ROLE authenticated");
  await expect(client.query(sql, params)).rejects.toThrow(pattern);
  await client.query("ROLLBACK");
}

let client: Client;

beforeAll(async () => {
  client = await recreate("gsh_payment_integrity");
  await client.query(fixtureSql);
  await client.query(foundationSql);
  await client.query(`
    GRANT USAGE ON SCHEMA public TO authenticated, anon;
    GRANT SELECT, INSERT, UPDATE ON public.event_registrations TO authenticated;
    GRANT SELECT, INSERT, UPDATE ON public.event_guests TO authenticated;
    GRANT SELECT ON public.members, public.societies, public.events, public.event_societies TO authenticated;
  `);
  await client.query(
    `INSERT INTO public.societies (id, name) VALUES ($1, 'M4'), ($2, 'Joint Club')`,
    [M4, JOINT],
  );
  await client.query(
    `UPDATE public.societies SET stripe_connect_account_id = 'acct_m4', stripe_connect_charges_enabled = true WHERE id = $1`,
    [M4],
  );
  await client.query(
    `INSERT INTO public.members (id, society_id, user_id, role, display_name) VALUES
      ($1, $2, $3, 'TREASURER', 'Treasurer'),
      ($4, $2, $5, 'HANDICAPPER', 'Handicapper'),
      ($6, $2, $7, 'CAPTAIN', 'Captain'),
      ($8, $2, $9, 'MEMBER', 'Playing Member'),
      ($10, $2, $9, 'MEMBER', 'Withdrawn Member'),
      ($11, $12, $13, 'TREASURER', 'Joint Treasurer'),
      ($14, $12, $13, 'MEMBER', 'Joint Player')`,
    [
      TREASURER_MEMBER, M4, TREASURER_USER,
      HANDICAPPER_MEMBER, HANDICAPPER_USER,
      "10000000-0000-4000-8000-000000000027", CAPTAIN_USER,
      PLAYER, PLAYER_USER,
      WITHDRAWN,
      JOINT_TREASURER, JOINT, JOINT_TREASURER_USER,
      JOINT_PLAYER,
    ],
  );
  await client.query(
    `INSERT INTO public.events (id, society_id, name, date) VALUES ($1, $2, 'M4 Spring Stableford', '2026-05-01')`,
    [EVENT, M4],
  );
  await client.query(
    `INSERT INTO public.event_societies (event_id, society_id, role) VALUES ($1, $2, 'host'), ($1, $3, 'participant')`,
    [EVENT, M4, JOINT],
  );
  await client.query(
    `INSERT INTO public.event_registrations (society_id, event_id, member_id, status) VALUES
      ($1, $2, $3, 'in'),
      ($1, $2, $4, 'in'),
      ($5, $2, $6, 'in')`,
    [M4, EVENT, PLAYER, WITHDRAWN, JOINT, JOINT_PLAYER],
  );
  await client.query(`UPDATE public.event_registrations SET removed_from_event_at = now() WHERE member_id = $1`, [WITHDRAWN]);
  await client.query(
    `INSERT INTO public.event_guests (id, society_id, event_id, name, sex) VALUES ($1, $2, $3, 'Guest Golfer', 'male')`,
    [GUEST, M4, EVENT],
  );
}, 60000);

afterAll(async () => {
  await client?.end();
});

function insertTx(id: string, memberId: string | null, guestId: string | null, payerType: "member" | "guest") {
  return client.query(
    `INSERT INTO public.payment_transactions (
      id, society_id, beneficiary_society_id, event_id, payer_type, member_id, guest_id,
      society_name, beneficiary_society_name, event_name, event_date_snapshot, payer_display_name,
      amount_pence, currency, status, payment_method, idempotency_key, stripe_connect_account_id
    ) VALUES (
      $1, $2, $2, $3, $4, $5, $6,
      'M4', 'M4', 'M4 Spring Stableford', '2026-05-01', 'Playing Member',
      4500, 'gbp', 'pending', 'stripe', $7, 'acct_m4'
    )`,
    [id, M4, EVENT, payerType, memberId, guestId, `idem-${id}`],
  );
}

it("blocks end-user payment writes even when the old bypass flag is set", async () => {
  await client.query("BEGIN");
  await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [PLAYER_USER]);
  await client.query("SELECT set_config('gsh.payment_write', 'true', true)");
  await client.query("SET LOCAL ROLE authenticated");
  await expect(
    client.query(`UPDATE public.event_registrations SET paid = true WHERE member_id = $1`, [PLAYER]),
  ).rejects.toThrow(/event_registration_payment_forbidden/);
  await client.query("ROLLBACK");
});

it("still lets a Handicapper record a manual payment and a joint treasurer record theirs", async () => {
  await client.query(
    `INSERT INTO public.event_registrations (society_id, event_id, member_id, status) VALUES ($1, $2, $3, 'in')`,
    [M4, EVENT, HANDICAPPER_MEMBER],
  );
  await asUser(
    client,
    HANDICAPPER_USER,
    `SELECT public.mark_event_paid($1, $2, $3, true, 4500, false)`,
    [EVENT, M4, HANDICAPPER_MEMBER],
  );
  await asUser(
    client,
    JOINT_TREASURER_USER,
    `SELECT public.mark_event_paid($1, $2, $3, true, 3500, false)`,
    [EVENT, JOINT, JOINT_PLAYER],
  );
  const joint = await client.query(
    `SELECT paid, payment_method, amount_paid_pence, status FROM public.event_registrations WHERE member_id = $1`,
    [JOINT_PLAYER],
  );
  expect(joint.rows[0]).toMatchObject({ paid: true, payment_method: "manual", amount_paid_pence: 3500, status: "in" });
  const manual = await client.query(
    `SELECT paid, payment_method FROM public.event_registrations WHERE member_id = $1`,
    [HANDICAPPER_MEMBER],
  );
  expect(manual.rows[0]).toMatchObject({ paid: true, payment_method: "manual" });
});

it("lets a player change attendance without touching payment columns", async () => {
  await asUser(
    client,
    PLAYER_USER,
    `UPDATE public.event_registrations SET status = 'out' WHERE member_id = $1`,
    [PLAYER],
  );
  await asUser(
    client,
    PLAYER_USER,
    `UPDATE public.event_registrations SET status = 'in' WHERE member_id = $1`,
    [PLAYER],
  );
  const row = await client.query(`SELECT status, paid FROM public.event_registrations WHERE member_id = $1`, [PLAYER]);
  expect(row.rows[0]).toMatchObject({ status: "in", paid: false });
});

it("applies a verified webhook once, then refuses a second PaymentIntent", async () => {
  await insertTx(TX, PLAYER, null, "member");
  await client.query(
    `SELECT public.apply_event_stripe_payment($1, 'evt_1', 'cs_1', 'pi_1', 4500, 'gbp', 'acct_m4', $2, $3, 'https://pay.stripe.com/receipts/m4')`,
    [TX, EVENT, M4],
  );
  await client.query(
    `SELECT public.apply_event_stripe_payment($1, 'evt_1', 'cs_1', 'pi_1', 4500, 'gbp', 'acct_m4', $2, $3, 'https://pay.stripe.com/receipts/m4')`,
    [TX, EVENT, M4],
  );
  const paid = await client.query(
    `SELECT paid, payment_method, status, removed_from_event_at IS NULL AS still_active
       FROM public.event_registrations WHERE member_id = $1`,
    [PLAYER],
  );
  expect(paid.rows[0]).toMatchObject({ paid: true, payment_method: "stripe", status: "in", still_active: true });

  await insertTx(TX_DUP, WITHDRAWN, null, "member");
  await expect(
    client.query(
      `SELECT public.apply_event_stripe_payment($1, 'evt_2', 'cs_2', 'pi_1', 4500, 'gbp', 'acct_m4', $2, $3, NULL)`,
      [TX_DUP, EVENT, M4],
    ),
  ).rejects.toThrow(/payment_intent_already_used/);
  const dup = await client.query(`SELECT status FROM public.payment_transactions WHERE id = $1`, [TX_DUP]);
  expect(dup.rows[0].status).toBe("pending");
});

it("records a late payment without restoring a removed player", async () => {
  const applied = await client.query(
    `SELECT public.apply_event_stripe_payment($1, 'evt_withdrawn', 'cs_withdrawn', 'pi_withdrawn', 4500, 'gbp', 'acct_m4', $2, $3, NULL)`,
    [TX_DUP, EVENT, M4],
  );
  expect(applied.rowCount).toBe(1);
  const row = await client.query(
    `SELECT r.paid, r.status, r.removed_from_event_at IS NOT NULL AS removed, r.payment_resolution_required,
            t.status AS tx_status, t.resolution_required
       FROM public.event_registrations r
       JOIN public.payment_transactions t ON t.id = $1
      WHERE r.member_id = $2`,
    [TX_DUP, WITHDRAWN],
  );
  expect(row.rows[0]).toMatchObject({
    paid: true,
    status: "in",
    removed: true,
    payment_resolution_required: true,
    tx_status: "succeeded",
    resolution_required: true,
  });
});

it("does not mark a guest payment succeeded when the guest row is gone", async () => {
  await insertTx(TX_GUEST, null, GUEST, "guest");
  await client.query(`DELETE FROM public.event_guests WHERE id = $1`, [GUEST]);
  await expect(
    client.query(
      `SELECT public.apply_event_stripe_payment($1, 'evt_guest', 'cs_guest', 'pi_guest', 4500, 'gbp', 'acct_m4', $2, $3, NULL)`,
      [TX_GUEST, EVENT, M4],
    ),
  ).rejects.toThrow(/payment_target_missing/);
  const tx = await client.query(`SELECT status, guest_id, payer_display_name FROM public.payment_transactions WHERE id = $1`, [TX_GUEST]);
  expect(tx.rows[0]).toMatchObject({ status: "pending", guest_id: null, payer_display_name: "Playing Member" });
});

it("stops a Handicapper overwriting Stripe and allows a Treasurer correction", async () => {
  await expectUserError(
    client,
    HANDICAPPER_USER,
    `SELECT public.mark_event_paid($1, $2, $3, false, 0, false)`,
    [EVENT, M4, PLAYER],
    /stripe_payment_locked/,
  );
  await asUser(
    client,
    TREASURER_USER,
    `SELECT public.mark_event_paid($1, $2, $3, false, 0, true)`,
    [EVENT, M4, PLAYER],
  );
  const row = await client.query(
    `SELECT paid, payment_resolution_required FROM public.event_registrations WHERE member_id = $1`,
    [PLAYER],
  );
  expect(row.rows[0]).toMatchObject({ paid: false, payment_resolution_required: true });
  const ledger = await client.query(`SELECT status FROM public.payment_transactions WHERE id = $1`, [TX]);
  expect(ledger.rows[0].status).toBe("succeeded");
});

it("hides the ledger from a Handicapper and limits refunds to the Treasurer", async () => {
  const handicapper = await asUser(client, HANDICAPPER_USER, `SELECT id FROM public.payment_transactions`);
  expect(handicapper.rows).toHaveLength(0);
  const treasurer = await asUser(client, TREASURER_USER, `SELECT id FROM public.payment_transactions WHERE id = $1`, [TX]);
  expect(treasurer.rows).toHaveLength(1);
  await expectUserError(
    client,
    CAPTAIN_USER,
    `SELECT public.record_event_stripe_refund($1, 're_captain')`,
    [TX],
    /refund_forbidden/,
  );
  await asUser(client, TREASURER_USER, `SELECT public.mark_event_paid($1, $2, $3, true, 4500, true)`, [EVENT, M4, PLAYER]);
  await client.query(`UPDATE public.event_registrations SET payment_transaction_id = $1, payment_method = 'stripe', paid = true WHERE member_id = $2`, [TX, PLAYER]);
  await asUser(client, TREASURER_USER, `SELECT public.record_event_stripe_refund($1, 're_treasurer')`, [TX]);
  const refunded = await client.query(
    `SELECT t.status, t.stripe_refund_id, r.paid FROM public.payment_transactions t
      JOIN public.event_registrations r ON r.member_id = $2 WHERE t.id = $1`,
    [TX, PLAYER],
  );
  expect(refunded.rows[0]).toMatchObject({ status: "refunded", stripe_refund_id: "re_treasurer", paid: false });
});

it("keeps the ledger row when the event is deleted", async () => {
  await client.query(`DELETE FROM public.events WHERE id = $1`, [EVENT]);
  const kept = await client.query(
    `SELECT event_id, event_name, society_name, amount_pence FROM public.payment_transactions WHERE id = $1`,
    [TX],
  );
  expect(kept.rows[0]).toMatchObject({
    event_id: null,
    event_name: "M4 Spring Stableford",
    society_name: "M4",
    amount_pence: 4500,
  });
});

it("rejects a second open checkout for the same player", async () => {
  const otherEvent = "10000000-0000-4000-8000-000000000099";
  await client.query(`INSERT INTO public.events (id, society_id, name) VALUES ($1, $2, 'Second event')`, [otherEvent, M4]);
  await client.query(
    `INSERT INTO public.payment_transactions (
      society_id, beneficiary_society_id, event_id, payer_type, member_id,
      society_name, beneficiary_society_name, event_name, payer_display_name,
      amount_pence, idempotency_key, stripe_connect_account_id
    ) VALUES ($1, $1, $2, 'member', $3, 'M4', 'M4', 'Second event', 'Playing Member', 4500, 'idem-open-1', 'acct_m4')`,
    [M4, otherEvent, PLAYER],
  );
  await expect(
    client.query(
      `INSERT INTO public.payment_transactions (
        society_id, beneficiary_society_id, event_id, payer_type, member_id,
        society_name, beneficiary_society_name, event_name, payer_display_name,
        amount_pence, idempotency_key, stripe_connect_account_id
      ) VALUES ($1, $1, $2, 'member', $3, 'M4', 'M4', 'Second event', 'Playing Member', 4500, 'idem-open-2', 'acct_m4')`,
      [M4, otherEvent, PLAYER],
    ),
  ).rejects.toThrow(/payment_transactions_open_member_uq/);
});

it("applies a signed webhook through the server handler and the database function together", async () => {
  const liveEvent = "10000000-0000-4000-8000-000000000098";
  const liveTx = "10000000-0000-4000-8000-000000000045";
  await client.query(`INSERT INTO public.events (id, society_id, name, date) VALUES ($1, $2, 'Webhook event', '2026-06-01')`, [liveEvent, M4]);
  await client.query(
    `INSERT INTO public.event_registrations (society_id, event_id, member_id, status) VALUES ($1, $2, $3, 'in')`,
    [M4, liveEvent, PLAYER],
  );
  await client.query(
    `INSERT INTO public.payment_transactions (
      id, society_id, beneficiary_society_id, event_id, payer_type, member_id,
      society_name, beneficiary_society_name, event_name, payer_display_name,
      amount_pence, currency, status, payment_method, idempotency_key, stripe_checkout_session_id, stripe_connect_account_id
    ) VALUES (
      $1, $2, $2, $3, 'member', $4,
      'M4', 'M4', 'Webhook event', 'Playing Member',
      4500, 'gbp', 'pending', 'stripe', 'idem-webhook', 'cs_webhook', 'acct_m4'
    )`,
    [liveTx, M4, liveEvent, PLAYER],
  );

  process.env.STRIPE_WEBHOOK_SECRET = "whsec_integration_secret";
  const stripe = new Stripe("sk_test_integration");
  const payload = JSON.stringify({
    id: "evt_webhook_integration",
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_webhook",
        object: "checkout.session",
        mode: "payment",
        status: "complete",
        payment_status: "paid",
        currency: "gbp",
        amount_total: 4500,
        payment_intent: "pi_webhook",
        metadata: {
          payment_transaction_id: liveTx,
          event_id: liveEvent,
          society_id: M4,
          payer_type: "member",
          member_id: PLAYER,
          guest_id: "",
        },
      },
    },
  });
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: "whsec_integration_secret",
  });

  const bad = await handleStripeWebhook(
    { rawBody: payload, signatureHeader: "t=1,v1=bad" },
    {
      constructEvent: (raw, sig, secret) => stripe.webhooks.constructEvent(raw, sig, secret),
      loadTransaction: async () => {
        throw new Error("should not load");
      },
      loadBeneficiaryConnectAccount: async () => null,
      retrievePaymentIntent: async () => null,
      applyPayment: async () => {
        throw new Error("should not apply");
      },
      syncConnectAccount: async () => undefined,
    },
  );
  expect(bad.status).toBe(400);

  const ok = await handleStripeWebhook(
    { rawBody: payload, signatureHeader: signature },
    {
      constructEvent: (raw, sig, secret) => stripe.webhooks.constructEvent(raw, sig, secret),
      loadTransaction: async (id) => {
        const found = await client.query(`SELECT * FROM public.payment_transactions WHERE id = $1`, [id]);
        return (found.rows[0] as PaymentTransactionCheck | undefined) ?? null;
      },
      loadBeneficiaryConnectAccount: async () => "acct_m4",
      retrievePaymentIntent: async () => ({
        id: "pi_webhook",
        amount: 4500,
        currency: "gbp",
        status: "succeeded",
        destinationAccountId: "acct_m4",
        receiptUrl: "https://pay.stripe.com/receipts/webhook",
      }),
      applyPayment: async (payment) => {
        await client.query(
          `SELECT public.apply_event_stripe_payment($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            payment.paymentTransactionId,
            payment.stripeEventId,
            payment.sessionId,
            payment.paymentIntentId,
            payment.amountPence,
            payment.currency,
            payment.connectAccountId,
            payment.eventId,
            payment.beneficiarySocietyId,
            payment.receiptUrl,
          ],
        );
      },
      syncConnectAccount: async () => undefined,
    },
  );
  expect(ok.status).toBe(200);
  const row = await client.query(
    `SELECT t.status, t.stripe_receipt_url, r.paid, r.payment_method
       FROM public.payment_transactions t
       JOIN public.event_registrations r ON r.event_id = t.event_id AND r.member_id = t.member_id
      WHERE t.id = $1`,
    [liveTx],
  );
  expect(row.rows[0]).toMatchObject({
    status: "succeeded",
    stripe_receipt_url: "https://pay.stripe.com/receipts/webhook",
    paid: true,
    payment_method: "stripe",
  });
});

it("repairs an older cascading ledger without dropping history", async () => {
  const repairDb = await recreate("gsh_payment_integrity_repair");
  try {
    await repairDb.query(fixtureSql);
    await repairDb.query(`
      CREATE TABLE public.payment_transactions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        society_id uuid NOT NULL REFERENCES public.societies(id) ON DELETE CASCADE,
        beneficiary_society_id uuid NOT NULL REFERENCES public.societies(id) ON DELETE CASCADE,
        event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
        payer_type text NOT NULL CHECK (payer_type IN ('member', 'guest')),
        member_id uuid NULL REFERENCES public.members(id) ON DELETE CASCADE,
        guest_id uuid NULL REFERENCES public.event_guests(id) ON DELETE CASCADE,
        amount_pence integer NOT NULL CHECK (amount_pence > 0),
        currency text NOT NULL DEFAULT 'gbp' CHECK (char_length(currency) = 3),
        status text NOT NULL DEFAULT 'pending',
        payment_method text NOT NULL DEFAULT 'stripe',
        idempotency_key text NOT NULL UNIQUE,
        stripe_checkout_session_id text NULL UNIQUE,
        stripe_payment_intent_id text NULL,
        stripe_event_id text NULL UNIQUE,
        failure_reason text NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        completed_at timestamptz NULL,
        CONSTRAINT payment_transactions_payer_check CHECK (
          (payer_type = 'member' AND member_id IS NOT NULL AND guest_id IS NULL)
          OR (payer_type = 'guest' AND guest_id IS NOT NULL AND member_id IS NULL)
        )
      );
    `);
    await repairDb.query(`INSERT INTO public.societies (id, name) VALUES ($1, 'M4')`, [M4]);
    await repairDb.query(`INSERT INTO public.events (id, society_id, name) VALUES ($1, $2, 'Archive me')`, [EVENT, M4]);
    await repairDb.query(
      `INSERT INTO public.members (id, society_id, user_id, role, display_name) VALUES ($1, $2, $3, 'MEMBER', 'Player')`,
      [PLAYER, M4, PLAYER_USER],
    );
    await repairDb.query(
      `INSERT INTO public.payment_transactions (
        society_id, beneficiary_society_id, event_id, payer_type, member_id, amount_pence, idempotency_key
      ) VALUES ($1, $1, $2, 'member', $3, 2000, 'old-idem')`,
      [M4, EVENT, PLAYER],
    );
    await repairDb.query(repairSql);
    await repairDb.query(`DELETE FROM public.events WHERE id = $1`, [EVENT]);
    const kept = await repairDb.query(
      `SELECT event_id, event_name, amount_pence FROM public.payment_transactions WHERE idempotency_key = 'old-idem'`,
    );
    expect(kept.rows[0]).toMatchObject({ event_id: null, event_name: "Unknown event", amount_pence: 2000 });
  } finally {
    await repairDb.end();
  }
}, 60000);
