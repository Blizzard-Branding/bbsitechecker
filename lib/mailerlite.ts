const DEFAULT_API_URL = "https://connect.mailerlite.com/api/subscribers";
const REQUEST_TIMEOUT_MS = 10_000;

function apiUrl(): string {
  return process.env.MAILERLITE_API_URL?.trim() || DEFAULT_API_URL;
}

export interface SubscribeInput {
  email: string;
  businessName: string;
}

export type AuthCheckResult =
  | { ok: true; groupIdSet: boolean }
  | { ok: false; reason: string; httpStatus: number | null; groupIdSet: boolean };

/**
 * Verifies the API key against MailerLite with a read-only request. Reports
 * only whether auth works, never any subscriber data, since the endpoint that
 * surfaces this is publicly reachable.
 */
export async function checkMailerLiteAuth(): Promise<AuthCheckResult> {
  const groupIdSet = Boolean(process.env.MAILERLITE_GROUP_ID?.trim());
  const apiKey = process.env.MAILERLITE_API_KEY;

  if (!apiKey) {
    return {
      ok: false,
      reason: "MAILERLITE_API_KEY is not set on this deployment",
      httpStatus: null,
      groupIdSet,
    };
  }

  try {
    const response = await fetch(`${apiUrl()}?limit=1`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return {
        ok: false,
        reason:
          response.status === 401
            ? "MailerLite rejected the key. Check it is a token from the current API, not the legacy v2 API."
            : `MailerLite returned ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
        httpStatus: response.status,
        groupIdSet,
      };
    }

    return { ok: true, groupIdSet };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
      httpStatus: null,
      groupIdSet,
    };
  }
}

export type SubscribeResult =
  | { status: "subscribed" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

/**
 * Adds someone to the MailerLite newsletter list. Never throws: a signup that
 * reaches us should unlock the report even if MailerLite is having a bad day,
 * so the caller decides what to do with a failure.
 */
export async function subscribeToNewsletter(
  input: SubscribeInput,
): Promise<SubscribeResult> {
  const apiKey = process.env.MAILERLITE_API_KEY;
  if (!apiKey) {
    return { status: "skipped", reason: "MAILERLITE_API_KEY is not set" };
  }

  const groupId = process.env.MAILERLITE_GROUP_ID?.trim();

  try {
    const response = await fetch(apiUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        email: input.email,
        fields: {
          company: input.businessName,
        },
        ...(groupId ? { groups: [groupId] } : {}),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      // Read the body for the log, but keep it out of anything user-facing.
      const detail = await response.text().catch(() => "");
      return {
        status: "failed",
        reason: `MailerLite returned ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`,
      };
    }

    return { status: "subscribed" };
  } catch (err) {
    return {
      status: "failed",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
