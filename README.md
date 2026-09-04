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
DATABASE_URL=              # Vercel Postgres, auto-injected on Vercel
RESEND_API_KEY=
FROM_EMAIL=hello@blizzardbranding.com
LEO_NOTIFY_EMAIL=leo@blizzardbranding.com
UPSTASH_REDIS_REST_URL=     # optional, enables IP rate limiting
UPSTASH_REDIS_REST_TOKEN=
NEXT_PUBLIC_SITE_URL=https://tools.blizzardbranding.com
```

Without `DATABASE_URL`, `/api/audit` and the results/report pages won't have
anywhere to persist or read audits. Without `RESEND_API_KEY`, email sending is
skipped silently (the report still unlocks online). Without the Upstash
variables, the IP rate limiter is a no-op.

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
  db.ts                       Vercel Postgres client + schema
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
