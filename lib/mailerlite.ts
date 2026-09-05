const DEFAULT_API_URL = "https://connect.mailerlite.com/api/subscribers";
const REQUEST_TIMEOUT_MS = 10_000;

function apiUrl(): string {
  return process.env.MAILERLITE_API_URL?.trim() || DEFAULT_API_URL;
}

export interface SubscribeInput {
  email: string;
  businessName: string;
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
