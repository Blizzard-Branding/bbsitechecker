import { notFound } from "next/navigation";
import Link from "next/link";
import { getAudit } from "@/lib/db";
import ScoreCard from "@/components/ScoreCard";
import LeadForm from "@/components/LeadForm";
import ScopeNote from "@/components/ScopeNote";

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
        {result.blockedAutomation ? (
          <div className="bb-card max-w-xl p-6 mt-2 text-left">
            <p className="font-display text-xl text-navy mb-2">We couldn&apos;t read this page</p>
            <p className="text-blue text-sm">
              {result.fetchError
                ? `${result.fetchError} `
                : "The site blocked our request. "}
              That is usually a firewall, a security plugin, or bot protection turning away
              automated visitors. It is not a fault in the page itself.
            </p>
            <p className="text-blue text-sm mt-3">
              We are not showing a grade, because anything measured from a blocked request
              would describe the block page rather than your site. Allow the checker through
              and run it again for a real report.
            </p>
          </div>
        ) : (
          <>
            <p className="bb-grade text-7xl text-navy mt-2">{result.combinedGrade}</p>
            <p className="text-blue">Combined score: {result.combinedScore}/100</p>
            <ScopeNote />
          </>
        )}
      </section>

      {!result.blockedAutomation && (
        <section className="bb-container grid gap-6 sm:grid-cols-3 pb-16">
          <ScoreCard category={result.seo} />
          <ScoreCard category={result.aio} />
          <ScoreCard category={result.wcag} />
        </section>
      )}

      {result.blockedAutomation ? (
        // Asking for an email in exchange for a report we know is empty would
        // be a bad trade, so offer the next step instead.
        <section className="bb-container flex flex-col items-center text-center gap-4 py-16 border-t border-navy/10">
          <p className="bb-eyebrow text-sm text-green-text">What to do next</p>
          <p className="text-blue max-w-lg">
            Ask whoever manages the site to allow automated checkers, then run this again.
            If you would rather we look at it directly, we can audit it by hand.
          </p>
          <a
            href="https://blizzardbranding.com/contact"
            className="bb-eyebrow bg-navy text-warm-white px-6 py-3 rounded-lg hover:bg-blue transition-colors"
          >
            Talk to us about your site
          </a>
        </section>
      ) : (
      <section className="bb-container flex flex-col items-center text-center gap-6 py-16 border-t border-navy/10">
        <p className="bb-eyebrow text-sm text-green-text">See all 35 checks and the fixes</p>
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
              Sign up for our newsletter to unlock the full report. We write about
              search, accessibility, and the web, roughly once a month.
            </p>
            <LeadForm auditId={result.id} />
          </>
        )}
      </section>
      )}
    </main>
  );
}
