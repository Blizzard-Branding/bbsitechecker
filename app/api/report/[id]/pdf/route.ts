import { NextRequest, NextResponse } from "next/server";
import { getAudit } from "@/lib/db";
import { buildReportPdf } from "@/lib/pdf-builder";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const audit = await getAudit(id);
  if (!audit) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }
  if (!audit.unlocked) {
    return NextResponse.json({ error: "This report is locked." }, { status: 403 });
  }

  const pdfBuffer = await buildReportPdf(audit.result);
  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="blizzard-site-check.pdf"',
    },
  });
}
