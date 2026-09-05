# Blizzard Site Checker

Audits any URL against 35 SEO, AI-optimization, and WCAG 2.2 AA checks,
returns three category scores and a combined grade, and gates the detailed
breakdown behind email capture.

## Stack

Next.js 15 (App Router) + TypeScript + Tailwind v4. Playwright (`playwright-core`
+ `@sparticuz/chromium`) renders the target page and runs `axe-core` in-page
for the accessibility checks; `cheerio` handles the static HTML parsing for
SEO and AIO checks.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Auditing a live URL requires a local Chromium build. This repo assumes
`playwright-core` can find one at `/opt/pw-browsers/chromium`; on a machine
without that path installed, run `npx playwright install chromium` and point
`lib/fetch-page.ts`'s `LOCAL_CHROMIUM_PATH` at the installed binary instead
(or let Playwright fall back to its own managed installs).

## Environment variables

Copy `.env.example` to `.env` and fill in:

```
POSTGRES_URL=               # auto-injected once you connect a Postgres database
POSTGRES_URL_NON_POOLING=   # auto-injected alongside POSTGRES_URL
MAILERLITE_API_KEY=         # newsletter signup on the report gate
MAILERLITE_GROUP_ID=        # optional, adds subscribers to one specific group
RESEND_API_KEY=
FROM_EMAIL=hello@blizzardbranding.com
LEO_NOTIFY_EMAIL=leo@blizzardbranding.com
UPSTASH_REDIS_REST_URL=     # optional, enables IP rate limiting
UPSTASH_REDIS_REST_TOKEN=
NEXT_PUBLIC_SITE_URL=https://tools.blizzardbranding.com
```

The database layer (`lib/db.ts`) takes a standard Postgres connection string
and looks for one in this order:

1. `SITE_CHECKER_DATABASE_URL`, if set.
2. The unprefixed conventional names: `POSTGRES_URL`, `DATABASE_URL`,
   `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`, `DATABASE_URL_UNPOOLED`,
   `DIRECT_URL`, `DIRECT_DATABASE_URL`.
3. The same names carrying a resource prefix, which is how Vercel storage
   integrations inject them (`tools_POSTGRES_URL`, `bbsitechecker_DATABASE_URL`).
4. Any env var at all whose value is a `postgres://` URL.

Steps 3 and 4 sort names so the choice is stable across deployments. If more
than one database is attached, pin the one you want with
`SITE_CHECKER_DATABASE_URL`, otherwise which one wins is deterministic but
arbitrary, and audits written to one won't be readable from the other.

A **Prisma Postgres** database that only exposes a `prisma+postgres://`
Accelerate URL will not work: that's an HTTP proxy protocol rather than the
Postgres wire protocol this app speaks.

Hit `/api/health/db` on a deployment to check the connection. It reports
which env vars are present (names only, never values) and whether the
database is reachable.

Without a connection string, `/api/audit` and the results/report pages won't
have anywhere to persist or read audits. Without `MAILERLITE_API_KEY`, the
signup form still unlocks the report and still records the lead, it just
doesn't add anyone to the newsletter. Without `RESEND_API_KEY`, email sending
is skipped silently. Without the Upstash variables, the IP rate limiter is a
no-op. None of these failures block the report: someone who submits the form
always gets through.

## Architecture

```
app/
  page.tsx                    landing: URL input + hero
  results/[id]/page.tsx       public scores page (top-line only)
  report/[id]/page.tsx        gated full report (post-email)
  api/audit/route.ts          POST url -> runs checks, returns id
  api/capture/route.ts        POST email+business -> unlocks report
  api/report/[id]/pdf/route.ts GET -> generated PDF
lib/
  checks/{seo,aio,wcag}.ts    the 35 checks, one file per category
  checks/index.ts             orchestrator: fetch + run + score
  fetch-page.ts               Playwright/axe-core wrapper
  scorer.ts                   weight math + letter grades
  pdf-builder.tsx             @react-pdf/renderer report
  db.ts                       node-postgres client + schema
  rate-limit.ts               Upstash IP rate limiting
  resend.ts                   lead + report emails
components/
  ScoreCard.tsx, CheckItem.tsx, LeadForm.tsx, UrlInput.tsx
```

## Deployment (Vercel)

1. `vercel link` to a new project.
2. Add Vercel Postgres from the dashboard (the schema is created lazily on
   first write by `lib/db.ts`, no manual migration needed).
3. Add the Resend integration or set `RESEND_API_KEY` manually.
4. Point `tools.blizzardbranding.com` at the project with a CNAME to
   `cname.vercel-dns.com`.
5. `vercel.json` sets `maxDuration: 60` on `/api/audit` for the Playwright run;
   make sure Fluid Compute is enabled since a full audit routinely takes
   20 to 40 seconds.

Push to `main` deploys to production.
