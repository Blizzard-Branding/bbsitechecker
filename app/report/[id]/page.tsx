import { notFound, redirect } from "next/navigation";
import { getAudit } from "@/lib/db";
import CheckItem from "@/components/CheckItem";
import type { CategoryResult } from "@/lib/types";

const CATEGORY_LABEL: Record<CategoryResult["category"], string> = {
  seo: "SEO",
  aio: "AI Optimization",
  wcag: "WCAG 2.2 AA",
};

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const audit = await getAudit(id);
  if (!audit) notFound();
  if (!audit.unlocked) redirect(`/results/${id}`);

  const { result } = audit;
  const categories: CategoryResult[] = [result.seo, result.aio, result.wcag];

  return (
    <main className="flex-1">
      <section className="bb-container flex flex-col items-center text-center py-16 gap-3">
        <p className="bb-eyebrow text-sm text-salmon">Full report for</p>
        <p className="font-display text-2xl text-navy break-all">{result.url}</p>
        <p className="bb-grade text-6xl text-navy mt-2">{result.combinedGrade}</p>
      </section>

      {categories.map((category) => (
        <section key={category.category} className="bb-container pb-12">
          <h2 className="font-display text-2xl text-navy mb-1">
            {CATEGORY_LABEL[category.category]}
          </h2>
          <p className="text-blue mb-6">
            {category.grade} grade, {category.score}/100.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {category.checks.map((check) => (
              <CheckItem key={check.id} check={check} />
            ))}
          </div>
        </section>
      ))}

      <section className="bb-container flex flex-col items-center text-center gap-4 py-16 border-t border-navy/10">
        <p className="font-display text-2xl text-navy max-w-lg">
          Want us to fix these?
        </p>
        <a
          href="https://blizzardbranding.com/contact"
          className="bb-eyebrow bg-navy text-warm-white px-6 py-3 rounded-lg hover:bg-blue transition-colors"
        >
          Book a free consultation
        </a>
      </section>
    </main>
  );
}
