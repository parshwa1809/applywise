"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AiProvider, Company, Job, SearchFilters, SourceSettings, TailorResult } from "./types";

import { tidy, type ArchiveEntry, type ArchiveReason, type Stage } from "./board";

export type { Stage } from "./board";
/** "archived" = left the board (closed, stale, no reply, duplicate, or removed); restorable */
export type Status = Stage | "skipped" | "archived";
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
  /** what this scan collected for — used to tell the user when a settings change needs a rescan */
  scope?: { roles: string[]; companies: string[]; locations: string[]; paid: boolean };
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
  /** when each job entered its current stage (drives stale / no-reply rules and column order) */
  statusAt: Record<string, string>;
  archived: Record<string, ArchiveEntry>;
  /** board jobs whose posting disappeared from the company board on a later scan */
  closed: Record<string, string>;
  /** the job whose posting the user just opened; asks "did you apply?" when they come back */
  pendingApply: { id: string; at: string } | null;
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
  archive: (id: string, reason: ArchiveReason) => void;
  restore: (id: string) => void;
  /** apply the automatic board rules (see lib/board.ts) */
  tidyBoard: (now?: number) => void;
  markClosed: (r: { closed: string[]; open: string[] }) => void;
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
  statusAt: {} as Record<string, string>,
  archived: {} as Record<string, ArchiveEntry>,
  closed: {} as Record<string, string>,
  pendingApply: null as { id: string; at: string } | null,
  tailor: {} as Record<string, TailorResult>,
  notes: {} as Record<string, string>,
  lastScan: null as ScanStats | null,
  paidRuns: {} as PaidRuns,
  openJob: null as string | null,
  drawerTab: "job" as "tailor" | "job",
  settingsTab: "search" as "search" | "companies" | "resume" | "data",
};

/**
 * If the saved pool ever outgrows the browser's storage quota (~5 MB), drop the oldest jobs the user
 * never acted on and save again, instead of silently failing to save anything.
 */
function quotaSafe(ls: Storage) {
  return {
    getItem: (k: string) => ls.getItem(k),
    removeItem: (k: string) => ls.removeItem(k),
    setItem: (k: string, v: string) => {
      try {
        ls.setItem(k, v);
      } catch {
        try {
          const data = JSON.parse(v);
          const st = data.state ?? {};
          const acted = new Set(Object.keys(st.status ?? {}));
          const open = Object.values((st.jobs ?? {}) as Record<string, Job>)
            .filter((j) => !acted.has(j.id))
            .sort((a, b) => Date.parse(a.postedAt ?? "0") - Date.parse(b.postedAt ?? "0"));
          for (const j of open.slice(0, Math.ceil(open.length / 3))) delete st.jobs[j.id];
          ls.setItem(k, JSON.stringify(data));
        } catch {
          /* still too big: keep working in memory for this session */
        }
      }
    },
  };
}

const safeStorage = createJSONStorage(() => {
  try {
    const k = "__aw_probe";
    localStorage.setItem(k, "1");
    localStorage.removeItem(k);
    return quotaSafe(localStorage);
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
          const at = { ...s.statusAt };
          const archived = { ...s.archived };
          if (st) {
            if (next[id] !== st) at[id] = new Date().toISOString();
            next[id] = st;
          } else {
            delete next[id];
            delete at[id];
          }
          if (st !== "archived") delete archived[id];
          const pendingApply = s.pendingApply?.id === id && (st === "applied" || st === "interview") ? null : s.pendingApply;
          return { status: next, statusAt: at, archived, pendingApply };
        }),
      archive: (id, reason) =>
        set((s) => {
          const from = s.status[id];
          if (!from || from === "skipped" || from === "archived") return {};
          return {
            status: { ...s.status, [id]: "archived" },
            archived: { ...s.archived, [id]: { from, reason, at: new Date().toISOString() } },
          };
        }),
      restore: (id) =>
        set((s) => {
          const a = s.archived[id];
          if (!a) return {};
          const archived = { ...s.archived };
          delete archived[id];
          const closed = { ...s.closed };
          if (a.reason === "closed") delete closed[id];
          // a fresh clock, so it doesn't get archived again straight away
          return { status: { ...s.status, [id]: a.from }, statusAt: { ...s.statusAt, [id]: new Date().toISOString() }, archived, closed };
        }),
      tidyBoard: (now = Date.now()) =>
        set((s) => {
          const out = tidy(s, now);
          const ids = Object.keys(out);
          if (!ids.length) return {};
          const status = { ...s.status };
          for (const id of ids) status[id] = "archived";
          return { status, archived: { ...s.archived, ...out } };
        }),
      markClosed: ({ closed, open }) =>
        set((s) => {
          if (!closed.length && !open.some((id) => s.closed[id])) return {};
          const next = { ...s.closed };
          const at = new Date().toISOString();
          for (const id of closed) next[id] ??= at;
          for (const id of open) delete next[id];
          return { closed: next };
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
        // older saves have no stage dates: start everyone's clock now, so nothing is archived on upgrade
        const statusAt = { ...(p.statusAt ?? {}) };
        const now = new Date().toISOString();
        for (const [id, st] of Object.entries(p.status ?? {})) if (st !== "skipped" && st !== "archived") statusAt[id] ??= now;
        return {
          ...current,
          ...p,
          statusAt,
          archived: p.archived ?? {},
          closed: p.closed ?? {},
          pendingApply: p.pendingApply ?? null,
          ai,
          filters: {
            ...current.filters,
            ...p.filters,
            // older versions offered a "manager, " chip; strip stray punctuation from saved tags
            excludeTitle: (p.filters?.excludeTitle ?? current.filters.excludeTitle)
              .filter((x) => !/^\s*manager\s*,\s*$/i.test(x)) // the old "manager, " suggestion hid every PM job
              .map((x) => x.replace(/^[\s,;.|/]+|[\s,;.|/]+$/g, "").trim())
              .filter(Boolean),
          },
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
