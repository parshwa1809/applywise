import "server-only";
import { readFileSync } from "fs";
import { join } from "path";
/**
 * Server-side PDF — a port of job-tailor's src/resume/pdf.ts.
 * Renders with headless Chromium (page.pdf, preferCSSPageSize, no browser header/footer), measures
 * each ladder rung, and accepts: pageCount === 1 AND fill ≥ 0.94 AND bottom blank ≤ 0.7in.
 * Ladder: roomy → balanced → compact → tight → tight+moderate → tight+shortened, then capped
 * underfill expansion of the fullest one-page rung. Margins live only in the CSS @page rule.
 */
import { PDFDocument } from "pdf-lib";
import type { Browser, Page } from "playwright";
import type { ResumeDoc } from "./doc";
import { buildCandidates, EXPAND_FACTORS, FILL_MIN, PRINTABLE_H, PRINTABLE_W, renderResumeHtml, UNDERFILL_TARGET, type Candidate } from "./render";

const DPI = 96;
export const BOTTOM_BLANK_MAX_IN = 0.7;

export class PdfLayoutError extends Error {}

interface Measurement {
  pageCount: number;
  fillRatio: number;
  bottomBlankInches: number;
  pdf: Uint8Array;
}

let browserPromise: Promise<Browser> | null = null;

const serverless = () => !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

/**
 * Serverless Linux has no Times New Roman, so Chromium would silently swap fonts and the one-page fit
 * would drift. Liberation Serif is metric-compatible with Times New Roman (same widths), so we register
 * it under that name there. Unlike the Fontsource "latin" subset we used before, these files keep arrows
 * (→), math (≤ ≈) and other symbols, which otherwise printed as empty boxes and vanished from the PDF
 * text that ATS parsers read. Anything still missing (✓ ★ …) falls back to a small DejaVu symbol font.
 * Locally (macOS/Windows) the real font is used, same as job-tailor.
 */
export const FONT_DIR = join(process.cwd(), "src/lib/resume/fonts");
let fontCss: string | null = null;
export function timesFontCss(): string {
  if (fontCss !== null) return fontCss;
  const face = (family: string, file: string, weight: number, style: string) => {
    try {
      const b64 = readFileSync(join(FONT_DIR, file)).toString("base64");
      return `@font-face{font-family:"${family}";font-weight:${weight};font-style:${style};src:url(data:font/woff2;base64,${b64}) format("woff2");}`;
    } catch {
      return "";
    }
  };
  fontCss =
    [
      face("Times New Roman", "LiberationSerif-Regular.woff2", 400, "normal"),
      face("Times New Roman", "LiberationSerif-Bold.woff2", 700, "normal"),
      face("Times New Roman", "LiberationSerif-Italic.woff2", 400, "italic"),
      face("Times New Roman", "LiberationSerif-BoldItalic.woff2", 700, "italic"),
      face("Applywise Symbols", "DejaVuSans-Symbols.woff2", 400, "normal"),
    ].join("");
  return fontCss;
}
const withFonts = (html: string) => (serverless() ? html.replace("</head>", `<style>${timesFontCss()}</style></head>`) : html);

/** Local: Playwright's Chromium (same one job-tailor uses). Vercel/Lambda: @sparticuz/chromium. */
async function launchBrowser(): Promise<Browser> {
  const { chromium } = await import("playwright");
  if (serverless()) {
    const sparticuz = (await import("@sparticuz/chromium")).default;
    return chromium.launch({ args: sparticuz.args, executablePath: await sparticuz.executablePath(), headless: true });
  }
  return chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {});
}

/** Locally one browser is reused across requests (fast). */
async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = launchBrowser().catch((e) => {
      browserPromise = null;
      throw e;
    });
  }
  const b = await browserPromise;
  if (!b.isConnected()) {
    browserPromise = null;
    return getBrowser();
  }
  return b;
}

async function measure(page: Page, html: string): Promise<Measurement> {
  await page.setViewportSize({ width: Math.round(PRINTABLE_W), height: Math.round(PRINTABLE_H) });
  await page.setContent(withFonts(html), { waitUntil: "load" });
  await page.emulateMedia({ media: "print" });
  const contentHeightPx = await page.evaluate(() => document.body.scrollHeight);
  const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
  const pageCount = (await PDFDocument.load(pdf)).getPageCount();
  return {
    pageCount,
    fillRatio: contentHeightPx / PRINTABLE_H,
    bottomBlankInches: Math.max(0, (PRINTABLE_H - contentHeightPx) / DPI),
    pdf,
  };
}

const passes = (m: Measurement) => m.pageCount === 1 && m.fillRatio >= FILL_MIN && m.bottomBlankInches <= BOTTOM_BLANK_MAX_IN;

export interface PdfResult {
  pdf: Uint8Array;
  /** the exact HTML of the accepted rung (used for the on-screen preview) */
  html: string;
  layout: string;
  fillRatio: number;
  pageCount: number;
  underfilled: boolean;
}

const isClosedError = (e: unknown) => /has been closed|Target closed|browser has disconnected|Browser closed/i.test(String(e));

export async function generateResumePdf(doc: ResumeDoc, title: string): Promise<PdfResult> {
  // Serverless instances are frozen between requests, which kills a cached Chromium while it still
  // looks connected. There, launch a fresh browser per request (the unpacked binary stays in /tmp,
  // so this costs well under a second) and always close it.
  if (serverless()) {
    for (let attempt = 1; ; attempt++) {
      const browser = await launchBrowser();
      try {
        return await renderOnePage(await browser.newPage(), doc, title);
      } catch (e) {
        if (attempt >= 2 || !isClosedError(e)) throw e;
      } finally {
        await browser.close().catch(() => {});
      }
    }
  }
  try {
    return await renderOnePage(await (await getBrowser()).newPage(), doc, title);
  } catch (e) {
    if (!isClosedError(e)) throw e;
    browserPromise = null; // the cached browser died; start a new one once
    return renderOnePage(await (await getBrowser()).newPage(), doc, title);
  }
}

async function renderOnePage(page: Page, doc: ResumeDoc, title: string): Promise<PdfResult> {
  try {
    let bestUnderfilled: { m: Measurement; c: Candidate } | null = null;
    for (const c of buildCandidates(doc)) {
      const html = renderResumeHtml(c.doc, c.layout, 1, title);
      const m = await measure(page, html);
      if (passes(m)) return { pdf: m.pdf, html, layout: c.label, fillRatio: m.fillRatio, pageCount: 1, underfilled: false };
      if (m.pageCount === 1 && (!bestUnderfilled || m.fillRatio > bestUnderfilled.m.fillRatio)) bestUnderfilled = { m, c };
    }
    if (bestUnderfilled) {
      // grow vertical spacing only (content and text order unchanged), never onto a 2nd page
      let best = bestUnderfilled;
      let bestFactor = 1;
      let bestHtml = renderResumeHtml(bestUnderfilled.c.doc, bestUnderfilled.c.layout, 1, title);
      for (const f of EXPAND_FACTORS) {
        const html = renderResumeHtml(bestUnderfilled.c.doc, bestUnderfilled.c.layout, f, title);
        const m = await measure(page, html);
        if (m.pageCount > 1) break;
        if (m.fillRatio > best.m.fillRatio) {
          best = { m, c: bestUnderfilled.c };
          bestFactor = f;
          bestHtml = html;
        }
        if (m.fillRatio >= UNDERFILL_TARGET) break;
      }
      const label = bestFactor > 1 ? `${best.c.label} +expand×${bestFactor.toFixed(2)}` : best.c.label;
      return { pdf: best.m.pdf, html: bestHtml, layout: label, fillRatio: best.m.fillRatio, pageCount: 1, underfilled: best.m.fillRatio < UNDERFILL_TARGET };
    }
    throw new PdfLayoutError("Even the tightest layout runs past one page — shorten your resume a little and try again.");
  } finally {
    await page.close().catch(() => {});
  }
}
