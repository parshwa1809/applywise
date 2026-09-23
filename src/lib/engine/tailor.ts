import type { AiProvider, Job, TailorResult, TailoredBullet } from "../types";
import { findSkills } from "./skills";

export const DEFAULT_MODELS: Record<AiProvider, string> = {
  gemini: "gemini-3.5-flash",
  openai: "gpt-5-mini",
  anthropic: "claude-sonnet-4-5",
};

// ── resume parsing ─────────────────────────────────────────────────────────────────────────
export function resumeBullets(resume: string): string[] {
  const lines = resume.split(/\r?\n/).map((l) => l.trim());
  const marked = lines
    .filter((l) => /^[-•*▪◦‣●–]\s*/.test(l))
    .map((l) => l.replace(/^[-•*▪◦‣●–]\s*/, "").trim())
    .filter((l) => l.length > 25);
  if (marked.length >= 3) return marked;
  return lines.filter((l) => l.length > 60);
}

/** Every number / metric in `text` must already exist somewhere in the resume. */
export function unsupportedNumbers(text: string, resume: string): string[] {
  const RE = /\$?\d[\d,.]*\s?(?:%|k|m|x|\+)?/gi;
  const core = (n: string) => n.replace(/,/g, "").replace(/[^0-9.]/g, "").replace(/\.$/, "");
  const pool = new Set((resume.match(RE) ?? []).map(core));
  return (text.match(RE) ?? [])
    .map((n) => n.trim().replace(/[.,]$/, ""))
    .filter((n) => {
      const c = core(n);
      return c.length > 0 && !pool.has(c);
    });
}

function overlap(bullet: string, keywords: string[]) {
  const have = new Set(findSkills(bullet));
  return keywords.filter((k) => have.has(k));
}

// ── offline mode: no AI, fully deterministic ──────────────────────────────────────────────
export function tailorOffline(job: Job, resume: string): TailorResult {
  const jd = findSkills(`${job.title}\n${job.description}`);
  const bullets = resumeBullets(resume)
    .map((b) => ({ b, hits: overlap(b, jd) }))
    .sort((a, z) => z.hits.length - a.hits.length)
    .slice(0, 8)
    .map<TailoredBullet>(({ b, hits }) => ({ original: b, tailored: b, keywords: hits }));
  const have = new Set(findSkills(resume));
  return {
    mode: "offline",
    headline: job.title,
    summary: `Your strongest evidence for ${job.company} is ranked first below. Add an AI key in Settings to have Applywise rewrite these bullets in the job's language — it never invents facts.`,
    bullets,
    highlightSkills: jd.filter((s) => have.has(s)).slice(0, 12),
    missingKeywords: jd.filter((s) => !have.has(s)).slice(0, 12),
    coverNote: "",
    createdAt: new Date().toISOString(),
  };
}

// ── AI mode ────────────────────────────────────────────────────────────────────────────────
export function buildPrompt(job: Job, resume: string): string {
  return `You are an expert resume editor. Tailor the candidate's resume to the job below.

HARD RULES — breaking any of them makes the output useless:
1. Never invent employers, titles, tools, degrees, dates, numbers or achievements. Only rephrase, reorder and emphasize what is in the resume.
2. Keep every metric exactly as written in the resume. Do not add new numbers.
3. Use the job's vocabulary only where the resume genuinely supports it.
4. Each tailored bullet must correspond to one original bullet from the resume, copied verbatim into "original".
5. Keep bullets concise (under 35 words), starting with a strong verb.

Return ONLY JSON with this exact shape:
{
  "headline": "a resume headline for this application, max 12 words",
  "summary": "a 2-3 sentence professional summary grounded in the resume",
  "bullets": [{"original": "...", "tailored": "...", "keywords": ["job keywords this bullet now covers"]}],
  "highlightSkills": ["skills from the resume that this job cares about"],
  "missingKeywords": ["important job keywords the resume does not support — do not add them to bullets"],
  "coverNote": "a warm, specific 90-120 word note to the hiring manager, grounded only in the resume"
}
Pick the 6-8 most relevant bullets.

=== JOB ===
Company: ${job.company}
Title: ${job.title}
Location: ${job.location}
${job.description.slice(0, 7000)}

=== RESUME ===
${resume.slice(0, 9000)}`;
}

function parseJson(text: string): Record<string, unknown> {
  const cleaned = text.replace(/^```(?:json)?/m, "").replace(/```\s*$/m, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function callProvider(provider: AiProvider, apiKey: string, model: string, prompt: string): Promise<string> {
  if (provider === "gemini") {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, responseMimeType: "application/json" },
        }),
      },
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message ?? `Gemini error ${res.status}`);
    return data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  }
  if (provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message ?? `OpenAI error ${res.status}`);
    return data?.choices?.[0]?.message?.content ?? "";
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 4000, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? `Anthropic error ${res.status}`);
  return (data?.content ?? []).map((c: { text?: string }) => c.text ?? "").join("");
}

const strArr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** Validates model output against the resume so fabricated metrics get flagged, not shipped. */
export function sanitize(raw: Record<string, unknown>, job: Job, resume: string): TailorResult {
  const bullets: TailoredBullet[] = (Array.isArray(raw.bullets) ? raw.bullets : [])
    .filter((b): b is Record<string, unknown> => !!b && typeof b === "object")
    .map((b) => {
      const original = String(b.original ?? "");
      const tailored = String(b.tailored ?? original);
      const bad = unsupportedNumbers(tailored, resume);
      return {
        original,
        tailored,
        keywords: strArr(b.keywords),
        flagged: bad.length ? `Contains ${bad.join(", ")} which isn't in your resume — double-check before using.` : undefined,
      };
    })
    .filter((b) => b.tailored.trim());
  return {
    mode: "ai",
    headline: String(raw.headline ?? job.title),
    summary: String(raw.summary ?? ""),
    bullets,
    highlightSkills: strArr(raw.highlightSkills),
    missingKeywords: strArr(raw.missingKeywords),
    coverNote: String(raw.coverNote ?? ""),
    createdAt: new Date().toISOString(),
  };
}

export async function tailorWithAi(
  job: Job,
  resume: string,
  provider: AiProvider,
  apiKey: string,
  model?: string,
): Promise<TailorResult> {
  const text = await callProvider(provider, apiKey, model || DEFAULT_MODELS[provider], buildPrompt(job, resume));
  return sanitize(parseJson(text), job, resume);
}
