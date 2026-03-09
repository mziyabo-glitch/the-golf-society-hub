# Club Domain Discovery (Phase 1)

Automatically find likely official golf club websites for UK courses in Supabase, score candidates, and store them for later scorecard crawling.

**Pilot: 20 courses only.** No full-site crawling yet.

## Overview

1. **Build pilot list** – Extract 20 courses (including Shrivenham Park, Abbey Hill, Forest of Arden, The Belfry, Woburn, Sunningdale, Wentworth)
2. **Discovery** – Search for club domains using multiple queries per course
3. **Scoring** – Score candidates by name match, domain quality, page title, area
4. **Review** – Approve or reject candidates via CLI or admin UI
5. **Crawl** – (Future) Only crawl approved domains for scorecards

## Prerequisites

- Node.js 18+
- Supabase project with `courses` table (`id`, `name`, `area`)
- Run migration: `supabase/migrations/024_courses_and_domain_discovery.sql`
- Optional: [SerpAPI](https://serpapi.com) key for real search (free tier available)

## Environment

Create `.env` or `.env.local`:

```env
EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SERPAPI_KEY=xxx   # Optional; required for real search
```

## Commands

### 1. Build pilot course list

```bash
npm run build-pilot
```

Writes `datasets/crawl/pilot-courses.json` with 20 courses. Prioritizes: Shrivenham Park, Abbey Hill Golf Centre, Forest of Arden, The Belfry, Woburn, Sunningdale, Wentworth.

### 2. Discover domains (pilot)

```bash
# Dry run (mock data, no writes)
npm run discover-domains -- --pilot --dry-run

# Real run, pilot list only
npm run discover-domains -- --pilot

# Force re-process courses that already have candidates
npm run discover-domains -- --pilot --force
```

### 3. Discover domains (general)

```bash
# Limit/offset for pagination
npm run discover-domains -- --limit 20 --offset 0

# Single course debug
npm run discover-domains -- --course <course-uuid>
```

### 4. Re-score candidates (optional)

```bash
npm run score-domains -- --limit 50
npm run score-domains -- --limit 20 --fetch-titles
```

### 5. Approve via CLI

```bash
npm run approve-domain -- --course <course-uuid> --domain <course_domains.id> --action approve [--url https://...]
npm run approve-domain -- --course <course-uuid> --domain <course_domains.id> --action reject
```

### 6. Approve via app

1. Run the app: `npm run web` or `npm start`
2. Go to **Settings** → **Club Domains** → **Domain Review**
3. Or navigate to `/course-domains`

## Workflow (Pilot)

```
1. Run migration 024
2. npm run build-pilot                    # Build pilot-courses.json
3. npm run discover-domains -- --pilot --dry-run   # Test
4. npm run discover-domains -- --pilot             # Real
5. (Optional) npm run score-domains -- --fetch-titles
6. Review at /course-domains
7. Approve high-confidence domains
8. Later: crawl approved domains for scorecards
```

## Tables

### course_domains

| Column       | Type    | Description                    |
|-------------|---------|--------------------------------|
| id          | uuid    | Primary key                    |
| course_id   | uuid    | FK to courses                  |
| domain      | text    | e.g. `st-andrews.com`         |
| homepage_url| text    | Full URL                      |
| confidence  | numeric | 0–100 score                   |
| source      | text    | `discovery`                   |
| status      | text    | `candidate` \| `approved` \| `rejected` |
| notes       | text    | Optional                      |

### course_domain_reviews

| Column        | Type    | Description              |
|---------------|---------|--------------------------|
| id            | uuid    | Primary key              |
| course_id     | uuid    | FK to courses            |
| chosen_domain | text    | Approved domain (if any) |
| chosen_url    | text    | Approved URL (if any)    |
| decision      | text    | `approve` \| `reject`    |
| notes         | text    | Optional                 |

## Scoring

- **Name match** – Course name in domain or page title
- **Domain quality** – Short, clean domains
- **Keyword bonus** – `golf`, `club`, `links`, etc.
- **Page title** – Course name + golf/club in title
- **Area match** – Area in domain or title

**Penalties:** Social media, directories (TripAdvisor, Golfshake), generic patterns.

## Resumability

- `--offset` for pagination
- Skip courses that already have candidates (unless `--force`)
