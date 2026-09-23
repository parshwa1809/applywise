import type { AiProvider, Job, TailorResult, TailoredBullet } from "../types";
import { findSkills, HARD_SKILLS } from "./skills";
import { allBullets, parseResume } from "../resume/doc";

export const DEFAULT_MODELS: Record<AiProvider, string> = {
  gemini: "gemini-3.5-flash",
  openai: "gpt-5-mini",
  anthropic: "claude-sonnet-4-5",
};

// ── resume parsing ─────────────────────────────────────────────────────────────────────────
export function resumeBullets(resume: string): string[] {
  // Prefer the structured parse: it recovers bullets even when a PDF lost its bullet glyphs,
  // and never mistakes summary sentences for bullets.
  const parsed = allBullets(parseResume(resume)).filter((b) => b.length > 25);
  if (parsed.length >= 2) return parsed;
  const lines = resume.split(/\r?\n/).map((l) => l.trim());
  const marked = lines
    .filter((l) => /^[-•*▪◦‣●–]\s*/.test(l))
    .map((l) => l.replace(/^[-•*▪◦‣●–]\s*/, "").trim())
    .filter((l) => l.length > 25);
  if (marked.length >= 3) return marked;
  return lines.filter((l) => l.length > 60);
}

// ── truth guards (ported from job-tailor src/ai/tailor.ts) ────────────────────────────────────

/**
 * Canonical numeric token so legitimate rewording doesn't false-flag: strips commas and "+",
 * expands k/m/b, keeps "%" significant. "200K+" === "200,000+" === "200000"; "23%" ≠ "23".
 */
export function canonicalizeNumber(raw: string): string | null {
  let s = raw.toLowerCase().replace(/[,\s]/g, "").replace(/\+/g, "");
  const isPct = s.includes("%");
  s = s.replace(/%/g, "");
  const m = s.match(/^(\d+(?:\.\d+)?)([kmb]?)$/);
  let value: number;
  if (m) {
    value = parseFloat(m[1]);
    if (m[2] === "k") value *= 1e3;
    else if (m[2] === "m") value *= 1e6;
    else if (m[2] === "b") value *= 1e9;
  } else {
    const digits = s.replace(/[^\d.]/g, "");
    if (!digits) return null;
    value = parseFloat(digits);
    if (!Number.isFinite(value)) return null;
  }
  return isPct ? `${value}%` : String(value);
}

// a k/m/b suffix counts only when attached and not the start of a word ("200K" yes, "200,000 monthly" no)
const NUM = /\d[\d,.]*(?:\s*%|[kmb](?![a-z]))?\+?/gi;

export function extractNumbers(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(NUM)) {
    const c = canonicalizeNumber(m[0].replace(/[.,]$/, ""));
    if (c) out.add(c);
  }
  return out;
}

/** Numbers in `text` that don't exist anywhere in the resume (incl. numbers copied from the job post). */
export function unsupportedNumbers(text: string, resume: string): string[] {
  // phone numbers, emails and links aren't achievements — their digits must not "approve" a metric
  const facts = resume
    .replace(/\+?\d?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g, " ")
    .replace(/\S+@\S+/g, " ")
    .replace(/(?:https?:\/\/)?(?:www\.)?[\w-]+\.(?:com|io|dev|app|me|org)\S*/gi, " ");
  const pool = extractNumbers(facts);
  const bad: string[] = [];
  for (const m of text.matchAll(NUM)) {
    const raw = m[0].trim().replace(/[.,]$/, "");
    const c = canonicalizeNumber(raw);
    if (c && !pool.has(c) && !bad.includes(raw)) bad.push(raw);
  }
  return bad;
}

/** Metrics the original bullet had that the rewrite dropped ("never soften 23% into 'improved'"). */
export function droppedNumbers(original: string, tailored: string): string[] {
  const kept = extractNumbers(tailored);
  return [...extractNumbers(original)].filter((n) => !kept.has(n));
}

/** Named tools / technologies in `text` that the resume never mentions (generic business words don't count). */
export function inventedSkills(text: string, resume: string): string[] {
  const have = new Set(findSkills(resume));
  const lower = resume.toLowerCase();
  return findSkills(text).filter((s) => HARD_SKILLS.has(s) && !have.has(s) && !lower.includes(s));
}

/** All truth violations for one piece of AI text; empty = clean. */
/**
 * Words that set the honest scope of your role. A rewrite that drops them (turning a proof-of-concept
 * into a system, or "partnering with the team who built it" into "built it") overstates what you did.
 */
// [how it appears in your bullet, what counts as still keeping it in the rewrite, label]
const QUALIFIERS: [RegExp, RegExp, string][] = [
  [/proof[- ]of[- ]concept|\bpoc\b/i, /proof[- ]of[- ]concept|\bpoc\b/i, "proof-of-concept"],
  [/\bprototype/i, /\bprototype/i, "prototype"],
  [/\bpilot/i, /\bpilot/i, "pilot"],
  [/\bcontribut/i, /\bcontribut/i, "contributed"],
  // only "supported" as your action (lead verb or "and supported"), not "supporting async ingestion"
  [/(^|,|;|\band\b)\s*support(ed|ing)\b/i, /\bsupport/i, "supported"],
  [/\bassist/i, /\bassist/i, "assisted"],
  [/\bhelped\b/i, /\bhelp/i, "helped"],
  [/\bpartner(ing|ed)? with\b|\bin partnership with\b/i, /\bpartner|\bwith the .{0,40}team\b/i, "partnering with"],
  [/\b(under|alongside) (the )?(senior|lead|guidance)/i, /\b(under|alongside) (the )?(senior|lead|guidance)/i, "working under senior staff"],
  [/\breviewed by\b/i, /\breview/i, "reviewed by"],
  [/\bintern(ship)?\b/i, /\bintern/i, "intern"],
];

export function droppedQualifiers(original: string, rewrite: string): string[] {
  return QUALIFIERS.filter(([inOrig, kept]) => inOrig.test(original) && !kept.test(rewrite)).map(([, , label]) => label);
}

export function truthViolations(text: string, resume: string, original?: string): string[] {
  const v: string[] = [];
  const nums = unsupportedNumbers(text, resume);
  if (nums.length) v.push(`adds ${nums.join(", ")}, which isn't in your resume`);
  const skills = inventedSkills(text, resume);
  if (skills.length) v.push(`claims ${skills.join(", ")}, which your resume doesn't mention`);
  if (original) {
    const lost = droppedQualifiers(original, text);
    if (lost.length) v.push(`drops "${lost.join('", "')}", which makes your role sound bigger than it was`);
    const dropped = droppedNumbers(original, text);
    if (dropped.length) v.push(`drops your metric${dropped.length > 1 ? "s" : ""} ${dropped.join(", ")}`);
  }
  return v;
}

function overlap(bullet: string, keywords: string[]) {
  const have = new Set(findSkills(bullet));
  return keywords.filter((k) => have.has(k));
}

/**
 * A short note built only from your own resume text (summary + the bullet that best fits the job),
 * used when the AI's note fails the fact checks — so there's never a fabricated note to send.
 */
export function factOnlyNote(job: Job, resume: string): string {
  const doc = parseResume(resume);
  const summary = doc.sections.find((s) => s.kind === "summary")?.text ?? "";
  const first = summary.match(/^.+?[.!?](\s|$)/)?.[0].trim() ?? summary.trim();
  const jd = findSkills(`${job.title}\n${job.description}`);
  const best = resumeBullets(resume)
    .map((b) => ({ b, hits: overlap(b, jd).length }))
    .sort((a, z) => z.hits - a.hits)[0]?.b;
  const lines = [`Hello ${job.company} team,`, "", `I'm applying for the ${job.title} role.${first ? ` ${first}` : ""}`];
  if (best) lines.push("", `Most relevant to this role: ${best.replace(/^./, (c) => c.toLowerCase()).replace(/\.?$/, ".")}`);
  lines.push("", "I'd welcome the chance to talk about how this experience fits your team.", "", "Thank you,", doc.name && doc.name === doc.name.toUpperCase() ? doc.name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : doc.name);
  return lines.join("\n").trim();
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
    coverNote: factOnlyNote(job, resume),
    createdAt: new Date().toISOString(),
  };
}

// ── AI mode ────────────────────────────────────────────────────────────────────────────────
export function buildPrompt(job: Job, resume: string): string {
  return `You are an expert resume editor. Tailor the candidate's resume to the job below.

ABSOLUTE RULES (output that breaks any of them is rejected automatically):
- NEVER invent or alter any company, job title, employment date, school, degree, number, metric, tool, skill or project. Use ONLY content present in the resume.
- Reframe wording into the job's language for ATS, but only where the resume genuinely supports it.
- Each tailored bullet must correspond to exactly one bullet from the BULLETS list, copied character-for-character into "original".
METRICS (preserve the resume's real numbers; never import the job's):
- ALWAYS carry every quantified metric from the original bullet into its rewrite EXACTLY (percentages, counts, scale figures). You may rephrase the surrounding words, but the number must appear.
- NEVER soften a quantified result into vague language (never turn "23% retention improvement" into "improved retention").
- NEVER introduce a number that isn't already in the resume — including numbers from the job description (salary, years of experience, company scale).
SCOPE (don't make the role sound bigger than it was):
- Keep qualifiers like "proof-of-concept", "prototype", "contributed", "supported", "partnering with", "under senior architects", "reviewed by". Never upgrade "supported"/"contributed" to "led"/"owned".
- Never add outcomes the bullet doesn't state (e.g. "to drive daily active usage", "accelerating velocity").
COVER NOTE (it gets sent as written):
- Use only facts from the resume, in the resume's own scope ("drove", "contributed", "supported" — not "led" unless the resume says led).
- No numbers except the resume's own metrics. Do not quote company facts or figures from the job posting (users, revenue, rankings).

Return ONLY JSON with this exact shape:
{
  "headline": "a resume headline for this application, max 12 words",
  "summary": "a 2-3 sentence professional summary grounded in the resume",
  "bullets": [{"original": "...", "tailored": "...", "keywords": ["job keywords this bullet now covers"]}],
  "highlightSkills": ["skills from the resume that this job cares about"],
  "missingKeywords": ["important job keywords the resume does not support — do not add them to bullets"],
  "coverNote": "a warm, specific 90-120 word note to the hiring manager, using only facts from the resume"
}
Include EVERY bullet from the resume (up to 30), most relevant to this job first. Bullets that don't need changes can keep their original wording.

=== JOB ===
Company: ${job.company}
Title: ${job.title}
Location: ${job.location}
${job.description.slice(0, 7000)}

=== RESUME ===
${resume.slice(0, 9000)}

=== BULLETS (copy into "original" exactly) ===
${resumeBullets(resume).slice(0, 30).map((b) => `- ${b}`).join("\n")}`;
}

function parseJson(text: string): Record<string, unknown> {
  const cleaned = text.replace(/^```(?:json)?/m, "").replace(/```\s*$/m, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  return JSON.parse(cleaned.slice(start, end + 1));
}

/** Parse a provider response; non-JSON bodies (proxies, HTML error pages) become a readable error. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readJson(res: Response, name: string): Promise<Record<string, any>> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${name} returned HTTP ${res.status}: ${text.slice(0, 120)}`);
  }
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Busy/overloaded errors that usually clear in seconds. A daily quota 429 is not one of them. */
export function isTransient(e: unknown) {
  if (!(e instanceof ProviderError)) return false;
  if (/per ?day|daily/i.test(e.message)) return false;
  return [429, 500, 502, 503, 504, 529].includes(e.status) || /overloaded|high demand|unavailable|try again later/i.test(e.message);
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Retry the SAME model while it's busy (5s, 15s, 30s) — like job-tailor, which never swaps in a
 * weaker model for resume writing; it only waits longer because nobody is watching it run.
 */
export async function callWithRetry(call: () => Promise<string>, delays = [5000, 15000, 30000]): Promise<string> {
  for (let i = 0; ; i++) {
    try {
      return await call();
    } catch (e) {
      if (!isTransient(e) || i >= delays.length) throw e;
      await wait(delays[i]);
    }
  }
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
    const data = await readJson(res, "Gemini");
    if (!res.ok) throw new ProviderError(data?.error?.message ?? `Gemini error ${res.status}`, res.status);
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
    const data = await readJson(res, "OpenAI");
    if (!res.ok) throw new ProviderError(data?.error?.message ?? `OpenAI error ${res.status}`, res.status);
    return data?.choices?.[0]?.message?.content ?? "";
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 4000, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await readJson(res, "Anthropic");
  if (!res.ok) throw new ProviderError(data?.error?.message ?? `Anthropic error ${res.status}`, res.status);
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
      const v = tailored === original ? [] : truthViolations(tailored, resume, original);
      return {
        original,
        tailored,
        keywords: strArr(b.keywords),
        flagged: v.length ? `Rejected — it ${v.join("; ")}. Your original bullet is used instead.` : undefined,
      };
    })
    .filter((b) => b.tailored.trim());
  // the note is sent as-is, so a failing AI note is replaced, not just flagged
  const aiNote = String(raw.coverNote ?? "").trim();
  const coverIssue = aiNote ? truthViolations(aiNote, resume).join("; ") : "";
  return {
    mode: "ai",
    headline: String(raw.headline ?? job.title),
    summary: String(raw.summary ?? ""),
    summaryFlagged: raw.summary ? truthViolations(String(raw.summary), resume).join("; ") || undefined : undefined,
    coverFlagged: coverIssue || undefined,
    bullets,
    highlightSkills: strArr(raw.highlightSkills),
    missingKeywords: strArr(raw.missingKeywords),
    coverNote: coverIssue ? factOnlyNote(job, resume) : aiNote,
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
  const prompt = buildPrompt(job, resume);
  const chosen = model || DEFAULT_MODELS[provider];
  const text = await callWithRetry(() => callProvider(provider, apiKey, chosen, prompt));
  return sanitize(parseJson(text), job, resume);
}
