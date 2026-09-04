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
  return { id, category: "seo", name, weight, status, message, howToFix };
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export async function runSeoChecks(
  $: cheerio.CheerioAPI,
  page: FetchedPage,
): Promise<Check[]> {
  const checks: Check[] = [];
  const origin = new URL(page.finalUrl).origin;

  // 1. Title tag, 30-60 chars
  const title = $("title").first().text().trim();
  if (!title) {
    checks.push(
      check(
        "title-tag",
        "Title tag",
        5,
        "fail",
        "No title tag found.",
        "Add a <title> tag between 30 and 60 characters that describes the page.",
      ),
    );
  } else if (title.length >= 30 && title.length <= 60) {
    checks.push(
      check(
        "title-tag",
        "Title tag",
        5,
        "pass",
        `Title is ${title.length} characters.`,
        "No action needed.",
      ),
    );
  } else {
    checks.push(
      check(
        "title-tag",
        "Title tag",
        5,
        "partial",
        `Title is ${title.length} characters, outside the 30 to 60 range.`,
        "Rewrite the title tag to fall between 30 and 60 characters.",
      ),
    );
  }

  // 2. Meta description, 120-160 chars
  const metaDescription = $('meta[name="description"]').attr("content")?.trim() ?? "";
  if (!metaDescription) {
    checks.push(
      check(
        "meta-description",
        "Meta description",
        4,
        "fail",
        "No meta description found.",
        "Add a meta description between 120 and 160 characters summarizing the page.",
      ),
    );
  } else if (metaDescription.length >= 120 && metaDescription.length <= 160) {
    checks.push(
      check(
        "meta-description",
        "Meta description",
        4,
        "pass",
        `Meta description is ${metaDescription.length} characters.`,
        "No action needed.",
      ),
    );
  } else {
    checks.push(
      check(
        "meta-description",
        "Meta description",
        4,
        "partial",
        `Meta description is ${metaDescription.length} characters, outside the 120 to 160 range.`,
        "Rewrite the meta description to fall between 120 and 160 characters.",
      ),
    );
  }

  // 3. Single H1
  const h1Count = $("h1").length;
  checks.push(
    h1Count === 1
      ? check("single-h1", "Single H1", 4, "pass", "Page has exactly one H1.", "No action needed.")
      : check(
          "single-h1",
          "Single H1",
          4,
          "fail",
          h1Count === 0 ? "No H1 found." : `Found ${h1Count} H1 tags.`,
          "Use exactly one H1 per page to describe the main topic.",
        ),
  );

  // 4. Heading hierarchy, no skipped levels
  const headingLevels = $("h1, h2, h3, h4, h5, h6")
    .toArray()
    .map((el) => Number(el.tagName.slice(1)));
  let skipped = false;
  for (let i = 1; i < headingLevels.length; i++) {
    if (headingLevels[i] - headingLevels[i - 1] > 1) {
      skipped = true;
      break;
    }
  }
  checks.push(
    headingLevels.length === 0
      ? check(
          "heading-hierarchy",
          "Heading hierarchy",
          2,
          "fail",
          "No headings found.",
          "Structure content with a logical H1 through H6 hierarchy.",
        )
      : skipped
        ? check(
            "heading-hierarchy",
            "Heading hierarchy",
            2,
            "fail",
            "Heading levels skip a level (e.g. H2 straight to H4).",
            "Don't skip heading levels. Each heading should step down by one from the previous.",
          )
        : check(
            "heading-hierarchy",
            "Heading hierarchy",
            2,
            "pass",
            "Heading levels step down without skipping.",
            "No action needed.",
          ),
  );

  // 5. Canonical URL
  const canonical = $('link[rel="canonical"]').attr("href");
  checks.push(
    canonical
      ? check("canonical-url", "Canonical URL", 3, "pass", `Canonical set to ${canonical}.`, "No action needed.")
      : check(
          "canonical-url",
          "Canonical URL",
          3,
          "fail",
          "No canonical link tag found.",
          'Add <link rel="canonical" href="..."> pointing to the preferred URL for this page.',
        ),
  );

  // 6. HTTPS + valid cert
  checks.push(
    page.isHttps && page.status !== null && page.status < 400
      ? check("https", "HTTPS", 5, "pass", "Page loads over HTTPS.", "No action needed.")
      : check(
          "https",
          "HTTPS",
          5,
          "fail",
          page.isHttps ? `Page returned status ${page.status}.` : "Page does not load over HTTPS.",
          "Serve the site over HTTPS with a valid certificate.",
        ),
  );

  // 7 & 8. robots.txt exists + sitemap referenced
  const robotsTxt = await fetchText(`${origin}/robots.txt`);
  checks.push(
    robotsTxt !== null
      ? check("robots-txt", "robots.txt exists", 3, "pass", "robots.txt found.", "No action needed.")
      : check(
          "robots-txt",
          "robots.txt exists",
          3,
          "fail",
          "No robots.txt found at the site root.",
          "Add a robots.txt file at the domain root.",
        ),
  );

  const hasSitemapDirective = robotsTxt ? /^sitemap:/im.test(robotsTxt) : false;
  checks.push(
    hasSitemapDirective
      ? check(
          "sitemap-in-robots",
          "Sitemap in robots.txt",
          3,
          "pass",
          "robots.txt references a sitemap.",
          "No action needed.",
        )
      : check(
          "sitemap-in-robots",
          "Sitemap in robots.txt",
          3,
          "fail",
          "robots.txt does not reference a sitemap.",
          "Add a Sitemap: line to robots.txt pointing to your sitemap.xml.",
        ),
  );

  // 9. OG tags, partial credit
  const ogTags = ["og:title", "og:description", "og:image"];
  const presentOgTags = ogTags.filter((tag) => $(`meta[property="${tag}"]`).attr("content"));
  checks.push(
    presentOgTags.length === ogTags.length
      ? check("og-tags", "Open Graph tags", 2, "pass", "All core Open Graph tags present.", "No action needed.")
      : presentOgTags.length > 0
        ? check(
            "og-tags",
            "Open Graph tags",
            2,
            "partial",
            `Found ${presentOgTags.length} of ${ogTags.length} Open Graph tags.`,
            `Add the missing tags: ${ogTags.filter((t) => !presentOgTags.includes(t)).join(", ")}.`,
          )
        : check(
            "og-tags",
            "Open Graph tags",
            2,
            "fail",
            "No Open Graph tags found.",
            "Add og:title, og:description, and og:image meta tags for better link previews.",
          ),
  );

  // 10. Twitter card
  const twitterCard = $('meta[name="twitter:card"]').attr("content");
  checks.push(
    twitterCard
      ? check("twitter-card", "Twitter card", 1, "pass", "Twitter card tag present.", "No action needed.")
      : check(
          "twitter-card",
          "Twitter card",
          1,
          "fail",
          "No Twitter card meta tag found.",
          'Add <meta name="twitter:card" content="summary_large_image">.',
        ),
  );

  // 11. JSON-LD present
  const jsonLdCount = $('script[type="application/ld+json"]').length;
  checks.push(
    jsonLdCount > 0
      ? check("json-ld", "Structured data (JSON-LD)", 3, "pass", `Found ${jsonLdCount} JSON-LD block(s).`, "No action needed.")
      : check(
          "json-ld",
          "Structured data (JSON-LD)",
          3,
          "fail",
          "No JSON-LD structured data found.",
          "Add JSON-LD structured data describing the page's content type.",
        ),
  );

  // 12. Viewport meta
  const viewport = $('meta[name="viewport"]').attr("content");
  checks.push(
    viewport
      ? check("viewport-meta", "Viewport meta tag", 4, "pass", "Viewport meta tag present.", "No action needed.")
      : check(
          "viewport-meta",
          "Viewport meta tag",
          4,
          "fail",
          "No viewport meta tag found.",
          'Add <meta name="viewport" content="width=device-width, initial-scale=1">.',
        ),
  );

  return checks;
}
