import UrlInput from "@/components/UrlInput";

const EXPLAINERS = [
  {
    title: "SEO",
    body: "How well search engines can find, read, and rank your pages. Title tags, headings, sitemaps, structured data.",
  },
  {
    title: "AIO",
    body: "How well AI tools and answer engines can understand and cite your content. Semantic structure, clear schema, direct answers.",
  },
  {
    title: "WCAG 2.2",
    body: "Whether people using screen readers, keyboards, or low vision can actually use your site. The current accessibility standard.",
  },
];

export default function Home() {
  return (
    <main className="flex-1">
      <section className="bb-container flex flex-col items-center text-center py-24 gap-8">
        <p className="bb-eyebrow text-sm text-salmon">Blizzard Branding</p>
        <h1 className="font-display text-4xl sm:text-5xl text-navy max-w-2xl">
          Find out what your website is actually doing.
        </h1>
        <p className="text-blue max-w-xl">
          Enter a URL. We run 35 checks across SEO, AI optimization, and accessibility, then hand
          you a grade and a plain list of what to fix.
        </p>
        <UrlInput />
      </section>

      <section className="bb-container grid gap-8 sm:grid-cols-3 py-16 border-t border-navy/10">
        {EXPLAINERS.map((item) => (
          <div key={item.title} className="text-center sm:text-left">
            <p className="bb-eyebrow text-sm text-green mb-2">{item.title}</p>
            <p className="text-blue">{item.body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
