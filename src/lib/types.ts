export type Ats = "greenhouse" | "lever" | "ashby";
/** Where a posting came from: a company ATS board, or an aggregator the user plugged a key into. */
export type Source = Ats | "jsearch" | "apify";

export interface Company {
  name: string;
  industry: string;
  ats: Ats;
  slug: string;
}

export type WorkMode = "remote" | "hybrid" | "onsite";

export interface SearchFilters {
  /** Title keywords, case-insensitive substring match. e.g. "product manager" */
  roles: string[];
  /** City / region tokens, e.g. "Dallas", "New York". Empty = anywhere. */
  locations: string[];
  workModes: WorkMode[];
  usOnly: boolean;
  /** Drop postings that ask for more than this many years. 0 = no limit. */
  maxYears: number;
  /** Drop postings whose title contains any of these (e.g. "senior", "director"). */
  excludeTitle: string[];
  /** Drop postings older than this many days. 0 = no limit. */
  maxAgeDays: number;
}

export interface GhostSignal {
  label: string;
  weight: number;
}

export interface Job {
  id: string; // `${ats}:${slug}:${externalId}`
  company: string;
  industry: string;
  ats: Source;
  title: string;
  location: string;
  workMode: WorkMode | "unknown";
  postedAt: string | null;
  url: string;
  description: string; // plain text
  salary: string | null;
  minYears: number | null;
  match: number; // 0-100
  matched: string[];
  missing: string[];
  ghost: { score: number; level: "low" | "medium" | "high"; signals: GhostSignal[] };
}

export interface TailoredBullet {
  original: string;
  tailored: string;
  keywords: string[];
  flagged?: string; // set when the guardrail finds something not supported by the resume
}

export interface TailorResult {
  mode: "ai" | "offline";
  headline: string;
  summary: string;
  /** set when the AI summary failed the truth guard (the original summary is used instead) */
  summaryFlagged?: string;
  coverFlagged?: string;
  bullets: TailoredBullet[];
  highlightSkills: string[];
  missingKeywords: string[];
  coverNote: string;
  createdAt: string;
}

export interface SourceSettings {
  boards: boolean;
  jsearch: { enabled: boolean; apiKey: string; datePosted: "today" | "3days" | "week" | "month"; maxQueries: number };
  apify: { enabled: boolean; token: string; actorId: string; limit: number };
}

export type AiProvider = "gemini" | "openai" | "anthropic";
