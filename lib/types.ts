export type CheckCategory = "seo" | "aio" | "wcag";

export type CheckStatus = "pass" | "partial" | "fail";

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
