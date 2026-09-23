"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AiProvider, Company, Job, SearchFilters, TailorResult } from "./types";

export type Stage = "saved" | "tailored" | "applied" | "interview";
export type Status = Stage | "skipped";
export type View = "home" | "setup" | "discover" | "board" | "settings";

export interface ScanStats {
  at: string;
  companies: number;
  reachable: number;
  postings: number;
  kept: number;
}

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
  ai: { provider: AiProvider; apiKey: string; model: string };
  industries: string[];
  selected: string[]; // company keys
  custom: Company[];
  jobs: Record<string, Job>;
  status: Record<string, Status>;
  tailor: Record<string, TailorResult>;
  notes: Record<string, string>;
  lastScan: ScanStats | null;
  openJob: string | null;
  drawerTab: "tailor" | "job";

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
  ai: { provider: "gemini" as AiProvider, apiKey: "", model: "" },
  industries: [] as string[],
  selected: [] as string[],
  custom: [] as Company[],
  jobs: {} as Record<string, Job>,
  status: {} as Record<string, Status>,
  tailor: {} as Record<string, TailorResult>,
  notes: {} as Record<string, string>,
  lastScan: null as ScanStats | null,
  openJob: null as string | null,
  drawerTab: "job" as "tailor" | "job",
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
          for (const j of jobs) next[j.id] = j;
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
      partialize: (s) => {
        const { openJob, drawerTab, ...rest } = s;
        void openJob;
        void drawerTab;
        return rest;
      },
    },
  ),
);
