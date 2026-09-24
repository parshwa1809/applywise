import { describe, expect, it } from "vitest";
import { normalizeAshby, normalizeGreenhouse, normalizeLever } from "../src/lib/engine/collect";
import { analyze, isLikelyUS, minYears } from "../src/lib/engine/analyze";
import { resumeBullets, sanitize, tailorOffline, unsupportedNumbers } from "../src/lib/engine/tailor";
import type { Company, SearchFilters } from "../src/lib/types";

const co = (ats: Company["ats"]): Company => ({ name: "Acme", industry: "saas", ats, slug: "acme" });
const now = Date.parse("2026-09-20T00:00:00Z");
const desc =
  "About the role. You will own the product roadmap and run A/B testing with SQL and Amplitude. " +
  "Requirements: 3+ years of experience in product management. Work with engineering on APIs and personalization. ".repeat(6) +
  " Pay: $140,000 - $170,000.";

const filters: SearchFilters = {
  roles: ["product manager"],
  locations: ["Dallas", "New York"],
  workModes: ["remote", "hybrid", "onsite"],
  usOnly: true,
  maxYears: 5,
  excludeTitle: ["director"],
  maxAgeDays: 30,
};

const resume = `Jane Doe
- Drove personalization roadmap for 200K+ MAU streaming app, lifting retention 23% through A/B testing
- Wrote SQL cohort analyses in Tableau to prioritize the product backlog
- Launched loyalty program that increased high-value actions by 35%
- Partnered with engineering on REST APIs for recommendation features`;

describe("collectors", () => {
  it("normalizes greenhouse escaped html", () => {
    const [j] = normalizeGreenhouse(co("greenhouse"), {
      jobs: [{ id: 1, title: "Product Manager", location: { name: "Dallas, TX" }, content: "&lt;p&gt;Hello &amp;amp; welcome&lt;/p&gt;&lt;ul&gt;&lt;li&gt;SQL&lt;/li&gt;&lt;/ul&gt;", absolute_url: "u", updated_at: "2026-09-10T00:00:00Z" }],
    });
    expect(j.description).toContain("Hello & welcome");
    expect(j.description).toContain("• SQL");
    expect(j.postedAt).toBe("2026-09-10T00:00:00Z");
  });
  it("normalizes lever with salary range + workplace", () => {
    const [j] = normalizeLever(co("lever"), [
      { id: "x", text: "Product Manager", categories: { location: "New York, NY" }, descriptionPlain: "d", createdAt: now, hostedUrl: "h", workplaceType: "hybrid", salaryRange: { min: 150000, max: 180000, currency: "USD", interval: "per-year-salary" } },
    ]);
    expect(j.workplaceHint).toBe("hybrid");
    expect(j.salary).toContain("150k");
  });
  it("normalizes ashby, drops unlisted", () => {
    const js = normalizeAshby(co("ashby"), { jobs: [{ id: "1", title: "PM", location: "Remote", isRemote: true }, { id: "2", title: "Hidden", isListed: false }] });
    expect(js).toHaveLength(1);
    expect(js[0].remoteHint).toBe(true);
  });
});

describe("analysis", () => {
  it("parses experience years", () => {
    expect(minYears("Requires 3+ years of experience")).toBe(3);
    expect(minYears("5-7 years experience in SaaS")).toBe(5);
    expect(minYears("Founded 12 years ago")).toBeNull();
  });
  it("US gate", () => {
    expect(isLikelyUS("Remote - Canada")).toBe(false);
    expect(isLikelyUS("London, UK")).toBe(false);
    expect(isLikelyUS("New York, NY / London")).toBe(true);
    expect(isLikelyUS("Remote (US)")).toBe(true);
    expect(isLikelyUS("")).toBe(true);
  });
  it("filters and scores", () => {
    const raw = normalizeGreenhouse(co("greenhouse"), {
      jobs: [
        { id: 1, title: "Senior Product Manager", location: { name: "Dallas, TX" }, content: desc, absolute_url: "a", updated_at: "2026-09-15T00:00:00Z" },
        { id: 2, title: "Director, Product Manager", location: { name: "Dallas, TX" }, content: desc, absolute_url: "b", updated_at: "2026-09-15T00:00:00Z" },
        { id: 3, title: "Product Manager", location: { name: "Toronto, Canada" }, content: desc, absolute_url: "c", updated_at: "2026-09-15T00:00:00Z" },
        { id: 4, title: "Product Manager", location: { name: "Remote" }, content: desc, absolute_url: "d", updated_at: "2026-06-01T00:00:00Z" },
        { id: 5, title: "Software Engineer", location: { name: "Dallas" }, content: desc, absolute_url: "e", updated_at: "2026-09-15T00:00:00Z" },
        { id: 6, title: "Product Manager, Talent Pool", location: { name: "New York, NY" }, content: "short", absolute_url: "f", updated_at: "2026-09-15T00:00:00Z" },
      ],
    });
    const { jobs, stats } = analyze(raw, filters, resume, now);
    expect(jobs.map((j) => j.title)).toEqual(["Senior Product Manager", "Product Manager, Talent Pool"]);
    expect(stats.total).toBe(6);
    expect(jobs[0].match).toBeGreaterThan(50);
    expect(jobs[0].matched).toContain("sql");
    expect(jobs[0].ghost.level).toBe("low");
    expect(jobs[1].ghost.level).toBe("high");
  });
});

describe("tailor", () => {
  it("extracts bullets", () => expect(resumeBullets(resume)).toHaveLength(4));
  it("flags invented numbers", () => {
    expect(unsupportedNumbers("Lifted retention 23% for 200K+ users", resume)).toEqual([]);
    expect(unsupportedNumbers("Grew revenue 40% across 3M users", resume)).toEqual(["40%", "3M"]);
  });
  it("offline ranks relevant bullets first", () => {
    const { jobs } = analyze(normalizeLever(co("lever"), [{ id: "1", text: "Product Manager", categories: { location: "Dallas" }, descriptionPlain: desc, createdAt: now }]), filters, resume, now);
    const r = tailorOffline(jobs[0], resume);
    expect(r.bullets[0].keywords.length).toBeGreaterThan(0);
    expect(r.mode).toBe("offline");
  });
  it("sanitize flags fabricated metrics", () => {
    const { jobs } = analyze(normalizeLever(co("lever"), [{ id: "1", text: "Product Manager", categories: { location: "Dallas" }, descriptionPlain: desc, createdAt: now }]), filters, resume, now);
    const r = sanitize({ bullets: [{ original: "x", tailored: "Boosted retention 99%", keywords: [] }] }, jobs[0], resume);
    expect(r.bullets[0].flagged).toMatch(/99%/);
  });
});

import { explainFunnel } from "../src/lib/engine/funnel";
describe("explainFunnel", () => {
  it("says in one line which filter emptied the boards", () => {
    const m = explainFunnel({ total: 9000, title: 147, location: 68, age: 4, experience: 0, overYears: [{ company: "A", title: "PM", years: 6 }, { company: "B", title: "PM", years: 5 }] }, { maxYears: 4 });
    expect(m).toBe("No company-board jobs match your filters — the 4 fresh ones need 5+ years (your limit is 4). Raise it in Settings → Search to see them.");
    expect(explainFunnel({ total: 900, title: 0, location: 0, age: 0, experience: 0 })).toMatch(/excluded title word/);
  });
});
