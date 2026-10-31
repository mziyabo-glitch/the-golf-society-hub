# Stripe payment staging

Online payments stay off until someone turns `online_payments_enabled` on for one staging society. Do not set that flag on production project `eaenzjwecrrbhibrvgsb`. That project is not a valid staging target. This workspace does not apply SQL, seed data, or Stripe config to it.

No hosted Supabase project and no Vercel preview were created. Stripe test keys were not present here, and no Checkout was created.

## Local setup

The app and payment API stay the existing Expo web app and `scripts/dev-api-server.ts`. Staging uses a gitignored env file so the account password is generated on the machine that runs the script.

```bash
bash scripts/payments/local-staging.sh setup
bash scripts/payments/local-staging.sh start
bash scripts/payments/local-staging.sh check
```

`setup` writes `.env.staging.local` (mode 600, already covered by `.env.*.local`). `STAGING_ACCOUNT_PASSWORD` is `openssl`-equivalent `secrets.token_hex(24)`. The script does not print the password. Sign in with:

- `staging.m4.captain@gsh-staging.test`
- `staging.m4.treasurer@gsh-staging.test`
- `staging.m4.secretary@gsh-staging.test`
- `staging.m4.handicapper@gsh-staging.test`
- `staging.m4.player@gsh-staging.test`
- `staging.zgs.treasurer@gsh-staging.test`

Read the password from `.env.staging.local` on that machine. Do not commit the file and do not paste the password into a pull request, issue, or screenshot.

`setup` prefers `supabase start` and `supabase db reset --local --yes --no-seed` when Docker is running. The local API is `http://127.0.0.1:54321`. Without Docker it drops and recreates local database `gsh_payment_staging`, then applies migrations with:

```bash
supabase db reset --db-url 'postgresql://ubuntu@localhost/gsh_payment_staging?host=/var/run/postgresql' --yes --no-seed
```

That URL is a local Unix socket. The seed then runs only if the migration reset succeeded. `supabase/seeds/staging_m4_zgs_payments.sql` aborts unless all of these are true:

- psql variables `staging_password`, `staging_db_host`, and `staging_project_ref` are set
- the password is at least 16 characters
- `staging_db_host` is `127.0.0.1`, `localhost`, or `::1`
- the project ref and host do not contain `eaenzjwecrrbhibrvgsb` or a `supabase.co` host
- the server address is a loopback, private, or Unix-socket connection
- no society exists other than Staging M4 and Staging ZGS

The joint event is `Staging M4 v ZGS`, id `24000000-0000-4000-8000-000000000001`, fee 2500 pence (£25). `online_payments_enabled` stays false. Re-running the seed keeps it false.

`start` refuses to launch when `SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_URL`, or a local `.env` file points at `eaenzjwecrrbhibrvgsb`, or when `STRIPE_SECRET_KEY` is set and does not start with `sk_test_`. An absent Stripe key is allowed: Pay now stays hidden. `check` calls `GET http://127.0.0.1:3001/api/health/db`, which runs `select 1` against `STAGING_DATABASE_URL`. That route does not create a Checkout.

Web origin: `http://127.0.0.1:8081`. Payment API: `http://127.0.0.1:3001`.

## Migration order

Fresh database: `supabase db reset` applies `supabase/migrations` in filename order. Payment files:

1. `supabase/migrations/20261030180000_stripe_event_payments_foundation.sql` (30 October 2026 18:00:00, valid). Already applied to production. Do not rename it and do not apply it again there.
2. `supabase/migrations/20261030190000_stripe_payment_integrity.sql` (renamed from `20261030240000`; hour 24 is not a valid timestamp)
3. `supabase/migrations/20261030200000_guest_payment_invitations.sql` (renamed from `20261030250000`; hour 25)
4. `supabase/migrations/20261030210000_payment_destination_and_checkout_eligibility.sql` (renamed from `20261030260000`; hour 26)

The repair, guest, and destination files were not applied to production. A later production upgrade would be those three files in that order, under a separate change. Do not run it from this workspace.

If a local `supabase_migrations.schema_migrations` table still has the old versions, and only if the database host is local:

```bash
bash scripts/payments/local-staging.sh repair-local-history
```

To re-check every migration file on a throwaway local database:

```bash
bash scripts/payments/local-staging.sh validate-migrations
```

That drops and recreates local database `gsh_migration_validate` only. It does not take `--linked` and it has no project ref.

Historical files in this repo are incremental patches. Checked on 30 October 2026 with Supabase CLI 2.122.0:

```bash
supabase start
# failed: docker: command not found (podman also not found)

bash scripts/payments/local-staging.sh validate-migrations
# supabase db reset --db-url 'postgresql://ubuntu@localhost/gsh_migration_validate?host=/var/run/postgresql' --yes --no-seed
# failed at 002_rls_policies.sql: relation "public.societies" does not exist
```

The CLI labels any `--db-url` target "remote" even when the URL is a local socket. The script refuses that URL unless the host is loopback or a Unix socket, and it never passes `--linked` or project `eaenzjwecrrbhibrvgsb`. An empty database cannot finish the historical migrations until the original `public.societies` baseline exists. Payment vitest applies the four payment files on its own fixture.

With Docker absent, the web app was not opened: there is no local Auth service and the schema reset stops at `002_rls_policies.sql`. The payment API did start. `GET http://127.0.0.1:3001/api/health/db` returned `{"ok":true,"database":"reachable","via":"postgres","stripeCheckoutCreated":false}` against local `gsh_payment_staging`. No Stripe request was made.

## Server environment

Set these for the API process (`scripts/dev-api-server.ts`, port 3001). `npm run dev:web` starts Expo and the API together. `bash scripts/payments/local-staging.sh start` does that with the staging file loaded.

| Variable | Where | Rule |
| --- | --- | --- |
| `GSH_PAYMENT_STAGING` | API | `1` while staging. Refuses production URLs and live keys. |
| `EXPO_PUBLIC_GSH_PAYMENT_STAGING` | Web | `1`. Same refusal in the client. |
| `EXPO_PUBLIC_SUPABASE_URL` | Web | Local: `http://127.0.0.1:54321`. Never `eaenzjwecrrbhibrvgsb`. |
| `SUPABASE_URL` | API | Same project as the public URL. |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Web | Publishable key for that project. |
| `SUPABASE_SERVICE_ROLE_KEY` | API only | Never `EXPO_PUBLIC_*`. |
| `STAGING_DATABASE_URL` | API health check | Local Postgres URL. Loopback or Unix socket only. |
| `EXPO_PUBLIC_WEB_APP_URL` | API | `http://127.0.0.1:8081` locally. Checkout return URLs. |
| `EXPO_PUBLIC_SUPABASE_ENV` | Web | `test` |
| `STRIPE_SECRET_KEY` | API only | `sk_test_` or unset. `sk_live_` is refused. |
| `STRIPE_WEBHOOK_SECRET` | API only | From `stripe listen` or a test-mode endpoint. Not a live endpoint. |

Forward test webhooks:

```bash
stripe listen --forward-to http://127.0.0.1:3001/api/stripe/webhook
```

Put the CLI's `whsec_` value in `STRIPE_WEBHOOK_SECRET` inside `.env.staging.local`, then start again. Do not call Stripe, and do not invent a successful charge, when the test secret is absent. `GET /api/health/db` returns `stripeCheckoutCreated: false`.

## External Stripe test-mode checks

Use card `4242 4242 4242 4242`, any future expiry, and any CVC. No real money. Do this only on the empty local staging database, after `online_payments_enabled` is turned on for Staging M4 only.

1. M4 Stripe Connect Express onboarding completes. Sign in as `staging.m4.treasurer@gsh-staging.test` with `STAGING_ACCOUNT_PASSWORD` from `.env.staging.local` and `POST /api/stripe/connect-onboarding` with the Staging M4 society id. Finish Express in Stripe test mode and confirm charges are enabled.
2. Online payments remain hidden while the flag is disabled. Leave `online_payments_enabled` false and open the joint event. Pay now is absent. Bank-transfer copy can still show.
3. Only authorised members see Pay now after activation. Set `online_payments_enabled` true for Staging M4 only. A playing member sees Pay now. A withdrawn member and a member with no RSVP and no playing-list entry do not.
4. A successful £25 card payment appears exactly once in the ledger. `member_entry_fee_pence` and `joint_participant_entry_fee_pence` are 2500. One `payment_transactions` row is `succeeded` for 2500.
5. The player becomes paid and tee-sheet eligible. The registration is status `in`, `paid` true, payment method `stripe`.
6. Duplicate webhooks do not duplicate payment records. Deliver `checkout.session.completed` twice. The ledger still has one row.
7. Canceled and failed Checkouts do not mark players paid. Cancel returns to `/event/{id}?payment=canceled`. A failed or unpaid session leaves the registration unpaid.
8. A guest can pay through the public invite without creating an account. Open `/invite/{eventUuid}`, submit a name, and Pay now with the returned token at `POST /api/stripe/guest-checkout`. A raw guest UUID is rejected.
9. M4/ZGS joint payment routing is correct. Only a Captain or Treasurer can call `set_event_payment_beneficiary`. The beneficiary must be M4 or ZGS. Checkout uses that society's Connect account. A Secretary or Handicapper update of the event does not change it.
10. The Treasurer can issue a test refund. `POST /api/stripe/refund` with a Bearer token, an `Idempotency-Key`, and `{ "transactionId" }`.
11. Pending, failed, and successful refunds are represented accurately. `succeeded` marks that same row `refunded` and the linked player unpaid. `pending` sets `refund_pending` and leaves the player paid until `refund.updated`. `failed` leaves the original payment `succeeded`.
12. Expired sessions, Stripe API timeouts, and late webhooks recover safely. An expired or complete-unpaid session can be replaced. A timeout or HTTP 5xx returns 503 and does not expire or replace the open session. A later `checkout.session.completed` for the original session id still credits that one row.
13. Existing manual bank transfers continue working. With online payments off, a Captain or Treasurer can still mark a joint-event player paid. That row uses payment method `manual` and does not create a Stripe ledger charge.

## Hosted staging

Do not create this from the agent environment. Do not call Supabase project creation. Do not deploy Vercel. Do not copy production credentials, Connect account ids, or society ids from `eaenzjwecrrbhibrvgsb`.

1. Create a new empty Supabase project that is not `eaenzjwecrrbhibrvgsb`.
2. Apply migrations in the order above. Do not link the CLI at the production ref. `supabase link` and `supabase db push` against `eaenzjwecrrbhibrvgsb` are not valid staging commands.
3. The committed seed refuses any non-local host, including a hosted Supabase database. Keep using `bash scripts/payments/local-staging.sh seed` only against local Postgres. Do not weaken that guard to reach production.
4. Vercel preview environment, with Deployment Protection enabled so the preview is not public:
   - `EXPO_PUBLIC_SUPABASE_URL` = `https://<new-project-ref>.supabase.co`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY` = that project's publishable key
   - `EXPO_PUBLIC_SUPABASE_ENV` = `test`
   - `EXPO_PUBLIC_GSH_PAYMENT_STAGING` = `1`
   - `GSH_PAYMENT_STAGING` = `1`
   - `EXPO_PUBLIC_WEB_APP_URL` = the preview origin
   - `SUPABASE_SERVICE_ROLE_KEY` = that project's service role, server-only
   - `STRIPE_SECRET_KEY` = `sk_test_...`, server-only
   - `STRIPE_WEBHOOK_SECRET` = the signing secret of a Stripe **test-mode** endpoint whose URL is `https://<preview-host>/api/stripe/webhook`
5. Leave `online_payments_enabled` false until a person turns it on for the staging society only.

`eaenzjwecrrbhibrvgsb` is not a valid target for any of those variables.
