"use client";

import { useCallback, useRef, useState } from "react";
import companiesData from "@/data/companies.json";
import { companyKey, useApp } from "./store";
import type { Company, Job } from "./types";

export const DIRECTORY = companiesData as Company[];

export const INDUSTRIES = (() => {
  const counts = new Map<string, number>();
  for (const c of DIRECTORY) counts.set(c.industry, (counts.get(c.industry) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id, count]) => ({ id, count, label: prettyIndustry(id) }));
})();

export function prettyIndustry(id: string) {
  const map: Record<string, string> = { "ai-ml": "AI / ML", saas: "SaaS", "hr-tech": "HR tech", "data-infra": "Data infra", devtools: "Dev tools", martech: "Martech", edtech: "Edtech", proptech: "Proptech", "insurance-tech": "Insurtech", "healthcare-tech": "Health tech", "mid-size-general": "General", "logistics-supply-chain": "Logistics" };
  return map[id] ?? id.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function resolveCompanies(selected: string[], custom: Company[]): Company[] {
  const byKey = new Map([...DIRECTORY, ...custom].map((c) => [companyKey(c), c]));
  return selected.map((k) => byKey.get(k)).filter((c): c is Company => !!c);
}

export interface ScanProgress {
  running: boolean;
  done: number;
  total: number;
  found: number;
  current: string[];
  error?: string;
}

const BATCH = 12;
const PARALLEL = 3;

export function useScan() {
  const [progress, setProgress] = useState<ScanProgress>({ running: false, done: 0, total: 0, found: 0, current: [] });
  const cancel = useRef(false);

  const scan = useCallback(async () => {
    const s = useApp.getState();
    const companies = resolveCompanies(s.selected, s.custom);
    if (!companies.length) {
      setProgress((p) => ({ ...p, error: "Pick at least one company or industry first." }));
      return;
    }
    cancel.current = false;
    const batches: Company[][] = [];
    for (let i = 0; i < companies.length; i += BATCH) batches.push(companies.slice(i, i + BATCH));
    let done = 0;
    let found = 0;
    let reachable = 0;
    let postings = 0;
    const fresh: Job[] = [];
    setProgress({ running: true, done: 0, total: companies.length, found: 0, current: batches[0]?.slice(0, 3).map((c) => c.name) ?? [] });

    let next = 0;
    const worker = async () => {
      while (next < batches.length && !cancel.current) {
        const batch = batches[next++];
        setProgress((p) => ({ ...p, current: batch.slice(0, 4).map((c) => c.name) }));
        try {
          const st = useApp.getState();
          const res = await fetch("/api/jobs", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ companies: batch, filters: st.filters, resume: st.resume }),
          });
          const data = (await res.json()) as { jobs: Job[]; stats: { total: number }; companies: { count: number }[] };
          if (res.ok) {
            fresh.push(...data.jobs);
            found += data.jobs.length;
            postings += data.stats.total;
            reachable += data.companies.filter((c) => c.count > 0).length;
            useApp.getState().mergeJobs(data.jobs);
          }
        } catch {
          /* one failed batch shouldn't stop the scan */
        }
        done += batch.length;
        setProgress((p) => ({ ...p, done, found }));
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));

    // drop previously-found jobs that no longer match and were never acted on
    const st = useApp.getState();
    const keep = new Set(fresh.map((j) => j.id));
    const jobs: Record<string, Job> = {};
    for (const [id, j] of Object.entries(st.jobs)) if (keep.has(id) || st.status[id]) jobs[id] = j;
    useApp.setState({
      jobs,
      lastScan: { at: new Date().toISOString(), companies: companies.length, reachable, postings, kept: fresh.length },
    });
    setProgress((p) => ({ ...p, running: false, current: [], error: reachable === 0 ? "Couldn't reach any job boards. Check your internet connection and try again." : undefined }));
  }, []);

  const stop = useCallback(() => {
    cancel.current = true;
  }, []);

  return { progress, scan, stop };
}

export function timeAgo(iso: string | null) {
  if (!iso) return "date unknown";
  const d = (Date.now() - Date.parse(iso)) / 86_400_000;
  if (d < 1) return "today";
  if (d < 2) return "yesterday";
  if (d < 30) return `${Math.floor(d)}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

export function hue(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}
