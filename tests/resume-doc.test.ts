import { describe, expect, it } from "vitest";
import { applyTailoring } from "../src/lib/resume/apply";
import { parseResume } from "../src/lib/resume/doc";
import { moderateContent, renderResumeHtml, shortenContent } from "../src/lib/resume/render";
import type { Job, TailorResult } from "../src/lib/types";

const RESUME = `JORDAN LEE
(555) 010-2030 | jordan.lee@example.com | linkedin.com/in/jordan-lee-example
PROFESSIONAL SUMMARY
Product manager with 4 years across AI, data and product initiatives.
SKILLS
Product & Strategy: Roadmap Planning, PRDs, User Stories, Stakeholder Management
Analytics: SQL, A/B Testing, Tableau, Funnel & Cohort Analysis
EXPERIENCE
ITMiracle | Technical Product Management Intern | Apr 2026 – Aug 2026 | Little Elm, TX
• Built a proof-of-concept data foundation on Databricks unifying seven systems
• Wrote user stories and acceptance criteria across a Medallion architecture
Funasia Network & Perfect Group
Associate Product Manager
Feb 2023 - Oct 2025
McKinney, TX
• Drove personalization for an OTT platform (200K+ MAU), contributing to a 23% retention improvement
• Ran 6+ A/B experiments and wrote SQL for cohort analysis in Tableau
PROJECTS
Council of Agents — github.com/jordan/beacon
• Built a multi-agent LLM analyst with RAG
EDUCATION
MS Business Analytics, UT Dallas, 2022`;

const job = { title: "Product Manager", company: "Acme", description: "We want A/B testing, SQL and experimentation experience. Tableau a plus." } as Job;

describe("parseResume", () => {
  const doc = parseResume(RESUME);
  it("finds name, contact and sections in job-tailor order", () => {
    expect(doc.name).toBe("JORDAN LEE");
    expect(doc.contact.map((c) => c.label)).toEqual(["(555) 010-2030", "jordan.lee@example.com", "linkedin.com/in/jordan-lee-example"]);
    expect(doc.contact[1].href).toBe("mailto:jordan.lee@example.com");
    expect(doc.sections.map((s) => s.kind)).toEqual(["summary", "skills", "experience", "projects", "education"]);
  });
  it("splits one-line and multi-line role headers", () => {
    const exp = doc.sections.find((s) => s.kind === "experience")!.entries!;
    expect(exp).toHaveLength(2);
    expect(exp[0]).toMatchObject({ title: "ITMiracle", subtitle: "Technical Product Management Intern", dates: "Apr 2026 – Aug 2026", location: "Little Elm, TX" });
    expect(exp[1]).toMatchObject({ title: "Funasia Network & Perfect Group", subtitle: "Associate Product Manager", dates: "Feb 2023 – Oct 2025", location: "McKinney, TX" });
    expect(exp[1].bullets).toHaveLength(2);
  });
  it("parses skill groups", () => {
    const sk = doc.sections.find((s) => s.kind === "skills")!.skills!;
    expect(sk[1]).toEqual({ group: "Analytics", items: ["SQL", "A/B Testing", "Tableau", "Funnel & Cohort Analysis"] });
  });
  it("handles a bare bullet list", () => {
    const d = parseResume("Jane Doe — Product Manager\n- Led roadmap for payments\n- Ran A/B tests on onboarding");
    expect(d.name).toBe("Jane Doe");
    expect(d.headline).toBe("Product Manager");
    expect(d.sections).toHaveLength(1);
    expect(d.sections[0].entries![0].bullets).toHaveLength(2);
  });
});

describe("applyTailoring", () => {
  const doc = parseResume(RESUME);
  it("reorders bullets by relevance and never keeps fabricated rewrites", () => {
    const result: TailorResult = {
      mode: "ai", headline: "", summary: "PM with 10 years of experience", coverNote: "", createdAt: "", highlightSkills: [], missingKeywords: [],
      bullets: [
        { original: "Ran 6+ A/B experiments and wrote SQL for cohort analysis in Tableau", tailored: "Ran 6+ A/B experiments, using SQL and Tableau to turn cohort analysis into roadmap calls", keywords: [] },
        { original: "Built a proof-of-concept data foundation on Databricks unifying seven systems", tailored: "Built a Databricks foundation for 40 systems", keywords: [] },
      ],
    };
    const { doc: out, rewritten, kept } = applyTailoring(doc, job, result, RESUME);
    const fun = out.sections.find((s) => s.kind === "experience")!.entries![1];
    expect(fun.bullets[0]).toContain("using SQL and Tableau"); // most relevant + rewritten moves to the top
    expect(rewritten).toBe(1);
    expect(kept).toBe(1); // "40 systems" isn't in the resume, so the original stays
    expect(out.sections[0].text).toBe(doc.sections[0].text); // "10 years" summary rejected (and the phone number 010 can't approve it)
    const analytics = out.sections.find((s) => s.kind === "skills")!.skills![1].items;
    expect(new Set(analytics.slice(0, 2))).toEqual(new Set(["SQL", "A/B Testing"]));
    expect(analytics.at(-1)).toBe("Funnel & Cohort Analysis");
  });
});

describe("render", () => {
  const doc = parseResume(RESUME);
  it("uses job-tailor typography and page rules", () => {
    const html = renderResumeHtml(doc, "balanced-full", 1, "Jordan_Lee");
    expect(html).toContain("@page { size: Letter; margin: 0.35in 0.45in; }");
    expect(html).toContain('"Times New Roman"');
    expect(html).toContain('<a class="lk" href="mailto:jordan.lee@example.com">');
    expect(html).toContain("<title>Jordan_Lee</title>");
  });
  it("trims only by dropping or shortening existing bullets", () => {
    expect(moderateContent(doc, 1).sections.find((s) => s.kind === "experience")!.entries![1].bullets).toHaveLength(1);
    const long = parseResume("A\nEXPERIENCE\nAcme\n• Led the payments roadmap across four product squads in two regions. Also mentored two associate PMs on discovery.");
    expect(shortenContent(long).sections[0].entries![0].bullets[0]).toBe("Led the payments roadmap across four product squads in two regions.");
  });
});

describe("job-tailor-style PDF round trip (bullet glyphs lost in extraction)", () => {
  it("recovers every role, bullet, skill group and project", async () => {
    const { readFileSync } = await import("fs");
    const { parseResumeFile } = await import("../src/lib/engine/resume");
    const text = await parseResumeFile("r.pdf", new Uint8Array(readFileSync(`${__dirname}/fixtures/sample-resume.pdf`)));
    const doc = parseResume(text);
    expect(doc.name).toBe("JORDAN LEE");
    const exp = doc.sections.find((s) => s.kind === "experience")!.entries!;
    expect(exp.map((e) => [e.title, e.subtitle, e.dates, e.location])).toEqual([
      ["Northwind Analytics", "Technical Product Management Intern", "Apr 2026 – Present", "Austin, TX"],
      ["Bluebird Media Group", "Associate Product Manager", "Feb 2023 – Oct 2025", "Denver, CO"],
      ["Skyline Travel Data", "Product Marketing Analyst", "Jun 2022 – Dec 2022", "Chicago, IL"],
      ["Cedar Software Ltd", "Software Developer", "Jun 2019 – Feb 2020", "Pune, India"],
    ]);
    expect(exp.map((e) => e.bullets.length)).toEqual([3, 4, 2, 1]);
    const skills = doc.sections.find((s) => s.kind === "skills")!.skills!;
    expect(skills.map((g) => g.group)).toEqual(["Product & Roadmap Management", "Data & Analytics", "AI & Technical Platforms", "Tools"]);
    expect(skills[1].items).toContain("Python (Pandas, NumPy)");
    const proj = doc.sections.find((s) => s.kind === "projects")!.entries!;
    expect(proj[0].title).toBe("Project Beacon – Agentic AI Research Assistant (@Github)");
    expect(proj[0].bullets).toHaveLength(2);
    expect(doc.sections.find((s) => s.kind === "education")!.lines).toHaveLength(3);
  });
});
