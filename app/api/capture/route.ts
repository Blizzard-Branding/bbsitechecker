import { NextRequest, NextResponse } from "next/server";
import { getAudit, saveLead, unlockAudit } from "@/lib/db";
import { buildReportPdf } from "@/lib/pdf-builder";
import { notifyLeoOfLead, sendReportToLead } from "@/lib/resend";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const auditId = typeof body?.auditId === "string" ? body.auditId : "";
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const businessName = typeof body?.businessName === "string" ? body.businessName.trim() : "";

  if (!auditId || !EMAIL_RE.test(email) || !businessName) {
    return NextResponse.json({ error: "Enter a valid business email and business name." }, { status: 400 });
  }

  const audit = await getAudit(auditId);
  if (!audit) {
    return NextResponse.json({ error: "We couldn't find that audit." }, { status: 404 });
  }

  const lead = {
    email,
    businessName,
    urlAudited: audit.result.url,
    combinedScore: audit.result.combinedScore,
    seoScore: audit.result.seo.score,
    aioScore: audit.result.aio.score,
    wcagScore: audit.result.wcag.score,
  };

  await saveLead(auditId, lead);
  await unlockAudit(auditId);

  try {
    const pdfBuffer = await buildReportPdf(audit.result);
    await Promise.all([
      notifyLeoOfLead(lead, audit.result),
      sendReportToLead(lead, audit.result, pdfBuffer),
    ]);
  } catch {
    // The report stays unlocked online even if email delivery fails.
  }

  return NextResponse.json({ ok: true });
}
