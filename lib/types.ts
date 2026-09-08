export type CheckCategory = "seo" | "aio" | "wcag";

/**
 * "na" means the check doesn't apply to this kind of page (a services page has
 * no article to date-stamp, for instance). Those checks are still reported, so
 * the reader can see they were considered, but they're left out of the score
 * rather than counted as failures.
 */
export type CheckStatus = "pass" | "partial" | "fail" | "na";

export interface Check {
  id: string;
  category: CheckCategory;
  name: string;
  weight: number;
  status: CheckStatus;
  message: string;
  howToFix: string;
}

export type Grade = "A" | "B" | "C" | "D" | "F";

export interface CategoryResult {
  category: CheckCategory;
  score: number;
  grade: Grade;
  summary: string;
  checks: Check[];
}

export interface AuditResult {
  id: string;
  url: string;
  createdAt: string;
  combinedScore: number;
  combinedGrade: Grade;
  seo: CategoryResult;
  aio: CategoryResult;
  wcag: CategoryResult;
  blockedAutomation: boolean;
  fetchError?: string;
}

export interface FetchedPage {
  html: string;
  status: number | null;
  finalUrl: string;
  isHttps: boolean;
  headers: Record<string, string>;
  axeViolations: AxeViolation[];
  stylesheetText: string;
  blockedAutomation: boolean;
  wordCount: number;
}

export interface AxeViolation {
  id: string;
  impact: string | null;
  nodes: number;
}
