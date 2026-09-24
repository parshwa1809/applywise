import { describe, expect, it } from "vitest";
import { apifyInput, collectApify, pollApifyRun, startApifyRun, collectJsearch, jsearchQueries, normalizeApify, normalizeJsearch } from "../src/lib/engine/aggregators";
import type { SearchFilters } from "../src/lib/types";

const f: SearchFilters = { roles: ["Product Manager", "Product Analyst"], locations: ["Dallas"], workModes: ["remote", "hybrid"], usOnly: true, maxYears: 4, excludeTitle: [], maxAgeDays: 30 };

describe("JSearch", () => {
  it("builds role × place queries capped by quota, remote first, regardless of work mode", () => {
    expect(jsearchQueries(f, 10)).toEqual(["Product Manager remote", "Product Analyst remote", "Product Manager in Dallas", "Product Analyst in Dallas"]);
    expect(jsearchQueries({ ...f, workModes: ["onsite"] }, 10)).toEqual(jsearchQueries(f, 10));
    expect(jsearchQueries(f, 2)).toHaveLength(2);
  });
  it("normalizes v2 postings", () => {
    const [j] = normalizeJsearch([{ job_id: "x1", job_title: "Product Manager", employer_name: "Acme", job_city: "Dallas", job_state: "TX", job_is_remote: false, job_min_salary: 120000, job_max_salary: 150000, job_salary_period: "YEAR", job_publisher: "Indeed", job_description: "desc" }]);
    expect(j).toMatchObject({ ats: "jsearch", company: "Acme", location: "Dallas, TX", industry: "via Indeed", externalId: "x1" });
    expect(j.salary).toBe("$120k–$150k / year");
  });
  it("sends the key header, reads data.jobs, and keeps partial results when quota runs out", async () => {
    const calls: RequestInit[] = [];
    let n = 0;
    const fake = async (_u: string, init?: RequestInit) => {
      calls.push(init!);
      n++;
      return n === 1 ? Response.json({ data: { jobs: [{ job_id: "1", job_title: "PM", employer_name: "A" }] } }) : Response.json({ message: "quota" }, { status: 429 });
    };
    const r = await collectJsearch({ apiKey: "k", queries: ["a", "b", "c"], datePosted: "week", usOnly: true }, fake);
    expect(r.jobs).toHaveLength(1);
    expect((calls[0].headers as Record<string, string>)["x-rapidapi-key"]).toBe("k");
  });
  it("explains a bad key", async () => {
    const fake = async () => Response.json({ message: "Invalid API key" }, { status: 401 });
    await expect(collectJsearch({ apiKey: "bad", queries: ["a"], datePosted: "week", usOnly: true }, fake)).rejects.toThrow(/key looks wrong/);
  });
});

describe("Apify", () => {
  it("builds actor input from filters", () => {
    expect(apifyInput(f, 50).limit).toBe(200);
    expect(apifyInput(f, 300)).toMatchObject({ titleSearch: ["Product Manager", "Product Analyst"], locationSearch: ["United States"], limit: 300, removeAgency: true });
    // work mode and experience are filtered on the device, so they never change the (paid) Apify run
    expect(apifyInput(f, 300)).not.toHaveProperty("remote");
    expect(apifyInput(f, 300)).not.toHaveProperty("aiExperienceLevelFilter");
  });
  it("normalizes Fantastic.jobs rows", () => {
    const [j] = normalizeApify([{ id: 9, title: "Product Manager", organization: "Beta", url: "u", cities_derived: ["Austin"], regions_derived: ["Texas"], ai_work_arrangement: "Hybrid", description_text: "d", date_posted: "2026-09-20" }]);
    expect(j).toMatchObject({ ats: "apify", company: "Beta", location: "Austin, Texas", workplaceHint: "hybrid", externalId: "9" });
  });
  it("calls run-sync with a bearer token", async () => {
    let url = "";
    let auth = "";
    const fake = async (u: string, init?: RequestInit) => {
      url = u;
      auth = (init!.headers as Record<string, string>).authorization;
      return Response.json([{ id: 1, title: "PM", organization: "C" }]);
    };
    const jobs = await collectApify({ token: "t", actorId: "fantastic-jobs/career-site-job-listing-feed", input: {} }, fake);
    expect(url).toContain("/acts/fantastic-jobs~career-site-job-listing-feed/run-sync-get-dataset-items");
    expect(auth).toBe("Bearer t");
    expect(jobs).toHaveLength(1);
  });
  it("starts an async run and polls it to completion", async () => {
    const calls: string[] = [];
    let status = "RUNNING";
    const fake = async (u: string) => {
      calls.push(u);
      if (u.endsWith("/runs")) return Response.json({ data: { id: "abcDEF12345" } });
      if (u.includes("/actor-runs/")) return Response.json({ data: { status, defaultDatasetId: "ds1" } });
      return Response.json([{ id: 2, title: "PM", organization: "C" }]);
    };
    const { runId } = await startApifyRun({ token: "t", actorId: "a~b", input: {} }, fake);
    expect(runId).toBe("abcDEF12345");
    expect(await pollApifyRun({ token: "t", runId }, fake)).toEqual({ state: "running", status: "RUNNING" });
    status = "SUCCEEDED";
    const done = await pollApifyRun({ token: "t", runId }, fake);
    expect(done.state === "done" && done.jobs).toHaveLength(1);
    expect(calls.at(-1)).toContain("/datasets/ds1/items");
    status = "TIMED-OUT";
    await expect(pollApifyRun({ token: "t", runId }, fake)).rejects.toThrow(/timed out/);
  });
});
