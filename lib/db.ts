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
  /** Every usable connection string env var, best candidate first. */
  candidates: string[];
}

function usableValue(name: string): string | null {
  const value = process.env[name]?.trim();
  if (!value || !isWireProtocolUrl(value)) return null;
  return value;
}

/**
 * Every env var holding a usable connection string, best candidate first.
 * More than one can be present: a deleted storage integration can leave its
 * variables behind in a deployment, so the first candidate is not necessarily
 * the one that still works.
 */
export function listConnectionCandidates(): string[] {
  const candidates: string[] = [];
  const add = (name: string) => {
    if (!candidates.includes(name) && usableValue(name) !== null) candidates.push(name);
  };

  // Highest priority: an explicitly pinned connection string.
  add(EXPLICIT_ENV_VAR);

  // Then the unprefixed conventional names, in preference order.
  for (const name of CONNECTION_ENV_VARS) add(name);

  // Then the same names carrying a resource prefix, which is how Vercel
  // storage integrations inject them (tools_POSTGRES_URL). Sorted so the
  // ordering is stable across deployments.
  const envNames = Object.keys(process.env).sort();
  for (const known of CONNECTION_ENV_VARS) {
    for (const name of envNames) {
      if (name.endsWith(`_${known}`)) add(name);
    }
  }

  // Last resort: any env var at all whose value is a postgres:// URL.
  for (const name of envNames) add(name);

  return candidates;
}

export function inspectConnectionEnv(): ConnectionInfo {
  const present: string[] = [];
  const unusable: { name: string; protocol: string }[] = [];

  for (const name of [EXPLICIT_ENV_VAR, ...CONNECTION_ENV_VARS]) {
    const value = process.env[name]?.trim();
    if (!value) continue;
    present.push(name);
    if (!isWireProtocolUrl(value)) {
      unusable.push({ name, protocol: protocolOf(value) });
    }
  }

  const candidates = listConnectionCandidates();
  for (const name of candidates) {
    if (!present.includes(name)) present.push(name);
  }

  const databaseLikeVars = Object.entries(process.env)
    .filter(([name, value]) => DATABASE_LIKE_NAME.test(name) && (value?.trim().length ?? 0) > 0)
    .map(([name, value]) => ({ name, protocol: protocolOf(value!.trim()) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { source: candidates[0] ?? null, unusable, present, databaseLikeVars, candidates };
}

function noCandidatesError(): Error {
  const { unusable, databaseLikeVars } = inspectConnectionEnv();

  if (unusable.length > 0) {
    const detail = unusable.map((u) => `${u.name} (${u.protocol}:)`).join(", ");
    return new Error(
      `No usable Postgres connection string. Found ${detail}, but this app needs a standard postgres:// URL. ` +
        `A Prisma Accelerate URL (prisma+postgres://) won't work here; connect a plain Postgres database instead.`,
    );
  }

  const seen =
    databaseLikeVars.length > 0
      ? databaseLikeVars.map((v) => `${v.name} (${v.protocol})`).join(", ")
      : "none";
  return new Error(
    `No Postgres connection string found. Set one of: ${CONNECTION_ENV_VARS.join(", ")}. ` +
      `Database-like env vars visible to this function: ${seen}.`,
  );
}

function newPool(connectionString: string): Pool {
  const pool = new Pool({
    connectionString,
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  // A pool with no error listener crashes the process on a dropped backend.
  pool.on("error", (err) => console.error("[db] idle client error:", err.message));
  return pool;
}

// Reused across warm invocations; serverless keeps the pool small on purpose.
let pool: Pool | null = null;
let activeSource: string | null = null;
let resolving: Promise<Pool> | null = null;
let schemaReady: Promise<void> | null = null;

/** The env var the live connection came from, once one has been established. */
export function activeConnectionSource(): string | null {
  return activeSource;
}

/**
 * Connects using the first candidate that actually works. Trying them in turn
 * matters because a deleted database can leave a stale connection string in a
 * deployment, and it must not shadow a working one.
 */
async function resolvePool(): Promise<Pool> {
  if (pool) return pool;
  if (resolving) return resolving;

  resolving = (async () => {
    const candidates = listConnectionCandidates();
    if (candidates.length === 0) throw noCandidatesError();

    const failures: string[] = [];
    for (const name of candidates) {
      const candidate = newPool(process.env[name]!.trim());
      try {
        await candidate.query("SELECT 1");
        pool = candidate;
        activeSource = name;
        return candidate;
      } catch (err) {
        failures.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
        await candidate.end().catch(() => {});
      }
    }

    throw new Error(
      `Could not connect using any of the ${candidates.length} connection string(s) found. ${failures.join("; ")}`,
    );
  })();

  try {
    return await resolving;
  } finally {
    resolving = null;
  }
}

async function query<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const active = await resolvePool();
  try {
    const result = await active.query<T>(text, params);
    return result.rows;
  } catch (err) {
    // If the connection itself went bad (database deleted, credentials
    // rotated), drop it so the next call re-resolves against the candidates.
    if (active === pool && isConnectionError(err)) {
      pool = null;
      activeSource = null;
      schemaReady = null;
      await active.end().catch(() => {});
    }
    throw err;
  }
}

const CONNECTION_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "ETIMEDOUT",
  "ECONNRESET",
  "EPIPE",
  "28P01", // invalid_password
  "28000", // invalid_authorization_specification
  "3D000", // invalid_catalog_name
  "57P01", // admin_shutdown
]);

function isConnectionError(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  return typeof code === "string" && CONNECTION_ERROR_CODES.has(code);
}

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
