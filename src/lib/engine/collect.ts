import type { Ats, Company } from "../types";
import { htmlToText } from "./text";

/** A posting as returned by a company's public job board, normalized across ATS vendors. */
export interface RawJob {
  ats: Ats;
  company: string;
  industry: string;
  slug: string;
  externalId: string;
  title: string;
  location: string;
  remoteHint: boolean;
  workplaceHint: string | null;
  postedAt: string | null;
  url: string;
  description: string;
  salary: string | null;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

async function getJson<T>(url: string, fetchImpl: FetchLike, timeoutMs: number): Promise<T | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      signal: ctrl.signal,
      headers: { accept: "application/json", "user-agent": "Applywise/0.1 (+open-source job search)" },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// ── Greenhouse ─────────────────────────────────────────────────────────────────────────────
interface GhJob {
  id: number | string;
  title?: string;
  location?: { name?: string };
  content?: string;
  absolute_url?: string;
  updated_at?: string;
  first_published?: string;
}
export function normalizeGreenhouse(c: Company, data: { jobs?: GhJob[] } | null): RawJob[] {
  return (data?.jobs ?? []).map((j) => {
    const description = j.content ? htmlToText(j.content) : "";
    return {
      ats: "greenhouse",
      company: c.name,
      industry: c.industry,
      slug: c.slug,
      externalId: String(j.id),
      title: (j.title ?? "").trim(),
      location: j.location?.name ?? "",
      remoteHint: /remote/i.test(j.location?.name ?? ""),
      workplaceHint: null,
      postedAt: j.first_published ?? j.updated_at ?? null,
      url: j.absolute_url ?? `https://job-boards.greenhouse.io/${c.slug}`,
      description,
      salary: extractSalary(description),
    };
  });
}

// ── Lever ──────────────────────────────────────────────────────────────────────────────────
interface LeverJob {
  id?: string;
  text?: string;
  categories?: { location?: string; allLocations?: string[]; commitment?: string };
  descriptionPlain?: string;
  additionalPlain?: string;
  lists?: { text?: string; content?: string }[];
  hostedUrl?: string;
  createdAt?: number;
  workplaceType?: string;
  salaryRange?: { min?: number; max?: number; currency?: string; interval?: string };
}
export function normalizeLever(c: Company, data: LeverJob[] | null): RawJob[] {
  if (!Array.isArray(data)) return [];
  return data.map((j) => {
    const lists = (j.lists ?? [])
      .map((l) => `${l.text ?? ""}\n${l.content ? htmlToText(l.content) : ""}`)
      .join("\n");
    const description = [j.descriptionPlain ?? "", lists, j.additionalPlain ?? ""].join("\n").trim();
    const sr = j.salaryRange;
    const salary =
      sr && (sr.min || sr.max)
        ? `${sr.currency ?? "USD"} ${fmt(sr.min)}–${fmt(sr.max)}${sr.interval ? ` ${sr.interval}` : ""}`
        : extractSalary(description);
    return {
      ats: "lever",
      company: c.name,
      industry: c.industry,
      slug: c.slug,
      externalId: j.id ?? Math.random().toString(36).slice(2),
      title: (j.text ?? "").trim(),
      location: j.categories?.location ?? j.categories?.allLocations?.join(" / ") ?? "",
      remoteHint: j.workplaceType === "remote" || /remote/i.test(j.categories?.location ?? ""),
      workplaceHint: j.workplaceType ?? null,
      postedAt: typeof j.createdAt === "number" ? new Date(j.createdAt).toISOString() : null,
      url: j.hostedUrl ?? `https://jobs.lever.co/${c.slug}`,
      description,
      salary,
    };
  });
}

// ── Ashby ──────────────────────────────────────────────────────────────────────────────────
interface AshbyJob {
  id?: string;
  title?: string;
  location?: string;
  secondaryLocations?: { location?: string }[];
  isRemote?: boolean;
  workplaceType?: string;
  descriptionPlain?: string;
  descriptionHtml?: string;
  jobUrl?: string;
  publishedAt?: string;
  isListed?: boolean;
  compensation?: { compensationTierSummary?: string; scrapeableCompensationSalarySummary?: string };
}
export function normalizeAshby(c: Company, data: { jobs?: AshbyJob[] } | null): RawJob[] {
  return (data?.jobs ?? [])
    .filter((j) => j.isListed !== false)
    .map((j) => {
      const description = j.descriptionPlain ?? (j.descriptionHtml ? htmlToText(j.descriptionHtml) : "");
      const locs = [j.location, ...(j.secondaryLocations ?? []).map((s) => s.location)].filter(Boolean);
      return {
        ats: "ashby",
        company: c.name,
        industry: c.industry,
        slug: c.slug,
        externalId: j.id ?? Math.random().toString(36).slice(2),
        title: (j.title ?? "").trim(),
        location: locs.join(" / "),
        remoteHint: !!j.isRemote || /remote/i.test(j.location ?? ""),
        workplaceHint: j.workplaceType ?? null,
        postedAt: j.publishedAt ?? null,
        url: j.jobUrl ?? `https://jobs.ashbyhq.com/${c.slug}`,
        description,
        salary:
          j.compensation?.scrapeableCompensationSalarySummary ??
          j.compensation?.compensationTierSummary ??
          extractSalary(description),
      };
    });
}

function fmt(n?: number) {
  if (!n) return "?";
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
}

export function extractSalary(text: string): string | null {
  const m = text.match(/\$\s?\d{2,3}(?:,\d{3}|k|K)(?:\s?(?:-|–|to)\s?\$?\s?\d{2,3}(?:,\d{3}|k|K))?/);
  return m ? m[0].replace(/\s+/g, " ") : null;
}

export async function collectCompany(c: Company, fetchImpl: FetchLike = fetch, timeoutMs = 12000): Promise<RawJob[]> {
  const slug = encodeURIComponent(c.slug);
  switch (c.ats) {
    case "greenhouse":
      return normalizeGreenhouse(
        c,
        await getJson(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`, fetchImpl, timeoutMs),
      );
    case "lever":
      return normalizeLever(c, await getJson(`https://api.lever.co/v0/postings/${slug}?mode=json`, fetchImpl, timeoutMs));
    case "ashby":
      return normalizeAshby(
        c,
        await getJson(
          `https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`,
          fetchImpl,
          timeoutMs,
        ),
      );
  }
}
