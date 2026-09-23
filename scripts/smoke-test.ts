/**
 * Live smoke test against a running Applywise server, using real keys from another project's .env
 * (default: ../job-tailor/.env). Keys are only sent to your local server and never printed.
 *
 *   npm run dev                       # terminal 1
 *   npm run smoke                     # terminal 2
 *
 * Options (env vars):
 *   ENV_FILE=../job-tailor/.env   where GEMINI_API_KEY / JSEARCH_API_KEY / APIFY_TOKEN live
 *   RESUME=path/to/resume.pdf     resume to test with (PDF, .docx, .txt) — default: a sample resume
 *   ROLE="product manager"        role to search     LOCATION=Dallas   location for JSearch
 *   RUN_APIFY=1                   also run Apify (bills a few cents per run; 10 results)
 *   BASE=http://localhost:3000
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { basename, resolve } from "path";
import companies from "../src/data/companies.json";
import { parseResume, allBullets } from "../src/lib/resume/doc";
import { applyTailoring } from "../src/lib/resume/apply";
import type { Company, Job, SearchFilters, TailorResult } from "../src/lib/types";

const BASE = process.env.BASE ?? "http://localhost:3000";
const ENV_FILE = resolve(process.env.ENV_FILE ?? "../job-tailor/.env");
const RESUME = resolve(process.env.RESUME ?? "tests/fixtures/sample-resume.pdf");
const ROLE = process.env.ROLE ?? "product manager";
const LOCATION = process.env.LOCATION ?? "Dallas";

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const results: { step: string; ok: boolean | null; note: string }[] = [];

function readEnv(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/\s+#.*$/, "").trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

async function step<T>(name: string, fn: () => Promise<{ ok: boolean; note: string; value?: T }>): Promise<T | undefined> {
  const t = Date.now();
  process.stdout.write(`• ${name} … `);
  try {
    const r = await fn();
    console.log(`${r.ok ? green("PASS") : red("FAIL")} ${r.note} ${dim(`(${((Date.now() - t) / 1000).toFixed(1)}s)`)}`);
    results.push({ step: name, ok: r.ok, note: r.note });
    return r.value;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`${red("FAIL")} ${msg}`);
    results.push({ step: name, ok: false, note: msg });
    return undefined;
  }
}

function skip(name: string, why: string) {
  console.log(`• ${name} … ${dim(`SKIP ${why}`)}`);
  results.push({ step: name, ok: null, note: why });
}

async function post<T>(path: string, body: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, data: (await res.json()) as T };
}

const filters: SearchFilters = { roles: [ROLE], locations: [], workModes: ["remote", "hybrid", "onsite"], usOnly: true, maxYears: 0, excludeTitle: ["intern", "director", "vp", "principal"], maxAgeDays: 60 };

async function main() {
  const env = readEnv(ENV_FILE);
  const keys = { gemini: env.GEMINI_API_KEY, jsearch: env.JSEARCH_API_KEY, apify: env.APIFY_TOKEN };
  console.log(`\nApplywise smoke test → ${BASE}`);
  console.log(dim(`keys from ${ENV_FILE}: Gemini ${keys.gemini ? "✓" : "✗"} · JSearch ${keys.jsearch ? "✓" : "✗"} · Apify ${keys.apify ? "✓" : "✗"}`));
  console.log(dim(`resume: ${RESUME}\n`));

  await step("Server is running", async () => {
    const res = await fetch(BASE).catch(() => null);
    if (!res?.ok) throw new Error(`nothing answering at ${BASE} — start it with: npm run dev`);
    return { ok: true, note: "" };
  });

  const resumeText = await step<string>("Resume upload + parsing", async () => {
    const fd = new FormData();
    fd.append("file", new File([readFileSync(RESUME)], basename(RESUME)));
    const res = await fetch(`${BASE}/api/resume`, { method: "POST", body: fd });
    const data = (await res.json()) as { text?: string; error?: string };
    if (!data.text) throw new Error(data.error ?? `HTTP ${res.status}`);
    const doc = parseResume(data.text);
    const roles = doc.sections.find((s) => s.kind === "experience")?.entries?.length ?? 0;
    const bullets = allBullets(doc).length;
    return { ok: !!doc.name && roles > 0 && bullets > 0, note: `name "${doc.name}", ${roles} roles, ${bullets} bullets, sections: ${doc.sections.map((s) => s.kind).join(", ")}`, value: data.text };
  });

  const found: Job[] = [];
  await step("Company boards (Greenhouse / Lever / Ashby)", async () => {
    const pick = (companies as Company[]).filter((c) => ["fintech", "ai-ml", "saas"].includes(c.industry)).slice(0, 24);
    const { status, data } = await post<{ jobs: Job[]; stats: { total: number }; companies: { count: number }[] }>("/api/jobs", { companies: pick, filters, resume: resumeText ?? "" });
    if (status !== 200) throw new Error(`HTTP ${status}`);
    const reachable = data.companies.filter((c) => c.count > 0).length;
    found.push(...data.jobs);
    return { ok: reachable > 0, note: `${reachable}/${pick.length} boards answered, ${data.stats.total} postings, ${data.jobs.length} match "${ROLE}"${data.jobs[0] ? ` — e.g. ${data.jobs[0].company}: ${data.jobs[0].title}` : ""}` };
  });

  if (keys.jsearch)
    await step("JSearch (uses 1 request of your monthly quota)", async () => {
      const { status, data } = await post<{ jobs?: Job[]; stats?: { total: number }; error?: string }>("/api/sources", {
        source: "jsearch",
        filters: { ...filters, locations: [LOCATION], workModes: ["hybrid", "onsite"] },
        resume: resumeText ?? "",
        jsearch: { apiKey: keys.jsearch, datePosted: "week", maxQueries: 1 },
      });
      if (status !== 200 || !data.jobs) throw new Error(data.error ?? `HTTP ${status}`);
      found.push(...data.jobs);
      return { ok: (data.stats?.total ?? 0) > 0, note: `${data.stats?.total ?? 0} postings, ${data.jobs.length} kept${data.jobs[0] ? ` — e.g. ${data.jobs[0].company}: ${data.jobs[0].title} (${data.jobs[0].industry})` : ""}` };
    });
  else skip("JSearch", "no JSEARCH_API_KEY");

  if (keys.apify && process.env.RUN_APIFY === "1")
    await step("Apify (200 results — the actor minimum; bills your Apify account)", async () => {
      type Reply = { jobs?: Job[]; stats?: { total: number }; error?: string; pending?: boolean; runId?: string; status?: string };
      const apify = { token: keys.apify, actorId: "fantastic-jobs~career-site-job-listing-feed", limit: 200 };
      let { status, data } = await post<Reply>("/api/sources", { source: "apify", filters, resume: resumeText ?? "", apify: { ...apify, step: "start" } });
      const t0 = Date.now();
      while (status === 200 && data.pending && data.runId) {
        if (Date.now() - t0 > 10 * 60_000) throw new Error("still running after 10 minutes");
        process.stdout.write(dim(`\r    ↳ run ${data.runId}: ${data.status} (${Math.round((Date.now() - t0) / 1000)}s)   `));
        await new Promise((r) => setTimeout(r, 5000));
        ({ status, data } = await post<Reply>("/api/sources", { source: "apify", filters, resume: resumeText ?? "", apify: { ...apify, step: "poll", runId: data.runId } }));
      }
      process.stdout.write("\n");
      if (status !== 200 || !data.jobs) throw new Error(data.error ?? `HTTP ${status}`);
      found.push(...data.jobs);
      return { ok: (data.stats?.total ?? 0) > 0, note: `${data.stats?.total ?? 0} postings, ${data.jobs.length} kept${data.jobs[0] ? ` — e.g. ${data.jobs[0].company}: ${data.jobs[0].title}` : ""}` };
    });
  else skip("Apify", keys.apify ? "set RUN_APIFY=1 to run it (bills a few cents)" : "no APIFY_TOKEN");

  const job = found.sort((a, b) => b.match - a.match)[0];
  let tailored: TailorResult | undefined;
  if (!job || !resumeText) skip("AI tailoring + truth guards", "needs a job and a resume from the steps above");
  else if (!keys.gemini) skip("AI tailoring + truth guards", "no GEMINI_API_KEY");
  else
    tailored = await step<TailorResult>(`AI tailoring (Gemini) for ${job.company} — ${job.title}`, async () => {
      const { status, data } = await post<TailorResult & { error?: string }>("/api/tailor", { job, resume: resumeText, provider: "gemini", apiKey: keys.gemini, model: env.GEMINI_TAILOR_MODEL || undefined });
      if (status !== 200) throw new Error(data.error ?? `HTTP ${status}`);
      if (data.mode !== "ai") throw new Error(`fell back to offline: ${data.error ?? "unknown error"}`);
      const flagged = data.bullets.filter((b) => b.flagged);
      const changed = data.bullets.filter((b) => b.tailored !== b.original && !b.flagged).length;
      const note = `${data.bullets.length} bullets back, ${changed} rewritten, ${flagged.length} rejected by truth guards${data.summaryFlagged ? `, summary rejected (${data.summaryFlagged})` : ", summary OK"}`;
      for (const b of flagged.slice(0, 3)) console.log(dim(`    ↳ rejected: ${b.flagged}`));
      return { ok: true, note, value: data };
    });

  if (job && resumeText)
    await step("One-page PDF (job-tailor ladder)", async () => {
      const { doc } = applyTailoring(parseResume(resumeText), job, tailored, resumeText);
      const fileName = (doc.name || "Resume").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/[^\w]+/g, "_");
      const { status, data } = await post<{ pdf?: string; layout?: string; fill?: number; pages?: number; error?: string }>("/api/pdf", { doc, fileName });
      if (status !== 200 || !data.pdf) throw new Error(data.error ?? `HTTP ${status}`);
      mkdirSync("smoke-output", { recursive: true });
      const out = `smoke-output/${fileName}_${job.company.replace(/[^\w]+/g, "_")}.pdf`;
      writeFileSync(out, Buffer.from(data.pdf, "base64"));
      return { ok: data.pages === 1, note: `${data.pages} page · ${data.layout} · ${Math.round((data.fill ?? 0) * 100)}% filled → ${out}` };
    });
  else skip("One-page PDF", "needs a job and a resume from the steps above");

  const failed = results.filter((r) => r.ok === false).length;
  console.log(`\n${failed ? red(`${failed} step(s) failed`) : green("All run steps passed")} · ${results.filter((r) => r.ok).length} passed · ${results.filter((r) => r.ok === null).length} skipped\n`);
  process.exit(failed ? 1 : 0);
}

main();
