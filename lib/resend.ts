import { Resend } from "resend";
import type { AuditResult } from "./types";
import type { Lead } from "./db";

function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY);
}

const FROM_EMAIL = process.env.FROM_EMAIL ?? "hello@blizzardbranding.com";
const LEO_NOTIFY_EMAIL = process.env.LEO_NOTIFY_EMAIL ?? "leo@blizzardbranding.com";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tools.blizzardbranding.com";

export async function notifyLeoOfLead(lead: Lead, audit: AuditResult): Promise<void> {
  const resend = getResend();
  if (!resend) return;

  await resend.emails.send({
    from: FROM_EMAIL,
    to: LEO_NOTIFY_EMAIL,
    subject: `[Site Checker] ${lead.businessName} — ${audit.combinedGrade}`,
    text: [
      `${lead.businessName} ran a site check and left their email.`,
      "",
      `URL audited: ${audit.url}`,
      `Combined grade: ${audit.combinedGrade} (${audit.combinedScore})`,
      `SEO: ${audit.seo.grade} (${audit.seo.score})`,
      `AIO: ${audit.aio.grade} (${audit.aio.score})`,
      `WCAG 2.2: ${audit.wcag.grade} (${audit.wcag.score})`,
      "",
      `Contact: ${lead.email}`,
      `Report: ${SITE_URL}/report/${audit.id}`,
    ].join("\n"),
  });
}

export async function sendReportToLead(
  lead: Lead,
  audit: AuditResult,
  pdfBuffer: Buffer,
): Promise<void> {
  const resend = getResend();
  if (!resend) return;

  await resend.emails.send({
    from: FROM_EMAIL,
    to: lead.email,
    subject: `Your site check for ${audit.url}`,
    text: [
      `Here is the full report for ${audit.url}.`,
      "",
      `Combined grade: ${audit.combinedGrade}`,
      `SEO ${audit.seo.grade}, AIO ${audit.aio.grade}, WCAG 2.2 ${audit.wcag.grade}.`,
      "",
      `View it online: ${SITE_URL}/report/${audit.id}`,
      "",
      "The PDF is attached.",
    ].join("\n"),
    attachments: [
      {
        filename: "blizzard-site-check.pdf",
        content: pdfBuffer,
      },
    ],
  });
}
