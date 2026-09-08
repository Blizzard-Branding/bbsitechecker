import * as cheerio from "cheerio";
import { randomUUID } from "node:crypto";
import { fetchPage } from "../fetch-page";
import { buildCategoryResult, combinedScore, gradeFromScore } from "../scorer";
import type { AuditResult, Check } from "../types";
import { runSeoChecks } from "./seo";
import { runAioChecks } from "./aio";
import { runWcagChecks } from "./wcag";

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return new URL(withProtocol).toString();
}

/**
 * Checks that don't depend on reading the page body: they either describe the
 * connection or fetch a separate file from the domain root. These stay
 * meaningful even when the page itself was withheld from us.
 */
const CHECKS_INDEPENDENT_OF_PAGE_BODY = new Set([
  "https",
  "robots-txt",
  "sitemap-in-robots",
  "llms-txt",
]);

/**
 * When a site blocks automated tools we get a challenge or error page, not the
 * real one. Reporting "no meta description" off the back of that is worse than
 * reporting nothing: it tells someone their site is broken when it isn't. Mark
 * everything derived from the page body as not applicable so the report says
 * what actually happened.
 */
export function setAsideBodyChecks(checks: Check[], status: number | null): Check[] {
  return checks.map((c) => {
    if (CHECKS_INDEPENDENT_OF_PAGE_BODY.has(c.id)) return c;
    return {
      ...c,
      status: "na" as const,
      message: status
        ? `Not checked. The site returned ${status} to our request, so we never received the real page.`
        : "Not checked. The site blocked our request, so we never received the real page.",
      howToFix: "Allow the checker to read the page, then run the audit again.",
    };
  });
}

export async function runAudit(rawUrl: string): Promise<AuditResult> {
  const url = normalizeUrl(rawUrl);
  const page = await fetchPage(url);
  const $ = cheerio.load(page.html);

  const [rawSeoChecks, rawAioChecks] = await Promise.all([
    runSeoChecks($, page),
    runAioChecks($, page, page.html),
  ]);
  const rawWcagChecks = runWcagChecks($, page);

  const blocked = page.blockedAutomation;
  const seoChecks = blocked ? setAsideBodyChecks(rawSeoChecks, page.status) : rawSeoChecks;
  const aioChecks = blocked ? setAsideBodyChecks(rawAioChecks, page.status) : rawAioChecks;
  const wcagChecks = blocked ? setAsideBodyChecks(rawWcagChecks, page.status) : rawWcagChecks;

  const seo = buildCategoryResult("seo", seoChecks);
  const aio = buildCategoryResult("aio", aioChecks);
  const wcag = buildCategoryResult("wcag", wcagChecks);

  const combined = combinedScore(seo.score, aio.score, wcag.score);

  return {
    id: randomUUID(),
    url,
    createdAt: new Date().toISOString(),
    combinedScore: combined,
    combinedGrade: gradeFromScore(combined),
    seo,
    aio,
    wcag,
    blockedAutomation: page.blockedAutomation,
    fetchError: page.status !== null && page.status >= 400 ? `Site returned status ${page.status}.` : undefined,
  };
}
