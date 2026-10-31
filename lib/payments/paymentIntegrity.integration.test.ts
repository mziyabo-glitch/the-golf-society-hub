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
  path.join(root, "supabase/migrations/20261030190000_stripe_payment_integrity.sql"),
  "utf8",
);
const guestInviteSql = readFileSync(
  path.join(root, "supabase/migrations/20261030200000_guest_payment_invitations.sql"),
  "utf8",
);
const destinationSql = readFileSync(
  path.join(root, "supabase/migrations/20261030210000_payment_destination_and_checkout_eligibility.sql"),
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

async function asRole(client: Client, role: "authenticated" | "service_role" | "anon", sql: string, params: unknown[] = []) {
  await client.query("BEGIN");
  await client.query(`SET LOCAL ROLE ${role}`);
  try {
    const result = await client.query(sql, params);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

async function expectRoleError(
  client: Client,
  role: "authenticated" | "service_role" | "anon",
  sql: string,
  params: unknown[],
  pattern: RegExp,
) {
  await client.query("BEGIN");
  await client.query(`SET LOCAL ROLE ${role}`);
  await expect(client.query(sql, params)).rejects.toThrow(pattern);
  await client.query("ROLLBACK");
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
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
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

it("hides the ledger from a Handicapper and records refunds only as service_role", async () => {
  const handicapper = await asUser(client, HANDICAPPER_USER, `SELECT id FROM public.payment_transactions`);
  expect(handicapper.rows).toHaveLength(0);
  const treasurer = await asUser(client, TREASURER_USER, `SELECT id FROM public.payment_transactions WHERE id = $1`, [TX]);
  expect(treasurer.rows).toHaveLength(1);
  const privileges = await client.query(
    `SELECT
       has_function_privilege('authenticated', 'public.record_event_stripe_refund(uuid,text,text)', 'EXECUTE') AS authenticated,
       has_function_privilege('anon', 'public.record_event_stripe_refund(uuid,text,text)', 'EXECUTE') AS anon,
       has_function_privilege('public', 'public.record_event_stripe_refund(uuid,text,text)', 'EXECUTE') AS public,
       has_function_privilege('service_role', 'public.record_event_stripe_refund(uuid,text,text)', 'EXECUTE') AS service_role`,
  );
  expect(privileges.rows[0]).toMatchObject({ authenticated: false, anon: false, public: false, service_role: true });
  const statusCheck = await client.query(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'payment_transactions_status_check'`,
  );
  expect(statusCheck.rows[0].def).toContain("refund_pending");
  await expectRoleError(
    client,
    "authenticated",
    `SELECT public.record_event_stripe_refund($1, 're_invented', 'succeeded')`,
    [TX],
    /permission denied/,
  );
  await asUser(client, TREASURER_USER, `SELECT public.mark_event_paid($1, $2, $3, true, 4500, true)`, [EVENT, M4, PLAYER]);
  await client.query(`UPDATE public.event_registrations SET payment_transaction_id = $1, payment_method = 'stripe', paid = true WHERE member_id = $2`, [TX, PLAYER]);
  await asRole(client, "service_role", `SELECT public.record_event_stripe_refund($1, 're_treasurer', 'succeeded')`, [TX]);
  const refunded = await client.query(
    `SELECT t.status, t.stripe_refund_id, t.stripe_refund_status, r.paid FROM public.payment_transactions t
      JOIN public.event_registrations r ON r.member_id = $2 WHERE t.id = $1`,
    [TX, PLAYER],
  );
  expect(refunded.rows[0]).toMatchObject({
    status: "refunded",
    stripe_refund_id: "re_treasurer",
    stripe_refund_status: "succeeded",
    paid: false,
  });
  const before = await client.query(`SELECT count(*)::int AS n FROM public.payment_transactions`);
  await asRole(client, "service_role", `SELECT public.record_event_stripe_refund($1, 're_treasurer', 'succeeded')`, [TX]);
  const after = await client.query(`SELECT count(*)::int AS n FROM public.payment_transactions`);
  expect(after.rows[0].n).toBe(before.rows[0].n);
});

it("keeps one ledger row across pending, failed, and deleted payment targets", async () => {
  const lifeEvent = "10000000-0000-4000-8000-0000000000b1";
  const failEvent = "10000000-0000-4000-8000-0000000000b2";
  const goneMember = "10000000-0000-4000-8000-0000000000c1";
  const goneGuest = "10000000-0000-4000-8000-0000000000c2";
  const goneEvent = "10000000-0000-4000-8000-0000000000b3";
  const guestEvent = "10000000-0000-4000-8000-0000000000b4";
  const txLife = "10000000-0000-4000-8000-0000000000d1";
  const txFail = "10000000-0000-4000-8000-0000000000d2";
  const txMember = "10000000-0000-4000-8000-0000000000d3";
  const txGuest = "10000000-0000-4000-8000-0000000000d4";
  const txEvent = "10000000-0000-4000-8000-0000000000d5";

  async function succeededPayment(id: string, eventId: string, memberId: string | null, guestId: string | null, payer: "member" | "guest") {
    await client.query(
      `INSERT INTO public.payment_transactions (
        id, society_id, beneficiary_society_id, event_id, payer_type, member_id, guest_id,
        society_name, beneficiary_society_name, event_name, payer_display_name,
        amount_pence, currency, status, payment_method, idempotency_key, stripe_connect_account_id, stripe_payment_intent_id
      ) VALUES (
        $1, $2, $2, $3, $4, $5, $6,
        'M4', 'M4', 'Refund event', 'Payer',
        4500, 'gbp', 'succeeded', 'stripe', $7, 'acct_m4', $8
      )`,
      [id, M4, eventId, payer, memberId, guestId, `idem-${id}`, `pi-${id}`],
    );
  }

  await client.query(`INSERT INTO public.events (id, society_id, name) VALUES ($1, $2, 'Life'), ($3, $2, 'Fail'), ($4, $2, 'Gone'), ($5, $2, 'Guest fee')`, [lifeEvent, M4, failEvent, goneEvent, guestEvent]);
  await client.query(
    `INSERT INTO public.event_registrations (society_id, event_id, member_id, status, paid, payment_method, amount_paid_pence)
     VALUES ($1, $2, $3, 'in', true, 'stripe', 4500), ($1, $2, $4, 'in', true, 'manual', 4500)`,
    [M4, lifeEvent, PLAYER, HANDICAPPER_MEMBER],
  );
  await succeededPayment(txLife, lifeEvent, PLAYER, null, "member");
  await client.query(`UPDATE public.event_registrations SET payment_transaction_id = $1 WHERE event_id = $2 AND member_id = $3`, [txLife, lifeEvent, PLAYER]);

  const before = await client.query(`SELECT count(*)::int AS n FROM public.payment_transactions`);
  await asRole(client, "service_role", `SELECT public.record_event_stripe_refund($1, 're_pending', 'pending')`, [txLife]);
  const pending = await client.query(
    `SELECT t.status, t.stripe_refund_status, r.paid
       FROM public.payment_transactions t
       JOIN public.event_registrations r ON r.payment_transaction_id = t.id
      WHERE t.id = $1`,
    [txLife],
  );
  expect(pending.rows[0]).toMatchObject({ status: "refund_pending", stripe_refund_status: "pending", paid: true });
  await asRole(client, "service_role", `SELECT public.record_event_stripe_refund($1, 're_pending', 'succeeded')`, [txLife]);
  await asRole(client, "service_role", `SELECT public.record_event_stripe_refund($1, 're_pending', 'succeeded')`, [txLife]);
  const done = await client.query(
    `SELECT t.status, r.paid AS player_paid,
            (SELECT paid FROM public.event_registrations WHERE event_id = $2 AND member_id = $3) AS other_paid
       FROM public.payment_transactions t
       JOIN public.event_registrations r ON r.member_id = $4 AND r.event_id = $2
      WHERE t.id = $1`,
    [txLife, lifeEvent, HANDICAPPER_MEMBER, PLAYER],
  );
  expect(done.rows[0]).toMatchObject({ status: "refunded", player_paid: false, other_paid: true });
  const after = await client.query(`SELECT count(*)::int AS n FROM public.payment_transactions`);
  expect(after.rows[0].n).toBe(before.rows[0].n);

  await client.query(
    `INSERT INTO public.event_registrations (society_id, event_id, member_id, status, paid, payment_method)
     VALUES ($1, $2, $3, 'in', true, 'stripe')`,
    [M4, failEvent, PLAYER],
  );
  await succeededPayment(txFail, failEvent, PLAYER, null, "member");
  await client.query(`UPDATE public.event_registrations SET payment_transaction_id = $1 WHERE event_id = $2 AND member_id = $3`, [txFail, failEvent, PLAYER]);
  await asRole(client, "service_role", `SELECT public.record_event_stripe_refund($1, 're_failed', 'failed')`, [txFail]);
  await asRole(client, "service_role", `SELECT public.record_event_stripe_refund($1, 're_failed', 'failed')`, [txFail]);
  const failed = await client.query(
    `SELECT t.status, t.stripe_refund_status, r.paid
       FROM public.payment_transactions t
       JOIN public.event_registrations r ON r.payment_transaction_id = t.id
      WHERE t.id = $1`,
    [txFail],
  );
  expect(failed.rows[0]).toMatchObject({ status: "succeeded", stripe_refund_status: "failed", paid: true });

  await client.query(
    `INSERT INTO public.members (id, society_id, user_id, role, display_name) VALUES ($1, $2, $3, 'MEMBER', 'Departed')`,
    [goneMember, M4, "10000000-0000-4000-8000-0000000000c9"],
  );
  await client.query(`INSERT INTO public.event_registrations (society_id, event_id, member_id, status, paid) VALUES ($1, $2, $3, 'in', true)`, [M4, goneEvent, goneMember]);
  await succeededPayment(txMember, goneEvent, goneMember, null, "member");
  await client.query(`UPDATE public.event_registrations SET payment_transaction_id = $1 WHERE member_id = $2`, [txMember, goneMember]);
  await client.query(`DELETE FROM public.members WHERE id = $1`, [goneMember]);
  await asRole(client, "service_role", `SELECT public.record_event_stripe_refund($1, 're_member_gone', 'succeeded')`, [txMember]);
  const memberGone = await client.query(`SELECT status, member_id, event_name FROM public.payment_transactions WHERE id = $1`, [txMember]);
  expect(memberGone.rows).toHaveLength(1);
  expect(memberGone.rows[0]).toMatchObject({ status: "refunded", member_id: null, event_name: "Refund event" });

  await client.query(`INSERT INTO public.event_guests (id, society_id, event_id, name, sex, paid) VALUES ($1, $2, $3, 'Visitor', 'male', true)`, [goneGuest, M4, guestEvent]);
  await succeededPayment(txGuest, guestEvent, null, goneGuest, "guest");
  await client.query(`UPDATE public.event_guests SET payment_transaction_id = $1, paid = true WHERE id = $2`, [txGuest, goneGuest]);
  const linkedGuest = await client.query(`SELECT paid FROM public.event_guests WHERE id = $1`, [goneGuest]);
  expect(linkedGuest.rows[0].paid).toBe(true);
  await asRole(client, "service_role", `SELECT public.record_event_stripe_refund($1, 're_guest_here', 'succeeded')`, [txGuest]);
  const guestUpdated = await client.query(`SELECT paid FROM public.event_guests WHERE id = $1`, [goneGuest]);
  expect(guestUpdated.rows[0].paid).toBe(false);
  await client.query(`UPDATE public.payment_transactions SET status = 'succeeded', stripe_refund_status = NULL, stripe_refund_id = NULL WHERE id = $1`, [txGuest]);
  await client.query(`UPDATE public.event_guests SET paid = true, payment_transaction_id = $1 WHERE id = $2`, [txGuest, goneGuest]);
  await client.query(`DELETE FROM public.event_guests WHERE id = $1`, [goneGuest]);
  await asRole(client, "service_role", `SELECT public.record_event_stripe_refund($1, 're_guest_gone', 'succeeded')`, [txGuest]);
  const guestGone = await client.query(`SELECT status, guest_id FROM public.payment_transactions WHERE id = $1`, [txGuest]);
  expect(guestGone.rows).toHaveLength(1);
  expect(guestGone.rows[0]).toMatchObject({ status: "refunded", guest_id: null });

  await client.query(
    `INSERT INTO public.event_registrations (society_id, event_id, member_id, status, paid) VALUES ($1, $2, $3, 'in', true)`,
    [M4, guestEvent, PLAYER],
  );
  await succeededPayment(txEvent, guestEvent, PLAYER, null, "member");
  await client.query(`UPDATE public.event_registrations SET payment_transaction_id = $1 WHERE event_id = $2 AND member_id = $3`, [txEvent, guestEvent, PLAYER]);
  await client.query(`DELETE FROM public.events WHERE id = $1`, [guestEvent]);
  await asRole(client, "service_role", `SELECT public.record_event_stripe_refund($1, 're_event_gone', 'succeeded')`, [txEvent]);
  const eventGone = await client.query(`SELECT status, event_id, event_name FROM public.payment_transactions WHERE id = $1`, [txEvent]);
  expect(eventGone.rows).toHaveLength(1);
  expect(eventGone.rows[0]).toMatchObject({ status: "refunded", event_id: null, event_name: "Refund event" });
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
    await repairDb.query(`GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role`);
    await repairDb.query(`UPDATE public.payment_transactions SET status = 'succeeded', payment_method = 'stripe' WHERE idempotency_key = 'old-idem'`);
    await repairDb.query(`DELETE FROM public.events WHERE id = $1`, [EVENT]);
    const kept = await repairDb.query(
      `SELECT id, event_id, event_name, amount_pence FROM public.payment_transactions WHERE idempotency_key = 'old-idem'`,
    );
    expect(kept.rows[0]).toMatchObject({ event_id: null, event_name: "Unknown event", amount_pence: 2000 });
    const repairedCheck = await repairDb.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'payment_transactions_status_check'`,
    );
    expect(repairedCheck.rows[0].def).toContain("refund_pending");
    await expectRoleError(
      repairDb,
      "authenticated",
      `SELECT public.record_event_stripe_refund($1, 're_draft', 'succeeded')`,
      [kept.rows[0].id],
      /permission denied/,
    );
    const before = await repairDb.query(`SELECT count(*)::int AS n FROM public.payment_transactions`);
    await asRole(repairDb, "service_role", `SELECT public.record_event_stripe_refund($1, 're_draft', 'succeeded')`, [kept.rows[0].id]);
    const after = await repairDb.query(
      `SELECT status, event_id, count(*) OVER ()::int AS n FROM public.payment_transactions WHERE idempotency_key = 'old-idem'`,
    );
    expect(after.rows).toHaveLength(1);
    expect(after.rows[0]).toMatchObject({ status: "refunded", event_id: null, n: 1 });
    expect(before.rows[0].n).toBe(1);
  } finally {
    await repairDb.end();
  }
}, 60000);

it("applies the repair after the corrected foundation without changing the ledger rules", async () => {
  const both = await recreate("gsh_payment_integrity_both");
  try {
    await both.query(fixtureSql);
    await both.query(foundationSql);
    await both.query(repairSql);
    await both.query(`GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role`);
    await both.query(`INSERT INTO public.societies (id, name) VALUES ($1, 'M4')`, [M4]);
    await both.query(`INSERT INTO public.events (id, society_id, name) VALUES ($1, $2, 'Kept')`, [EVENT, M4]);
    await both.query(
      `INSERT INTO public.members (id, society_id, user_id, role, display_name) VALUES ($1, $2, $3, 'MEMBER', 'Player')`,
      [PLAYER, M4, PLAYER_USER],
    );
    await both.query(
      `INSERT INTO public.payment_transactions (
        society_id, beneficiary_society_id, event_id, payer_type, member_id,
        society_name, beneficiary_society_name, event_name, payer_display_name,
        amount_pence, currency, status, payment_method, idempotency_key, stripe_connect_account_id
      ) VALUES ($1, $1, $2, 'member', $3, 'M4', 'M4', 'Kept', 'Player', 4500, 'gbp', 'succeeded', 'stripe', 'both-idem', 'acct_m4')`,
      [M4, EVENT, PLAYER],
    );
    await both.query(`DELETE FROM public.events WHERE id = $1`, [EVENT]);
    const kept = await both.query(`SELECT id, event_id, event_name FROM public.payment_transactions WHERE idempotency_key = 'both-idem'`);
    expect(kept.rows[0]).toMatchObject({ event_id: null, event_name: "Kept" });
    await expectRoleError(both, "authenticated", `SELECT public.record_event_stripe_refund($1, 're_both', 'succeeded')`, [kept.rows[0].id], /permission denied/);
    await asRole(both, "service_role", `SELECT public.record_event_stripe_refund($1, 're_both', 'succeeded')`, [kept.rows[0].id]);
    const refunded = await both.query(`SELECT status FROM public.payment_transactions WHERE idempotency_key = 'both-idem'`);
    expect(refunded.rows[0].status).toBe("refunded");
    const check = await both.query(`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'payment_transactions_status_check'`);
    expect(check.rows[0].def).toContain("refund_pending");
  } finally {
    await both.end();
  }
}, 60000);

it("issues a hashed guest invitation and does not let authenticated read it", async () => {
  const guestDb = await recreate("gsh_guest_payment_invite");
  try {
    await guestDb.query(fixtureSql);
    await guestDb.query(foundationSql);
    await guestDb.query(guestInviteSql);
    await guestDb.query(`GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role`);
    await guestDb.query(`INSERT INTO public.societies (id, name) VALUES ($1, 'M4')`, [M4]);
    await guestDb.query(
      `UPDATE public.societies
          SET online_payments_enabled = true,
              stripe_connect_charges_enabled = true,
              stripe_connect_account_id = 'acct_m4'
        WHERE id = $1`,
      [M4],
    );
    await guestDb.query(
      `INSERT INTO public.events (id, society_id, name, date, guest_entry_fee_pence) VALUES ($1, $2, 'Guest day', '2026-12-01', 5500)`,
      [EVENT, M4],
    );
    const issued = await asRole(
      guestDb,
      "anon",
      `SELECT guest_id, society_id, payment_token, amount_pence, online_payments_enabled
         FROM public.submit_public_guest_rsvp_with_payment_token($1, 'Guest Golfer')`,
      [EVENT],
    );
    const token = issued.rows[0].payment_token as string;
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(issued.rows[0]).toMatchObject({ society_id: M4, amount_pence: 5500, online_payments_enabled: true });
    const stored = await guestDb.query(
      `SELECT token_hash, event_id, guest_id, consumed_at IS NULL AS open
         FROM public.event_guest_payment_invitations WHERE guest_id = $1`,
      [issued.rows[0].guest_id],
    );
    const { createHash } = await import("node:crypto");
    expect(stored.rows[0].token_hash).toBe(createHash("sha256").update(token, "utf8").digest("hex"));
    expect(stored.rows[0]).toMatchObject({ event_id: EVENT, open: true });
    expect(JSON.stringify(stored.rows)).not.toContain(token);
    await expectRoleError(guestDb, "authenticated", `SELECT token_hash FROM public.event_guest_payment_invitations`, [], /permission denied/);
    expect(guestInviteSql).not.toContain("DROP FUNCTION IF EXISTS public.submit_public_event_rsvp_guest");
  } finally {
    await guestDb.end();
  }
}, 60000);

it("stops unauthorised users redirecting a joint payment and blocks ineligible checkout targets", async () => {
  const db = await recreate("gsh_pay_destination_d748");
  const OUTSIDER = "10000000-0000-4000-8000-000000000099";
  const SECRETARY_USER = "10000000-0000-4000-8000-000000000016";
  const SECRETARY_MEMBER = "10000000-0000-4000-8000-000000000030";
  const LEGACY = "10000000-0000-4000-8000-000000000028";
  const UNREGISTERED = "10000000-0000-4000-8000-000000000029";
  try {
    await db.query(fixtureSql);
    await db.query(`ALTER TABLE public.events ADD COLUMN player_ids uuid[] DEFAULT '{}'`);
    await db.query(foundationSql);
    await db.query(repairSql);
    await db.query(guestInviteSql);
    await db.query(destinationSql);
    await db.query(`GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role`);
    await db.query(`GRANT SELECT ON public.event_societies, public.events, public.members TO authenticated`);
    await db.query(`GRANT UPDATE ON public.events TO authenticated`);
    await db.query(`GRANT DELETE ON public.event_societies TO authenticated`);
    await db.query(
      `INSERT INTO public.societies (id, name) VALUES ($1, 'M4'), ($2, 'ZGS'), ($3, 'Outsider')`,
      [M4, JOINT, OUTSIDER],
    );
    await db.query(
      `UPDATE public.societies SET stripe_connect_account_id = 'acct_m4', stripe_connect_charges_enabled = true WHERE id = $1`,
      [M4],
    );
    await db.query(
      `INSERT INTO public.members (id, society_id, user_id, role, display_name) VALUES
        ($1, $2, $3, 'CAPTAIN', 'Captain'),
        ($4, $2, $5, 'TREASURER', 'Treasurer'),
        ($6, $2, $7, 'SECRETARY', 'Secretary'),
        ($8, $2, $9, 'HANDICAPPER', 'Handicapper'),
        ($10, $2, $11, 'MEMBER', 'Playing Member'),
        ($12, $2, $11, 'MEMBER', 'Legacy Roster'),
        ($13, $2, $11, 'MEMBER', 'Unregistered'),
        ($14, $2, NULL, 'MEMBER', 'Withdrawn'),
        ($15, $16, $17, 'TREASURER', 'ZGS Treasurer'),
        ($18, $16, $17, 'MEMBER', 'ZGS Player')`,
      [
        "10000000-0000-4000-8000-000000000027", M4, CAPTAIN_USER,
        TREASURER_MEMBER, TREASURER_USER,
        SECRETARY_MEMBER, SECRETARY_USER,
        HANDICAPPER_MEMBER, HANDICAPPER_USER,
        PLAYER, PLAYER_USER,
        LEGACY,
        UNREGISTERED,
        WITHDRAWN,
        JOINT_TREASURER, JOINT, JOINT_TREASURER_USER,
        JOINT_PLAYER,
      ],
    );
    await db.query(
      `INSERT INTO public.events (id, society_id, name, date, player_ids, member_entry_fee_pence, joint_participant_entry_fee_pence)
       VALUES ($1, $2, 'M4 v ZGS', '2026-06-01', $3, 2500, 2500)`,
      [EVENT, M4, [LEGACY]],
    );
    await db.query(
      `INSERT INTO public.event_societies (event_id, society_id, role) VALUES ($1, $2, 'host'), ($1, $3, 'participant')`,
      [EVENT, M4, JOINT],
    );
    await db.query(
      `INSERT INTO public.event_registrations (society_id, event_id, member_id, status) VALUES ($1, $2, $3, 'in'), ($1, $2, $4, 'out')`,
      [M4, EVENT, PLAYER, WITHDRAWN],
    );
    await db.query(`UPDATE public.event_registrations SET removed_from_event_at = now() WHERE member_id = $1`, [WITHDRAWN]);

    const redirect = `UPDATE public.event_societies SET payment_beneficiary_society_id = $1 WHERE event_id = $2 AND society_id = $3`;
    await expectUserError(db, SECRETARY_USER, redirect, [OUTSIDER, EVENT, M4], /permission denied|payment_beneficiary_unauthorised/);
    await expectUserError(db, HANDICAPPER_USER, redirect, [JOINT, EVENT, M4], /permission denied|payment_beneficiary_unauthorised/);
    await expectUserError(db, PLAYER_USER, redirect, [OUTSIDER, EVENT, M4], /permission denied|payment_beneficiary_unauthorised/);
    await expectUserError(db, CAPTAIN_USER, redirect, [JOINT, EVENT, M4], /permission denied/);
    await expectRoleError(db, "service_role", redirect, [OUTSIDER, EVENT, M4], /payment_beneficiary_unauthorised/);

    await asUser(db, SECRETARY_USER, `UPDATE public.event_societies SET role = 'host' WHERE event_id = $1 AND society_id = $2`, [EVENT, M4]);
    await asUser(db, SECRETARY_USER, `UPDATE public.events SET name = 'Renamed by secretary' WHERE id = $1`, [EVENT]);
    const unchanged = await db.query(
      `SELECT payment_beneficiary_society_id FROM public.event_societies WHERE event_id = $1 AND society_id = $2`,
      [EVENT, M4],
    );
    expect(unchanged.rows[0].payment_beneficiary_society_id).toBeNull();

    await expectUserError(
      db,
      CAPTAIN_USER,
      `SELECT public.set_event_payment_beneficiary($1, $2, $3)`,
      [EVENT, M4, OUTSIDER],
      /payment_beneficiary_not_on_event/,
    );
    await expectUserError(
      db,
      SECRETARY_USER,
      `SELECT public.set_event_payment_beneficiary($1, $2, $3)`,
      [EVENT, M4, JOINT],
      /payment_beneficiary_unauthorised/,
    );
    await expectUserError(
      db,
      HANDICAPPER_USER,
      `SELECT public.set_event_payment_beneficiary($1, $2, $3)`,
      [EVENT, M4, JOINT],
      /payment_beneficiary_unauthorised/,
    );
    await expectUserError(
      db,
      PLAYER_USER,
      `SELECT public.set_event_payment_beneficiary($1, $2, $3)`,
      [EVENT, M4, JOINT],
      /payment_beneficiary_unauthorised/,
    );

    await asUser(db, CAPTAIN_USER, `SELECT public.set_event_payment_beneficiary($1, $2, $3)`, [EVENT, M4, JOINT]);
    await asUser(db, TREASURER_USER, `SELECT public.set_event_payment_beneficiary($1, $2, $3)`, [EVENT, JOINT, M4]);
    const routed = await db.query(
      `SELECT society_id, payment_beneficiary_society_id FROM public.event_societies WHERE event_id = $1 ORDER BY society_id`,
      [EVENT],
    );
    expect(routed.rows).toEqual([
      { society_id: M4, payment_beneficiary_society_id: JOINT },
      { society_id: JOINT, payment_beneficiary_society_id: M4 },
    ]);

    await asUser(db, SECRETARY_USER, `DELETE FROM public.event_societies WHERE event_id = $1 AND society_id = $2`, [EVENT, M4]);
    await asUser(
      db,
      SECRETARY_USER,
      `INSERT INTO public.event_societies (event_id, society_id, role) VALUES ($1, $2, 'host')`,
      [EVENT, M4],
    );
    const restored = await db.query(
      `SELECT payment_beneficiary_society_id FROM public.event_societies WHERE event_id = $1 AND society_id = $2`,
      [EVENT, M4],
    );
    expect(restored.rows[0].payment_beneficiary_society_id).toBe(JOINT);

    await asUser(
      db,
      JOINT_TREASURER_USER,
      `SELECT public.mark_event_paid($1, $2, $3, true, 2500, false)`,
      [EVENT, JOINT, JOINT_PLAYER],
    );
    const manual = await db.query(
      `SELECT paid, payment_method, status, amount_paid_pence FROM public.event_registrations WHERE member_id = $1`,
      [JOINT_PLAYER],
    );
    expect(manual.rows[0]).toMatchObject({ paid: true, payment_method: "manual", status: "in", amount_paid_pence: 2500 });

    async function pendingTx(id: string, memberId: string, key: string) {
      await db.query(
        `INSERT INTO public.payment_transactions (
          id, society_id, beneficiary_society_id, event_id, payer_type, member_id,
          society_name, beneficiary_society_name, event_name, payer_display_name,
          amount_pence, currency, status, payment_method, idempotency_key, stripe_connect_account_id
        ) VALUES ($1, $2, $2, $3, 'member', $4, 'M4', 'M4', 'M4 v ZGS', 'Player', 2500, 'gbp', 'pending', 'stripe', $5, 'acct_m4')`,
        [id, M4, EVENT, memberId, key],
      );
    }
    const TX_UNREG = "10000000-0000-4000-8000-000000000091";
    const TX_LEGACY = "10000000-0000-4000-8000-000000000092";
    const TX_OUT = "10000000-0000-4000-8000-000000000093";
    await pendingTx(TX_UNREG, UNREGISTERED, "unreg");
    await pendingTx(TX_LEGACY, LEGACY, "legacy");
    await pendingTx(TX_OUT, WITHDRAWN, "withdrawn-pay");
    const apply = `SELECT public.apply_event_stripe_payment($1, $2, $3, $4, 2500, 'gbp', 'acct_m4', $5, $6, NULL)`;
    await asRole(db, "service_role", apply, [TX_UNREG, "evt_unreg", "cs_unreg", "pi_unreg", EVENT, M4]);
    await asRole(db, "service_role", apply, [TX_LEGACY, "evt_legacy", "cs_legacy", "pi_legacy", EVENT, M4]);
    await asRole(db, "service_role", apply, [TX_OUT, "evt_out", "cs_out", "pi_out", EVENT, M4]);
    await asRole(db, "service_role", apply, [TX_LEGACY, "evt_legacy", "cs_legacy", "pi_legacy", EVENT, M4]);

    const unreg = await db.query(
      `SELECT t.resolution_required, t.status,
              (SELECT count(*)::int FROM public.event_registrations r WHERE r.member_id = $2) AS regs
         FROM public.payment_transactions t WHERE t.id = $1`,
      [TX_UNREG, UNREGISTERED],
    );
    expect(unreg.rows[0]).toMatchObject({ resolution_required: true, status: "succeeded", regs: 0 });
    const legacy = await db.query(
      `SELECT r.status, r.paid, r.payment_method, t.resolution_required
         FROM public.event_registrations r
         JOIN public.payment_transactions t ON t.id = $2
        WHERE r.member_id = $1`,
      [LEGACY, TX_LEGACY],
    );
    expect(legacy.rows[0]).toMatchObject({ status: "in", paid: true, payment_method: "stripe", resolution_required: false });
    const withdrawn = await db.query(
      `SELECT r.status, r.paid, r.removed_from_event_at IS NOT NULL AS removed, r.payment_resolution_required, t.resolution_required
         FROM public.event_registrations r
         JOIN public.payment_transactions t ON t.id = $2
        WHERE r.member_id = $1`,
      [WITHDRAWN, TX_OUT],
    );
    expect(withdrawn.rows[0]).toMatchObject({
      status: "out",
      paid: true,
      removed: true,
      payment_resolution_required: true,
      resolution_required: true,
    });
    const ledgerCount = await db.query(`SELECT count(*)::int AS n FROM public.payment_transactions WHERE member_id = $1`, [LEGACY]);
    expect(ledgerCount.rows[0].n).toBe(1);
  } finally {
    await db.end();
  }
}, 60000);
