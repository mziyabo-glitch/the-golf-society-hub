# Stripe payment staging

No staging Supabase project or web preview was created. The connected account can see one project, production `eaenzjwecrrbhibrvgsb` (The Golf Society Hub). Creating another project asks for a cost confirmation. That confirmation was not given, and nothing was applied to production. There is no staging URL.

Stripe test keys, Supabase service-role keys, and Vercel tokens were not present in this environment. Do not put those secrets in client code or in `EXPO_PUBLIC_*` variables.

## Migration order

Fresh database: apply `supabase/migrations` in filename order. The payment files already sort in this order, and each runs once:

1. `supabase/migrations/20261030180000_stripe_event_payments_foundation.sql`
2. `supabase/migrations/20261030240000_stripe_payment_integrity.sql`
3. `supabase/migrations/20261030250000_guest_payment_invitations.sql`
4. `supabase/migrations/20261030260000_payment_destination_and_checkout_eligibility.sql`

Do not reapply the foundation file to production. Project `eaenzjwecrrbhibrvgsb` already has the earlier draft of that file. A production upgrade would be the repair file, then the guest invitation file, then the destination/eligibility file. Do not run that upgrade from this workspace.

`online_payments_enabled` stays false until someone turns it on for one staging society. Do not set it on the live project.

## Synthetic seed

`supabase/seeds/staging_m4_zgs_payments.sql` inserts Staging M4 and Staging ZGS only. It aborts if the database already has any other society, so it is not safe to point at production and it will not modify the live clubs. The joint event fee is 2500 pence (£25). Online payments stay off. No Stripe secret is in the file.

Run it only on an empty staging database after the migrations above:

```bash
psql "postgresql://postgres@127.0.0.1:5432/postgres" -f supabase/seeds/staging_m4_zgs_payments.sql
```

Local checks in this repo use Postgres on `/var/run/postgresql` as user `ubuntu`. That is not staging and it is not production.

## Server environment

Set these on the API process only (`scripts/dev-api-server.ts`, port 3001):

- `STRIPE_SECRET_KEY` must start with `sk_test_`. Live keys are refused.
- `STRIPE_WEBHOOK_SECRET` from the Stripe CLI or a test-mode webhook endpoint.
- `SUPABASE_SERVICE_ROLE_KEY` for the staging project only.
- `SUPABASE_URL` or `EXPO_PUBLIC_SUPABASE_URL` for the staging project.
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` is the publishable client key.
- `EXPO_PUBLIC_WEB_APP_URL` is the staging web origin used for Checkout return URLs.

`npm run dev:web` starts Expo and the API together. A Vercel preview was not deployed because `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` are unset, and there is no staging Supabase project to point them at.

## External Stripe test-mode checks

Use card `4242 4242 4242 4242`, any future expiry, and any CVC. No real money. Do this only on the empty staging database.

1. M4 Stripe Connect Express onboarding completes. Sign in as the Staging M4 Treasurer (`staging.m4.treasurer@gsh-staging.test` / `StagingPayTest!2026`) and `POST /api/stripe/connect-onboarding` with the Staging M4 society id. Finish Express in Stripe test mode and confirm charges are enabled.
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
