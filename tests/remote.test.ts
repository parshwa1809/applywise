import { describe, expect, it } from "vitest";
import { analyze, detectWorkMode } from "../src/lib/engine/analyze";
import { jsearchQueries, apifyInput } from "../src/lib/engine/aggregators";
import type { RawJob } from "../src/lib/engine/collect";
import type { SearchFilters } from "../src/lib/types";

const now = Date.parse("2026-09-24T12:00:00Z");
const job = (p: Partial<RawJob>): RawJob => ({
  ats: "greenhouse", company: "Acme", industry: "saas", slug: "acme", externalId: Math.random().toString(),
  title: "Product Manager", location: "", remoteHint: false, workplaceHint: null,
  postedAt: "2026-09-20T00:00:00Z", url: "u", description: "We build things. ".repeat(40), salary: null, ...p,
});
const remoteOnly: SearchFilters = { roles: ["product manager"], locations: ["Dallas"], workModes: ["remote"], usOnly: true, maxYears: 0, excludeTitle: [], maxAgeDays: 30 };

describe("remote-only search", () => {
  it("keeps clearly remote jobs, even outside the listed cities", () => {
    const { jobs } = analyze([job({ location: "Remote - US" }), job({ location: "San Francisco, CA", remoteHint: true })], remoteOnly, "", now);
    expect(jobs.map((j) => j.workMode)).toEqual(["remote", "remote"]);
  });
  it("drops onsite, hybrid, and jobs with no work-mode signal at all", () => {
    const { jobs } = analyze(
      [job({ location: "Dallas, TX" }), job({ location: "Dallas, TX (Hybrid)" }), job({ location: "" })],
      remoteOnly, "", now,
    );
    expect(jobs).toHaveLength(0);
  });
  it("spots remote roles that only say so in the description", () => {
    expect(detectWorkMode(job({ location: "New York, NY", description: "This is a fully remote position open to US candidates. " + "x ".repeat(300) }))).toBe("remote");
    expect(detectWorkMode(job({ location: "United States", description: "We are a remote-first company. " }))).toBe("remote");
    expect(detectWorkMode(job({ location: "New York, NY", description: "Hybrid: 3 days in office. Remote tools like Zoom." }))).toBe("hybrid");
    expect(detectWorkMode(job({ location: "Austin, TX", description: "Collaborate with remote teams across time zones." }))).toBe("onsite");
  });
  it("remote-only never lets unknown work modes through, even with US-only off", () => {
    const { jobs } = analyze([job({ location: "" }), job({ location: "Remote" })], { ...remoteOnly, usOnly: false }, "", now);
    expect(jobs.map((j) => j.workMode)).toEqual(["remote"]);
  });
  it("drops remote roles restricted to other countries when US-only", () => {
    const { jobs } = analyze([job({ location: "Remote - Canada" }), job({ location: "Remote (EMEA)" })], remoteOnly, "", now);
    expect(jobs).toHaveLength(0);
  });
  it("searches don't depend on work mode (the pool is filtered on the device)", () => {
    expect(jsearchQueries(remoteOnly, 6)).toEqual(["product manager remote", "product manager in Dallas"]);
    expect(apifyInput(remoteOnly, 200)).not.toHaveProperty("remote");
  });
});

describe("work-mode combinations", () => {
  const base: SearchFilters = { roles: ["product manager"], locations: [], workModes: ["remote", "hybrid", "onsite"], usOnly: true, maxYears: 0, excludeTitle: [], maxAgeDays: 30 };
  const mix = [
    job({ externalId: "A", location: "Remote - US" }),
    job({ externalId: "D", location: "Dallas, TX (Hybrid)" }),
    job({ externalId: "E", location: "Chicago, IL", workplaceHint: "hybrid" }),
    job({ externalId: "F", location: "Dallas, TX" }),
    job({ externalId: "G", location: "Seattle, WA" }),
    job({ externalId: "H", location: "" }),
  ];
  const kept = (f: SearchFilters) => analyze(mix, f, "", now).jobs.map((j) => j.workMode).sort();
  it("all three modes keep everything, including unknown", () => {
    expect(kept(base)).toEqual(["hybrid", "hybrid", "onsite", "onsite", "remote", "unknown"]);
    expect(jsearchQueries(base, 6)).toEqual(["product manager remote", "product manager in United States"]);
  });
  it("remote + hybrid drops onsite and unknown; hybrid honors cities", () => {
    expect(kept({ ...base, workModes: ["remote", "hybrid"] })).toEqual(["hybrid", "hybrid", "remote"]);
    expect(kept({ ...base, workModes: ["remote", "hybrid"], locations: ["Dallas"] })).toEqual(["hybrid", "remote"]);
    expect(jsearchQueries({ ...base, workModes: ["remote", "hybrid"] }, 6)).toEqual(["product manager remote", "product manager in United States"]);
  });
  it("onsite only drops remote, hybrid and unknown", () => {
    expect(kept({ ...base, workModes: ["onsite"] })).toEqual(["onsite", "onsite"]);
    expect(kept({ ...base, workModes: ["onsite"], locations: ["Dallas"] })).toEqual(["onsite"]);
    expect(jsearchQueries({ ...base, workModes: ["onsite"] }, 6)).toEqual(["product manager remote", "product manager in United States"]);
  });
});

import { roleMatchesTitle, titleMatches } from "../src/lib/engine/analyze";
import { titleSearchVariants } from "../src/lib/engine/aggregators";
describe("role matching by job family", () => {
  it.each([
    ["software developer", "Software Engineer II", true],
    ["software developer", "Backend Developer", true],
    ["software developer", "Full-Stack Engineer", true],
    ["software developer", "SDE II", true],
    ["software developer", "Sales Engineer", false],
    ["software developer", "Software Sales Representative", false],
    ["product manager", "Sr. PM, Payments", true],
    ["product manager", "Production Manager", false],
    ["ai product manager", "Product Manager, Maintenance", false],
    ["associate product manager", "APM - Consumer", true],
    ["data scientist", "Data Science Manager", false],
  ])("%s ↔ %s → %s", (role, title, want) => {
    expect(roleMatchesTitle(role, title)).toBe(want);
  });
  it("excluded words match whole words only", () => {
    const f = { roles: ["developer"], excludeTitle: ["senior", "intern"] } as unknown as SearchFilters;
    expect(titleMatches("Internal Tools Developer", f)).toBe(true);
    expect(titleMatches("Developer Internship", f)).toBe(false);
    expect(titleMatches("Sr. Developer", f)).toBe(false);
  });
  it("Apify searches both developer and engineer titles", () => {
    expect(titleSearchVariants(["Software Developer", "Product Manager"])).toEqual(["Software Developer", "Software Engineer", "Product Manager"]);
  });
});

import { jobVisible } from "../src/lib/engine/analyze";
describe("collect once, filter on the device", () => {
  const all: SearchFilters = { roles: ["product manager"], locations: [], workModes: ["remote", "hybrid", "onsite"], usOnly: true, maxYears: 0, excludeTitle: [], maxAgeDays: 0 };
  const raw = [
    job({ externalId: "r", location: "Remote - US" }),
    job({ externalId: "h", location: "Dallas, TX (Hybrid)" }),
    job({ externalId: "o", location: "Seattle, WA" }),
    job({ externalId: "old", location: "Remote", postedAt: "2026-01-01T00:00:00Z" }),
    job({ externalId: "x", title: "Sales Director", location: "Remote" }),
  ];
  it("the scan keeps every work mode for your roles, dropping only very old postings", () => {
    const pool = analyze(raw, { ...all, workModes: ["remote"] }, "", now, { pool: true }).jobs;
    expect(pool.map((j) => j.workMode).sort()).toEqual(["hybrid", "onsite", "remote"]);
  });
  it("switching to remote-only just filters the saved pool", () => {
    const pool = analyze(raw, all, "", now, { pool: true }).jobs;
    expect(pool.filter((j) => jobVisible(j, all, now))).toHaveLength(3);
    expect(pool.filter((j) => jobVisible(j, { ...all, workModes: ["remote"] }, now)).map((j) => j.workMode)).toEqual(["remote"]);
    expect(pool.filter((j) => jobVisible(j, { ...all, workModes: ["onsite"], locations: ["Seattle"] }, now)).map((j) => j.workMode)).toEqual(["onsite"]);
  });
});
