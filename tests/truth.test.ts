import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { parseResumeFile } from "../src/lib/engine/resume";
import { canonicalizeNumber, droppedNumbers, inventedSkills, resumeBullets, sanitize, truthViolations, unsupportedNumbers } from "../src/lib/engine/tailor";
import type { Job } from "../src/lib/types";

const resume = `Jane Doe
EXPERIENCE
Acme | PM | Jan 2020 – Present | Dallas, TX
• Drove personalization for 200K+ MAU, contributing to a 23% retention improvement using SQL and Tableau
• Ran 6+ A/B experiments on onboarding`;
const job = { title: "PM", company: "X", description: "Kubernetes, 10 years" } as Job;

describe("truth guards (job-tailor rules)", () => {
  it("canonicalizes like job-tailor", () => {
    expect(canonicalizeNumber("200K+")).toBe("200000");
    expect(canonicalizeNumber("200,000")).toBe("200000");
    expect(canonicalizeNumber("23%")).toBe("23%");
  });
  it("accepts reworded numbers but rejects new or job-post numbers", () => {
    expect(unsupportedNumbers("reached 200,000 monthly users", resume)).toEqual([]);
    expect(unsupportedNumbers("10 years leading teams", resume)).toEqual(["10"]);
    expect(unsupportedNumbers("23 point lift", resume)).toEqual(["23"]); // 23 ≠ 23%
    // digits from a phone number never approve a made-up metric
    expect(unsupportedNumbers("grew signups 555%", "(555) 010-2030\n• grew signups")).toEqual(["555%"]);
    expect(unsupportedNumbers("led 10 people", "(555) 010-2030\n• led people")).toEqual(["10"]);
  });
  it("rejects softened metrics", () => {
    expect(droppedNumbers("contributing to a 23% retention improvement", "improved retention")).toEqual(["23%"]);
  });
  it("rejects tools the resume never mentions", () => {
    expect(inventedSkills("Shipped on Kubernetes with SQL", resume)).toEqual(["kubernetes"]);
  });
  it("sanitize marks bad rewrites and bad summaries", () => {
    const r = sanitize(
      {
        summary: "PM with 10 years in Kubernetes",
        bullets: [
          { original: "Ran 6+ A/B experiments on onboarding", tailored: "Ran 6+ A/B experiments to lift onboarding activation", keywords: [] },
          { original: "Drove personalization for 200K+ MAU, contributing to a 23% retention improvement using SQL and Tableau", tailored: "Drove personalization that improved retention", keywords: [] },
        ],
      },
      job,
      resume,
    );
    expect(r.bullets[0].flagged).toBeUndefined();
    expect(r.bullets[1].flagged).toMatch(/drops your metrics 200000, 23%/);
    expect(r.summaryFlagged).toMatch(/10/);
    expect(r.summaryFlagged).toMatch(/kubernetes/);
    expect(truthViolations("Ran 6+ A/B experiments", resume)).toEqual([]);
  });
});

describe("resumeBullets", () => {
  it("uses real role bullets from a PDF that lost its bullet dots, never summary sentences", async () => {
    const t = await parseResumeFile("r.pdf", new Uint8Array(readFileSync(`${__dirname}/fixtures/sample-resume.pdf`)));
    const b = resumeBullets(t);
    expect(b).toHaveLength(12);
    expect(b.some((x) => x.startsWith("Proven track record"))).toBe(false);
    expect(b[0]).toMatch(/^Produced client-facing technical documentation/);
  });
});

import { callWithRetry, droppedQualifiers, factOnlyNote, ProviderError } from "../src/lib/engine/tailor";
describe("callWithRetry", () => {
  it("retries the same model while it's busy — no weaker fallback", async () => {
    let n = 0;
    const text = await callWithRetry(async () => {
      if (++n < 3) throw new ProviderError("This model is currently experiencing high demand.", 503);
      return "{}";
    }, [0, 0, 0]);
    expect(text).toBe("{}");
    expect(n).toBe(3);
  });
  it("gives up after the last retry, and never retries a bad key or a daily quota", async () => {
    await expect(callWithRetry(async () => { throw new ProviderError("high demand", 503); }, [0, 0])).rejects.toThrow(/high demand/);
    let n = 0;
    await expect(callWithRetry(async () => { n++; throw new ProviderError("API key not valid", 400); }, [0])).rejects.toThrow(/key/);
    await expect(callWithRetry(async () => { n++; throw new ProviderError("Quota exceeded: requests per day", 429); }, [0])).rejects.toThrow(/day/);
    expect(n).toBe(2);
  });
});

describe("scope qualifiers", () => {
  it("rejects a rewrite that drops proof-of-concept or who-built-it credit", () => {
    const orig = "Built a proof-of-concept data foundation on Databricks, partnering with the technical team who built the models.";
    expect(droppedQualifiers(orig, "Developed data foundations and AI/BI dashboards.")).toEqual(["proof-of-concept", "partnering with"]);
    expect(truthViolations("Developed data foundations.", orig, orig)[0]).toMatch(/proof-of-concept.*bigger than it was/);
    expect(droppedQualifiers(orig, "Built a proof-of-concept on Databricks, partnering with the model team.")).toEqual([]);
  });
});

describe("cover note", () => {
  const resume = "Jordan Lee\nSUMMARY\nProduct manager with 3+ years in growth. Loves experiments.\nEXPERIENCE\nAcme | PM | 2022 – 2024\n- Ran 6 A/B tests on onboarding and lifted activation 12%.\n";
  const job = { id: "x", company: "WeatherCo", title: "Growth PM", description: "growth, a/b testing, onboarding. 360 million monthly users." } as never;
  it("replaces an AI note that imports the company's numbers with a fact-only one", () => {
    const r = sanitize({ bullets: [], coverNote: "I can help your 360 million monthly active users grow." }, job, resume);
    expect(r.coverFlagged).toMatch(/360/);
    expect(r.coverNote).not.toMatch(/360/);
    expect(r.coverNote).toMatch(/Growth PM role\. Product manager with 3\+ years in growth\./);
  });
  it("fact-only note uses only resume text", () => {
    const note = factOnlyNote(job, resume);
    expect(truthViolations(note, resume)).toEqual([]);
  });
});
