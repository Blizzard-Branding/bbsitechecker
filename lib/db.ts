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

/**
 * Set this to pin the app to one specific database. It wins over everything
 * else, which matters when more than one storage integration is attached and
 * each injects its own connection string.
 */
const EXPLICIT_ENV_VAR = "SITE_CHECKER_DATABASE_URL";

/** Protocols a raw Postgres wire-protocol client can actually talk to. */
function isWireProtocolUrl(value: string): boolean {
  return value.startsWith("postgres://") || value.startsWith("postgresql://");
}

/**
 * Env var names that look like they might hold database configuration.
 * Used only for diagnostics, so an unexpected provider naming scheme shows up
 * by name instead of leaving us guessing.
 */
const DATABASE_LIKE_NAME = /POSTGRES|POSTGRESQL|DATABASE|PRISMA|NEON|SUPABASE|\bPG_|_PG\b|DB_URL/i;

/** The scheme of a URL-ish value, for diagnostics. Never includes the value. */
function protocolOf(value: string): string {
  const match = value.match(/^([a-z0-9+.-]+):\/\//i);
  return match ? match[1] : "not-a-url";
}

export interface ConnectionInfo {
  /** Env var the connection string came from, if one was usable. */
  source: string | null;
  /** Env vars that were set but hold a non-Postgres-wire-protocol value. */
  unusable: { name: string; protocol: string }[];
  /** Env var names from the known list that are present and non-empty. */
  present: string[];
  /**
   * Every env var whose *name* looks database-related, with the protocol of
   * its value. Names and protocols only, never values.
   */
  databaseLikeVars: { name: string; protocol: string }[];
}

function usableValue(name: string): string | null {
  const value = process.env[name]?.trim();
  if (!value || !isWireProtocolUrl(value)) return null;
  return value;
}

export function inspectConnectionEnv(): ConnectionInfo {
  const present: string[] = [];
  const unusable: { name: string; protocol: string }[] = [];
  let source: string | null = null;

  // Highest priority: an explicitly pinned connection string.
  if (usableValue(EXPLICIT_ENV_VAR)) {
    source = EXPLICIT_ENV_VAR;
    present.push(EXPLICIT_ENV_VAR);
  }

  for (const name of CONNECTION_ENV_VARS) {
    const value = process.env[name]?.trim();
    if (!value) continue;
    present.push(name);
    if (isWireProtocolUrl(value)) {
      if (!source) source = name;
    } else {
      unusable.push({ name, protocol: protocolOf(value) });
    }
  }

  // Vercel storage integrations prefix their variables with the resource name
  // (e.g. tools_POSTGRES_URL), so match on the known suffixes next, keeping the
  // same preference order. Sorted by name so the choice stays stable across
  // deployments when several integrations are attached.
  if (!source) {
    const envNames = Object.keys(process.env).sort();
    for (const known of CONNECTION_ENV_VARS) {
      const match = envNames.find(
        (name) => name.endsWith(`_${known}`) && usableValue(name) !== null,
      );
      if (match) {
        source = match;
        if (!present.includes(match)) present.push(match);
        break;
      }
    }
  }

  // Last resort: any env var at all holding a postgres:// URL. Providers keep
  // inventing new names, and a working connection string is worth finding
  // wherever it landed. Sorted for a stable choice.
  if (!source) {
    const match = Object.keys(process.env)
      .sort()
      .find((name) => usableValue(name) !== null);
    if (match) {
      source = match;
      if (!present.includes(match)) present.push(match);
    }
  }

  const databaseLikeVars = Object.entries(process.env)
    .filter(([name, value]) => DATABASE_LIKE_NAME.test(name) && (value?.trim().length ?? 0) > 0)
    .map(([name, value]) => ({ name, protocol: protocolOf(value!.trim()) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { source, unusable, present, databaseLikeVars };
}

function getConnectionString(): string {
  const { source, unusable, databaseLikeVars } = inspectConnectionEnv();

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

  const seen =
    databaseLikeVars.length > 0
      ? databaseLikeVars.map((v) => `${v.name} (${v.protocol})`).join(", ")
      : "none";
  throw new Error(
    `No Postgres connection string found. Set one of: ${CONNECTION_ENV_VARS.join(", ")}. ` +
      `Database-like env vars visible to this function: ${seen}.`,
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
