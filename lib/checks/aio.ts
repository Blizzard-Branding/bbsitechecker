import * as cheerio from "cheerio";
import type { Check, FetchedPage } from "../types";

function check(
  id: string,
  name: string,
  weight: number,
  status: Check["status"],
  message: string,
  howToFix: string,
): Check {
  return { id, category: "aio", name, weight, status, message, howToFix };
}

function collectJsonLd($: cheerio.CheerioAPI): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($(el).text());
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (item && typeof item === "object") {
          blocks.push(item as Record<string, unknown>);
          const graph = (item as Record<string, unknown>)["@graph"];
          if (Array.isArray(graph)) {
            blocks.push(...(graph as Record<string, unknown>[]));
          }
        }
      }
    } catch {
      // Ignore malformed JSON-LD.
    }
  });
  return blocks;
}

function typeNames(block: Record<string, unknown>): string[] {
  const type = block["@type"];
  if (typeof type === "string") return [type];
  if (Array.isArray(type)) return type.filter((t): t is string => typeof t === "string");
  return [];
}

async function fetchOk(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000), method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "is", "are",
  "how", "what", "why", "your", "you", "we", "our", "at", "by", "from", "it",
]);

function significantWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

export async function runAioChecks(
  $: cheerio.CheerioAPI,
  page: FetchedPage,
  html: string,
): Promise<Check[]> {
  const checks: Check[] = [];
  const jsonLdBlocks = collectJsonLd($);
  const origin = new URL(page.finalUrl).origin;

  // 1. Content-to-code ratio > 15%
  const textLength = ($("body").text() || "").replace(/\s+/g, " ").trim().length;
  const ratio = html.length > 0 ? (textLength / html.length) * 100 : 0;
  checks.push(
    ratio > 15
      ? check(
          "content-code-ratio",
          "Content-to-code ratio",
          3,
          "pass",
          `Content is ${ratio.toFixed(1)}% of page weight.`,
          "No action needed.",
        )
      : check(
          "content-code-ratio",
          "Content-to-code ratio",
          3,
          ratio > 8 ? "partial" : "fail",
          `Content is only ${ratio.toFixed(1)}% of page weight.`,
          "Reduce markup bloat or add more substantive on-page copy so real content outweighs code.",
        ),
  );

  // 2. Semantic HTML. <main> is the signal that matters: it tells a machine
  // where the content is. <article> is only correct for self-contained,
  // syndicatable content, so a homepage or services page rightly has none and
  // must not be marked down for its absence.
  const hasMain = $("main").length > 0;
  const hasSectioning = $("article").length > 0 || $("section").length > 0;
  checks.push(
    hasMain && hasSectioning
      ? check(
          "semantic-html",
          "Semantic HTML",
          3,
          "pass",
          "Content sits in a main landmark and is broken into sections.",
          "No action needed.",
        )
      : hasMain
        ? check(
            "semantic-html",
            "Semantic HTML",
            3,
            "partial",
            "Content sits in a main landmark but isn't broken into sections.",
            "Group related content in section elements so machines can tell where topics begin and end.",
          )
        : hasSectioning
          ? check(
              "semantic-html",
              "Semantic HTML",
              3,
              "partial",
              "Page uses sectioning elements but has no main landmark.",
              "Wrap the primary content in a main element.",
            )
          : check(
              "semantic-html",
              "Semantic HTML",
              3,
              "fail",
              "No main landmark or sectioning elements found.",
              "Wrap the primary content in a main element and group related content in sections.",
            ),
  );

  // 3. Specific schema type (not just WebPage)
  const allTypes = jsonLdBlocks.flatMap(typeNames);
  const specificTypes = allTypes.filter((t) => !["WebPage", "WebSite", "Thing"].includes(t));
  checks.push(
    specificTypes.length > 0
      ? check(
          "specific-schema",
          "Specific schema type",
          4,
          "pass",
          `Uses specific schema type(s): ${Array.from(new Set(specificTypes)).join(", ")}.`,
          "No action needed.",
        )
      : allTypes.length > 0
        ? check(
            "specific-schema",
            "Specific schema type",
            4,
            "partial",
            "Schema present but only generic WebPage/WebSite types.",
            "Use a more specific schema.org type (Article, Product, Organization, FAQPage, etc.) for the page's content.",
          )
        : check(
            "specific-schema",
            "Specific schema type",
            4,
            "fail",
            "No schema type found.",
            "Add JSON-LD structured data with a specific schema.org @type.",
          ),
  );

  // 4. FAQ or Q&A schema/structure
  const hasFaqSchema = allTypes.some((t) => ["FAQPage", "QAPage", "Question"].includes(t));
  const questionHeadings = $("h2, h3").filter((_, el) => $(el).text().trim().endsWith("?")).length;
  // This check is about whether existing Q&A content is marked up, not about
  // whether every page ought to have an FAQ. A page with no questions on it has
  // nothing to mark up, so it isn't scored. Whether the page *should* carry
  // question-and-answer content is the answer-shaped check below, which keeps
  // the two from penalising the same absence twice.
  checks.push(
    hasFaqSchema
      ? check("faq-schema", "FAQ / Q&A markup", 3, "pass", "FAQ or Q&A schema present.", "No action needed.")
      : questionHeadings > 0
        ? check(
            "faq-schema",
            "FAQ / Q&A markup",
            3,
            "fail",
            `Found ${questionHeadings} question-style heading(s) with no FAQ schema.`,
            "Mark up the question-and-answer content with FAQPage schema so AI answer engines can cite it directly.",
          )
        : check(
            "faq-schema",
            "FAQ / Q&A markup",
            3,
            "na",
            "No question-and-answer content on this page, so there is nothing to mark up.",
            "Applies to pages with an FAQ or Q&A section.",
          ),
  );

  // 5. Author/Organization schema. schema.org has dozens of Organization
  // subtypes, and a business that declares LocalBusiness or ProfessionalService
  // has identified itself just as well as one declaring Organization outright.
  const ORGANIZATION_TYPES = [
    "Organization",
    "Person",
    "LocalBusiness",
    "Corporation",
    "NGO",
    "EducationalOrganization",
    "GovernmentOrganization",
    "MedicalOrganization",
    "NewsMediaOrganization",
    "PerformingGroup",
    "SportsOrganization",
    "OnlineBusiness",
    "Airline",
    "Restaurant",
    "Store",
    "Dentist",
    "Physician",
    "RealEstateAgent",
    "TravelAgency",
    "ChildCare",
  ];
  // Catches the long tail: ProfessionalService, HomeAndConstructionBusiness,
  // AutomotiveBusiness, FinancialService, and similar.
  const ORGANIZATION_SUFFIX = /(?:Business|Organization|Service|Agency|Store|Shop|Clinic|Practice)$/;
  const hasAuthorSchema =
    allTypes.some((t) => ORGANIZATION_TYPES.includes(t) || ORGANIZATION_SUFFIX.test(t)) ||
    jsonLdBlocks.some((b) => "author" in b || "publisher" in b);
  checks.push(
    hasAuthorSchema
      ? check("author-schema", "Author / Organization schema", 3, "pass", "Author or organization schema present.", "No action needed.")
      : check(
          "author-schema",
          "Author / Organization schema",
          3,
          "fail",
          "No author or organization schema found.",
          "Add Organization or Person schema, or an author/publisher field on existing structured data.",
        ),
  );

  // 6. Publish/modified dates visible + in schema. Dated content is what this
  // is for: an article without a date is a real problem, a services page
  // without one is not.
  const DATED_TYPES = [
    "Article",
    "BlogPosting",
    "NewsArticle",
    "TechArticle",
    "ScholarlyArticle",
    "Report",
    "Review",
  ];
  const isDatedContent = allTypes.some((t) => DATED_TYPES.includes(t));
  const hasDateSchema = jsonLdBlocks.some((b) => "datePublished" in b || "dateModified" in b);
  const hasVisibleDate = $("time").length > 0 || /\b(published|updated|last modified)\b/i.test($("body").text());
  checks.push(
    !isDatedContent
      ? check(
          "publish-dates",
          "Publish / modified dates",
          2,
          "na",
          "This page isn't dated content, so a publish date isn't expected.",
          "Applies to articles, blog posts, and news pages.",
        )
      : hasDateSchema && hasVisibleDate
      ? check("publish-dates", "Publish / modified dates", 2, "pass", "Dates present in schema and visible on page.", "No action needed.")
      : hasDateSchema || hasVisibleDate
        ? check(
            "publish-dates",
            "Publish / modified dates",
            2,
            "partial",
            hasDateSchema ? "Dates in schema but not visible on the page." : "Dates visible but missing from schema.",
            "Show a published/updated date on the page and include datePublished / dateModified in structured data.",
          )
        : check(
            "publish-dates",
            "Publish / modified dates",
            2,
            "fail",
            "No publish or modified date found in schema or on the page.",
            "Add a visible date and datePublished / dateModified in structured data.",
          ),
  );

  // 7. Descriptive alt text on content images. A plain length cutoff punishes
  // correct short alts ("Logo", "Map"), so look for alt text that is actually
  // unhelpful: a filename, a placeholder word, or a single character.
  const PLACEHOLDER_ALT = /^(image|images|photo|photos|picture|pic|img|graphic|untitled|placeholder|spacer|banner)$/i;
  const FILENAME_ALT = /\.(jpe?g|png|gif|webp|svg|avif|bmp)$/i;
  const images = $("img").toArray();
  const nonDecorative = images.filter(
    (el) => $(el).attr("role") !== "presentation" && $(el).attr("alt") !== "",
  );
  const weakAlt = nonDecorative.filter((el) => {
    const alt = ($(el).attr("alt") ?? "").trim();
    return alt.length <= 1 || PLACEHOLDER_ALT.test(alt) || FILENAME_ALT.test(alt);
  });
  checks.push(
    nonDecorative.length === 0
      ? check(
          "descriptive-alt",
          "Descriptive alt text",
          3,
          "na",
          "No content images on this page to describe.",
          "Applies to pages with images that carry meaning.",
        )
      : weakAlt.length === 0
        ? check("descriptive-alt", "Descriptive alt text", 3, "pass", "Content images have descriptive alt text.", "No action needed.")
        : check(
            "descriptive-alt",
            "Descriptive alt text",
            3,
            weakAlt.length < nonDecorative.length ? "partial" : "fail",
            `${weakAlt.length} of ${nonDecorative.length} content images have alt text that is a filename, a placeholder word, or a single character.`,
            "Write alt text that conveys what each image shows, rather than a filename or a generic word.",
          ),
  );

  // 8. TOC or section anchors, which only matter on long pages. Reported
  // either way so the check count stays consistent between reports.
  const hasToc = $('a[href^="#"]').length >= 3;
  checks.push(
    page.wordCount <= 1500
      ? check(
          "toc-anchors",
          "Table of contents / section anchors",
          2,
          "na",
          `This page is ${page.wordCount} words, short enough not to need jump links.`,
          "Applies to long-form pages over roughly 1500 words.",
        )
      : hasToc
        ? check("toc-anchors", "Table of contents / section anchors", 2, "pass", "Long page has section anchors.", "No action needed.")
        : check(
            "toc-anchors",
            "Table of contents / section anchors",
            2,
            "fail",
            `Page has ${page.wordCount} words but no table of contents or section anchors.`,
            "Add a table of contents with jump links for long-form content.",
          ),
  );

  // 9. First 100 words contain the H1 topic
  const h1Text = $("h1").first().text().trim();
  const bodyWords = ($("body").text() || "").trim().split(/\s+/);
  const first100 = bodyWords.slice(0, 100).join(" ");
  // Keyword overlap is a rough proxy, so the bar is set where a genuinely
  // off-topic intro fails but ordinary paraphrasing does not.
  const h1Keywords = significantWords(h1Text);
  if (!h1Text || h1Keywords.size === 0) {
    checks.push(
      check(
        "intro-topic-match",
        "Intro matches H1 topic",
        3,
        "na",
        "No H1 to compare the opening text against.",
        "Add a single H1 naming the page topic, then this check can be evaluated.",
      ),
    );
  } else {
    const first100Keywords = significantWords(first100);
    const overlap = Array.from(h1Keywords).filter((w) => first100Keywords.has(w));
    const overlapRatio = overlap.length / h1Keywords.size;
    checks.push(
      overlapRatio >= 0.4
        ? check("intro-topic-match", "Intro matches H1 topic", 3, "pass", "First 100 words reinforce the H1 topic.", "No action needed.")
        : overlapRatio > 0
          ? check(
              "intro-topic-match",
              "Intro matches H1 topic",
              3,
              "partial",
              "First 100 words only partially reflect the H1 topic.",
              "Open with a sentence that restates the page's main topic from the H1.",
            )
          : check(
              "intro-topic-match",
              "Intro matches H1 topic",
              3,
              "fail",
              "First 100 words don't reflect the H1 topic.",
              "Open with a sentence that restates the page's main topic from the H1.",
            ),
    );
  }

  // 10. llms.txt file
  const hasLlmsTxt = await fetchOk(`${origin}/llms.txt`);
  checks.push(
    hasLlmsTxt
      ? check("llms-txt", "llms.txt file", 2, "pass", "llms.txt found at the site root.", "No action needed.")
      : check(
          "llms-txt",
          "llms.txt file",
          2,
          "fail",
          "No llms.txt found. This is an emerging convention that most sites don't have yet.",
          "Add an llms.txt file at the domain root summarizing the site for AI crawlers.",
        ),
  );

  // 11. Answer-shaped content
  const questionHeadingsWithContent = $("h2, h3, h4").filter((_, el) => {
    if (!$(el).text().trim().endsWith("?")) return false;
    const next = $(el).next();
    return next.length > 0 && next.text().trim().length > 20;
  }).length;
  checks.push(
    questionHeadingsWithContent >= 2
      ? check("answer-shaped", "Answer-shaped content", 2, "pass", `Found ${questionHeadingsWithContent} question headings followed by an answer.`, "No action needed.")
      : questionHeadingsWithContent === 1
        ? check(
            "answer-shaped",
            "Answer-shaped content",
            2,
            "partial",
            "Only one question-and-answer block found.",
            "Add more question-style headings followed directly by a concise answer.",
          )
        : check(
            "answer-shaped",
            "Answer-shaped content",
            2,
            "fail",
            "No question-and-answer style content found.",
            "Structure key content as a question heading followed by a direct answer paragraph.",
          ),
  );

  return checks;
}
