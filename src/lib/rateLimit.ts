import "server-only";

/**
 * Small per-visitor rate limiter (sliding window, in memory). On Vercel each warm instance keeps its
 * own counters, so this is a guard against casual abuse of the public endpoints — not a hard quota.
 * Set RATE_LIMIT=off to disable (e.g. local load testing).
 */
const buckets = new Map<string, number[]>();

export const LIMITS = {
  jobs: { max: 90, windowMs: 60_000 }, // a full scan sends ~20 batches
  sources: { max: 60, windowMs: 60_000 }, // one call per JSearch query + Apify status polls
  resume: { max: 10, windowMs: 60_000 },
  tailor: { max: 20, windowMs: 60_000 },
  pdf: { max: 15, windowMs: 60_000 },
} as const;

function clientId(req: Request) {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || req.headers.get("x-real-ip") || "local";
}

/** Returns a 429 Response when over the limit, otherwise null. */
export function rateLimit(req: Request, route: keyof typeof LIMITS): Response | null {
  if (process.env.RATE_LIMIT === "off") return null;
  const { max, windowMs } = LIMITS[route];
  const key = `${route}:${clientId(req)}`;
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    const retry = Math.ceil((windowMs - (now - hits[0])) / 1000);
    return Response.json({ error: `Too many requests — try again in ${retry}s.` }, { status: 429, headers: { "retry-after": String(retry) } });
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 5000) for (const [k, v] of buckets) if (!v.length || now - v[v.length - 1] > windowMs) buckets.delete(k);
  return null;
}
