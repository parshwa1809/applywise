"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AiProvider, Company, Job, SearchFilters, SourceSettings, TailorResult } from "./types";

export type Stage = "saved" | "tailored" | "applied" | "interview";
export type Status = Stage | "skipped";
export type View = "home" | "setup" | "discover" | "board" | "settings";

export interface SourceResult {
  label: string;
  found: number;
  error?: string;
  /** a paid source that wasn't called this time (its earlier results are kept) */
  skipped?: string;
}

export type PaidSource = "jsearch" | "apify";
/** when a paid source last ran, and for which search — so Rescan doesn't spend credits on an identical query */
export type PaidRuns = Partial<Record<PaidSource, { at: string; search: string }>>;
export const PAID_COOLDOWN_MS = 24 * 3600_000;

export interface ScanStats {
  at: string;
  companies: number;
  reachable: number;
  postings: number;
  kept: number;
  sources?: SourceResult[];
}

export const DEFAULT_SOURCES: SourceSettings = {
  boards: true,
  jsearch: { enabled: false, apiKey: "", datePosted: "week", maxQueries: 6 },
  apify: { enabled: false, token: "", actorId: "fantastic-jobs~career-site-job-listing-feed", limit: 200 },
};

/** Same role at the same company and place, found via two different sources. */
export const dedupeKey = (j: Pick<Job, "company" | "title" | "location">) =>
  `${j.company}|${j.title}|${j.location}`.toLowerCase().replace(/[^a-z0-9|]+/g, " ").trim();

export const DEFAULT_FILTERS: SearchFilters = {
  roles: [],
  locations: [],
  workModes: ["remote", "hybrid", "onsite"],
  usOnly: true,
  maxYears: 0,
  excludeTitle: ["intern", "director", "vp", "principal"],
  maxAgeDays: 30,
};

export const companyKey = (c: Pick<Company, "ats" | "slug">) => `${c.ats}:${c.slug}`;

interface State {
  view: View;
  theme: "light" | "dark";
  onboarded: boolean;
  name: string;
  resume: string;
  filters: SearchFilters;
  /** each provider keeps its own key and model; `provider` is the one used for tailoring */
  ai: { provider: AiProvider; keys: Record<AiProvider, string>; models: Record<AiProvider, string> };
  sources: SourceSettings;
  industries: string[];
  selected: string[]; // company keys
  custom: Company[];
  jobs: Record<string, Job>;
  status: Record<string, Status>;
  tailor: Record<string, TailorResult>;
  notes: Record<string, string>;
  lastScan: ScanStats | null;
  paidRuns: PaidRuns;
  openJob: string | null;
  drawerTab: "tailor" | "job";
  /** which Settings tab to open on next visit (not persisted) */
  settingsTab: "search" | "companies" | "resume" | "data";

  set: (p: Partial<State>) => void;
  setFilters: (p: Partial<SearchFilters>) => void;
  mergeJobs: (jobs: Job[]) => void;
  setStatus: (id: string, s: Status | null) => void;
  setTailor: (id: string, r: TailorResult) => void;
  resetAll: () => void;
}

const initial = {
  view: "home" as View,
  theme: (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light") as "light" | "dark",
  onboarded: false,
  name: "",
  resume: "",
  filters: DEFAULT_FILTERS,
  ai: { provider: "gemini" as AiProvider, keys: { gemini: "", openai: "", anthropic: "" }, models: { gemini: "", openai: "", anthropic: "" } },
  sources: DEFAULT_SOURCES,
  industries: [] as string[],
  selected: [] as string[],
  custom: [] as Company[],
  jobs: {} as Record<string, Job>,
  status: {} as Record<string, Status>,
  tailor: {} as Record<string, TailorResult>,
  notes: {} as Record<string, string>,
  lastScan: null as ScanStats | null,
  paidRuns: {} as PaidRuns,
  openJob: null as string | null,
  drawerTab: "job" as "tailor" | "job",
  settingsTab: "search" as "search" | "companies" | "resume" | "data",
};

const safeStorage = createJSONStorage(() => {
  try {
    const k = "__aw_probe";
    localStorage.setItem(k, "1");
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    const mem = new Map<string, string>();
    return {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    };
  }
});

export const useApp = create<State>()(
  persist(
    (set) => ({
      ...initial,
      set: (p) => set(p),
      setFilters: (p) => set((s) => ({ filters: { ...s.filters, ...p } })),
      mergeJobs: (jobs) =>
        set((s) => {
          const next = { ...s.jobs };
          const seen = new Map(Object.values(next).map((j) => [dedupeKey(j), j.id]));
          for (const j of jobs) {
            const dup = seen.get(dedupeKey(j));
            // prefer the company-board copy over an aggregator copy of the same role
            if (dup && dup !== j.id) {
              if (j.ats === "jsearch" || j.ats === "apify" || s.status[dup]) continue;
              delete next[dup];
            }
            next[j.id] = j;
            seen.set(dedupeKey(j), j.id);
          }
          return { jobs: next };
        }),
      setStatus: (id, st) =>
        set((s) => {
          const next = { ...s.status };
          if (st) next[id] = st;
          else delete next[id];
          return { status: next };
        }),
      setTailor: (id, r) => set((s) => ({ tailor: { ...s.tailor, [id]: r } })),
      resetAll: () => set({ ...initial, theme: "light" }),
    }),
    {
      name: "applywise",
      version: 1,
      storage: safeStorage,
      // older saves won't have newer nested settings; fill them from defaults
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>;
        // older saves had one shared { apiKey, model } — move it under the provider it was entered for
        const oldAi = p.ai as (Partial<State["ai"]> & { apiKey?: string; model?: string }) | undefined;
        const provider = oldAi?.provider ?? current.ai.provider;
        const ai: State["ai"] = {
          provider,
          keys: { ...current.ai.keys, ...oldAi?.keys, ...(oldAi?.apiKey && !oldAi.keys ? { [provider]: oldAi.apiKey } : {}) },
          models: { ...current.ai.models, ...oldAi?.models, ...(oldAi?.model && !oldAi.models ? { [provider]: oldAi.model } : {}) },
        };
        return {
          ...current,
          ...p,
          ai,
          filters: { ...current.filters, ...p.filters },
          sources: {
            ...DEFAULT_SOURCES,
            ...p.sources,
            jsearch: { ...DEFAULT_SOURCES.jsearch, ...p.sources?.jsearch },
            apify: { ...DEFAULT_SOURCES.apify, ...p.sources?.apify, limit: Math.max(200, p.sources?.apify?.limit ?? 200) },
          },
        };
      },
      partialize: (s) => {
        const { openJob, drawerTab, settingsTab, ...rest } = s;
        void settingsTab;
        void openJob;
        void drawerTab;
        return rest;
      },
    },
  ),
);
