import { findSkills } from "../engine/skills";
import { truthViolations } from "../engine/tailor";
import type { Job, TailorResult } from "../types";
import type { ResumeDoc, Section } from "./doc";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function relevance(text: string, jd: Set<string>) {
  return findSkills(text).filter((s) => jd.has(s)).length;
}

/** Stable sort by relevance to the job — most relevant bullet first within each role. */
function rank<T>(items: T[], score: (t: T) => number): T[] {
  return items
    .map((t, i) => ({ t, i, s: score(t) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.t);
}

export interface Applied {
  doc: ResumeDoc;
  rewritten: number;
  kept: number; // AI rewrites we refused because they added unsupported numbers
}

/**
 * Produce the resume for one job from the parsed original:
 * - AI rewrites replace their original bullet (matched by text) unless the fact-check flagged them
 * - bullets inside each role, and skills inside each group, are reordered by relevance to the job
 * - the AI summary is used only if every number in it already appears in the resume
 * Nothing is added that isn't in the original resume or the checked AI output.
 */
export function applyTailoring(original: ResumeDoc, job: Job, result: TailorResult | undefined, resumeText: string): Applied {
  const jd = new Set(findSkills(`${job.title}\n${job.description}`));
  const rewrites = new Map<string, string>();
  let kept = 0;
  for (const b of result?.mode === "ai" ? result.bullets : []) {
    if (!b.original || !b.tailored || b.tailored === b.original) continue;
    // re-check here too, so nothing unverified can reach the PDF even from an older saved result
    if (b.flagged || truthViolations(b.tailored, resumeText, b.original).length) {
      kept++;
      continue;
    }
    rewrites.set(norm(b.original), b.tailored);
  }
  const lookup = (bullet: string) => {
    const n = norm(bullet);
    if (rewrites.has(n)) return rewrites.get(n)!;
    // PDF extraction can differ slightly (wrapping, punctuation) — fall back to a long shared prefix
    for (const [k, v] of rewrites) if (k.length > 40 && (n.startsWith(k.slice(0, 60)) || k.startsWith(n.slice(0, 60)))) return v;
    return null;
  };

  let rewritten = 0;
  const sections: Section[] = original.sections.map((s) => {
    if (s.entries)
      return {
        ...s,
        entries: s.entries.map((e) => ({
          ...e,
          bullets: rank(
            e.bullets.map((b) => {
              const t = lookup(b);
              if (t) rewritten++;
              return t ?? b;
            }),
            (b) => relevance(b, jd),
          ),
        })),
      };
    if (s.kind === "skills" && s.skills)
      return { ...s, skills: s.skills.map((g) => ({ ...g, items: rank(g.items, (it) => relevance(it, jd)) })) };
    if (s.kind === "summary" && result?.mode === "ai" && result.summary && !truthViolations(result.summary, resumeText).length)
      return { ...s, text: result.summary };
    return s;
  });

  if (!sections.some((s) => s.kind === "summary") && result?.mode === "ai" && result.summary && !truthViolations(result.summary, resumeText).length)
    sections.unshift({ kind: "summary", heading: "Professional Summary", text: result.summary });

  return { doc: { ...original, sections }, rewritten, kept };
}
