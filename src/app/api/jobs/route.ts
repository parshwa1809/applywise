import { analyze } from "@/lib/engine/analyze";
import { collectCompany, type RawJob } from "@/lib/engine/collect";
import { demoJobs } from "@/lib/engine/demo";
import type { Company, SearchFilters } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ATS = new Set(["greenhouse", "lever", "ashby"]);
const SLUG = /^[a-z0-9][a-z0-9._-]{0,79}$/i;
const TTL = 10 * 60_000;
const cache = new Map<string, { at: number; jobs: RawJob[] }>();

async function collectCached(c: Company) {
  const key = `${c.ats}:${c.slug}`;
  if (process.env.APPLYWISE_DEMO === "1") return demoJobs(c);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.jobs;
  const jobs = await collectCompany(c);
  cache.set(key, { at: Date.now(), jobs });
  return jobs;
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

export async function POST(req: Request) {
  let body: { companies?: Company[]; filters?: SearchFilters; resume?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const companies = (body.companies ?? [])
    .filter((c) => c && ATS.has(c.ats) && SLUG.test(c.slug))
    .slice(0, 30);
  if (!body.filters) return Response.json({ error: "Missing filters" }, { status: 400 });

  const perCompany = await pool(companies, 8, async (c) => {
    const jobs = await collectCached(c);
    return { company: c, ok: jobs.length > 0, count: jobs.length, jobs };
  });

  const raw = perCompany.flatMap((p) => p.jobs);
  const { jobs, stats } = analyze(raw, body.filters, body.resume ?? "");
  return Response.json({
    jobs,
    stats,
    companies: perCompany.map((p) => ({ slug: p.company.slug, ats: p.company.ats, name: p.company.name, count: p.count })),
  });
}
