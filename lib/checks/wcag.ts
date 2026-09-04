import * as cheerio from "cheerio";
import type { AxeViolation, Check, FetchedPage } from "../types";

function check(
  id: string,
  name: string,
  weight: number,
  status: Check["status"],
  message: string,
  howToFix: string,
): Check {
  return { id, category: "wcag", name, weight, status, message, howToFix };
}

function findViolation(violations: AxeViolation[], ...ruleIds: string[]): AxeViolation[] {
  return violations.filter((v) => ruleIds.includes(v.id));
}

function fromAxeRule(
  violations: AxeViolation[],
  ruleIds: string[],
  id: string,
  name: string,
  weight: number,
  passMessage: string,
  fixMessage: string,
): Check {
  const matches = findViolation(violations, ...ruleIds);
  const nodeCount = matches.reduce((sum, v) => sum + v.nodes, 0);
  if (matches.length === 0) {
    return check(id, name, weight, "pass", passMessage, "No action needed.");
  }
  return check(
    id,
    name,
    weight,
    "fail",
    `${nodeCount} element(s) fail this check.`,
    fixMessage,
  );
}

export function runWcagChecks($: cheerio.CheerioAPI, page: FetchedPage): Check[] {
  const violations = page.axeViolations;
  const checks: Check[] = [];

  // 1. Images have alt
  checks.push(
    fromAxeRule(
      violations,
      ["image-alt"],
      "image-alt",
      "Images have alt text",
      5,
      "All images have appropriate alt text.",
      "Add alt attributes to every informative image; use alt=\"\" for decorative ones.",
    ),
  );

  // 2. Form inputs have labels
  checks.push(
    fromAxeRule(
      violations,
      ["label"],
      "form-labels",
      "Form inputs have labels",
      5,
      "All form inputs have associated labels.",
      "Give every form input an associated <label>, or an aria-label/aria-labelledby.",
    ),
  );

  // 3. Body text contrast >= 4.5:1
  checks.push(
    fromAxeRule(
      violations,
      ["color-contrast"],
      "color-contrast",
      "Body text contrast",
      4,
      "Text meets 4.5:1 contrast minimum.",
      "Darken text or lighten backgrounds so body text reaches at least 4.5:1 contrast.",
    ),
  );

  // 4. html lang set
  checks.push(
    fromAxeRule(
      violations,
      ["html-has-lang"],
      "html-lang",
      "<html lang> set",
      3,
      "html element has a lang attribute.",
      'Add a lang attribute to the <html> tag, e.g. <html lang="en">.',
    ),
  );

  // 5. Document has title
  checks.push(
    fromAxeRule(
      violations,
      ["document-title"],
      "document-title",
      "Document has title",
      3,
      "Document has a descriptive title.",
      "Add a non-empty <title> element.",
    ),
  );

  // 6. No positive tabindex
  checks.push(
    fromAxeRule(
      violations,
      ["tabindex"],
      "no-positive-tabindex",
      "No positive tabindex",
      3,
      "No elements use a positive tabindex.",
      "Remove positive tabindex values; rely on natural DOM order for tab sequence.",
    ),
  );

  // 7. Skip link present
  const firstElements = $("body").children().slice(0, 3);
  const hasSkipLink =
    $('a[href^="#"]').filter((_, el) => /skip/i.test($(el).text())).length > 0 ||
    firstElements.find('a[href^="#"]').length > 0;
  checks.push(
    hasSkipLink
      ? check("skip-link", "Skip link present", 3, "pass", "A skip link is present near the top of the page.", "No action needed.")
      : check(
          "skip-link",
          "Skip link present",
          3,
          "fail",
          "No skip link found near the start of the page.",
          "Add a 'Skip to content' link as the first focusable element on the page.",
        ),
  );

  // 8. Landmarks present
  checks.push(
    fromAxeRule(
      violations,
      ["landmark-one-main"],
      "landmarks",
      "Landmarks present",
      3,
      "Page has a single main landmark.",
      "Wrap the primary content in a single <main> landmark.",
    ),
  );

  // 9. Focus indicators not disabled
  const outlineDisabled = /outline\s*:\s*(0|none)\b(?![^;}]*box-shadow)/i.test(page.stylesheetText);
  checks.push(
    outlineDisabled
      ? check(
          "focus-indicators",
          "Focus indicators not disabled",
          4,
          "fail",
          "Stylesheets set outline: none/0 without an evident replacement focus style.",
          "Never remove focus outlines without providing a visible alternative (e.g. box-shadow or a custom outline).",
        )
      : check("focus-indicators", "Focus indicators not disabled", 4, "pass", "No stylesheet rules disable focus outlines outright.", "No action needed."),
  );

  // 10. Discernible button/link text
  checks.push(
    fromAxeRule(
      violations,
      ["link-name", "button-name"],
      "discernible-text",
      "Discernible button/link text",
      4,
      "Buttons and links all have discernible text.",
      "Give every button and link accessible text (visible text, aria-label, or aria-labelledby).",
    ),
  );

  // 11. Target size >= 24x24px
  checks.push(
    fromAxeRule(
      violations,
      ["target-size"],
      "target-size",
      "Target size at least 24x24px",
      3,
      "Interactive targets meet the 24x24px minimum size.",
      "Increase padding or dimensions so tap targets are at least 24 by 24 pixels.",
    ),
  );

  // 12. Link identification not color-only
  checks.push(
    fromAxeRule(
      violations,
      ["link-in-text-block"],
      "link-not-color-only",
      "Links identifiable without color",
      2,
      "In-text links are distinguishable without relying on color alone.",
      "Underline in-text links or add another non-color cue so they're identifiable without relying on color.",
    ),
  );

  return checks;
}
