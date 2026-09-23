/**
 * Structured resume model + a forgiving plain-text parser.
 *
 * Applywise accepts any resume text (pasted, PDF, Word). To print a proper one-page resume we
 * need structure — name, contact line, sections, roles with dates and bullets — so this parser
 * recovers it with heuristics. It never invents content: anything it can't classify is kept
 * as plain lines in its section.
 */

export interface ContactItem {
  label: string;
  href?: string;
}

export interface Entry {
  /** e.g. company (bold) */
  title: string;
  /** e.g. role (italic) */
  subtitle?: string;
  /** e.g. "Feb 2023 – Oct 2025" */
  dates?: string;
  location?: string;
  bullets: string[];
}

export type SectionKind = "summary" | "skills" | "experience" | "projects" | "education" | "other";

export interface Section {
  kind: SectionKind;
  heading: string;
  text?: string; // summary
  skills?: { group: string; items: string[] }[];
  entries?: Entry[];
  lines?: string[];
}

export interface ResumeDoc {
  name: string;
  headline?: string;
  contact: ContactItem[];
  sections: Section[];
}

const HEADINGS: [SectionKind, RegExp][] = [
  ["summary", /^(professional\s+)?(summary|profile|about( me)?|objective|overview)$/i],
  ["skills", /^((technical|core|key)\s+)?(skills|competencies|toolkit|technologies|tools)(\s*(&|and)\s*\w+)?$/i],
  ["experience", /^((professional|work|relevant)\s+)?(experience|employment( history)?|work history)$/i],
  ["projects", /^((selected|personal|key|academic)\s+)?projects$/i],
  ["education", /^(education|academics)(\s*(&|and)\s*certifications?)?$/i],
  ["other", /^(certifications?|licenses|awards|honors|publications|volunteer(ing)?|leadership|activities|languages|interests)$/i],
];

const BULLET = /^\s*[•●▪◦‣∙·*\-–]\s+/;
const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";
const DATE = `(?:${MONTH}\\s+\\d{4}|\\d{1,2}/\\d{4}|\\d{4})`;
const RANGE = new RegExp(`(${DATE})\\s*(?:-|–|—|to)\\s*(${DATE}|present|current|now|today)`, "i");
const SINGLE = new RegExp(`(?:^|\\s|\\|)(${MONTH}\\s+\\d{4}|(?:19|20)\\d{2})\\s*$`, "i");
const LOCATION = /\b(remote|hybrid|[A-Z][a-zA-Z.]+(?:\s[A-Z][a-zA-Z.]+)*,\s?(?:[A-Z]{2}|[A-Z][a-z]+))\b\s*$/;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/;
const PHONE = /(\+?\d[\d\s().-]{7,}\d)/;
const URLISH = /((?:https?:\/\/)?(?:www\.)?(?:linkedin\.com|github\.com|[\w-]+\.(?:vercel\.app|dev|io|me|com))\/?[^\s|,]*)/i;

function headingKind(line: string, knownOnly = false): { kind: SectionKind; heading: string } | null {
  const clean = line.replace(/[:：]\s*$/, "").trim();
  if (!clean || clean.length > 40 || BULLET.test(line)) return null;
  for (const [kind, re] of HEADINGS) if (re.test(clean)) return { kind, heading: clean };
  // an ALL-CAPS short line is almost always a heading
  if (!knownOnly && /^[A-Z][A-Z &/]{2,30}$/.test(clean) && !/\d/.test(clean)) return { kind: "other", heading: clean };
  return null;
}

function titleCase(s: string) {
  return s.toLowerCase().replace(/(^|\s|&)\w/g, (m) => m.toUpperCase());
}

export function parseContact(lines: string[]): ContactItem[] {
  const items: ContactItem[] = [];
  for (const line of lines) {
    for (const raw of line.split(/\s*[|•·]\s*|\s{3,}/)) {
      const part = raw.trim();
      if (!part) continue;
      const email = part.match(EMAIL);
      if (email) {
        items.push({ label: email[0], href: `mailto:${email[0]}` });
        continue;
      }
      const url = part.match(URLISH);
      if (url) {
        const label = url[1].replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
        items.push({ label, href: url[1].startsWith("http") ? url[1] : `https://${url[1]}` });
        continue;
      }
      items.push({ label: part });
    }
  }
  return items;
}

function isContactLine(l: string) {
  return EMAIL.test(l) || URLISH.test(l) || (PHONE.test(l) && l.length < 90) || /\|/.test(l);
}

/** Split an entry header into title/subtitle/dates/location. */
function parseHeader(lines: string[], wholeTitle = false): Omit<Entry, "bullets"> {
  if (wholeTitle && !lines.some((l) => RANGE.test(l))) return { title: lines.join(" ").trim() };
  let dates: string | undefined;
  let location: string | undefined;
  const parts: string[] = [];
  for (let raw of lines) {
    const r = raw.match(RANGE) ?? raw.match(SINGLE);
    if (r && !dates) {
      dates = r[0].replace(/^[\s|]+/, "").replace(/\s*(-|–|—|to)\s*/i, " – ").trim();
      raw = raw.replace(r[0], " ");
    }
    // "Company | Title | City, ST" or "Title — Company"
    for (const seg of raw.split(/\s+[|·•]\s+|\s+[—–]\s+|\t+/)) {
      const s = seg.replace(/^[\s,|–—-]+|[\s,|–—-]+$/g, "").trim();
      if (!s || !/[a-z0-9]/i.test(s)) continue;
      const loc = s.match(LOCATION);
      if (!location && loc && loc[0].length === s.length) {
        location = s;
        continue;
      }
      if (!location && loc && parts.length > 0 && s.includes(",")) {
        // "Acme Corp, Dallas, TX" → keep company, peel off trailing location
        const idx = s.lastIndexOf(loc[0]);
        const head = s.slice(0, idx).replace(/,\s*$/, "").trim();
        if (head) {
          parts.push(head);
          location = loc[0];
          continue;
        }
      }
      parts.push(s);
    }
  }
  return { title: parts[0] ?? "", subtitle: parts.slice(1).join(" · ") || undefined, dates, location };
}

const ENDS_SENTENCE = /[.!?]["')\]]?$/;

/** Re-split wrapped prose into bullets: a new bullet starts after a line that ends a sentence. */
function proseToBullets(lines: string[]): string[] {
  const out: string[] = [];
  for (const l of lines) {
    const prev = out[out.length - 1];
    if (prev !== undefined && !ENDS_SENTENCE.test(prev)) out[out.length - 1] = `${prev} ${l}`;
    else out.push(l);
  }
  return out;
}

/**
 * Bullet glyphs are often lost when text is pulled out of a PDF (CSS list bullets aren't text).
 * Recover roles from the date lines instead: company / title sit just above the date, location
 * just below; for undated blocks (projects) a line that isn't a sentence starts a new entry.
 */
function parseProseEntries(body: string[], wholeTitle = false): { entries: Entry[]; loose: string[] } {
  const isHeaderish = (l: string) => l.length <= 110 && !ENDS_SENTENCE.test(l);
  const starts = new Map<number, number>(); // header start index -> header end index (exclusive)
  const dateIdx = body.map((l, i) => (RANGE.test(l) ? i : -1)).filter((i) => i >= 0);
  if (dateIdx.length) {
    for (const d of dateIdx) {
      let start = d;
      // a date on its own line: pull in up to 2 short lines above (company, title)
      if (body[d].replace(RANGE, "").replace(/[|,\s–—-]/g, "").length < 3) {
        while (start > 0 && d - start < 2 && isHeaderish(body[start - 1]) && !starts.has(start - 1) && ![...starts.values()].includes(start)) start--;
      }
      let end = d + 1;
      if (body[end] && (LOCATION.test(body[end]) && body[end].length <= 40)) end++;
      starts.set(start, end);
    }
  } else {
    body.forEach((l, i) => {
      if (isHeaderish(l) && (i === 0 || ENDS_SENTENCE.test(body[i - 1]))) starts.set(i, i + 1);
    });
  }
  const entries: Entry[] = [];
  const loose: string[] = [];
  const keys = [...starts.keys()].sort((a, b) => a - b);
  if (!keys.length) return { entries, loose: proseToBullets(body) };
  loose.push(...body.slice(0, keys[0]));
  keys.forEach((k, n) => {
    const end = starts.get(k)!;
    const next = keys[n + 1] ?? body.length;
    entries.push({ ...parseHeader(body.slice(k, end), wholeTitle), bullets: proseToBullets(body.slice(end, next)) });
  });
  return { entries, loose };
}

function parseEntries(body: string[], wholeTitle = false): { entries: Entry[]; loose: string[] } {
  if (!body.some((l) => BULLET.test(l))) return parseProseEntries(body, wholeTitle);
  const entries: Entry[] = [];
  const loose: string[] = [];
  let header: string[] = [];
  let current: Entry | null = null;
  for (const line of body) {
    if (BULLET.test(line)) {
      const b = line.replace(BULLET, "").trim();
      if (header.length) {
        current = { ...parseHeader(header, wholeTitle), bullets: [] };
        entries.push(current);
        header = [];
      }
      if (current) current.bullets.push(b);
      else loose.push(b);
    } else if (current && header.length === 0 && current.bullets.length && /^[a-z(%&]/.test(line)) {
      // wrapped continuation of the previous bullet
      current.bullets[current.bullets.length - 1] += ` ${line}`;
    } else {
      if (current && current.bullets.length) current = null;
      header.push(line);
      if (header.length > 4) {
        loose.push(header.shift()!);
      }
    }
  }
  if (header.length) {
    if (entries.length || header.some((h) => RANGE.test(h))) entries.push({ ...parseHeader(header), bullets: [] });
    else loose.push(...header);
  }
  return { entries, loose };
}

/** Split "a, b (c, d), e" on separators that aren't inside parentheses. */
function splitList(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    if (depth === 0 && /[,;·•|]/.test(ch)) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function parseSkills(lines: string[]): { group: string; items: string[] }[] {
  const out: { group: string; items: string[] }[] = [];
  // re-join wrapped lines: a line without "Group:" continues the previous one
  const body: string[] = [];
  for (const raw of lines) {
    const l = raw.replace(BULLET, "").trim();
    if (body.length && !/^[^:]{2,40}:\s/.test(l)) body[body.length - 1] += ` ${l}`;
    else body.push(l);
  }
  for (const raw of body) {
    const line = raw.replace(BULLET, "").trim();
    const m = line.match(/^([^:]{2,40}):\s*(.+)$/);
    const split = splitList;
    if (m) out.push({ group: m[1].trim(), items: split(m[2]) });
    else if (line) {
      const last = out.find((g) => g.group === "");
      if (last) last.items.push(...split(line));
      else out.push({ group: "", items: split(line) });
    }
  }
  return out;
}

export function parseResume(text: string): ResumeDoc {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim().length > 0)
    .map((l) => l.trim());

  let i = 0;
  const name = lines[i] && !isContactLine(lines[i]) && !headingKind(lines[i], true) ? lines[i++].replace(/\s*[—–-]\s*$/, "") : "";
  const contactLines: string[] = [];
  let headline: string | undefined;
  // header zone: until the first section heading or bullet
  while (i < lines.length && !headingKind(lines[i]) && !BULLET.test(lines[i])) {
    const l = lines[i];
    if (isContactLine(l)) contactLines.push(l);
    else if (!headline && l.length < 90) headline = l;
    else break;
    i++;
  }
  // "Name — Title" on one line
  let displayName = name;
  const dash = name.match(/^(.{3,40}?)\s+[—–|-]\s+(.{3,60})$/);
  if (dash && !headline) {
    displayName = dash[1];
    headline = dash[2];
  }

  const sections: Section[] = [];
  let cur: { kind: SectionKind; heading: string; body: string[] } | null = null;
  const pre: string[] = [];
  const flush = () => {
    if (!cur) return;
    const { kind, heading, body } = cur;
    if (kind === "summary") sections.push({ kind, heading, text: body.map((b) => b.replace(BULLET, "")).join(" ") });
    else if (kind === "skills") sections.push({ kind, heading, skills: parseSkills(body) });
    else if (kind === "experience" || kind === "projects") {
      const { entries, loose } = parseEntries(body, kind === "projects");
      sections.push({ kind, heading, entries, lines: loose.length ? loose : undefined });
    } else if (kind === "education") {
      sections.push({ kind, heading, lines: body.map((b) => b.replace(BULLET, "")) });
    } else {
      const { entries, loose } = parseEntries(body);
      sections.push(entries.length && entries.some((e) => e.bullets.length) ? { kind, heading, entries, lines: loose.length ? loose : undefined } : { kind, heading, lines: body.map((b) => b.replace(BULLET, "• ")) });
    }
  };
  for (; i < lines.length; i++) {
    const h = headingKind(lines[i]);
    if (h) {
      flush();
      cur = { ...h, heading: h.heading === h.heading.toUpperCase() ? titleCase(h.heading) : h.heading, body: [] };
    } else if (cur) cur.body.push(lines[i]);
    else pre.push(lines[i]);
  }
  flush();

  // text before any heading: bullets become an Experience section, prose becomes the summary
  if (pre.length) {
    const bullets = pre.filter((l) => BULLET.test(l));
    const prose = pre.filter((l) => !BULLET.test(l));
    if (bullets.length) {
      const { entries, loose } = parseEntries(pre);
      const exp: Section = entries.length ? { kind: "experience", heading: "Experience", entries } : { kind: "experience", heading: "Highlights", entries: [{ title: "", bullets: bullets.map((b) => b.replace(BULLET, "")) }] };
      const intro = entries.length ? loose.filter((l) => !bullets.some((b) => b.includes(l))) : prose;
      if (intro.length) sections.unshift({ kind: "summary", heading: "Professional Summary", text: intro.join(" ") });
      sections.splice(sections.some((s) => s.kind === "summary") ? 1 : 0, 0, exp);
    } else if (prose.length) sections.unshift({ kind: "summary", heading: "Professional Summary", text: prose.join(" ") });
  }

  // job-tailor order: Summary, Skills, Experience, Projects, Education, then anything else
  const rank: Record<SectionKind, number> = { summary: 0, skills: 1, experience: 2, projects: 3, education: 4, other: 5 };
  const ordered = sections.map((s, idx) => ({ s, idx })).sort((a, b) => rank[a.s.kind] - rank[b.s.kind] || a.idx - b.idx).map((x) => x.s);

  return { name: displayName, headline, contact: parseContact(contactLines), sections: ordered };
}

/** Every bullet in document order (used to map tailored bullets back into place). */
export function allBullets(doc: ResumeDoc): string[] {
  return doc.sections.flatMap((s) => (s.entries ?? []).flatMap((e) => e.bullets));
}
