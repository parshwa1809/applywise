/**
 * One-page resume HTML — the same rules as the job-tailor renderer:
 * Letter, margins 0.35in top/bottom & 0.45in left/right, Times New Roman 10pt, centered 16pt name,
 * "a | b | c" contact line with black bold un-underlined links, uppercase ruled section headers,
 * role header with company/title on the left and dates/location on the right, real <ul> bullets
 * with a hanging indent (so ATS text extraction keeps reading order), and a density ladder
 * roomy → full → compact → tight, then non-fabricating content trims (moderate → shortened).
 */
import type { Entry, ResumeDoc, Section } from "./doc";

export type LayoutMode = "balanced-roomy" | "balanced-full" | "balanced-compact" | "tight";

interface Density {
  lineHeight: number;
  sectionTop: number;
  sectionBottom: number;
  entryGap: number;
  bulletGap: number;
  summaryGap: number;
}

const LAYOUTS: Record<LayoutMode, Density> = {
  "balanced-roomy": { lineHeight: 1.32, sectionTop: 9, sectionBottom: 4, entryGap: 7, bulletGap: 2.6, summaryGap: 5 },
  "balanced-full": { lineHeight: 1.22, sectionTop: 7, sectionBottom: 3, entryGap: 5, bulletGap: 1.8, summaryGap: 4 },
  "balanced-compact": { lineHeight: 1.12, sectionTop: 5, sectionBottom: 2, entryGap: 3.5, bulletGap: 1.1, summaryGap: 3 },
  tight: { lineHeight: 1.04, sectionTop: 3.5, sectionBottom: 1.5, entryGap: 2.5, bulletGap: 0.6, summaryGap: 2 },
};

/** Underfill expansion: grow vertical spacing only (capped) so a short resume still fills the page. */
function expandDensity(d: Density, factor: number): Density {
  if (factor <= 1) return d;
  return {
    lineHeight: Math.min(d.lineHeight + (factor - 1) * 0.16, 1.6),
    sectionTop: d.sectionTop * factor,
    sectionBottom: d.sectionBottom * factor,
    entryGap: d.entryGap * factor,
    bulletGap: d.bulletGap * (1 + (factor - 1) * 0.5),
    summaryGap: d.summaryGap * factor,
  };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function contactLine(doc: ResumeDoc) {
  return doc.contact
    .map((c) => (c.href ? `<a class="lk" href="${esc(c.href)}">${esc(c.label)}</a>` : `<span>${esc(c.label)}</span>`))
    .join('<span class="sep"> | </span>');
}

function entryHtml(e: Entry) {
  const bullets = e.bullets.length ? `<ul>${e.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : "";
  const right = [e.dates, e.location].filter(Boolean) as string[];
  if (!e.subtitle && !right.length) return `<div class="entry">${e.title ? `<div class="phead"><span class="b">${esc(e.title)}</span></div>` : ""}${bullets}</div>`;
  // source order: company, title, dates, location, bullets — so extracted text matches reading order
  return `<div class="entry"><div class="hdr"><div class="hl"><span class="b">${esc(e.title)}</span>${e.subtitle ? `<br><span class="i">${esc(e.subtitle)}</span>` : ""}</div>${
    right.length ? `<div class="hr">${e.dates ? `<span class="b">${esc(e.dates)}</span>` : ""}${e.dates && e.location ? "<br>" : ""}${e.location ? `<span>${esc(e.location)}</span>` : ""}</div>` : ""
  }</div>${bullets}</div>`;
}

function sectionHtml(s: Section) {
  let body = "";
  if (s.kind === "summary") body = `<div class="summary">${esc(s.text ?? "")}</div>`;
  else if (s.kind === "skills")
    body = (s.skills ?? []).map((g) => `<div class="skill">${g.group ? `<span class="skill-g">${esc(g.group)}:</span> ` : ""}${esc(g.items.join(", "))}</div>`).join("");
  else {
    body = (s.entries ?? []).map(entryHtml).join("");
    body += (s.lines ?? []).map((l) => `<div class="edu">${esc(l)}</div>`).join("");
  }
  return `<h2>${esc(s.heading)}</h2>${body}`;
}

/**
 * `browserPrint`: for the in-browser fallback only. Chrome adds a date/title/URL header and footer
 * inside the page margins when printing, so that variant uses a zero @page margin and puts the
 * same 0.35in/0.45in margins on the body instead — identical page, no browser header.
 */
export function renderResumeHtml(doc: ResumeDoc, layout: LayoutMode = "balanced-full", expand = 1, title = "Resume", browserPrint = false): string {
  const d = expandDensity(LAYOUTS[layout], expand);
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
  ${browserPrint ? "@page { size: Letter; margin: 0; } @media print { body { padding: 0.35in 0.45in; } }" : "@page { size: Letter; margin: 0.35in 0.45in; }"}
  * { box-sizing: border-box; }
  html, body { padding: 0; margin: 0; background: #fff; }
  body {
    font-family: "Times New Roman", Times, "Liberation Serif", "Applywise Symbols", serif;
    font-size: 10pt; line-height: ${d.lineHeight}; color: #000; width: 100%;
    word-break: keep-all; overflow-wrap: normal; hyphens: manual;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  h1 { text-align: center; font-size: 16pt; font-weight: bold; margin: 0 0 2pt; letter-spacing: 0.3pt; }
  .headline { text-align: center; font-size: 10.5pt; margin: 0 0 2pt; }
  .contact { text-align: center; font-size: 10pt; margin: 0 0 2pt; }
  a.lk { color: #000; text-decoration: none; font-weight: 700; }
  h2 { text-transform: uppercase; font-weight: bold; font-size: 10.5pt; border-bottom: 0.75pt solid #000; margin: ${d.sectionTop}pt 0 ${d.sectionBottom}pt; padding-bottom: 1pt; letter-spacing: 0.4pt; }
  .summary { margin: 0 0 ${d.summaryGap}pt; text-align: justify; }
  .entry { margin: 0 0 ${d.entryGap}pt; }
  .hdr { display: flex; justify-content: space-between; align-items: flex-start; }
  .hr { text-align: right; white-space: nowrap; padding-left: 10pt; }
  .phead { margin: 0; }
  .b { font-weight: bold; } .i { font-style: italic; }
  .skill, .edu { margin: 0 0 ${d.bulletGap}pt; }
  .skill-g { font-weight: bold; }
  ul { margin: 1pt 0 0; padding-left: 16pt; list-style-type: disc; list-style-position: outside; }
  li { margin: 0 0 ${d.bulletGap}pt; padding-left: 2pt; }
</style></head><body>
  <h1>${esc(doc.name || "Your Name")}</h1>
  ${doc.headline ? `<div class="headline">${esc(doc.headline)}</div>` : ""}
  ${doc.contact.length ? `<div class="contact">${contactLine(doc)}</div>` : ""}
  ${doc.sections.map(sectionHtml).join("\n")}
</body></html>`;
}

// ── non-fabricating content trims (only drop / shorten existing text) ─────────────────────────

export function firstSentence(text: string): string {
  const parts = text.trim().split(/(?<=\.)\s+/);
  if (parts.length <= 1) return text.trim();
  let out = parts[0].trim();
  if (out.replace(/[^a-z]/gi, "").length < 40 && parts[1]) out = `${out} ${parts[1].trim()}`;
  return /[.!?]$/.test(out) ? out : `${out}.`;
}

const mapEntries = (doc: ResumeDoc, kind: Section["kind"], fn: (entries: Entry[]) => Entry[]): ResumeDoc => ({
  ...doc,
  sections: doc.sections.map((s) => (s.kind === kind && s.entries ? { ...s, entries: fn(s.entries) } : s)),
});

/** Cap each role to its first 3 bullets (already relevance-ordered) and keep at most 2 projects. */
export function moderateContent(doc: ResumeDoc, maxBullets = 3, maxProjects = 2): ResumeDoc {
  let d = mapEntries(doc, "experience", (es) => es.map((e) => ({ ...e, bullets: e.bullets.slice(0, maxBullets) })));
  d = mapEntries(d, "projects", (es) => es.slice(0, maxProjects).map((e) => ({ ...e, bullets: e.bullets.slice(0, 3) })));
  return d;
}

/** Most aggressive fit: 2 bullets per role, lead project only, whole leading sentences only. */
export function shortenContent(doc: ResumeDoc): ResumeDoc {
  let d = mapEntries(doc, "experience", (es) => es.map((e) => ({ ...e, bullets: e.bullets.slice(0, 2).map(firstSentence) })));
  d = mapEntries(d, "projects", (es) => es.slice(0, 1).map((e) => ({ ...e, bullets: e.bullets.slice(0, 2).map(firstSentence) })));
  return d;
}

export interface Candidate {
  label: string;
  layout: LayoutMode;
  doc: ResumeDoc;
}

export function buildCandidates(doc: ResumeDoc): Candidate[] {
  const moderate = moderateContent(doc);
  const shortened = shortenContent(doc);
  return [
    { label: "roomy", layout: "balanced-roomy", doc },
    { label: "balanced", layout: "balanced-full", doc },
    { label: "compact", layout: "balanced-compact", doc },
    { label: "tight", layout: "tight", doc },
    { label: "tight · top bullets", layout: "tight", doc: moderate },
    { label: "tight · shortened", layout: "tight", doc: shortened },
  ];
}

// Letter at 96dpi minus the @page margins — the box one page of content must fit in.
export const PRINTABLE_W = (8.5 - 0.9) * 96; // 729.6px
export const PRINTABLE_H = (11 - 0.7) * 96; // 988.8px
export const FILL_MIN = 0.94;
export const UNDERFILL_TARGET = 0.92;
export const EXPAND_FACTORS = [1.12, 1.25, 1.4, 1.55, 1.7, 1.85, 2.0];
