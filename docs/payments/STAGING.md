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

`setup` writes `staging.local.env` (mode 600, gitignored). The name does not start with `.env`. Expo's web bundle loads every project-root file matching `/^\.\/\.env/` and fails on a file that is not `.env`, `.env.local`, `.env.development`, or `.env.development.local`. `STAGING_ACCOUNT_PASSWORD` is `openssl`-equivalent `secrets.token_hex(24)`. The script does not print the password. Sign in with:

- `staging.m4.captain@gsh-staging.test`
- `staging.m4.treasurer@gsh-staging.test`
- `staging.m4.secretary@gsh-staging.test`
- `staging.m4.handicapper@gsh-staging.test`
- `staging.m4.player@gsh-staging.test`
- `staging.zgs.treasurer@gsh-staging.test`

Read the password from `staging.local.env` on that machine. Do not commit the file and do not paste the password into a pull request, issue, or screenshot. If an older `.env.staging.local` is still in the project root, `scripts/payments/local-staging.sh` moves it to `staging.local.env` when that file is missing, and refuses to start while `.env.staging.local` remains.

`setup` prefers `supabase start` and `supabase db reset --local --yes --no-seed` when Docker is running. The local API is `http://127.0.0.1:54321`. Without Docker, and only when `SUPABASE_EXPERIMENTAL_STACK=1 supabase start --help` lists `--runtime native`, `setup` runs:

```bash
SUPABASE_EXPERIMENTAL_STACK=1 supabase start --runtime native --eager \
  --exclude studio,mail,analytics,realtime,storage,functions,pooler --yes
```

That flag is absent from `supabase start --help` until the experimental stack is turned on for the process. This repo does not set `[experimental] stack = true`, because that switches every `supabase start` onto the experimental engine and the fixed ports in `supabase/config.toml` become exact requests. If the CLI has no native runtime flag and Docker is absent, `setup` falls back to local database `gsh_payment_staging` and says that path has no Auth and no REST API. It applies migrations with:

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

`supabase/migrations/20261104140000_joint_payments_stay_with_payer_society.sql` follows `20261104021500_staging_platform_charge_apply.sql`. Checkout ignores a cross-society destination. Each society collects its own fee. This file was not applied to production.

The repair, guest, and destination files were not applied to production. A later production upgrade would be those three files in that order, under a separate change. Do not run it from this workspace. Do not apply the joint-payment file to production from this workspace either.

If a local `supabase_migrations.schema_migrations` table still has the old versions, and only if the database host is local:

```bash
bash scripts/payments/local-staging.sh repair-local-history
```

To re-check every migration file on a throwaway local database:

```bash
bash scripts/payments/local-staging.sh validate-migrations
```

That drops and recreates local database `gsh_migration_validate` only. It does not take `--linked` and it has no project ref.

## Why `002_rls_policies.sql` fails

The first file in `supabase/migrations` is `002_rls_policies.sql`. There is no `001`. Its header says to run it in the Supabase SQL Editor. The first statement is `ALTER TABLE public.societies ENABLE ROW LEVEL SECURITY`. The same file then alters `public.profiles`, `public.members`, and `public.events`. None of those tables are created earlier in the migration list.

`public.societies` and `public.members` are never created by any committed migration. `git log -S 'CREATE TABLE public.societies'` finds that statement only in the payment vitest fixture, not in a migration. `public.events` is created later by `005_fix_members_events_complete.sql`. `public.profiles` is created later by `031_user_profile_fields.sql`. `supabase/config.toml` has `schema_paths = []`. There is no `schema.sql`, no generated Database type, and no declarative schema directory.

Checked on 31 October 2026 with Supabase CLI 2.122.0. `docker` and `podman` are not installed. `supabase start --runtime native` applies the same migration list and stops at `002_rls_policies.sql` with `relation "public.societies" does not exist`. The 30 October socket run of `bash scripts/payments/local-staging.sh validate-migrations` stopped on that same statement. The CLI labels any `--db-url` target "remote" even when the URL is a local socket. The script refuses that URL unless the host is loopback or a Unix socket, and it never passes `--linked` or project `eaenzjwecrrbhibrvgsb`.

The original core tables were created outside this repository, in the Supabase SQL editor, before these files were saved as migrations. Later files are patches on that dashboard schema. A one-line `CREATE TABLE societies` is not the missing baseline: `002` also requires `profiles`, `members`, and `events`, and later files assume columns that were never added by a `CREATE TABLE` (`societies.join_code`, `societies.country`, `societies.created_by`, `societies.logo_url`, `members.name`, `members.role`, `members.paid`, `members.amount_paid_pence`).

A fresh replay of the committed files is not achievable even after those four tables are created from the columns the later files assume. A local Postgres 16 probe (not committed, not pointed at production) applied 174 of 187 files and then hit historical migrations that do not replay onto an empty database:

- `007_event_results_table.sql` and `008_fix_event_results_rls.sql` read `members.roles`. `009_fix_event_results_rls_v2.sql` says that column does not exist and that `members.role` is the real column. The migration runner stops at `007`, so `009` never runs.
- `048_course_tees_and_event_tee_id.sql` adds `events.tee_id` referencing `public.course_tees` before `049_golf_api_course_import.sql` creates that table. The file's own comment says `049` creates it. Filename order runs `048` first.
- `082_restore_david_nyoni_m4_membership.sql` raises `M4 society not found` unless a society whose name matches `%m4%` already exists. If one does, the file inserts a member named David Nyoni. That is a production data repair, not schema, and it must not be replayed onto staging.
- `099_event_prize_pool_opt_in_and_manager.sql` creates a SQL function that reads `event_prize_pool_managers` before that table is created later in the same file.
- `160_tee_sheet_draft_manco_rls.sql` and `173_fix_publish_tee_times_time_cast.sql` use `CREATE OR REPLACE FUNCTION` in a way Postgres rejects when the existing function's argument name `p_start` would change.

Editing those files would change the checksum of migrations already applied on production. They were left unchanged. Payment vitest still applies the four payment files on its own fixture. A fresh replay of `supabase/migrations` is still not the way to build staging. The local database that is running now was loaded from a schema-only copy of production, then the three unapplied payment files, as described below.

## Schema-only export

On 31 October 2026 Brian approved a read-only, schema-only export from production project `eaenzjwecrrbhibrvgsb`. `pg_dump` and `supabase db dump` did not run. A dry-run of `supabase db dump --schema public,storage --project-ref eaenzjwecrrbhibrvgsb` returned `AccessTokenRequiredError`. These names were unset: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `DATABASE_URL`, `SUPABASE_DB_URL`, `POSTGRES_PASSWORD`, `PGPASSWORD`, `DB_PASSWORD`. There was no `supabase login` session. The service role key was not used as a database password.

The DDL was reconstructed from read-only catalog `SELECT`s (columns, constraints, functions, policies, indexes, triggers, grants) for schemas `public` and `storage`. Production received no `INSERT`, `UPDATE`, `DELETE`, or DDL. No migration was applied there. `online_payments_enabled` was not changed.

The SQL is under `/tmp/gsh-schema` on that machine and is not in git. A review of it found top-level DDL only (`CREATE`, `ALTER`, `COMMENT`, `GRANT`, policies, indexes, triggers). It has no `COPY`, no row inserts into data tables, no `auth.users` rows, no password hashes, no member emails, and no `acct_` Connect ids. Function bodies contain the word `INSERT` as their own SQL source. `auth.users` appears only as a foreign-key target. PostGIS objects owned by the extension were omitted; the local database needs `CREATE EXTENSION postgis WITH SCHEMA public` before the table DDL. The `auth` schema was not exported. Storage tables, functions, and policies were included. `storage.objects` and `storage.buckets` were created empty.

## Local baseline

`[db.migrations] enabled` was set false only so `supabase start --runtime native` could boot, then restored to true. That config change is not committed. The ready stack is runtime `native`, API `http://127.0.0.1:54321`, database `127.0.0.1:54322`. The storage, realtime, functions, and pooler services were excluded from the start. Storage DDL is in the database; the Storage HTTP service is not running.

The empty local `public` schema was loaded from the DDL as `supabase_admin`. Production migration versions were inserted into `supabase_migrations.schema_migrations` and were not executed again. Production's foundation version is `20261030223626` (`stripe_event_payments_foundation`), not `20261030180000`. Both versions were marked applied. `20261030180000_stripe_event_payments_foundation.sql` was not executed and was not renamed. Production follow-ups `20261030223700` and `20261030223732` were marked applied and not executed. Do not run `supabase db reset` or `supabase migration up` on this database. Other local filenames are absent from that history and a reset would try to replay them.

These three files were applied next, in order, each with exit 0:

1. `supabase/migrations/20261030190000_stripe_payment_integrity.sql`
2. `supabase/migrations/20261030200000_guest_payment_invitations.sql`
3. `supabase/migrations/20261030210000_payment_destination_and_checkout_eligibility.sql`

`bash scripts/payments/local-staging.sh seed` then exited 0 against `127.0.0.1:54322`. The societies table holds Staging M4 (`22000000-0000-4000-8000-000000000001`) and Staging ZGS (`22000000-0000-4000-8000-000000000002`). `online_payments_enabled` is false on both. `payment_transactions` has no rows. The seed still aborts on a non-local host, on project ref `eaenzjwecrrbhibrvgsb`, and when any society other than those two already exists. An empty societies table is allowed. The guard was not changed.

Auth and REST, local only:

- `POST /auth/v1/token?grant_type=password` for `staging.m4.treasurer@gsh-staging.test` returned HTTP 200 and a session. `GET /auth/v1/user` returned that address.
- `GET /rest/v1/societies?select=id,name,online_payments_enabled` with the local anon key returned HTTP 200 and an empty array. That is row-level security, not `PGRST205`.
- The same query with the treasurer access token returned HTTP 200 for Staging M4 and Staging ZGS, both with `online_payments_enabled` false.

`bash scripts/payments/local-staging.sh start` then served the web app at `http://127.0.0.1:8081` and the payment API at `http://127.0.0.1:3001`. `GET /api/health/db` returned `{"ok":true,"database":"reachable","via":"postgres","stripeCheckoutCreated":false}`.

Signed in through the web UI as `staging.m4.player@gsh-staging.test` and opened `/event/24000000-0000-4000-8000-000000000001`. The player is Playing, the fee is outstanding, and Pay now is absent. `/invite/24000000-0000-4000-8000-000000000001` shows the public RSVP choice (member or guest) and no Pay now. Signed in as `staging.m4.treasurer@gsh-staging.test`, `/treasurer` shows Opening Balance, Total Income, Total Costs, and Current Balance at £0.00, with no ledger entries.

No Stripe API call was made. No `sk_test_` key is configured. No Checkout was created.

## Native Supabase runtime

CLI `2.122.0` on Linux x86_64, glibc 2.39. `supabase start --help` with no experimental setting does not list a runtime flag. Its description is "Start containers for Supabase local development" and its only flags are `--exclude` and `--ignore-health-check`.

With `SUPABASE_EXPERIMENTAL_STACK=1`, `supabase stack --help` starts with "Manage an experimental, unstable local Supabase stack", and `supabase start --help` adds:

```text
--runtime choice    Runtime to use for a new stack. auto selects Docker, then Podman, then native, based on what is available. (choices: auto, docker, podman, native)
--eager             Activate all enabled capabilities before returning and disable automatic idle stops.
```

`supabase start --runtime native --eager --exclude studio,mail,analytics,realtime,storage,functions,pooler --yes` was run on 31 October 2026.

With migrations left enabled, the native stack seeded its own roles and then exited 1 at `002_rls_policies.sql`: `relation "public.societies" does not exist`. Auth and PostgREST were not left running. That is the same schema gap as the socket reset. It is not a missing Docker daemon and not an unsupported OS.

A second start, with `[db.migrations] enabled` set to false only for that process and then restored to true, reached "Stack is ready" with `"runtime":"native"`. API `http://127.0.0.1:54321`. Database `127.0.0.1:54322`. That config change was not committed.

On that temporary stack:

- `POST /auth/v1/signup` for `staging.native.probe@gsh-staging.test` returned HTTP 200 and a session.
- `POST /auth/v1/token?grant_type=password` for the same address returned HTTP 200.
- `GET /rest/v1/` returned HTTP 200 and a PostgREST OpenAPI document (PostgREST 16.5).
- `GET /rest/v1/societies?select=id&limit=1` returned HTTP 404 `PGRST205` (`Could not find the table 'public.societies' in the schema cache`).

The password for that probe stayed in a mode 600 file under `/tmp` and was deleted. That diagnostic stack was destroyed with `supabase stack destroy --yes`. It did not have the application schema, so the Expo app was not opened against it. A later native start, described in "Local baseline", loaded the schema and is the stack the app uses.

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
stripe listen --forward-to http://127.0.0.1:3001/api/stripe/webhook --forward-connect-to http://127.0.0.1:3001/api/stripe/webhook
```

Put the CLI's `whsec_` value in `STRIPE_WEBHOOK_SECRET` inside `staging.local.env`, then start again. Do not call Stripe, and do not invent a successful charge, when the test secret is absent. `GET /api/health/db` returns `stripeCheckoutCreated: false`.

## External Stripe test-mode checks

No Stripe API call was made from this environment. There is no `sk_test_` key here. Do not treat the steps below as a passed integration test.

The local schema baseline, the three payment migrations, and the Staging M4 / Staging ZGS seed are done. The checks below are not. No Stripe call has been made. `online_payments_enabled` stays false until a person turns it on for Staging M4 only. Card `4242 4242 4242 4242`, any future expiry, any CVC. No real money.

Put `STRIPE_SECRET_KEY=sk_test_...` in `staging.local.env` only. Then, in another terminal:

```bash
stripe listen --forward-to http://127.0.0.1:3001/api/stripe/webhook --forward-connect-to http://127.0.0.1:3001/api/stripe/webhook
```

Copy that command's `whsec_` into `STRIPE_WEBHOOK_SECRET` in the same gitignored file and run `bash scripts/payments/local-staging.sh start` again.

1. Test-mode Express connected account. Sign in as `staging.m4.treasurer@gsh-staging.test` with `STAGING_ACCOUNT_PASSWORD` from `staging.local.env`. Call `POST http://127.0.0.1:3001/api/stripe/connect-onboarding` with `Authorization: Bearer <access_token>` and body `{"societyId":"22000000-0000-4000-8000-000000000001"}`. Open the returned Account Link, finish Express in Stripe test mode, and confirm `societies.stripe_connect_charges_enabled` is true for Staging M4. The account id must be a new test-mode `acct_` created by that call, not a production Connect account. This step has not been run.
2. Online payments remain hidden while the flag is disabled. This was checked on the local stack: `online_payments_enabled` is false, the joint event shows Fee outstanding for the playing member, and Pay now is absent. Bank-transfer copy can still show when the society has instructions. Staging M4 has none, so the payment section stays hidden.
3. Only authorised members see Pay now after activation. Set `online_payments_enabled` true for Staging M4 only. A playing member sees Pay now. A withdrawn member and a member with no RSVP and no playing-list entry do not.
4. A successful £25 member payment appears exactly once in the ledger. Sign in as `staging.m4.player@gsh-staging.test`. `POST http://127.0.0.1:3001/api/stripe/create-checkout-session` with `Authorization: Bearer <access_token>`, header `Idempotency-Key` of at least 8 characters, and body `{"eventId":"24000000-0000-4000-8000-000000000001","societyId":"22000000-0000-4000-8000-000000000001","payerType":"member"}`. Pay the Checkout for 2500 pence. The player sees one amount, the event fee. `member_entry_fee_pence` and `joint_participant_entry_fee_pence` are 2500. One `payment_transactions` row is `succeeded` for 2500. A Connect charge is a direct charge on the society's connected account: the Stripe-Account header, `application_fee_amount` of 2% of that event fee (50 pence), and no `transfer_data` or `on_behalf_of`. A stored `player_pays` value does not change the total. A staging platform-only charge (`STAGING_PLATFORM_ONLY_PAYMENTS` exactly true, and the society has no charges-enabled Connect account) has no Stripe-Account header and no application fee. `stripe listen` must include `--forward-connect-to` so the connected-account webhook is delivered.
5. The player becomes paid and tee-sheet eligible. The registration is status `in`, `paid` true, payment method `stripe`.
6. Duplicate webhooks do not duplicate payment records. Deliver `checkout.session.completed` twice. The ledger still has one row.
7. Canceled and failed Checkouts do not mark players paid. Cancel returns to `/event/{id}?payment=canceled`. A failed or unpaid session leaves the registration unpaid.
8. A guest can pay through the public invite without creating an account. Open `http://127.0.0.1:8081/invite/24000000-0000-4000-8000-000000000001`, submit a name, and use the returned `paymentToken`. `POST http://127.0.0.1:3001/api/stripe/guest-checkout` with header `Idempotency-Key` and body `{"paymentToken":"<token>","eventId":"24000000-0000-4000-8000-000000000001","societyId":"22000000-0000-4000-8000-000000000001","guestId":"<guest uuid>"}`. A raw guest UUID without that token is rejected.
9. Joint events are paid per society. A Staging M4 member pays Staging M4's fee on Staging M4's connected account, and that ledger row is visible to the Staging M4 Treasurer. A Staging ZGS member pays Staging ZGS the same way. A guest pays the society that invited them. There is no cross-society payout and no payment into the other society's account. Checkout is a direct charge on that connected account. The player sees one amount, the event fee. Player pays is removed until a professional has reviewed UK surcharge rules, and a stored `player_pays` value does not change the charge. The platform fee is `PLATFORM_FEE_BASIS_POINTS` (200, 2.00%) of the event fee, rounded half-up to whole pence. £25 is 50 pence. £45 is 90 pence. The payment row snapshots the rate and the pence amount. The ledger Stripe card fee is the connected-account balance transaction `stripe_fee`, and the ledger platform fee is the charge's application fee. Neither is copied from a quote. Society net is that balance transaction's net, which reconciles as gross minus the card fee minus the application fee. A staging platform-only charge has no application fee. The Treasurer sees gross, the Stripe card fee, the Golf Society Hub platform fee, society net, and reconciliation.
10. Refund. As `staging.m4.treasurer@gsh-staging.test`, `POST http://127.0.0.1:3001/api/stripe/refund` with `Authorization: Bearer <access_token>`, header `Idempotency-Key`, and body `{"transactionId":"<payment_transactions.id>"}`. `stripe listen` must forward connected-account `charge.refunded` and `refund.updated` (`--forward-connect-to`) before the ledger matches Stripe. A direct-charge refund is created with the Stripe-Account header and `refund_application_fee: true`, so a full refund returns the platform fee. It does not set `reverse_transfer`, because a direct charge has no transfer. The refund does not add a fee of its own. `stripe_application_fee_refunded_pence` is written only from Stripe's ApplicationFee `amount_refunded`. A staging platform-only refund has no application fee and does not set `refund_application_fee`.
11. Pending, failed, and successful refunds are represented accurately. `succeeded` marks that same row `refunded` and the linked player unpaid. `pending` sets `refund_pending` and leaves the player paid until `refund.updated`. `failed` leaves the original payment `succeeded`.
12. Expired sessions, Stripe API timeouts, and late webhooks recover safely. An expired or complete-unpaid session can be replaced. A timeout or HTTP 5xx returns 503 and does not expire or replace the open session. A later `checkout.session.completed` for the original session id still credits that one row.
13. Existing manual bank transfers continue working. With online payments off, a Captain or Treasurer can still mark a joint-event player paid. That row uses payment method `manual` and does not create a Stripe ledger charge.

## Hosted staging

Do not create this from the agent environment. Do not call Supabase project creation. Do not deploy Vercel. Do not copy production credentials, Connect account ids, or society ids from `eaenzjwecrrbhibrvgsb`.

1. Create a new empty Supabase project that is not `eaenzjwecrrbhibrvgsb`.
2. Load the approved schema-only baseline, mark the production migration versions applied, then apply only `20261030190000`, `20261030200000`, and `20261030210000`. Do not replay `002_rls_policies.sql` onto an empty database and do not run `20261030180000` again. Do not link the CLI at the production ref. `supabase link` and `supabase db push` against `eaenzjwecrrbhibrvgsb` are not valid staging commands.
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
