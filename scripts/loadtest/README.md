# Supabase Auth Load Test

Simple Node scripts that sign up and log in N test users concurrently against
your Supabase project to verify auth throughput and rate limits.

## Prerequisites

- Node 18+
- A Supabase project URL and anon key

## Setup

```bash
cd scripts/loadtest
npm init -y
npm i dotenv
cp .env.example .env
# Edit .env — fill SUPABASE_URL and SUPABASE_ANON_KEY
```

## Usage

### 1. Sign up test users

```bash
node signup-many.mjs 20
```

- Creates 20 users with emails `loadtest+<RUN_ID>+0@example.com` … `loadtest+<RUN_ID>+19@example.com`
- Prints a `RUN_ID` — you need this for the login step.
- Override count via CLI arg or `N` in `.env`.

### 2. Log in test users

```bash
node login-many.mjs <RUN_ID> 20
```

- Logs in the 20 users created in step 1.
- After each successful login, makes a read request to the `profiles` table to simulate real usage.
- Prints latency percentiles (p50, p95, p99) and failure details.

## Configuration (.env)

| Variable        | Description                              | Default        |
|-----------------|------------------------------------------|----------------|
| `SUPABASE_URL`  | Your Supabase project URL                | **(required)**  |
| `SUPABASE_ANON_KEY` | Your Supabase anon/public key        | **(required)**  |
| `TEST_PASSWORD` | Password for all test accounts           | `Password123!` |
| `N`             | Number of users (override via CLI arg)   | `20`           |
| `RUN_ID`        | Unique run identifier (auto-generated)   | *(random hex)* |
| `BATCH_SIZE`    | Max concurrent requests per batch        | `10`           |
| `BATCH_DELAY_MS`| Delay between batches in milliseconds    | `1000`         |

## Throttling

Both scripts process users in batches of `BATCH_SIZE` (default 10) with a
`BATCH_DELAY_MS` (default 1000ms) pause between batches. This keeps you
under Supabase rate limits on the free tier (~30 requests/second).

Increase `BATCH_SIZE` and decrease `BATCH_DELAY_MS` for higher throughput
on paid tiers.

## Important notes

- **Email confirmation**: If your Supabase project has "Confirm email" enabled,
  sign-ups will succeed but logins will fail because the accounts aren't
  confirmed. For load testing, go to Supabase Dashboard → Authentication →
  Providers → Email → toggle OFF "Confirm email".

- **Cleanup**: Test users use `@example.com` addresses and are identifiable by
  the `loadtest+` prefix. Delete them via Supabase Dashboard → Authentication →
  Users when done.

- **Rate limits**: Supabase free tier rate-limits auth endpoints. If you see 429
  errors, increase `BATCH_DELAY_MS` or reduce `BATCH_SIZE`.
