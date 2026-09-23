import type { SearchFilters } from "../types";
import { extractSalary, type RawJob } from "./collect";

/*
 * Aggregator sources. Unlike company boards these search across many sites, so each needs the
 * user's own key. Keys arrive with the request, are used once, and are never stored or logged.
 */

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export class SourceError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

async function readError(res: Response, source: string): Promise<SourceError> {
  let detail = "";
  try {
    const body = await res.json();
    detail = body?.message ?? body?.error?.message ?? body?.error ?? "";
  } catch {
    /* non-JSON error body */
  }
  const hint =
    res.status === 401 ? "the key looks wrong" : res.status === 403 ? "your key isn't subscribed to this API" : res.status === 429 ? "you've hit the rate limit or monthly quota" : `HTTP ${res.status}`;
  return new SourceError(`${source}: ${hint}${detail ? ` (${String(detail).slice(0, 160)})` : ""}`, res.status);
}

// ── JSearch (RapidAPI) ─────────────────────────────────────────────────────────────────────
interface JSearchPosting {
  job_id?: string;
  job_title?: string;
  employer_name?: string;
  job_city?: string;
  job_state?: string;
  job_country?: string;
  job_location?: string;
  job_is_remote?: boolean;
  job_apply_link?: string;
  job_posted_at_datetime_utc?: string;
  job_description?: string;
  job_min_salary?: number | null;
  job_max_salary?: number | null;
  job_salary_period?: string | null;
  job_publisher?: string;
}

/** roles × places → search strings, e.g. "product manager in Dallas" / "product manager remote". */
export function jsearchQueries(f: SearchFilters, max: number): string[] {
  const roles = f.roles.length ? f.roles : ["jobs"];
  const places = [
    ...f.locations,
    ...(f.workModes.includes("remote") ? ["remote"] : []),
    ...(!f.locations.length && !f.workModes.includes("remote") ? [f.usOnly ? "United States" : ""] : []),
  ].filter((p, i, a) => a.indexOf(p) === i);
  const out: string[] = [];
  for (const r of roles) for (const p of places.length ? places : [""]) out.push(p === "remote" ? `${r} remote` : p ? `${r} in ${p}` : r);
  return out.slice(0, Math.max(1, max));
}

export function normalizeJsearch(postings: JSearchPosting[]): RawJob[] {
  return postings.map((p) => {
    const loc = [p.job_city, p.job_state].filter(Boolean).join(", ") || p.job_location || (p.job_is_remote ? "Remote" : p.job_country ?? "");
    const salary =
      p.job_min_salary && p.job_max_salary
        ? `$${Math.round(p.job_min_salary / 1000)}k–$${Math.round(p.job_max_salary / 1000)}k${p.job_salary_period ? ` / ${p.job_salary_period.toLowerCase()}` : ""}`
        : extractSalary(p.job_description ?? "");
    return {
      ats: "jsearch",
      company: p.employer_name ?? "Unknown company",
      industry: p.job_publisher ? `via ${p.job_publisher}` : "via JSearch",
      slug: "jsearch",
      externalId: p.job_id ?? `${p.employer_name}-${p.job_title}-${loc}`,
      title: (p.job_title ?? "").trim(),
      location: p.job_is_remote && !/remote/i.test(loc) ? `${loc ? `${loc} · ` : ""}Remote` : loc,
      remoteHint: !!p.job_is_remote,
      workplaceHint: p.job_is_remote ? "remote" : null,
      postedAt: p.job_posted_at_datetime_utc ?? null,
      url: p.job_apply_link ?? "",
      description: p.job_description ?? "",
      salary,
    };
  });
}

export async function collectJsearch(
  opts: { apiKey: string; queries: string[]; datePosted: string; usOnly: boolean; host?: string },
  fetchImpl: FetchLike = fetch,
): Promise<{ jobs: RawJob[]; requests: number }> {
  const host = opts.host ?? "jsearch.p.rapidapi.com";
  const jobs: RawJob[] = [];
  let requests = 0;
  for (const q of opts.queries) {
    const url = `https://${host}/search-v2?query=${encodeURIComponent(q)}&page=1&num_pages=1&date_posted=${encodeURIComponent(opts.datePosted)}${opts.usOnly ? "&country=us" : ""}`;
    const res = await fetchImpl(url, { headers: { "x-rapidapi-key": opts.apiKey, "x-rapidapi-host": host }, signal: AbortSignal.timeout(25000) });
    requests++;
    if (!res.ok) {
      const err = await readError(res, "JSearch");
      if (jobs.length) break; // keep what we have (e.g. quota ran out mid-sweep)
      throw err;
    }
    const data = await res.json();
    // v2 nests postings under data.jobs; the older /search endpoint returns data as an array.
    const list: JSearchPosting[] = Array.isArray(data?.data) ? data.data : data?.data?.jobs ?? [];
    jobs.push(...normalizeJsearch(list));
  }
  return { jobs, requests };
}

// ── Apify (Fantastic.jobs "Career Site Job Listing Feed" or compatible actor) ─────────────
interface ApifyPosting {
  id?: string | number;
  title?: string;
  organization?: string;
  company?: string;
  companyName?: string;
  url?: string;
  jobUrl?: string;
  date_posted?: string;
  postedAt?: string;
  description_text?: string;
  description?: string;
  cities_derived?: string[] | null;
  regions_derived?: string[] | null;
  location?: string;
  ai_work_arrangement?: string | null;
  ai_salary_minvalue?: number | null;
  ai_salary_maxvalue?: number | null;
  source?: string;
}

/** Fantastic.jobs rejects runs under 200 results ("input.limit must be >= 200"). */
export const APIFY_MIN = 200;
export const clampApify = (n: number | undefined) => Math.min(1000, Math.max(APIFY_MIN, Math.round(Number(n) || APIFY_MIN)));

export function apifyInput(f: SearchFilters, limit: number): Record<string, unknown> {
  const levels = f.maxYears === 0 ? undefined : f.maxYears <= 2 ? ["0-2"] : f.maxYears <= 5 ? ["0-2", "2-5"] : ["0-2", "2-5", "5-10"];
  const input: Record<string, unknown> = {
    titleSearch: f.roles,
    locationSearch: f.usOnly ? ["United States"] : undefined,
    aiEmploymentTypeFilter: ["FULL_TIME"],
    removeAgency: true,
    descriptionType: "text",
    includeCompanyDetails: false,
    limit: clampApify(limit),
  };
  if (levels) input.aiExperienceLevelFilter = levels;
  if (f.workModes.length === 1 && f.workModes[0] === "remote") input.remote = true;
  return Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
}

export function normalizeApify(items: ApifyPosting[]): RawJob[] {
  return items
    .filter((p) => p && (p.title || p.organization))
    .map((p) => {
      const base = [p.cities_derived?.[0], p.regions_derived?.[0]].filter(Boolean).join(", ") || p.location || "";
      const arr = p.ai_work_arrangement ?? "";
      const remote = /remote/i.test(arr);
      const description = p.description_text ?? p.description ?? "";
      const salary =
        p.ai_salary_minvalue && p.ai_salary_maxvalue
          ? `$${Math.round(p.ai_salary_minvalue / 1000)}k–$${Math.round(p.ai_salary_maxvalue / 1000)}k`
          : extractSalary(description);
      const company = p.organization ?? p.company ?? p.companyName ?? "Unknown company";
      return {
        ats: "apify",
        company,
        industry: p.source ? `via ${p.source}` : "via Apify",
        slug: "apify",
        externalId: p.id != null ? String(p.id) : `${company}-${p.title}-${base}`,
        title: (p.title ?? "").trim(),
        location: remote ? (base ? `${base} (Remote)` : "Remote") : base,
        remoteHint: remote,
        workplaceHint: /hybrid/i.test(arr) ? "hybrid" : remote ? "remote" : /on-?site/i.test(arr) ? "onsite" : null,
        postedAt: p.date_posted ?? p.postedAt ?? null,
        url: p.url ?? p.jobUrl ?? "",
        description,
        salary,
      };
    });
}

export async function collectApify(
  opts: { token: string; actorId: string; input: Record<string, unknown>; timeoutMs?: number },
  fetchImpl: FetchLike = fetch,
): Promise<RawJob[]> {
  const actor = encodeURIComponent(opts.actorId.trim().replace("/", "~"));
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?format=json&clean=true`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${opts.token}` },
    body: JSON.stringify(opts.input),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 240_000),
  });
  if (!res.ok) throw await readError(res, "Apify");
  const items = await res.json();
  if (!Array.isArray(items)) throw new SourceError("Apify: the actor didn't return a list of jobs");
  return normalizeApify(items);
}

// Async Apify flow: start a run, poll it, then read its dataset. Every HTTP call is short, so no
// browser, proxy or serverless limit can cut off a run that takes a few minutes.
export const APIFY_RUN_ID = /^[A-Za-z0-9]{8,32}$/;

export async function startApifyRun(
  opts: { token: string; actorId: string; input: Record<string, unknown> },
  fetchImpl: FetchLike = fetch,
): Promise<{ runId: string }> {
  const actor = encodeURIComponent(opts.actorId.trim().replace("/", "~"));
  const res = await fetchImpl(`https://api.apify.com/v2/acts/${actor}/runs`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${opts.token}` },
    body: JSON.stringify(opts.input),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw await readError(res, "Apify");
  const data = await res.json();
  const runId = data?.data?.id;
  if (typeof runId !== "string") throw new SourceError("Apify: the run didn't start (no run id returned)");
  return { runId };
}

export type ApifyPoll = { state: "running"; status: string } | { state: "done"; jobs: RawJob[] };

export async function pollApifyRun(opts: { token: string; runId: string }, fetchImpl: FetchLike = fetch): Promise<ApifyPoll> {
  const auth = { authorization: `Bearer ${opts.token}` };
  const res = await fetchImpl(`https://api.apify.com/v2/actor-runs/${opts.runId}`, { headers: auth, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw await readError(res, "Apify");
  const run = (await res.json())?.data ?? {};
  const status: string = run.status ?? "UNKNOWN";
  if (status === "READY" || status === "RUNNING") return { state: "running", status };
  if (status !== "SUCCEEDED") {
    const why = status === "TIMED-OUT" ? "timed out" : status === "ABORTED" ? "was aborted" : `ended with status ${status}`;
    throw new SourceError(`Apify: the actor run ${why}${run.statusMessage ? ` (${String(run.statusMessage).slice(0, 160)})` : ""}`);
  }
  const items = await fetchImpl(`https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?format=json&clean=true`, { headers: auth, signal: AbortSignal.timeout(60_000) });
  if (!items.ok) throw await readError(items, "Apify");
  const list = await items.json();
  if (!Array.isArray(list)) throw new SourceError("Apify: the actor didn't return a list of jobs");
  return { state: "done", jobs: normalizeApify(list) };
}
