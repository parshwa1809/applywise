import type { Company } from "../types";
import type { RawJob } from "./collect";

/**
 * Demo mode (APPLYWISE_DEMO=1): deterministic, realistic-looking postings so you can try the UI,
 * record a demo, or develop offline without hitting real job boards.
 */
const TITLES = [
  "Product Manager", "Senior Product Manager", "Associate Product Manager", "Product Manager, Growth",
  "Technical Product Manager", "Product Manager, AI Platform", "Product Analyst", "Software Engineer",
  "Senior Frontend Engineer", "Data Analyst", "Product Designer", "Product Marketing Manager",
  "Product Manager, Talent Pool", "Director of Product",
];
const PLACES = ["New York, NY", "San Francisco, CA", "Remote (US)", "Austin, TX", "Dallas, TX", "Seattle, WA", "Chicago, IL", "Remote - Canada", "London, UK", "Boston, MA"];
const SKILLS = [
  "SQL, A/B testing and product analytics (Amplitude or Mixpanel)",
  "writing PRDs, user stories and acceptance criteria",
  "roadmap prioritization with engineering and design",
  "experimentation, funnel and cohort analysis",
  "LLM products, RAG and agentic AI features",
  "personalization and recommendation systems",
  "stakeholder management across go-to-market teams",
  "Python, dbt and Snowflake",
  "React, TypeScript and Next.js",
  "Figma prototyping and user research",
];

function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export function demoJobs(c: Company): RawJob[] {
  const r = rng(c.slug);
  const n = 2 + Math.floor(r() * 5);
  return Array.from({ length: n }, (_, i) => {
    const title = TITLES[Math.floor(r() * TITLES.length)];
    const location = PLACES[Math.floor(r() * PLACES.length)];
    const ageDays = Math.floor(r() * r() * 90);
    const years = 1 + Math.floor(r() * 7);
    const picks = [...SKILLS].sort(() => r() - 0.5).slice(0, 4);
    const salary = r() > 0.35 ? `$${120 + Math.floor(r() * 60)},000 - $${180 + Math.floor(r() * 70)},000` : null;
    const thin = r() < 0.12;
    const description = thin
      ? `Join ${c.name}! We're always looking for great people.`
      : `About ${c.name}\n${c.name} builds ${c.industry.replace(/-/g, " ")} software used by thousands of teams.\n\nWhat you'll do\n• Own the roadmap for a core product area and ship with engineering and design\n• Use ${picks[0]} to decide what to build next\n• Partner on ${picks[1]}\n\nWhat you'll bring\n• ${years}+ years of experience in a similar role\n• Hands-on with ${picks[2]}\n• Comfortable with ${picks[3]}\n\nWhy ${c.name}\n• Small, senior teams with real ownership and a bias to ship\n• Health, dental and vision coverage, 401(k) match and a learning budget\n• Flexible time off and a yearly team offsite\n\n${salary ? `Pay range: ${salary} + equity` : ""}`;
    return {
      ats: c.ats,
      company: c.name,
      industry: c.industry,
      slug: c.slug,
      externalId: `demo-${i}`,
      title,
      location,
      remoteHint: /remote/i.test(location),
      workplaceHint: /remote/i.test(location) ? "remote" : r() > 0.5 ? "hybrid" : null,
      postedAt: new Date(Date.now() - ageDays * 86_400_000).toISOString(),
      url: `https://example.com/${c.slug}/jobs/${i}`,
      description,
      salary,
    };
  });
}

/**
 * Demo-mode stand-in for an AI tailoring call (APPLYWISE_DEMO=1 only). It rewrites bullets toward the
 * job's language and deliberately inflates one, so the real truth guards can be seen rejecting it.
 */
export function demoTailorRaw(job: { company: string; title: string }, bullets: string[], summary: string): Record<string, unknown> {
  const focus = /growth|consumer/i.test(job.title) ? "growth" : /ai|data|platform/i.test(job.title) ? "AI and data" : "product";
  return {
    headline: `${job.title} · experimentation, personalization, ${focus}`,
    summary: summary || `Product manager focused on ${focus} outcomes.`,
    bullets: bullets.slice(0, 8).map((b, i) => {
      if (/proof-of-concept/i.test(b))
        // the "AI" overreaches here: drops the POC qualifier and invents a metric — the guard should reject it
        return { original: b, tailored: b.replace(/proof-of-concept /i, "").replace(/\.?$/, ", cutting reporting time by 40%"), keywords: ["data platform"] };
      if (i % 2 === 0) return { original: b, tailored: b.replace(/\.?$/, `, informing the ${focus} roadmap`), keywords: [focus] };
      return { original: b, tailored: b, keywords: [] };
    }),
    highlightSkills: ["A/B Testing", "SQL", "Roadmap Planning"],
    missingKeywords: ["lifecycle marketing"],
    coverNote: `I'm excited to apply for the ${job.title} role at ${job.company}. ${summary.split(". ")[0] ?? ""}.`,
  };
}
