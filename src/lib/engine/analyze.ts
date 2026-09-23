import type { GhostSignal, Job, SearchFilters, WorkMode } from "../types";
import type { RawJob } from "./collect";
import { findSkills } from "./skills";

const DAY = 86_400_000;

// ── work mode ──────────────────────────────────────────────────────────────────────────────
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
}

export function titleMatches(title: string, f: SearchFilters): boolean {
  const t = title.toLowerCase();
  if (f.excludeTitle.some((x) => x.trim() && t.includes(x.toLowerCase().trim()))) return false;
  if (!f.roles.length) return true;
  return f.roles.some((r) => {
    const words = r.toLowerCase().split(/\s+/).filter(Boolean);
    return words.length > 0 && words.every((w) => t.includes(w));
  });
}

export function locationMatches(location: string, mode: Job["workMode"], f: SearchFilters): boolean {
  if (f.usOnly && !isLikelyUS(location)) return false;
  const modes = f.workModes.length ? f.workModes : (["remote", "hybrid", "onsite"] as WorkMode[]);
  if (mode === "remote") return modes.includes("remote");
  if (mode !== "unknown" && !modes.includes(mode)) return false;
  if (!f.locations.length) return true;
  const l = location.toLowerCase();
  return f.locations.some((x) => x.trim() && l.includes(x.toLowerCase().trim()));
}

// ── main ───────────────────────────────────────────────────────────────────────────────────
export function analyze(raw: RawJob[], f: SearchFilters, resume: string, now = Date.now()): { jobs: Job[]; stats: FilterStats } {
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
    if (!titleMatches(r.title, f)) continue;
    stats.title++;
    const mode = detectWorkMode(r);
    if (!locationMatches(r.location, mode, f)) continue;
    stats.location++;
    if (f.maxAgeDays > 0 && r.postedAt && (now - Date.parse(r.postedAt)) / DAY > f.maxAgeDays) continue;
    stats.age++;
    const yrs = minYears(r.description);
    if (f.maxYears > 0 && yrs !== null && yrs > f.maxYears) continue;
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
      description: r.description.slice(0, 12000),
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
