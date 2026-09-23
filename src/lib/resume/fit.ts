"use client";

import type { ResumeDoc } from "./doc";
import { buildCandidates, EXPAND_FACTORS, FILL_MIN, PRINTABLE_H, PRINTABLE_W, renderResumeHtml, UNDERFILL_TARGET } from "./render";

export interface FitResult {
  html: string;
  label: string;
  fill: number;
  fitsOnePage: boolean;
}

/**
 * The job-tailor one-page ladder, run in the browser: render each candidate into an offscreen
 * iframe exactly as wide as the printable area, measure its height, and accept the first that
 * fits one page at ≥94% fill. Otherwise take the fullest one-page candidate and grow its spacing
 * (never its content) toward ~92% fill so there's no big blank gap at the bottom.
 */
export async function fitOnePage(doc: ResumeDoc, title: string): Promise<FitResult> {
  const render = (d: ResumeDoc, layout: Parameters<typeof renderResumeHtml>[1], f: number) => renderResumeHtml(d, layout, f, title, true);
  const frame = document.createElement("iframe");
  Object.assign(frame.style, { position: "fixed", left: "-10000px", top: "0", width: `${PRINTABLE_W}px`, height: `${PRINTABLE_H}px`, border: "0", visibility: "hidden" });
  document.body.appendChild(frame);
  const measure = async (html: string) => {
    const d = frame.contentDocument!;
    d.open();
    d.write(html);
    d.close();
    try {
      await d.fonts?.ready;
    } catch {
      /* fonts API unavailable */
    }
    return d.body.scrollHeight;
  };
  try {
    let best: { html: string; label: string; h: number; c: ReturnType<typeof buildCandidates>[number] } | null = null;
    for (const c of buildCandidates(doc)) {
      const html = render(c.doc, c.layout, 1);
      const h = await measure(html);
      if (h <= PRINTABLE_H && h / PRINTABLE_H >= FILL_MIN) return { html, label: c.label, fill: h / PRINTABLE_H, fitsOnePage: true };
      if (h <= PRINTABLE_H && (!best || h > best.h)) best = { html, label: c.label, h, c };
    }
    if (!best) {
      // even the tightest trim overflows — print it anyway (2 pages) and say so
      const c = buildCandidates(doc).at(-1)!;
      const html = render(c.doc, c.layout, 1);
      return { html, label: c.label, fill: (await measure(html)) / PRINTABLE_H, fitsOnePage: false };
    }
    let chosen = best;
    for (const f of EXPAND_FACTORS) {
      const html = render(best.c.doc, best.c.layout, f);
      const h = await measure(html);
      if (h > PRINTABLE_H) break;
      if (h > chosen.h) chosen = { ...best, html, h, label: `${best.c.label} · spaced` };
      if (h / PRINTABLE_H >= UNDERFILL_TARGET) break;
    }
    return { html: chosen.html, label: chosen.label, fill: chosen.h / PRINTABLE_H, fitsOnePage: true };
  } finally {
    frame.remove();
  }
}

/** Opens the browser print dialog for the resume only (choose "Save as PDF"). */
export function printResume(html: string) {
  const frame = document.createElement("iframe");
  Object.assign(frame.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
  document.body.appendChild(frame);
  const d = frame.contentDocument!;
  d.open();
  d.write(html);
  d.close();
  const go = async () => {
    try {
      await d.fonts?.ready;
    } catch {
      /* ignore */
    }
    frame.contentWindow!.focus();
    frame.contentWindow!.print();
    setTimeout(() => frame.remove(), 60_000);
  };
  if (d.readyState === "complete") go();
  else frame.onload = go;
}
