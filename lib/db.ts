import { sql } from "@vercel/postgres";
import type { AuditResult } from "./types";

export interface Lead {
  email: string;
  businessName: string;
  urlAudited: string;
  combinedScore: number;
  seoScore: number;
  aioScore: number;
  wcagScore: number;
}

let schemaReady: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS audits (
          id TEXT PRIMARY KEY,
          url TEXT NOT NULL,
          combined_score INTEGER NOT NULL,
          seo_score INTEGER NOT NULL,
          aio_score INTEGER NOT NULL,
          wcag_score INTEGER NOT NULL,
          result JSONB NOT NULL,
          unlocked BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS leads (
          id SERIAL PRIMARY KEY,
          audit_id TEXT NOT NULL REFERENCES audits(id),
          email TEXT NOT NULL,
          business_name TEXT NOT NULL,
          url_audited TEXT NOT NULL,
          combined_score INTEGER NOT NULL,
          seo_score INTEGER NOT NULL,
          aio_score INTEGER NOT NULL,
          wcag_score INTEGER NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
    })();
  }
  return schemaReady;
}

export async function saveAudit(result: AuditResult): Promise<void> {
  await ensureSchema();
  await sql`
    INSERT INTO audits (id, url, combined_score, seo_score, aio_score, wcag_score, result)
    VALUES (${result.id}, ${result.url}, ${result.combinedScore}, ${result.seo.score}, ${result.aio.score}, ${result.wcag.score}, ${JSON.stringify(result)}::jsonb)
    ON CONFLICT (id) DO NOTHING
  `;
}

export async function getAudit(
  id: string,
): Promise<{ result: AuditResult; unlocked: boolean } | null> {
  await ensureSchema();
  const { rows } = await sql`
    SELECT result, unlocked FROM audits WHERE id = ${id}
  `;
  if (rows.length === 0) return null;
  return { result: rows[0].result as AuditResult, unlocked: rows[0].unlocked as boolean };
}

export async function unlockAudit(id: string): Promise<void> {
  await ensureSchema();
  await sql`UPDATE audits SET unlocked = TRUE WHERE id = ${id}`;
}

export async function saveLead(auditId: string, lead: Lead): Promise<void> {
  await ensureSchema();
  await sql`
    INSERT INTO leads (audit_id, email, business_name, url_audited, combined_score, seo_score, aio_score, wcag_score)
    VALUES (${auditId}, ${lead.email}, ${lead.businessName}, ${lead.urlAudited}, ${lead.combinedScore}, ${lead.seoScore}, ${lead.aioScore}, ${lead.wcagScore})
  `;
}
