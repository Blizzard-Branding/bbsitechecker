import { notFound } from "next/navigation";
import Link from "next/link";
import { getAudit } from "@/lib/db";
import ScoreCard from "@/components/ScoreCard";
import LeadForm from "@/components/LeadForm";

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const audit = await getAudit(id);
  if (!audit) notFound();

  const { result, unlocked } = audit;

  return (
    <main className="flex-1">
      <section className="bb-container flex flex-col items-center text-center py-16 gap-4">
        <p className="bb-eyebrow text-sm text-salmon">Results for</p>
        <p className="font-display text-2xl text-navy break-all">{result.url}</p>
        <p className="bb-grade text-7xl text-navy mt-2">{result.combinedGrade}</p>
        <p className="text-blue">Combined score: {result.combinedScore}/100</p>
        {result.blockedAutomation && (
          <p className="text-sm text-blue max-w-md">
            This site blocks automated tools. Some checks may be incomplete.
          </p>
        )}
      </section>

      <section className="bb-container grid gap-6 sm:grid-cols-3 pb-16">
        <ScoreCard category={result.seo} />
        <ScoreCard category={result.aio} />
        <ScoreCard category={result.wcag} />
      </section>

      <section className="bb-container flex flex-col items-center text-center gap-6 py-16 border-t border-navy/10">
        <p className="bb-eyebrow text-sm text-green">See all 35 checks and the fixes</p>
        {unlocked ? (
          <Link
            href={`/report/${result.id}`}
            className="bb-eyebrow bg-navy text-warm-white px-6 py-3 rounded-lg hover:bg-blue transition-colors"
          >
            View the full report
          </Link>
        ) : (
          <>
            <p className="text-blue max-w-md">
              Enter your business email and we will unlock the full report and send you a PDF copy.
            </p>
            <LeadForm auditId={result.id} />
          </>
        )}
      </section>
    </main>
  );
}
