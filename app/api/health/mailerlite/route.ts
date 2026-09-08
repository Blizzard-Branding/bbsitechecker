import { NextResponse } from "next/server";
import { checkMailerLiteAuth } from "@/lib/mailerlite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reports whether newsletter signups can reach MailerLite. Deliberately
 * returns no subscriber data: this endpoint is publicly reachable, so it says
 * only whether the key works.
 */
export async function GET() {
  const result = await checkMailerLiteAuth();

  if (!result.ok) {
    console.error(`[health/mailerlite] ${result.reason}`);
    return NextResponse.json(
      {
        ok: false,
        apiKeySet: result.httpStatus !== null,
        groupIdSet: result.groupIdSet,
        error: result.reason,
        httpStatus: result.httpStatus,
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ok: true,
    apiKeySet: true,
    groupIdSet: result.groupIdSet,
    note: result.groupIdSet
      ? "Subscribers are added to the group in MAILERLITE_GROUP_ID."
      : "No group is set, so subscribers are added to the account without a group.",
  });
}
