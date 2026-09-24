import { rateLimit } from "@/lib/rateLimit";
import { analyze } from "@/lib/engine/analyze";
import { APIFY_RUN_ID, apifyInput, clampApify, collectJsearch, jsearchQueries, pollApifyRun, SourceError, startApifyRun } from "@/lib/engine/aggregators";
import type { RawJob } from "@/lib/engine/collect";
import { demoJobs } from "@/lib/engine/demo";
import type { SearchFilters } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // every call is short: one JSearch query, or one Apify start/poll

interface Body {
  source?: "jsearch" | "apify";
  filters?: SearchFilters;
  resume?: string;
  jsearch?: { apiKey?: string; datePosted?: string; maxQueries?: number; queries?: string[] };
  apify?: { token?: string; actorId?: string; limit?: number; step?: "start" | "poll"; runId?: string };
}

const DATE_POSTED = new Set(["today", "3days", "week", "month", "all"]);

export async function POST(req: Request) {
  const limited = rateLimit(req, "sources");
  if (limited) return limited;
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { source, filters, resume = "" } = body;
  if (!filters) return Response.json({ error: "Missing filters" }, { status: 400 });
  if (!filters.roles.length) return Response.json({ error: "Add at least one role to search JSearch or Apify." }, { status: 400 });

  try {
    let raw: RawJob[] = [];
    let requests = 0;
    if (process.env.APPLYWISE_DEMO === "1") {
      const label = source === "apify" ? "Apify" : "JSearch";
      raw = ["Northwind", "Globex", "Initech", "Umbrella Health", "Hooli"].flatMap((n) =>
        demoJobs({ name: n, industry: `via ${label}`, ats: "greenhouse", slug: `${source}-${n.toLowerCase().replace(/\W+/g, "-")}` }).map((j) => ({ ...j, ats: source! })),
      );
    } else if (source === "jsearch") {
      const key = body.jsearch?.apiKey?.trim();
      if (!key) return Response.json({ error: "Add your RapidAPI key for JSearch in Settings → Sources." }, { status: 400 });
      const max = Math.min(20, Math.max(1, body.jsearch?.maxQueries ?? 6));
      const datePosted = DATE_POSTED.has(body.jsearch?.datePosted ?? "") ? body.jsearch!.datePosted! : "week";
      // the client sends one query per request; fall back to the whole sweep for older clients
      const asked = body.jsearch?.queries?.filter((q) => typeof q === "string" && q.trim()).slice(0, 3).map((q) => q.slice(0, 200));
      const r = await collectJsearch({ apiKey: key, queries: asked?.length ? asked : jsearchQueries(filters, max), datePosted, usOnly: filters.usOnly });
      raw = r.jobs;
      requests = r.requests;
    } else if (source === "apify") {
      const token = body.apify?.token?.trim();
      if (!token) return Response.json({ error: "Add your Apify API token in Settings → Sources." }, { status: 400 });
      const actorId = body.apify?.actorId?.trim() || "fantastic-jobs~career-site-job-listing-feed";
      if (!/^[\w.-]+[~/][\w.-]+$/.test(actorId)) return Response.json({ error: "Actor ID should look like username~actor-name." }, { status: 400 });
      const limit = clampApify(body.apify?.limit);
      if (body.apify?.step !== "poll") {
        const { runId } = await startApifyRun({ token, actorId, input: apifyInput(filters, limit) });
        return Response.json({ pending: true, runId, status: "READY" });
      }
      const runId = body.apify.runId ?? "";
      if (!APIFY_RUN_ID.test(runId)) return Response.json({ error: "Bad Apify run id" }, { status: 400 });
      const poll = await pollApifyRun({ token, runId });
      if (poll.state === "running") return Response.json({ pending: true, runId, status: poll.status });
      raw = poll.jobs;
      requests = 1;
    } else {
      return Response.json({ error: "Unknown source" }, { status: 400 });
    }
    const { jobs, stats } = analyze(raw, filters, resume, Date.now(), { pool: true });
    return Response.json({ jobs, stats, requests });
  } catch (e) {
    const status = e instanceof SourceError ? e.status : 502;
    const message = e instanceof Error ? (e.name === "TimeoutError" ? `${source === "apify" ? "Apify" : "JSearch"} took too long to respond` : e.message) : "Source failed";
    return Response.json({ error: message }, { status: status >= 400 && status < 600 ? status : 502 });
  }
}
