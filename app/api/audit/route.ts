import { NextRequest, NextResponse } from "next/server";
import { runAudit } from "@/lib/checks";
import { saveAudit } from "@/lib/db";
import { checkAuditRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

function getClientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url.trim() : "";

  if (!url) {
    return NextResponse.json({ error: "Enter a URL to audit." }, { status: 400 });
  }

  const ip = getClientIp(req);
  const rateLimit = await checkAuditRateLimit(ip);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "You've reached today's audit limit. Try again tomorrow." },
      { status: 429 },
    );
  }

  let result;
  try {
    result = await runAudit(url);
  } catch (err) {
    console.error(`[audit] failed to fetch/check ${url}:`, err);
    return NextResponse.json(
      { error: "We couldn't fully audit this site. Check the URL and try again." },
      { status: 502 },
    );
  }

  try {
    await saveAudit(result);
  } catch (err) {
    console.error(`[audit] failed to save audit for ${url}:`, err);
    return NextResponse.json(
      { error: "The audit ran but we couldn't save it. Try again in a moment." },
      { status: 500 },
    );
  }

  return NextResponse.json({ id: result.id });
}
