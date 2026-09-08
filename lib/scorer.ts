import type { Check, CheckCategory, CategoryResult, Grade } from "./types";

const STATUS_VALUE: Record<Exclude<Check["status"], "na">, number> = {
  pass: 100,
  partial: 50,
  fail: 0,
};

function isScored(check: Check): boolean {
  return check.status !== "na";
}

export function gradeFromScore(score: number): Grade {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

export function scoreChecks(checks: Check[]): number {
  const scored = checks.filter(isScored);
  const totalWeight = scored.reduce((sum, c) => sum + c.weight, 0);
  // Nothing applicable means nothing to fix, so it shouldn't read as a zero.
  if (totalWeight === 0) return 100;
  const earned = scored.reduce(
    (sum, c) => sum + c.weight * STATUS_VALUE[c.status as keyof typeof STATUS_VALUE],
    0,
  );
  return Math.round((earned / (totalWeight * 100)) * 100);
}

const CATEGORY_LABEL: Record<CheckCategory, string> = {
  seo: "SEO",
  aio: "AI Optimization",
  wcag: "WCAG 2.2 AA",
};

function summarize(category: CheckCategory, score: number, checks: Check[]): string {
  const failing = checks.filter((c) => c.status === "fail").length;
  const scored = checks.filter(isScored).length;
  const label = CATEGORY_LABEL[category];
  if (failing === 0) {
    return `${label} is in good shape. No failing checks.`;
  }
  return `${label} has ${failing} failing ${failing === 1 ? "check" : "checks"} out of ${scored}.`;
}

export function buildCategoryResult(
  category: CheckCategory,
  checks: Check[],
): CategoryResult {
  const score = scoreChecks(checks);
  return {
    category,
    score,
    grade: gradeFromScore(score),
    summary: summarize(category, score, checks),
    checks,
  };
}

export function combinedScore(seo: number, aio: number, wcag: number): number {
  return Math.round((seo + aio + wcag) / 3);
}
