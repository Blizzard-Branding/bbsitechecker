import path from "node:path";
import type { Browser } from "playwright-core";
import type { AxeViolation, FetchedPage } from "./types";

const FETCH_TIMEOUT_MS = 30_000;
const LOCAL_CHROMIUM_PATH = "/opt/pw-browsers/chromium";

const BOT_BLOCK_MARKERS = [
  "just a moment",
  "checking your browser",
  "attention required",
  "access denied",
  "are you a human",
];

async function launchBrowser(): Promise<Browser> {
  const { chromium } = await import("playwright-core");

  if (process.env.VERCEL) {
    const sparticuzChromium = (await import("@sparticuz/chromium")).default;
    return chromium.launch({
      args: sparticuzChromium.args,
      executablePath: await sparticuzChromium.executablePath(),
      headless: true,
    });
  }

  const proxyServer = process.env.HTTPS_PROXY ?? process.env.https_proxy;

  return chromium.launch({
    executablePath: path.resolve(LOCAL_CHROMIUM_PATH),
    headless: true,
    proxy: proxyServer ? { server: proxyServer } : undefined,
  });
}

export async function fetchPage(url: string): Promise<FetchedPage> {
  const browser = await launchBrowser();

  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (compatible; BlizzardSiteChecker/1.0; +https://tools.blizzardbranding.com)",
    });
    const page = await context.newPage();

    const response = await page.goto(url, {
      timeout: FETCH_TIMEOUT_MS,
      waitUntil: "networkidle",
    });

    const html = await page.content();
    const finalUrl = page.url();
    const status = response?.status() ?? null;
    const headers = response?.headers() ?? {};

    const lowerHtml = html.toLowerCase();
    const blockedAutomation =
      status === 403 ||
      status === 429 ||
      status === 503 ||
      BOT_BLOCK_MARKERS.some((marker) => lowerHtml.includes(marker));

    const wordCount = await page.evaluate(() => {
      const text = document.body?.innerText ?? "";
      return text.trim().split(/\s+/).filter(Boolean).length;
    });

    const stylesheetText = await page.evaluate(() => {
      let combined = "";
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules)) {
            combined += rule.cssText + "\n";
          }
        } catch {
          // Cross-origin stylesheet, can't read cssRules.
        }
      }
      return combined;
    });

    const axeViolations = await runAxe(page);

    await context.close();

    return {
      html,
      status,
      finalUrl,
      isHttps: finalUrl.startsWith("https://"),
      headers,
      axeViolations,
      stylesheetText,
      blockedAutomation,
      wordCount,
    };
  } finally {
    await browser.close();
  }
}

async function runAxe(
  page: import("playwright-core").Page,
): Promise<AxeViolation[]> {
  try {
    const axeSource = await getAxeSource();
    await page.evaluate(axeSource);
    const results = await page.evaluate(async () => {
      // @ts-expect-error axe is injected as a global by axe.min.js
      return await window.axe.run();
    });
    return (results.violations ?? []).map(
      (violation: { id: string; impact: string | null; nodes: unknown[] }) => ({
        id: violation.id,
        impact: violation.impact,
        nodes: violation.nodes?.length ?? 0,
      }),
    );
  } catch {
    return [];
  }
}

let cachedAxeSource: string | null = null;

async function getAxeSource(): Promise<string> {
  if (cachedAxeSource) return cachedAxeSource;
  const fs = await import("node:fs/promises");
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const axePath = require.resolve("axe-core/axe.min.js");
  cachedAxeSource = await fs.readFile(axePath, "utf-8");
  return cachedAxeSource;
}
