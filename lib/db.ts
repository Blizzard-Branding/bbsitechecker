import { Pool, type QueryResultRow } from "pg";
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

/**
 * Env var names that hosting providers use for a Postgres connection string.
 * Checked in this order; the first usable one wins. Vercel Postgres/Neon set
 * POSTGRES_URL, Neon's own integration sets DATABASE_URL, and the *_NON_POOLING
 * / DIRECT_* variants are the direct (non-pooled) endpoints used as fallbacks.
 */
const CONNECTION_ENV_VARS = [
  "POSTGRES_URL",
  "DATABASE_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
  "DATABASE_URL_UNPOOLED",
  "DIRECT_URL",
  "DIRECT_DATABASE_URL",
] as const;

/** Protocols a raw Postgres wire-protocol client can actually talk to. */
function isWireProtocolUrl(value: string): boolean {
  return value.startsWith("postgres://") || value.startsWith("postgresql://");
}

export interface ConnectionInfo {
  /** Env var the connection string came from, if one was usable. */
  source: string | null;
  /** Env vars that were set but hold a non-Postgres-wire-protocol value. */
  unusable: { name: string; protocol: string }[];
  /** Env var names that are present and non-empty. */
  present: string[];
}

export function inspectConnectionEnv(): ConnectionInfo {
  const present: string[] = [];
  const unusable: { name: string; protocol: string }[] = [];
  let source: string | null = null;

  for (const name of CONNECTION_ENV_VARS) {
    const value = process.env[name]?.trim();
    if (!value) continue;
    present.push(name);
    if (isWireProtocolUrl(value)) {
      if (!source) source = name;
    } else {
      const protocol = value.split(":")[0] ?? "unknown";
      unusable.push({ name, protocol });
    }
  }

  return { source, unusable, present };
}

function getConnectionString(): string {
  const { source, unusable, present } = inspectConnectionEnv();

  if (source) {
    return process.env[source]!.trim();
  }

  if (unusable.length > 0) {
    const detail = unusable.map((u) => `${u.name} (${u.protocol}:)`).join(", ");
    throw new Error(
      `No usable Postgres connection string. Found ${detail}, but this app needs a standard postgres:// URL. ` +
        `A Prisma Accelerate URL (prisma+postgres://) won't work here; connect a plain Postgres database instead.`,
    );
  }

  throw new Error(
    `No Postgres connection string found. Set one of: ${CONNECTION_ENV_VARS.join(", ")}. ` +
      `Env vars currently present: ${present.length > 0 ? present.join(", ") : "none"}.`,
  );
}

// Reused across warm invocations; serverless keeps the pool small on purpose.
let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: getConnectionString(),
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return pool;
}

async function query<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

let schemaReady: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await query(`
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
      `);
      await query(`
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
      `);
    })().catch((err) => {
      // Don't cache a failed attempt: a later request should retry.
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

/** Runs a trivial query to prove the database is actually reachable. */
export async function pingDatabase(): Promise<void> {
  await query("SELECT 1");
}

export async function saveAudit(result: AuditResult): Promise<void> {
  await ensureSchema();
  await query(
    `INSERT INTO audits (id, url, combined_score, seo_score, aio_score, wcag_score, result)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [
      result.id,
      result.url,
      result.combinedScore,
      result.seo.score,
      result.aio.score,
      result.wcag.score,
      JSON.stringify(result),
    ],
  );
}

export async function getAudit(
  id: string,
): Promise<{ result: AuditResult; unlocked: boolean } | null> {
  await ensureSchema();
  const rows = await query<{ result: AuditResult; unlocked: boolean }>(
    `SELECT result, unlocked FROM audits WHERE id = $1`,
    [id],
  );
  if (rows.length === 0) return null;
  return { result: rows[0].result, unlocked: rows[0].unlocked };
}

export async function unlockAudit(id: string): Promise<void> {
  await ensureSchema();
  await query(`UPDATE audits SET unlocked = TRUE WHERE id = $1`, [id]);
}

export async function saveLead(auditId: string, lead: Lead): Promise<void> {
  await ensureSchema();
  await query(
    `INSERT INTO leads (audit_id, email, business_name, url_audited, combined_score, seo_score, aio_score, wcag_score)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      auditId,
      lead.email,
      lead.businessName,
      lead.urlAudited,
      lead.combinedScore,
      lead.seoScore,
      lead.aioScore,
      lead.wcagScore,
    ],
  );
}
