"use client";

import { clsx } from "clsx";
import type { Job } from "@/lib/types";
import { hue, timeAgo } from "@/lib/useScan";
import { MatchRing, Pill } from "./ui";

export function CompanyAvatar({ name, size = 44 }: { name: string; size?: number }) {
  const h = hue(name);
  return (
    <div
      className="grid shrink-0 place-items-center rounded-2xl font-display font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.42, background: `linear-gradient(135deg, hsl(${h} 70% 58%), hsl(${(h + 40) % 360} 75% 48%))` }}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

export function GhostMeter({ ghost }: { ghost: Job["ghost"] }) {
  const tone = ghost.level === "low" ? "good" : ghost.level === "medium" ? "warn" : "bad";
  const label = ghost.level === "low" ? "Looks real" : ghost.level === "medium" ? "Some ghost signals" : "Likely ghost";
  return (
    <div className="group relative">
      <Pill tone={tone}>
        <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden>
          <path d="M8 1.5c-3 0-5 2.2-5 5.2V14l1.7-1.2L6.3 14 8 12.8 9.7 14l1.6-1.2L13 14V6.7c0-3-2-5.2-5-5.2z" fill="currentColor" />
        </svg>
        {label}
      </Pill>
      {ghost.signals.length > 0 && (
        <div className="pointer-events-none absolute left-0 top-full z-30 mt-2 w-64 translate-y-1 rounded-xl border border-line bg-card p-3 text-xs text-ink-2 opacity-0 shadow-lift transition group-hover:translate-y-0 group-hover:opacity-100">
          <div className="mb-1 font-semibold text-ink">Why we flagged it</div>
          {ghost.signals.map((s) => (
            <div key={s.label}>• {s.label}</div>
          ))}
        </div>
      )}
    </div>
  );
}

const modeLabel = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site", unknown: "Mode n/a" } as const;

export function JobCard({ job, compact = false, className }: { job: Job; compact?: boolean; className?: string }) {
  return (
    <div className={clsx("flex h-full flex-col rounded-[28px] border border-line bg-card p-6 shadow-lift", className)}>
      <div className="flex items-start gap-4">
        <CompanyAvatar name={job.company} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-ink-2">{job.company}</div>
          <h3 className="font-display text-2xl font-bold leading-tight text-ink">{job.title}</h3>
        </div>
        <MatchRing value={job.match} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Pill>{job.location.length > 38 ? `${job.location.slice(0, 36)}…` : job.location}</Pill>
        <Pill tone="brand">{modeLabel[job.workMode]}</Pill>
        {job.salary && <Pill tone="good">{job.salary}</Pill>}
        <Pill>{timeAgo(job.postedAt)}</Pill>
        {(job.ats === "jsearch" || job.ats === "apify") && <Pill>{viaLabel(job)}</Pill>}
        {job.minYears !== null && <Pill>{job.minYears}+ yrs</Pill>}
        <GhostMeter ghost={job.ghost} />
      </div>

      {!compact && (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-bg-2 p-3">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-3">You have</div>
              <div className="flex flex-wrap gap-1">
                {job.matched.slice(0, 8).map((s) => (
                  <span key={s} className="rounded-md bg-good/15 px-1.5 py-0.5 text-xs font-semibold text-good">
                    {s}
                  </span>
                ))}
                {!job.matched.length && <span className="text-xs text-ink-3">Add your resume to see matches</span>}
              </div>
            </div>
            <div className="rounded-2xl bg-bg-2 p-3">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-3">They want</div>
              <div className="flex flex-wrap gap-1">
                {job.missing.slice(0, 8).map((s) => (
                  <span key={s} className="rounded-md bg-coral/15 px-1.5 py-0.5 text-xs font-semibold text-coral">
                    {s}
                  </span>
                ))}
                {!job.missing.length && <span className="text-xs text-ink-3">Nothing obvious missing</span>}
              </div>
            </div>
          </div>
          <div className="relative mt-4 min-h-0 flex-1 overflow-hidden">
            <p className="whitespace-pre-line text-sm leading-relaxed text-ink-2">{job.description.slice(0, 900)}</p>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card to-transparent" />
          </div>
        </>
      )}
    </div>
  );
}

/** "via Apify · Greenhouse" — the aggregator we used, plus the site it found the posting on. */
export function viaLabel(job: Pick<Job, "ats" | "industry">) {
  const agg = job.ats === "jsearch" ? "JSearch" : "Apify";
  const site = job.industry.replace(/^via\s*/i, "").trim();
  if (!site || site.toLowerCase() === agg.toLowerCase()) return `via ${agg}`;
  return `via ${agg} · ${site.replace(/\b\w/g, (c) => c.toUpperCase())}`;
}
