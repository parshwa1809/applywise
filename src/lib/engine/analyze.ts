import type { GhostSignal, Job, SearchFilters, WorkMode } from "../types";
import type { RawJob } from "./collect";
import { findSkills } from "./skills";

const DAY = 86_400_000;

// ── work mode ──────────────────────────────────────────────────────────────────────────────
const REMOTE_TEXT =
  /\b(fully|100%|completely|entirely) remote\b|\bremote[- ]first\b|\bwork from anywhere\b|\b(this|the) (role|position|job|opportunity) is (a )?(fully )?remote\b|\bremote \((us|usa|united states)\)|\bremote[- ]eligible\b|\bopen to remote\b/;

export function detectWorkMode(j: Pick<RawJob, "location" | "remoteHint" | "workplaceHint" | "description">): Job["workMode"] {
  const wp = (j.workplaceHint ?? "").toLowerCase();
  if (wp.includes("hybrid")) return "hybrid";
  if (wp.includes("remote")) return "remote";
  if (wp.includes("onsite") || wp.includes("on-site")) return "onsite";
  const loc = j.location.toLowerCase();
  if (loc.includes("hybrid")) return "hybrid";
  if (j.remoteHint || loc.includes("remote")) return "remote";
  const head = j.description.slice(0, 1500).toLowerCase();
  if (/\bhybrid\b/.test(head)) return "hybrid";
  // many boards list an HQ city but say "fully remote" only in the text
  if (REMOTE_TEXT.test(head)) return "remote";
  if (j.location.trim()) return "onsite";
  return "unknown";
}

// ── US-only gate (errs toward keeping) ─────────────────────────────────────────────────────
const NON_US = [
  "canada", "toronto", "vancouver", "montreal", "ontario", "united kingdom", " uk", "london", "england",
  "ireland", "dublin", "germany", "berlin", "munich", "france", "paris", "spain", "madrid", "barcelona",
  "portugal", "lisbon", "netherlands", "amsterdam", "poland", "warsaw", "india", "bangalore", "bengaluru",
  "hyderabad", "pune", "mumbai", "delhi", "gurgaon", "noida", "chennai", "singapore", "australia", "sydney",
  "melbourne", "japan", "tokyo", "brazil", "são paulo", "sao paulo", "mexico", "argentina", "colombia",
  "israel", "tel aviv", "emea", "apac", "latam", "europe", "philippines", "vietnam", "korea", "seoul",
  "sweden", "stockholm", "denmark", "copenhagen", "switzerland", "zurich", "italy", "milan", "romania",
  "ukraine", "estonia", "czech", "prague", "new zealand", "south africa", "nigeria", "kenya", "uae", "dubai",
];
const US_HINT = /\b(united states|usa|u\.s\.|us-remote|remote[- ,(]*us|\bus\b|[A-Z]{2}\b)/;

export function isLikelyUS(location: string): boolean {
  const l = ` ${location.toLowerCase()}`;
  if (!location.trim()) return true;
  if (/united states|\busa\b|u\.s\.|remote.{0,4}\bus\b|\bus\b.{0,4}remote/i.test(location)) return true;
  if (NON_US.some((t) => l.includes(t))) {
    // multi-location postings like "New York / London" — keep if any part looks US
    return location.split(/[\/;|]| or /i).some((p) => p.trim() && !NON_US.some((t) => ` ${p.toLowerCase()}`.includes(t)) && US_HINT.test(p));
  }
  return true;
}

// ── experience requirement ─────────────────────────────────────────────────────────────────
export function minYears(description: string): number | null {
  const re = /(\d{1,2})\s*(?:\+|plus)?\s*(?:(?:-|–|to)\s*\d{1,2}\s*)?(?:\+\s*)?(?:years|yrs)/gi;
  let best: number | null = null;
  for (const m of description.matchAll(re)) {
    const ctx = description.slice(m.index ?? 0, (m.index ?? 0) + 90).toLowerCase();
    if (!/experience|exp\b|background|working|in product|in a|in the/.test(ctx)) continue;
    const n = Number(m[1]);
    if (n > 0 && n <= 25) best = best === null ? n : Math.min(best, n);
  }
  return best;
}

// ── ghost-job signals ──────────────────────────────────────────────────────────────────────
const EVERGREEN = /(evergreen|talent (pool|community|network)|general application|future opportunit|pipeline|expression of interest|always hiring|join our talent)/i;

export function ghostSignals(j: RawJob, now: number, duplicateCount: number): Job["ghost"] {
  const signals: GhostSignal[] = [];
  if (EVERGREEN.test(j.title) || EVERGREEN.test(j.description.slice(0, 600)))
    signals.push({ label: "Reads like an evergreen / talent-pool listing", weight: 45 });
  if (!j.postedAt) signals.push({ label: "No posting date", weight: 10 });
  else {
    const age = (now - Date.parse(j.postedAt)) / DAY;
    if (age > 60) signals.push({ label: `Open for ${Math.round(age)} days`, weight: 35 });
    else if (age > 30) signals.push({ label: `Open for ${Math.round(age)} days`, weight: 18 });
  }
  if (j.description.length < 400) signals.push({ label: "Very thin description", weight: 25 });
  if (!j.salary) signals.push({ label: "No pay range listed", weight: 8 });
  if (duplicateCount >= 5) signals.push({ label: `Same title posted ${duplicateCount}× by this company`, weight: 15 });
  const score = Math.min(100, signals.reduce((s, x) => s + x.weight, 0));
  return { score, level: score < 25 ? "low" : score < 50 ? "medium" : "high", signals };
}

// ── filters ────────────────────────────────────────────────────────────────────────────────
export interface FilterStats {
  total: number;
  title: number;
  location: number;
  age: number;
  experience: number;
  kept: number;
  /** fresh, on-target postings dropped only for asking too many years — shown so the user can judge */
  overYears?: { company: string; title: string; years: number; url: string }[];
}

// ── role matching: title families, not exact strings ───────────────────────────────────────
// "software developer" should also find "Software Engineer", "Backend Developer", "SDE II".
const ABBREVIATIONS: [RegExp, string][] = [
  [/\bsde\b/g, "software development engineer"],
  [/\bswe\b/g, "software engineer"],
  [/\bapm\b/g, "associate product manager"],
  [/\bpm\b/g, "product manager"],
  [/\bsr\.?(?=\s)/g, "senior"],
  [/\bjr\.?(?=\s)/g, "junior"],
];
const SAME_JOB: string[][] = [
  ["developer", "engineer", "programmer", "dev"],
  ["manager", "mgr"],
  ["analyst", "analytics"],
];
// a role word that a specialization can stand in for ("software" is implied by "Backend Developer")
const IMPLIED_BY: Record<string, string[]> = {
  software: ["software", "backend", "frontend", "fullstack", "web", "mobile", "ios", "android", "platform", "application", "applications", "cloud", "development"],
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function normalizeTitle(text: string): string {
  let t = ` ${text.toLowerCase().replace(/[-_/,()|]+/g, " ").replace(/\s+/g, " ")} `;
  for (const [re, full] of ABBREVIATIONS) t = t.replace(re, full);
  // one spelling for compound words, so "Front End" = "Front-End" = "Frontend"
  t = t.replace(/\bfront end\b/g, "frontend").replace(/\bback end\b/g, "backend").replace(/\bfull stack\b/g, "fullstack").replace(/\bux ui\b|\bui ux\b/g, "ux ui");
  return t;
}
function wordAlternatives(w: string): string[] {
  return IMPLIED_BY[w] ?? SAME_JOB.find((g) => g.includes(w)) ?? [w];
}
const altRe = (w: string) => `(?:${wordAlternatives(w).map(escapeRe).join("|")})s?`;
// words allowed between the two halves of a role's core phrase ("Software Development Engineer", "Product Manager II")
const FILLER = "(?:development|ui)";

/**
 * A title matches a role when:
 *  - the role's core phrase (its last two words, e.g. "product manager") appears together and in order —
 *    so "Product Marketing Manager" or "Engineering Manager, Billing Products" don't count — and
 *  - any other role words ("ai", "technical", "growth") appear anywhere in the title.
 * Title-family synonyms apply throughout (developer = engineer, backend implies software, SDE, PM, …).
 */
export function roleMatchesTitle(role: string, title: string): boolean {
  const t = normalizeTitle(title);
  const words = normalizeTitle(role).trim().split(" ").filter(Boolean);
  if (!words.length) return false;
  const head = words.slice(-2);
  const rest = words.slice(0, -2);
  const headRe =
    head.length === 1
      ? new RegExp(`\\b${altRe(head[0])}\\b`)
      : new RegExp(`\\b${altRe(head[0])}(?:\\s+${FILLER})?\\s+${altRe(head[1])}\\b`);
  return headRe.test(t) && rest.every((w) => new RegExp(`\\b${altRe(w)}\\b`).test(t));
}

/**
 * Excluded words that are part of one of your own roles are ignored ("manager" can't exclude
 * "Product Manager" when that's what you're looking for). Returns the words that actually apply.
 */
export function effectiveExcludes(f: Pick<SearchFilters, "roles" | "excludeTitle">): { active: string[]; ignored: string[] } {
  const roleWords = new Set(f.roles.flatMap((r) => normalizeTitle(r).trim().split(" ")).filter(Boolean));
  const active: string[] = [];
  const ignored: string[] = [];
  for (const x of f.excludeTitle) {
    const norm = normalizeTitle(x).trim();
    if (!norm) continue;
    if (norm.split(" ").every((w) => roleWords.has(w))) ignored.push(x);
    else active.push(norm);
  }
  return { active, ignored };
}
const excludedBy = (title: string, f: Pick<SearchFilters, "roles" | "excludeTitle">) => {
  const t = normalizeTitle(title);
  return effectiveExcludes(f).active.some((x) => new RegExp(`\\b${escapeRe(x)}(s|ship)?\\b`).test(t));
};

/**
 * Was this role already collected by an earlier scan? True when a scanned role is a broader version of it
 * ("product manager" covers "ai product manager": same core phrase, fewer extra words), so narrowing a
 * role only filters, while a new or broader role needs a rescan.
 */
export function roleCoveredBy(role: string, scannedRoles: string[]): boolean {
  const words = normalizeTitle(role).trim().split(" ").filter(Boolean);
  const head = words.slice(-2).join(" ");
  return scannedRoles.some((s) => {
    const sw = normalizeTitle(s).trim().split(" ").filter(Boolean);
    return sw.slice(-2).join(" ") === head && sw.every((w) => words.includes(w));
  });
}

/** What changed since the last scan that the saved pool can't cover (so a Rescan is needed). */
export function scanGaps(
  scope: { roles: string[]; companies: string[]; locations: string[]; paid: boolean } | undefined,
  now: { roles: string[]; companies: string[]; locations: string[]; paidOn: boolean },
): { roles: string[]; companies: number; cities: string[] } | null {
  if (!scope) return null;
  const roles = now.roles.filter((r) => !roleCoveredBy(r, scope.roles));
  const had = new Set(scope.companies);
  const companies = now.companies.filter((c) => !had.has(c)).length;
  const hadCities = new Set(scope.locations.map((l) => l.toLowerCase().trim()));
  // new cities only matter for JSearch/Apify searches; company boards already return every location
  const cities = now.paidOn ? now.locations.filter((l) => !hadCities.has(l.toLowerCase().trim())) : [];
  return roles.length || companies || cities.length ? { roles, companies, cities } : null;
}

export function titleMatches(title: string, f: SearchFilters): boolean {
  if (excludedBy(title, f)) return false;
  if (!f.roles.length) return true;
  return f.roles.some((r) => roleMatchesTitle(r, title));
}

export function locationMatches(location: string, mode: Job["workMode"], f: SearchFilters): boolean {
  if (f.usOnly && !isLikelyUS(location)) return false;
  const modes = f.workModes.length ? f.workModes : (["remote", "hybrid", "onsite"] as WorkMode[]);
  if (mode === "remote") return modes.includes("remote");
  // a job that never says how it works is only kept when every work mode is acceptable
  if (mode === "unknown" && modes.length < 3) return false;
  if (mode !== "unknown" && !modes.includes(mode)) return false;
  if (!f.locations.length) return true;
  const l = location.toLowerCase();
  return f.locations.some((x) => x.trim() && l.includes(x.toLowerCase().trim()));
}

// ── main ───────────────────────────────────────────────────────────────────────────────────
/** How old a posting can be and still enter the pool (the freshness slider tops out at 90 days). */
export const POOL_MAX_AGE_DAYS = 120;

/**
 * The fine filters — work mode, cities, US-only, freshness, experience, excluded words — that run on
 * the user's device over the saved pool, so changing them never needs a rescan.
 */
export function jobVisible(j: Pick<Job, "title" | "location" | "workMode" | "postedAt" | "minYears">, f: SearchFilters, now = Date.now()): boolean {
  if (excludedBy(j.title, f)) return false;
  if (f.roles.length && !f.roles.some((r) => roleMatchesTitle(r, j.title))) return false;
  if (!locationMatches(j.location === "—" ? "" : j.location, j.workMode, f)) return false;
  if (f.maxAgeDays > 0 && j.postedAt && (now - Date.parse(j.postedAt)) / DAY > f.maxAgeDays) return false;
  if (f.maxYears > 0 && j.minYears !== null && j.minYears > f.maxYears) return false;
  return true;
}

/** Stage-by-stage counts over the pool, for "which filter emptied my deck" explanations. */
export function funnelFor(jobs: Pick<Job, "title" | "company" | "location" | "workMode" | "postedAt" | "minYears">[], f: SearchFilters, now = Date.now()) {
  const loose = { ...f, excludeTitle: [] as string[] };
  const titled = jobs.filter((j) => !excludedBy(j.title, f));
  const located = titled.filter((j) => locationMatches(j.location === "—" ? "" : j.location, j.workMode, loose));
  const fresh = located.filter((j) => !(f.maxAgeDays > 0 && j.postedAt && (now - Date.parse(j.postedAt)) / DAY > f.maxAgeDays));
  const fits = fresh.filter((j) => !(f.maxYears > 0 && j.minYears !== null && j.minYears > f.maxYears));
  const overYears = fresh.filter((j) => !fits.includes(j)).map((j) => ({ company: j.company, title: j.title, years: j.minYears ?? 0 }));
  return { total: jobs.length, title: titled.length, location: located.length, age: fresh.length, experience: fits.length, overYears };
}

export function analyze(
  raw: RawJob[],
  f: SearchFilters,
  resume: string,
  now = Date.now(),
  opts: { pool?: boolean } = {},
): { jobs: Job[]; stats: FilterStats } {
  const stats: FilterStats = { total: raw.length, title: 0, location: 0, age: 0, experience: 0, kept: 0 };
  const resumeSkills = new Set(findSkills(resume));
  const dupes = new Map<string, number>();
  for (const r of raw) {
    const k = `${r.company}|${r.title.toLowerCase()}`;
    dupes.set(k, (dupes.get(k) ?? 0) + 1);
  }

  const jobs: Job[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const pool = !!opts.pool;
    if (!(pool ? !f.roles.length || f.roles.some((role) => roleMatchesTitle(role, r.title)) : titleMatches(r.title, f))) continue;
    stats.title++;
    const mode = detectWorkMode(r);
    if (pool && r.postedAt && (now - Date.parse(r.postedAt)) / DAY > POOL_MAX_AGE_DAYS) continue;
    if (!pool && !locationMatches(r.location, mode, f)) continue;
    stats.location++;
    if (!pool && f.maxAgeDays > 0 && r.postedAt && (now - Date.parse(r.postedAt)) / DAY > f.maxAgeDays) continue;
    stats.age++;
    const yrs = minYears(r.description);
    if (!pool && f.maxYears > 0 && yrs !== null && yrs > f.maxYears) {
      (stats.overYears ??= []).push({ company: r.company, title: r.title, years: yrs, url: r.url });
      continue;
    }
    stats.experience++;

    const dedupeKey = `${r.company}|${r.title.toLowerCase()}|${r.location.toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const jdSkills = findSkills(`${r.title}\n${r.description}`);
    const matched = jdSkills.filter((s) => resumeSkills.has(s));
    const missing = jdSkills.filter((s) => !resumeSkills.has(s));
    // Bayesian shrink toward a 35% prior: a posting that names 1 skill shouldn't read as a "100% match".
    const coverage = (matched.length + 4 * 0.35) / (jdSkills.length + 4);
    const titleFit = f.roles.some((role) => r.title.toLowerCase().includes(role.toLowerCase())) ? 1 : 0.6;
    const ghost = ghostSignals(r, now, dupes.get(`${r.company}|${r.title.toLowerCase()}`) ?? 1);
    const match = resume.trim()
      ? Math.round(Math.max(0, Math.min(100, 25 * titleFit + 75 * coverage)))
      : Math.round(40 * titleFit);

    jobs.push({
      id: `${r.ats}:${r.slug}:${r.externalId}`,
      company: r.company,
      industry: r.industry,
      ats: r.ats,
      title: r.title,
      location: r.location || (mode === "remote" ? "Remote" : "—"),
      workMode: mode,
      postedAt: r.postedAt,
      url: r.url,
      description: r.description.slice(0, opts.pool ? 8000 : 12000),
      salary: r.salary,
      minYears: yrs,
      match,
      matched,
      missing,
      ghost,
    });
  }
  stats.kept = jobs.length;
  return { jobs, stats };
}
