"use client";

import { useCallback, useRef, useState } from "react";
import companiesData from "@/data/companies.json";
import { closedPostings } from "./board";
import { companyKey, PAID_COOLDOWN_MS, useApp, type SourceResult } from "./store";
import { jsearchQueries } from "./engine/aggregators";
import type { FilterStats } from "./engine/analyze";
import type { Company, Job } from "./types";

export const DIRECTORY = companiesData as Company[];

export const INDUSTRIES = (() => {
  const counts = new Map<string, number>();
  for (const c of DIRECTORY) counts.set(c.industry, (counts.get(c.industry) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id, count]) => ({ id, count, label: prettyIndustry(id) }));
})();

export function prettyIndustry(id: string) {
  const map: Record<string, string> = { "ai-ml": "AI / ML", saas: "SaaS", "hr-tech": "HR tech", "data-infra": "Data infra", devtools: "Dev tools", martech: "Martech", edtech: "Edtech", proptech: "Proptech", "insurance-tech": "Insurtech", "healthcare-tech": "Health tech", "mid-size-general": "General", "logistics-supply-chain": "Logistics" };
  return map[id] ?? id.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function resolveCompanies(selected: string[], custom: Company[]): Company[] {
  const byKey = new Map([...DIRECTORY, ...custom].map((c) => [companyKey(c), c]));
  return selected.map((k) => byKey.get(k)).filter((c): c is Company => !!c);
}

export interface ScanProgress {
  running: boolean;
  done: number;
  total: number;
  found: number;
  current: string[];
  error?: string;
  warnings?: string[];
  /** informational, not a failure (e.g. why company boards added nothing) */
  notes?: string[];
}

const BATCH = 12;
const PARALLEL = 3;

type Extra = "jsearch" | "apify";
const LABEL: Record<Extra, string> = { jsearch: "JSearch", apify: "Apify" };

export function useScan() {
  const [progress, setProgress] = useState<ScanProgress>({ running: false, done: 0, total: 0, found: 0, current: [] });
  const cancel = useRef(false);

  const scan = useCallback(async () => {
    const s = useApp.getState();
    const src = s.sources;
    const companies = src.boards ? resolveCompanies(s.selected, s.custom) : [];
    const extras: Extra[] = [];
    const results: SourceResult[] = [];
    // JSearch and Apify spend the user's quota/credits: run each at most once a day for the same search.
    // Changing the search (roles, places, limits) runs it again right away.
    const skipNote = (e: Extra) => {
      // scans from before this change have no record; treat a successful run in the last scan as this search
      const prev = s.lastScan?.sources?.find((r) => r.label === LABEL[e] && !r.error && !r.skipped);
      const last = s.paidRuns[e] ?? (prev && s.lastScan ? { at: s.lastScan.at, search: paidSearchKey(e) } : undefined);
      if (!last || last.search !== paidSearchKey(e)) return null;
      if (!s.paidRuns[e]) useApp.setState((st) => ({ paidRuns: { ...st.paidRuns, [e]: last } }));
      const left = PAID_COOLDOWN_MS - (Date.now() - Date.parse(last.at));
      return left > 0 ? `saved · refreshes in ${Math.max(1, Math.round(left / 3600_000))}h` : null;
    };
    for (const e of ["jsearch", "apify"] as const) {
      const on = e === "jsearch" ? src.jsearch.enabled && src.jsearch.apiKey : src.apify.enabled && src.apify.token;
      if (!on) continue;
      const skip = skipNote(e);
      if (skip) results.push({ label: LABEL[e], found: Object.values(s.jobs).filter((j) => j.ats === e && !s.status[j.id]).length, skipped: skip });
      else extras.push(e);
    }
    if (!companies.length && !extras.length && !results.length) {
      setProgress((p) => ({ ...p, error: "Nothing to scan yet — pick companies, or turn on JSearch or Apify in Settings → Sources." }));
      return;
    }
    cancel.current = false;
    const batches: Company[][] = [];
    for (let i = 0; i < companies.length; i += BATCH) batches.push(companies.slice(i, i + BATCH));
    let done = 0;
    let found = 0;
    let reachable = 0;
    let postings = 0;
    let boardsFound = 0;
    // only companies whose boards were actually checked — a stopped scan must not count the rest as scanned
    const checked: string[] = [];
    const fresh: Job[] = [];
    const live: { key: string; ids: string[] }[] = [];
    const total = companies.length + extras.length;
    setProgress({ running: true, done: 0, total, found: 0, current: [...extras.map((e) => LABEL[e]), ...(batches[0]?.slice(0, 3).map((c) => c.name) ?? [])] });

    const take = (jobs: Job[]) => {
      fresh.push(...jobs);
      found += jobs.length;
      useApp.getState().mergeJobs(jobs);
    };

    // aggregators run alongside the board batches (Apify can take a minute or two)
    const body = (e: Extra, extra: Record<string, unknown> = {}) => {
      const st = useApp.getState();
      return {
        source: e,
        filters: st.filters,
        resume: st.resume,
        jsearch: { ...st.sources.jsearch, ...(e === "jsearch" ? extra : {}) },
        apify: { ...st.sources.apify, ...(e === "apify" ? extra : {}) },
      };
    };
    type SourceReply = { jobs?: Job[]; stats?: FilterStats; error?: string; pending?: boolean; runId?: string; status?: string };

    const runJsearch = async () => {
      const js = useApp.getState().sources.jsearch;
      const queries = jsearchQueries(useApp.getState().filters, js.maxQueries);
      const errors: string[] = [];
      let got = 0;
      let q = 0;
      const lane = async () => {
        while (q < queries.length && !cancel.current) {
          const query = queries[q++];
          try {
            const data = await postJson<SourceReply>("/api/sources", body("jsearch", { queries: [query] }));
            take(data.jobs ?? []);
            got += data.jobs?.length ?? 0;
            postings += data.stats?.total ?? 0;
          } catch (err) {
            errors.push(errText(err));
            // a bad key or empty quota fails every query the same way; don't burn the rest
            if (err instanceof HttpError && [401, 403, 429].includes(err.status)) q = queries.length;
          }
        }
      };
      await Promise.all([lane(), lane()]);
      if (errors.length === queries.length || (got === 0 && errors.length)) throw new Error(errors[0]);
      return got;
    };

    const runApify = async () => {
      let data = await postJson<SourceReply>("/api/sources", body("apify", { step: "start" }));
      const started = Date.now();
      // Apify actors usually finish in 1–3 minutes; poll with short requests instead of holding one open
      while (data.pending && data.runId) {
        if (cancel.current) throw new Error("Stopped before Apify finished");
        if (Date.now() - started > 10 * 60_000) throw new Error("Apify is still running after 10 minutes. Try a smaller job limit.");
        setProgress((p) => ({ ...p, current: p.current.map((x) => (x.startsWith("Apify") ? `Apify (${Math.round((Date.now() - started) / 1000)}s)` : x)) }));
        await sleep(5000);
        data = await postJson<SourceReply>("/api/sources", body("apify", { step: "poll", runId: data.runId }));
      }
      take(data.jobs ?? []);
      postings += data.stats?.total ?? 0;
      return data.jobs?.length ?? 0;
    };

    const runExtra = async (e: Extra) => {
      try {
        const n = e === "jsearch" ? await runJsearch() : await runApify();
        results.push({ label: LABEL[e], found: n });
        useApp.setState((st) => ({ paidRuns: { ...st.paidRuns, [e]: { at: new Date().toISOString(), search: paidSearchKey(e) } } }));
      } catch (err) {
        results.push({ label: LABEL[e], found: 0, error: `${LABEL[e]}: ${errText(err).replace(/^(JSearch|Apify):\s*/, "")}` });
      }
      done += 1;
      setProgress((p) => ({ ...p, done, found, current: p.current.filter((x) => !x.startsWith(LABEL[e])) }));
    };

    let next = 0;
    const worker = async () => {
      while (next < batches.length && !cancel.current) {
        const batch = batches[next++];
        setProgress((p) => ({ ...p, current: [...p.current.filter((x) => x === "JSearch" || x === "Apify"), ...batch.slice(0, 4).map((c) => c.name)] }));
        try {
          const st = useApp.getState();
          const data = await postJson<{ jobs: Job[]; stats: FilterStats; companies: { count: number }[]; live?: { key: string; ids: string[] }[] }>("/api/jobs", { companies: batch, filters: st.filters, resume: st.resume });
          take(data.jobs);
          live.push(...(data.live ?? []));
          boardsFound += data.jobs.length;
          postings += data.stats.total;
          reachable += data.companies.filter((c) => c.count > 0).length;
        } catch {
          /* one failed batch shouldn't stop the scan */
        }
        done += batch.length;
        checked.push(...batch.map((c) => companyKey(c)));
        setProgress((p) => ({ ...p, done, found }));
      }
    };
    await Promise.all([...extras.map(runExtra), ...Array.from({ length: PARALLEL }, worker)]);
    if (companies.length) results.unshift({ label: "Company boards", found: boardsFound, error: reachable === 0 ? "Couldn't reach any company job boards" : undefined });

    // drop previously-found jobs that no longer match and were never acted on — but only for
    // sources that answered this time, so a flaky source doesn't wipe your deck
    const ok = new Set<string>();
    if (reachable > 0) ["greenhouse", "lever", "ashby"].forEach((a) => ok.add(a));
    for (const r of results) if (!r.error && !r.skipped && r.label !== "Company boards") ok.add(r.label.toLowerCase());
    const st = useApp.getState();
    const keep = new Set(fresh.map((j) => j.id));
    const jobs: Record<string, Job> = {};
    for (const [id, j] of Object.entries(st.jobs)) if (keep.has(id) || st.status[id] || !ok.has(j.ats)) jobs[id] = j;
    useApp.setState({
      jobs,
      lastScan: {
        at: new Date().toISOString(),
        companies: companies.length,
        reachable,
        postings,
        kept: fresh.length,
        sources: results,
        scope: { roles: [...s.filters.roles], companies: checked, locations: [...s.filters.locations], paid: extras.length > 0 || results.some((r) => r.skipped) },
      },
    });
    // board housekeeping: flag saved jobs whose posting was taken down, then apply the archive rules
    const after = useApp.getState();
    after.markClosed(closedPostings(Object.keys(after.status).filter((id) => after.status[id] !== "skipped"), live));
    after.tidyBoard();
    const failed = results.filter((r) => r.error);
    const ran = results.filter((r) => !r.skipped);
    const notes: string[] = [];
    setProgress((p) => ({
      ...p,
      running: false,
      current: [],
      error: ran.length > 0 && failed.length === ran.length ? "Every source failed. Check your internet connection and keys, then try again." : undefined,
      warnings: failed.map((r) => r.error!),
      notes,
    }));
  }, []);

  const stop = useCallback(() => {
    cancel.current = true;
  }, []);

  return { progress, scan, stop };
}

export function timeAgo(iso: string | null) {
  if (!iso) return "date unknown";
  const d = (Date.now() - Date.parse(iso)) / 86_400_000;
  if (d < 1) return "today";
  if (d < 2) return "yesterday";
  if (d < 30) return `${Math.floor(d)}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

export function hue(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function errText(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

/** POST JSON with one retry on a dropped connection, and real error messages instead of "Failed to fetch". */
async function postJson<T>(url: string, payload: unknown, tries = 2): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  } catch {
    if (tries > 1) {
      await sleep(1500);
      return postJson<T>(url, payload, tries - 1);
    }
    throw new Error("lost the connection to the Applywise server. Is it still running? Check the terminal where you started it.");
  }
  const text = await res.text();
  let data: (T & { error?: string }) | null = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* an HTML error page from the server */
  }
  if (res.status === 429 && tries > 1) {
    await sleep(3000);
    return postJson<T>(url, payload, tries - 1);
  }
  if (!res.ok || !data) throw new HttpError(data?.error ?? `server error ${res.status}${text ? ` — ${text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 140)}` : ""}`, res.status);
  return data;
}

/** The inputs that change what a paid source returns. Same key within the cooldown → reuse the last results. */
function paidSearchKey(e: "jsearch" | "apify") {
  const { filters: f, sources } = useApp.getState();
  // only what changes the *collected* pool; work mode, freshness and experience filter locally
  const base = [f.roles, f.locations, f.usOnly];
  return JSON.stringify(e === "jsearch" ? [...base, sources.jsearch.datePosted, sources.jsearch.maxQueries] : [...base, sources.apify.limit, sources.apify.actorId]);
}
