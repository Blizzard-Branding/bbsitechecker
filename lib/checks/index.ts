import * as cheerio from "cheerio";
import { randomUUID } from "node:crypto";
import { fetchPage } from "../fetch-page";
import { buildCategoryResult, combinedScore, gradeFromScore } from "../scorer";
import type { AuditResult } from "../types";
import { runSeoChecks } from "./seo";
import { runAioChecks } from "./aio";
import { runWcagChecks } from "./wcag";

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return new URL(withProtocol).toString();
}

export async function runAudit(rawUrl: string): Promise<AuditResult> {
  const url = normalizeUrl(rawUrl);
  const page = await fetchPage(url);
  const $ = cheerio.load(page.html);

  const [seoChecks, aioChecks] = await Promise.all([
    runSeoChecks($, page),
    runAioChecks($, page, page.html),
  ]);
  const wcagChecks = runWcagChecks($, page);

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
