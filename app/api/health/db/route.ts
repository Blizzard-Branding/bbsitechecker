import { NextResponse } from "next/server";
import { ensureSchema, inspectConnectionEnv, pingDatabase } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Strip credentials from any connection string that made it into an error
 * message. Only the user:password portion is removed; the protocol and host
 * stay readable, since those are what make the error diagnosable.
 */
function redact(message: string): string {
  return message.replace(
    /(postgres(?:ql)?:\/\/)[^:@/\s]+(?::[^@/\s]*)?@/gi,
    "$1[credentials redacted]@",
  );
}

/**
 * Reports whether the database is reachable, without exposing any secrets:
 * env var names only, never their values.
 */
export async function GET() {
  const { source, unusable, present, databaseLikeVars } = inspectConnectionEnv();

  const env = {
    usableConnectionStringFrom: source,
    envVarsPresent: present,
    envVarsPresentButWrongProtocol: unusable,
    // Names and value protocols only, never values.
    databaseLikeEnvVars: databaseLikeVars,
  };

  try {
    await pingDatabase();
  } catch (err) {
    console.error("[health/db] connection failed:", err);
    return NextResponse.json(
      {
        ok: false,
        stage: "connect",
        env,
        error: redact(err instanceof Error ? err.message : String(err)),
        code: (err as { code?: string })?.code ?? null,
      },
      { status: 503 },
    );
  }

  try {
    await ensureSchema();
  } catch (err) {
    console.error("[health/db] schema creation failed:", err);
    return NextResponse.json(
      {
        ok: false,
        stage: "schema",
        env,
        error: redact(err instanceof Error ? err.message : String(err)),
        code: (err as { code?: string })?.code ?? null,
      },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true, env });
}
