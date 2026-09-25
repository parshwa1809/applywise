/**
 * Board housekeeping: everything here runs on its own, on the device, with no extra API calls.
 * - postings that disappeared from their company board are archived (Saved/Tailored only)
 * - Saved jobs nobody touched for 14 days are archived
 * - Applied jobs with no change for 30 days are archived as "no reply"
 * - the same role saved from two sources (company board + JSearch/Apify) is merged into one card
 * Nothing is deleted: archived jobs keep their stage and can be restored with one tap.
 */
import type { Job } from "./types";

export type Stage = "saved" | "tailored" | "applied" | "interview";
export type ArchiveReason = "closed" | "stale" | "noreply" | "duplicate" | "manual";
export interface ArchiveEntry {
  from: Stage;
  reason: ArchiveReason;
  at: string;
}

const DAY = 86_400_000;
export const STALE_SAVED_DAYS = 14;
export const NO_REPLY_DAYS = 30;
/** start warning this many days before a Saved job is archived */
export const STALE_WARN_DAYS = 3;
/** show "no reply" on Applied cards after this many days */
export const NO_REPLY_WARN_DAYS = 21;
/** columns longer than this show only the first COLLAPSE_AT cards, and switch to compact rows */
export const COLLAPSE_AT = 6;
export const COMPACT_OVER = 8;

export const REASON_LABEL: Record<ArchiveReason, string> = {
  closed: "Posting closed",
  stale: `Saved ${STALE_SAVED_DAYS} days, untouched`,
  noreply: `No reply in ${NO_REPLY_DAYS} days`,
  duplicate: "Same role from another source",
  manual: "Removed by you",
};

const RANK: Record<Stage, number> = { saved: 0, tailored: 1, applied: 2, interview: 3 };
const BOARD_ATS = new Set(["greenhouse", "lever", "ashby"]);
const isStage = (s: unknown): s is Stage => typeof s === "string" && s in RANK;

export const daysSince = (iso: string | undefined, now: number) => (iso ? Math.floor((now - Date.parse(iso)) / DAY) : 0);

/** "ats:slug" of a company-board job, from its id `${ats}:${slug}:${externalId}` */
export const boardKey = (id: string) => id.split(":").slice(0, 2).join(":");

/** company + title, so one role posted on the company board and on JSearch lands on one card */
export const roleKey = (j: Pick<Job, "company" | "title">) =>
  `${j.company}|${j.title}`.toLowerCase().replace(/[^a-z0-9|]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * Board jobs whose company board answered this scan but no longer lists them.
 * A board that failed or came back empty proves nothing, so those are never marked closed.
 */
export function closedPostings(tracked: string[], live: { key: string; ids: string[] }[]): { closed: string[]; open: string[] } {
  const answered = new Map(live.map((l) => [l.key, new Set(l.ids)]));
  const closed: string[] = [];
  const open: string[] = [];
  for (const id of tracked) {
    if (!BOARD_ATS.has(id.split(":")[0])) continue;
    const ids = answered.get(boardKey(id));
    if (!ids) continue;
    (ids.has(id) ? open : closed).push(id);
  }
  return { closed, open };
}

export interface TidyInput {
  jobs: Record<string, Job>;
  status: Record<string, string>;
  statusAt: Record<string, string>;
  closed: Record<string, string>;
  tailor?: Record<string, unknown>;
}

/** Which active board jobs should be archived now, and why. */
export function tidy(s: TidyInput, now: number): Record<string, ArchiveEntry> {
  const out: Record<string, ArchiveEntry> = {};
  const at = new Date(now).toISOString();
  const active = Object.entries(s.status).filter(([id, st]) => isStage(st) && s.jobs[id]) as [string, Stage][];

  // duplicates across sources: keep the furthest-along card (then the company-board copy, then the tailored one)
  const groups = new Map<string, [string, Stage][]>();
  for (const e of active) {
    const k = roleKey(s.jobs[e[0]]);
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const sources = new Set(g.map(([id]) => s.jobs[id].ats));
    if (sources.size < 2) continue; // two postings on the same board are different openings (e.g. two cities)
    const score = ([id, st]: [string, Stage]) => RANK[st] * 100 + (BOARD_ATS.has(s.jobs[id].ats) ? 10 : 0) + (s.tailor?.[id] ? 1 : 0);
    const [keep] = [...g].sort((a, b) => score(b) - score(a));
    for (const e of g) if (e[0] !== keep[0] && s.jobs[e[0]].ats !== s.jobs[keep[0]].ats) out[e[0]] = { from: e[1], reason: "duplicate", at };
  }

  for (const [id, st] of active) {
    if (out[id]) continue;
    const age = daysSince(s.statusAt[id], now);
    if ((st === "saved" || st === "tailored") && s.closed[id]) out[id] = { from: st, reason: "closed", at };
    else if (st === "saved" && age >= STALE_SAVED_DAYS) out[id] = { from: st, reason: "stale", at };
    else if (st === "applied" && age >= NO_REPLY_DAYS) out[id] = { from: st, reason: "noreply", at };
  }
  return out;
}

/** Order that puts what needs you first. */
export function sortColumn(stage: Stage, jobs: Job[], statusAt: Record<string, string>): Job[] {
  const t = (j: Job) => Date.parse(statusAt[j.id] ?? "") || 0;
  const list = [...jobs];
  if (stage === "saved") return list.sort((a, b) => b.match - a.match || t(a) - t(b));
  if (stage === "interview") return list.sort((a, b) => t(b) - t(a));
  return list.sort((a, b) => t(a) - t(b)); // tailored and applied: waiting longest first
}

export const SORT_NOTE: Record<Stage, string> = {
  saved: "Best match first",
  tailored: "Ready longest first",
  applied: "Longest wait first",
  interview: "Newest first",
};

/** Small warning shown on a card before anything happens to it. */
export function cardFlag(stage: Stage, id: string, s: Pick<TidyInput, "statusAt" | "closed">, now: number): { text: string; tone: "warn" | "muted" } | null {
  const age = daysSince(s.statusAt[id], now);
  if (s.closed[id]) return { text: "Posting closed", tone: stage === "applied" || stage === "interview" ? "muted" : "warn" };
  if (stage === "saved" && age >= STALE_SAVED_DAYS - STALE_WARN_DAYS) {
    const left = Math.max(1, STALE_SAVED_DAYS - age);
    return { text: `Archives in ${left}d`, tone: "warn" };
  }
  if (stage === "applied" && age >= NO_REPLY_WARN_DAYS) return { text: `No reply · ${age}d`, tone: "warn" };
  return null;
}

/** "3 postings closed, 4 saved jobs went stale" for archive entries from the last 7 days. */
export function weeklySummary(archived: Record<string, ArchiveEntry>, now: number): string | null {
  const recent = Object.values(archived).filter((a) => a.reason !== "manual" && now - Date.parse(a.at) < 7 * DAY);
  if (!recent.length) return null;
  const n = (r: ArchiveReason) => recent.filter((a) => a.reason === r).length;
  const plural = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  const parts = [
    n("closed") && plural(n("closed"), "posting closed", "postings closed"),
    n("stale") && plural(n("stale"), "saved job went stale", "saved jobs went stale"),
    n("noreply") && plural(n("noreply"), "application got no reply", "applications got no reply"),
    n("duplicate") && plural(n("duplicate"), "duplicate merged", "duplicates merged"),
  ].filter(Boolean);
  return parts.length ? `Auto-tidied this week: ${parts.join(", ")}` : null;
}
