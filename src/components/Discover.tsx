"use client";

import { animate, AnimatePresence, motion, useMotionValue, useTransform, type PanInfo } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { companyKey, useApp, type Status } from "@/lib/store";
import type { Job } from "@/lib/types";
import { resolveCompanies, useScan, timeAgo } from "@/lib/useScan";
import { funnelFor, jobVisible, scanGaps } from "@/lib/engine/analyze";
import { explainFunnel } from "@/lib/engine/funnel";
import { JobCard } from "./JobCard";
import { Button, Magnetic, Segmented, Ticker, spring } from "./ui";

type Sort = "match" | "new" | "real";
type Dir = "left" | "right" | "up";

export default function Discover() {
  const jobs = useApp((s) => s.jobs);
  const status = useApp((s) => s.status);
  const setStatus = useApp((s) => s.setStatus);
  const lastScan = useApp((s) => s.lastScan);
  const filters = useApp((s) => s.filters);
  const selected = useApp((s) => s.selected);
  const custom = useApp((s) => s.custom);
  const srcSettings = useApp((s) => s.sources);
  // settings changes the saved pool can't answer (new roles, companies, cities for paid search) → ask for a rescan
  const gaps = useMemo(
    () =>
      scanGaps(lastScan?.scope, {
        roles: filters.roles,
        companies: srcSettings.boards ? resolveCompanies(selected, custom).map(companyKey) : [],
        locations: filters.locations,
        paidOn: (srcSettings.jsearch.enabled && !!srcSettings.jsearch.apiKey) || (srcSettings.apify.enabled && !!srcSettings.apify.token),
      }),
    [lastScan, filters.roles, filters.locations, selected, custom, srcSettings],
  );
  const set = useApp((s) => s.set);
  const { progress, scan, stop } = useScan();
  const [sort, setSort] = useState<Sort>("match");
  const [history, setHistory] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  // the saved pool is filtered here, live: changing work mode, cities, freshness or experience
  // re-filters instantly with no rescan (roles decide what gets collected, so those need one)
  const [now] = useState(() => Date.now());
  const { visible, hiddenCount, perSource, boardNote } = useMemo(() => {
    const open = Object.values(jobs).filter((j) => !status[j.id]);
    const vis = open.filter((j) => jobVisible(j, filters, now));
    const count = (ats: string[]) => [open.filter((j) => ats.includes(j.ats)).length, vis.filter((j) => ats.includes(j.ats)).length];
    const boards = open.filter((j) => j.ats === "greenhouse" || j.ats === "lever" || j.ats === "ashby");
    const boardsShown = vis.some((j) => j.ats === "greenhouse" || j.ats === "lever" || j.ats === "ashby");
    return {
      visible: vis,
      hiddenCount: open.length - vis.length,
      perSource: { "Company boards": count(["greenhouse", "lever", "ashby"]), JSearch: count(["jsearch"]), Apify: count(["apify"]) } as Record<string, number[]>,
      boardNote: boards.length && !boardsShown ? explainFunnel(funnelFor(boards, filters, now), { maxYears: filters.maxYears || undefined, maxAgeDays: filters.maxAgeDays || undefined }) : null,
    };
  }, [jobs, status, filters, now]);

  const queue = useMemo(() => {
    const list = [...visible];
    const by: Record<Sort, (a: Job, b: Job) => number> = {
      match: (a, b) => b.match - 0.8 * b.ghost.score - (a.match - 0.8 * a.ghost.score), // fit, discounted by ghost risk
      new: (a, b) => Date.parse(b.postedAt ?? "0") - Date.parse(a.postedAt ?? "0"),
      real: (a, b) => a.ghost.score - b.ghost.score || b.match - a.match,
    };
    return list.sort(by[sort]);
  }, [visible, sort]);

  const decide = useCallback(
    (job: Job, dir: Dir) => {
      const s: Status = dir === "left" ? "skipped" : "saved";
      setStatus(job.id, s);
      setHistory((h) => [...h.slice(-30), job.id]);
      if (dir === "up") set({ openJob: job.id, drawerTab: "tailor" });
      setToast(dir === "left" ? `Skipped ${job.company}` : dir === "up" ? `Tailoring for ${job.company}…` : `Saved ${job.company} to your board`);
    },
    [setStatus, set],
  );

  const undo = useCallback(() => {
    const id = history[history.length - 1];
    if (!id) return;
    setStatus(id, null);
    setHistory((h) => h.slice(0, -1));
    setToast("Undone");
  }, [history, setStatus]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  const top = queue[0];
  const autoScanned = useRef(false);
  useEffect(() => {
    if (!autoScanned.current && !lastScan && !progress.running) {
      autoScanned.current = true;
      scan();
    }
  }, [lastScan, progress.running, scan]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-4xl font-bold sm:text-5xl">Discover</h1>
          <p className="mt-1 text-ink-2">
            {lastScan ? (
              <>
                <Ticker value={queue.length} className="font-semibold text-ink" /> roles to review · scanned {timeAgo(lastScan.at)}
              </>
            ) : (
              "Scanning company boards and your connected sources — no reposted LinkedIn noise."
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented<Sort>
            id="sort"
            value={sort}
            onChange={setSort}
            options={[
              { value: "match", label: "Best fit", hint: "Match score with your resume, minus a penalty for ghost-job signals" },
              { value: "real", label: "Least ghosty", hint: "Most trustworthy listings first (fewest ghost signals), ties broken by match" },
              { value: "new", label: "Newest", hint: "Most recently posted first" },
            ]}
          />
          {progress.running ? (
            <Button variant="soft" onClick={stop}>
              Stop
            </Button>
          ) : (
            <Magnetic>
              <Button onClick={scan}>
                <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden>
                  <path d="M16.5 10A6.5 6.5 0 1 1 14.6 5.4M16.5 3v3.5H13" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
                </svg>
                Rescan
              </Button>
            </Magnetic>
          )}
        </div>
      </div>

      {lastScan?.sources && lastScan.sources.length > 0 && !progress.running && (
        <div className="mt-3 flex flex-wrap gap-2">
          {lastScan.sources.map((r) => (
            <span
              key={r.label}
              title={r.error ?? (r.skipped ? "JSearch and Apify use your paid quota, so they run at most once a day. Change your search to run them again sooner." : undefined)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${r.error ? "bg-bad/10 text-bad" : "bg-card text-ink-2 ring-1 ring-line"}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${r.error ? "bg-bad" : r.skipped ? "bg-ink-3" : "bg-good"}`} />
              {r.label}
              {r.label === "Company boards" && !r.error ? ` · ${lastScan.reachable}/${lastScan.companies} boards` : ""} · {r.error ? "failed" : r.skipped ? `${r.skipped}` : perSource[r.label] ? `${perSource[r.label][1]} shown of ${perSource[r.label][0]}` : `${r.found} found`}
            </span>
          ))}
        </div>
      )}

      {gaps && !progress.running && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-brand/40 bg-brand-soft p-4 text-sm text-ink"
        >
          <div className="min-w-0 flex-1">
            <div className="font-semibold">
              Rescan to collect jobs for what you added:{" "}
              {[
                gaps.roles.length ? `${gaps.roles.length === 1 ? "role" : "roles"} ${gaps.roles.map((r) => `“${r}”`).join(", ")}` : "",
                gaps.companies ? `${gaps.companies} new ${gaps.companies === 1 ? "company" : "companies"}` : "",
                gaps.cities.length ? `${gaps.cities.length === 1 ? "city" : "cities"} ${gaps.cities.join(", ")} (for JSearch/Apify)` : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
            <div className="mt-0.5 text-ink-2">
              Everything else, like removed or narrowed roles, work mode, cities, freshness, experience and skip words, already applies to the jobs you have.
              {(srcSettings.jsearch.enabled || srcSettings.apify.enabled) && gaps.roles.length + gaps.cities.length > 0 ? " JSearch and Apify will run again, since the search changed." : ""}
            </div>
          </div>
          <Button onClick={scan}>Rescan now</Button>
        </motion.div>
      )}

      <ScanBar progress={progress} />
      {progress.error && <div className="mt-4 rounded-2xl border border-bad/30 bg-bad/10 p-4 text-sm text-bad">{progress.error}</div>}
      {!progress.error && !!progress.warnings?.length && (
        <div className="mt-4 rounded-2xl border border-warn/30 bg-warn/10 p-4 text-sm text-warn">
          {progress.warnings.map((w) => (
            <div key={w}>⚠ {w}</div>
          ))}
        </div>
      )}
      {!progress.running && (boardNote || hiddenCount > 0) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-line bg-card p-4 text-sm text-ink-2">
          <div className="min-w-0 flex-1 space-y-1">
            {boardNote && <div>ⓘ {boardNote}</div>}
            {hiddenCount > 0 && (
              <div>
                ⓘ {hiddenCount} more job{hiddenCount === 1 ? "" : "s"} already found {hiddenCount === 1 ? "is" : "are"} hidden by your filters (roles, work mode, cities, US-only, freshness, experience). Changing them updates this deck instantly, with no rescan.
              </div>
            )}
          </div>
          {hiddenCount > 0 && (
            <button type="button" onClick={() => set({ view: "settings", settingsTab: "search" })} className="shrink-0 rounded-full border border-line px-3.5 py-1.5 text-xs font-semibold text-ink hover:bg-bg-2">
              Adjust filters
            </button>
          )}
        </div>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_280px]">
        <div className="relative mx-auto h-[620px] w-full max-w-[560px]">
          <AnimatePresence>
            {queue
              .slice(0, 3)
              .reverse()
              .map((job, i, arr) => {
                const depth = arr.length - 1 - i;
                return depth === 0 ? (
                  <SwipeCard key={job.id} job={job} onDecide={decide} />
                ) : (
                  <motion.div
                    key={job.id}
                    className="absolute inset-0"
                    initial={{ scale: 0.85, y: 40, opacity: 0 }}
                    animate={{ scale: 1 - depth * 0.05, y: depth * 22, opacity: 1, filter: `brightness(${1 - depth * 0.04})` }}
                    transition={spring}
                    style={{ zIndex: 10 - depth }}
                  >
                    <JobCard job={job} />
                  </motion.div>
                );
              })}
          </AnimatePresence>
          {!top && <EmptyDeck running={progress.running} hasScan={!!lastScan} hidden={hiddenCount} onScan={scan} />}
        </div>

        <aside className="space-y-4">
          <div className="rounded-3xl border border-line bg-card p-5">
            <div className="text-xs font-bold uppercase tracking-wider text-ink-3">Controls</div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <ActionBtn label="Skip" hint="←" tone="coral" disabled={!top} onClick={() => top && flingTop("left")}>
                <path d="M5 5l10 10M15 5L5 15" />
              </ActionBtn>
              <ActionBtn label="Tailor" hint="↑" tone="brand" disabled={!top} onClick={() => top && flingTop("up")}>
                <path d="M10 3l1.8 4.4L16 9l-4.2 1.6L10 15l-1.8-4.4L4 9l4.2-1.6z" />
              </ActionBtn>
              <ActionBtn label="Save" hint="→" tone="lime" disabled={!top} onClick={() => top && flingTop("right")}>
                <path d="M4 10.5l4 4L16 6" />
              </ActionBtn>
            </div>
            <button onClick={undo} disabled={!history.length} className="mt-3 w-full rounded-xl py-2 text-sm font-semibold text-ink-2 hover:bg-bg-2 disabled:opacity-40">
              ↶ Undo <span className="text-ink-3">(Z)</span>
            </button>
            <p className="mt-3 text-xs leading-relaxed text-ink-3">Drag the card: fling right to save, left to skip, up to tailor your resume right away. Space opens details.</p>
          </div>
          <div className="rounded-3xl bg-ink p-5 text-bg">
            <div className="font-display text-lg font-bold">Where these come from</div>
            <p className="mt-2 text-sm opacity-80">Company boards (Greenhouse, Lever, Ashby) are read directly. With your keys, JSearch adds Indeed, ZipRecruiter, Dice and more, and Apify adds 175k+ career sites. Duplicates are merged, and ghost signals flag stale or evergreen listings.</p>
          </div>
        </aside>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ y: 60, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 60, opacity: 0, scale: 0.9 }}
            transition={spring}
            className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-bg shadow-lift"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
      <Keys onKey={(k) => (k === "z" ? undo() : top && k === " " ? set({ openJob: top.id, drawerTab: "job" }) : top && flingTop(k as Dir))} />
    </div>
  );
}

// imperative bridge so buttons/keys can fling the top card with the same physics as a drag
const flingers = new Set<(d: Dir) => void>();
function flingTop(d: Dir) {
  flingers.forEach((f) => f(d));
}

function SwipeCard({ job, onDecide }: { job: Job; onDecide: (j: Job, d: Dir) => void }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-300, 0, 300], [-18, 0, 18]);
  const saveO = useTransform(x, [30, 140], [0, 1]);
  const skipO = useTransform(x, [-140, -30], [1, 0]);
  const tailorO = useTransform(y, [-160, -40], [1, 0]);
  const gone = useRef(false);

  const fling = useCallback(
    (d: Dir, vx = 0, vy = 0) => {
      if (gone.current) return;
      gone.current = true;
      const W = typeof window !== "undefined" ? window.innerWidth : 1200;
      const opts = { type: "spring" as const, stiffness: 120, damping: 22 };
      if (d === "up") {
        animate(y, -900, { ...opts, velocity: Math.min(vy, -800) });
        animate(x, x.get() * 1.5, opts);
      } else {
        animate(x, d === "right" ? W : -W, { ...opts, velocity: d === "right" ? Math.max(vx, 900) : Math.min(vx, -900) });
        animate(y, y.get() + vy * 0.15, opts);
      }
      setTimeout(() => onDecide(job, d), 260);
    },
    [job, onDecide, x, y],
  );

  useEffect(() => {
    flingers.add(fling);
    return () => void flingers.delete(fling);
  }, [fling]);

  const onEnd = (_: unknown, info: PanInfo) => {
    const { offset: o, velocity: v } = info;
    if (o.y < -130 || (v.y < -800 && Math.abs(o.x) < 120)) fling("up", v.x, v.y);
    else if (o.x > 130 || v.x > 700) fling("right", v.x, v.y);
    else if (o.x < -130 || v.x < -700) fling("left", v.x, v.y);
  };

  return (
    <motion.div
      className="absolute inset-0 z-20 cursor-grab touch-none active:cursor-grabbing"
      style={{ x, y, rotate }}
      drag
      dragSnapToOrigin
      dragElastic={0.9}
      dragTransition={{ bounceStiffness: 380, bounceDamping: 22 }}
      whileDrag={{ scale: 1.03 }}
      onDragEnd={onEnd}
      initial={{ scale: 0.95, y: 18 }}
      animate={{ scale: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
      transition={spring}
    >
      <JobCard job={job} />
      <Stamp style={{ opacity: saveO }} className="left-6 top-8 -rotate-12 border-good text-good">
        SAVE
      </Stamp>
      <Stamp style={{ opacity: skipO }} className="right-6 top-8 rotate-12 border-coral text-coral">
        SKIP
      </Stamp>
      <Stamp style={{ opacity: tailorO }} className="bottom-10 left-1/2 -translate-x-1/2 border-brand text-brand">
        TAILOR ✦
      </Stamp>
    </motion.div>
  );
}

function Stamp({ children, className, style }: { children: React.ReactNode; className: string; style: { opacity: import("motion/react").MotionValue<number> } }) {
  return (
    <motion.div style={style} className={`pointer-events-none absolute rounded-xl border-4 bg-card/80 px-4 py-1 font-display text-3xl font-extrabold tracking-wider backdrop-blur ${className}`}>
      {children}
    </motion.div>
  );
}

function ActionBtn({ children, label, hint, tone, onClick, disabled }: { children: React.ReactNode; label: string; hint: string; tone: "coral" | "brand" | "lime"; onClick: () => void; disabled: boolean }) {
  const bg = tone === "coral" ? "bg-coral text-white" : tone === "brand" ? "bg-brand text-brand-ink" : "bg-lime text-[#17151f]";
  return (
    <motion.button
      whileHover={disabled ? undefined : { y: -3, rotate: tone === "coral" ? -4 : tone === "lime" ? 4 : 0 }}
      whileTap={disabled ? undefined : { scale: 0.85 }}
      transition={spring}
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-1.5 disabled:opacity-40"
    >
      <span className={`grid h-14 w-14 place-items-center rounded-2xl shadow-soft ${bg}`}>
        <svg viewBox="0 0 20 20" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          {children}
        </svg>
      </span>
      <span className="text-xs font-semibold">
        {label} <span className="text-ink-3">{hint}</span>
      </span>
    </motion.button>
  );
}

function ScanBar({ progress }: { progress: ReturnType<typeof useScan>["progress"] }) {
  return (
    <AnimatePresence>
      {progress.running && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring} className="overflow-hidden">
          <div className="mt-6 rounded-3xl border border-line bg-card p-5">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 font-semibold">
                <motion.span className="inline-block h-2.5 w-2.5 rounded-full bg-brand" animate={{ scale: [1, 1.6, 1], opacity: [1, 0.5, 1] }} transition={{ repeat: Infinity, duration: 1 }} />
                Scanning {progress.done}/{progress.total} sources
              </div>
              <div className="text-ink-2">
                <Ticker value={progress.found} className="font-bold text-ink" /> matches
              </div>
            </div>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-bg-2">
              <motion.div className="h-full rounded-full bg-gradient-to-r from-brand via-sky to-lime" animate={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} transition={{ type: "spring", stiffness: 60, damping: 18 }} />
            </div>
            <div className="mt-3 flex h-6 gap-2 overflow-hidden">
              <AnimatePresence mode="popLayout">
                {progress.current.map((n) => (
                  <motion.span key={n} layout initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -20, opacity: 0 }} transition={spring} className="rounded-full bg-bg-2 px-2.5 py-0.5 text-xs font-semibold text-ink-2">
                    {n}
                  </motion.span>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function EmptyDeck({ running, hasScan, hidden, onScan }: { running: boolean; hasScan: boolean; hidden: number; onScan: () => void }) {
  const sources = useApp((s) => s.sources);
  const set = useApp((s) => s.set);
  const missing = [
    !(sources.jsearch.enabled && sources.jsearch.apiKey) && "JSearch",
    !(sources.apify.enabled && sources.apify.token) && "Apify",
  ].filter(Boolean) as string[];
  const filtered = hasScan && !running && hidden > 0;
  const nudge = hasScan && !running && !filtered && missing.length > 0;
  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="grid h-full place-items-center rounded-[28px] border-2 border-dashed border-line p-8 text-center">
      <div>
        <motion.div animate={{ y: [0, -10, 0], rotate: [0, -6, 6, 0] }} transition={{ repeat: Infinity, duration: 3 }} className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-3xl bg-brand-soft text-4xl">
          {running ? "🔭" : filtered ? "🔍" : hasScan ? "🎉" : "✨"}
        </motion.div>
        <div className="font-display text-2xl font-bold">{running ? "Finding real roles…" : filtered ? "Your filters hide the rest" : hasScan ? "Inbox zero!" : "Ready when you are"}</div>
        <p className="mx-auto mt-2 max-w-xs text-ink-2">
          {running
            ? "Cards will drop in as each source comes back."
            : filtered
              ? `${hidden} job${hidden === 1 ? "" : "s"} you already found ${hidden === 1 ? "doesn't" : "don't"} match your current roles, work mode, cities, US-only, freshness or experience settings. Widen them and they appear instantly.`
              : hasScan
                ? "You've reviewed everything. Rescan later, or widen your filters in Settings."
                : "Run your first scan to fill the deck."}
        </p>
        {filtered && (
          <button type="button" onClick={() => set({ view: "settings", settingsTab: "search" })} className="mx-auto mt-5 inline-flex h-11 items-center rounded-full bg-ink px-5 text-[15px] font-semibold text-bg">
            Adjust filters
          </button>
        )}
        {nudge && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, ...spring }} className="mx-auto mt-5 max-w-sm rounded-2xl border border-brand/40 bg-brand-soft p-4 text-left">
            <div className="font-display text-base font-bold text-ink">Want more jobs?</div>
            <p className="mt-1 text-sm text-ink-2">
              Add your {missing.join(" and ")} {missing.length > 1 ? "keys" : "key"} to search far beyond the company boards
              {missing.includes("JSearch") ? " — JSearch adds Indeed, ZipRecruiter, Dice and more" : ""}
              {missing.includes("Apify") ? `${missing.includes("JSearch") ? ", and" : " —"} Apify adds 175k+ company career sites` : ""}.
            </p>
            <div className="mt-3">
              <Button size="sm" onClick={() => set({ view: "settings", settingsTab: "companies" })}>
                Add {missing.join(" / ")} →
              </Button>
            </div>
          </motion.div>
        )}
        {!running && (
          <div className="mt-5">
            <Button variant={nudge ? "soft" : "brand"} onClick={onScan}>
              {hasScan ? "Rescan now" : "Start scanning"}
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function Keys({ onKey }: { onKey: (k: string) => void }) {
  const ref = useRef(onKey);
  useEffect(() => {
    ref.current = onKey;
  }, [onKey]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey) return;
      if (document.querySelector("[data-drawer-open]")) return;
      const map: Record<string, string> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", z: "z", " ": " " };
      const k = map[e.key];
      if (k) {
        e.preventDefault();
        ref.current(k);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  return null;
}
