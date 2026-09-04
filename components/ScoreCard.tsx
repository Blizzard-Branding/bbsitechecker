import type { CategoryResult } from "@/lib/types";

const CATEGORY_LABEL: Record<CategoryResult["category"], string> = {
  seo: "SEO",
  aio: "AI Optimization",
  wcag: "WCAG 2.2 AA",
};

export default function ScoreCard({ category }: { category: CategoryResult }) {
  return (
    <div className="bb-card p-6 flex flex-col items-center text-center">
      <p className="bb-eyebrow text-sm text-salmon mb-1">{CATEGORY_LABEL[category.category]}</p>
      <p className="bb-grade text-5xl text-navy">{category.grade}</p>
      <p className="text-sm text-blue mt-1">{category.score}/100</p>
      <p className="text-sm text-blue mt-3">{category.summary}</p>
    </div>
  );
}
