"use client";

import { clsx } from "clsx";
import { AnimatePresence, motion, useMotionValue, useSpring, useVelocity, useTransform } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cardFlag, COLLAPSE_AT, COMPACT_OVER, daysSince, REASON_LABEL, SORT_NOTE, sortColumn, weeklySummary } from "@/lib/board";
import { useApp, type Stage } from "@/lib/store";
import type { Job } from "@/lib/types";
import { timeAgo } from "@/lib/useScan";
import { confetti } from "./Confetti";
import { CompanyAvatar } from "./JobCard";
import { Button, spring } from "./ui";

const COLUMNS: { id: Stage; title: string; hint: string; accent: string }[] = [
  { id: "saved", title: "Saved", hint: "Swiped right", accent: "var(--sky)" },
  { id: "tailored", title: "Tailored", hint: "Resume ready", accent: "var(--brand)" },
  { id: "applied", title: "Applied", hint: "Fingers crossed", accent: "var(--amber)" },
  { id: "interview", title: "Interview", hint: "Let's go", accent: "var(--good)" },
];

type Flag = { text: string; tone: "warn" | "muted" } | null;

export default function Board() {
  const jobs = useApp((s) => s.jobs);
  const status = useApp((s) => s.status);
  const statusAt = useApp((s) => s.statusAt);
  const closed = useApp((s) => s.closed);
  const archived = useApp((s) => s.archived);
  const setStatus = useApp((s) => s.setStatus);
  const archive = useApp((s) => s.archive);
  const set = useApp((s) => s.set);
  const [hover, setHover] = useState<Stage | null>(null);
  const [expanded, setExpanded] = useState<Partial<Record<Stage, boolean>>>({});
  const colRefs = useRef<Record<string, HTMLDivElement | null>>({});
  // eslint-disable-next-line react-hooks/purity -- a clock read per render is fine for day-level labels
  const now = Date.now();

  // the automatic rules run whenever the board opens (and after every scan)
  useEffect(() => {
    useApp.getState().tidyBoard();
  }, []);

  const columns = useMemo(() => {
    const by: Record<Stage, Job[]> = { saved: [], tailored: [], applied: [], interview: [] };
    for (const [id, st] of Object.entries(status)) if (jobs[id] && st in by) by[st as Stage].push(jobs[id]);
    for (const c of COLUMNS) by[c.id] = sortColumn(c.id, by[c.id], statusAt);
    return by;
  }, [jobs, status, statusAt]);

  const columnAt = (x: number, y: number): Stage | null => {
    for (const c of COLUMNS) {
      const el = colRefs.current[c.id];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return c.id;
    }
    return null;
  };

  const move = (job: Job, to: Stage, at?: { x: number; y: number }) => {
    if (status[job.id] === to) return;
    setStatus(job.id, to);
    if (to === "applied" || to === "interview") confetti(at, to === "interview" ? 220 : 140);
  };

  const total = COLUMNS.reduce((n, c) => n + columns[c.id].length, 0);
  const archivedIds = Object.keys(archived).filter((id) => status[id] === "archived" && jobs[id]);
  const summary = weeklySummary(archived, now);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-24 pt-6 sm:px-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-bold sm:text-5xl">Board</h1>
          <p className="mt-1 text-ink-2">Drag cards between columns. Moving to Applied earns confetti.</p>
        </div>
      </div>

      {summary && (
        <div className="mt-4 flex items-center gap-2 text-sm text-ink-2">
          <span aria-hidden>✦</span>
          {summary}
        </div>
      )}

      {total === 0 ? (
        <div className="mt-10 grid place-items-center rounded-[28px] border-2 border-dashed border-line p-12 text-center">
          <div className="font-display text-2xl font-bold">{archivedIds.length ? "Board is clear" : "Nothing saved yet"}</div>
          <p className="mt-2 text-ink-2">Swipe right on roles in Discover and they&apos;ll land here.</p>
          <div className="mt-5">
            <Button onClick={() => set({ view: "discover" })}>Go to Discover</Button>
          </div>
        </div>
      ) : (
        <div className="no-scrollbar mt-6 flex snap-x items-start gap-4 overflow-x-auto pb-4 lg:grid lg:grid-cols-4 lg:overflow-visible">
          {COLUMNS.map((c) => {
            const list = columns[c.id];
            const compact = list.length > COMPACT_OVER;
            const open = !!expanded[c.id];
            const shown = open ? list : list.slice(0, COLLAPSE_AT);
            const rest = list.length - shown.length;
            return (
              <div
                key={c.id}
                ref={(el) => {
                  colRefs.current[c.id] = el;
                }}
                className={clsx(
                  "min-h-[420px] w-[80vw] shrink-0 snap-start rounded-[26px] border-2 p-3 transition-colors sm:w-[320px] lg:w-auto",
                  hover === c.id ? "border-brand bg-brand-soft/60" : "border-transparent bg-bg-2",
                )}
              >
                <div className="flex items-center justify-between px-2 pt-1">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.accent }} />
                    <span className="font-display text-lg font-bold">{c.title}</span>
                    <motion.span key={list.length} initial={{ scale: 1.6 }} animate={{ scale: 1 }} transition={spring} className="rounded-full bg-card px-2 text-xs font-bold text-ink-2">
                      {list.length}
                    </motion.span>
                  </div>
                  <span className="text-xs text-ink-3">{c.hint}</span>
                </div>
                <div className="px-2 pb-3 text-xs text-ink-3">{list.length > 1 ? SORT_NOTE[c.id] : "\u00a0"}</div>
                <motion.div layout className={clsx("flex flex-col", compact ? "gap-1.5" : "gap-2.5")}>
                  <AnimatePresence mode="popLayout">
                    {shown.map((job) => (
                      <DragCard
                        key={job.id}
                        job={job}
                        compact={compact}
                        flag={cardFlag(c.id, job.id, { statusAt, closed }, now)}
                        days={daysSince(statusAt[job.id], now)}
                        onHover={(x, y) => setHover(columnAt(x, y))}
                        onDrop={(x, y) => {
                          setHover(null);
                          const to = columnAt(x, y);
                          if (to) move(job, to, { x, y });
                        }}
                        onOpen={() => set({ openJob: job.id, drawerTab: useApp.getState().tailor[job.id] ? "tailor" : "job" })}
                        onArchive={() => archive(job.id, "manual")}
                      />
                    ))}
                  </AnimatePresence>
                </motion.div>
                {(rest > 0 || (open && list.length > COLLAPSE_AT)) && (
                  <button
                    onClick={() => setExpanded((e) => ({ ...e, [c.id]: !open }))}
                    className="mt-2 w-full rounded-xl py-2 text-sm font-semibold text-ink-2 hover:bg-card hover:text-ink"
                  >
                    {rest > 0 ? `+${rest} more` : "Show less"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {archivedIds.length > 0 && <ArchiveDrawer ids={archivedIds} now={now} />}
    </div>
  );
}

function ArchiveDrawer({ ids, now }: { ids: string[]; now: number }) {
  const [open, setOpen] = useState(false);
  const jobs = useApp((s) => s.jobs);
  const archived = useApp((s) => s.archived);
  const restore = useApp((s) => s.restore);
  const set = useApp((s) => s.set);
  const list = [...ids].sort((a, b) => Date.parse(archived[b].at) - Date.parse(archived[a].at));
  return (
    <div className="mt-4 rounded-[22px] border border-line">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 px-5 py-4 text-left">
        <svg viewBox="0 0 20 20" className="h-5 w-5 text-ink-2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="4" width="14" height="4" rx="1" />
          <path d="M4.5 8v7a1 1 0 001 1h9a1 1 0 001-1V8M8 11h4" />
        </svg>
        <span className="flex-1 font-semibold">
          Archive · {list.length} job{list.length === 1 ? "" : "s"}
        </span>
        <span className="text-xs text-ink-3">Nothing is deleted. Restore puts a job back where it was.</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} className="text-ink-2" aria-hidden>
          ▾
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="px-5 pb-3">
              {list.map((id) => {
                const job = jobs[id];
                const a = archived[id];
                return (
                  <div key={id} className="flex items-center gap-3 border-t border-line py-2.5">
                    <CompanyAvatar name={job.company} size={28} />
                    <button onClick={() => set({ openJob: id, drawerTab: "job" })} className="min-w-0 flex-1 truncate text-left text-sm">
                      <span className="font-semibold">{job.company}</span> <span className="text-ink-2">{job.title}</span>
                    </button>
                    <span className="hidden text-xs text-ink-3 sm:inline">
                      {REASON_LABEL[a.reason]} · was {a.from} · {daysSince(a.at, now) === 0 ? "today" : `${daysSince(a.at, now)}d ago`}
                    </span>
                    <button onClick={() => restore(id)} className="rounded-full border border-line px-3 py-1 text-xs font-semibold hover:bg-bg-2">
                      Restore
                    </button>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DragCard({ job, compact, flag, days, onHover, onDrop, onOpen, onArchive }: { job: Job; compact: boolean; flag: Flag; days: number; onHover: (x: number, y: number) => void; onDrop: (x: number, y: number) => void; onOpen: () => void; onArchive: () => void }) {
  const x = useMotionValue(0);
  const xv = useVelocity(x);
  // tilt follows horizontal drag velocity, like a card swinging from your fingers
  const tilt = useSpring(useTransform(xv, [-2000, 0, 2000], [-14, 0, 14], { clamp: true }), { stiffness: 300, damping: 20 });
  const dragged = useRef(false);
  return (
    <motion.div
      layout
      layoutId={`board-${job.id}`}
      initial={{ opacity: 0, scale: 0.8, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={spring}
      drag
      dragSnapToOrigin
      dragMomentum={false}
      dragElastic={1}
      style={{ x, rotate: tilt }}
      whileDrag={{ scale: 1.06, zIndex: 50, boxShadow: "var(--shadow-lg)" }}
      onDragStart={() => (dragged.current = true)}
      onDrag={(e) => {
        const p = "clientX" in e ? e : (e as TouchEvent).touches?.[0];
        if (p) onHover(p.clientX, p.clientY);
      }}
      onDragEnd={(e) => {
        const p = "clientX" in e ? (e as PointerEvent) : (e as TouchEvent).changedTouches?.[0];
        if (p) onDrop(p.clientX, p.clientY);
        setTimeout(() => (dragged.current = false), 50);
      }}
      onClick={() => !dragged.current && onOpen()}
      className={clsx("group relative cursor-grab touch-none border border-line bg-card shadow-soft active:cursor-grabbing", compact ? "rounded-xl px-2.5 py-2" : "rounded-2xl p-3.5")}
    >
      {compact ? (
        <div className="flex items-center gap-2.5 pr-5">
          <CompanyAvatar name={job.company} size={24} />
          <div className="min-w-0 flex-1 truncate text-sm">
            <span className="font-semibold">{job.company}</span> <span className="text-ink-2">{job.title}</span>
          </div>
          {flag ? <FlagTag flag={flag} /> : <span className="shrink-0 text-xs text-ink-3">{days}d</span>}
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <CompanyAvatar name={job.company} size={36} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold text-ink-2">{job.company}</div>
            <div className="line-clamp-2 font-semibold leading-snug">{job.title}</div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-3">
              <span className={clsx("font-bold", job.match >= 70 ? "text-good" : job.match >= 45 ? "text-warn" : "text-coral")}>{job.match}% match</span>
              <span>·</span>
              <span>{timeAgo(job.postedAt)}</span>
              {flag && <FlagTag flag={flag} />}
            </div>
          </div>
        </div>
      )}
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onArchive();
        }}
        aria-label="Move to archive" title="Move to archive"
        className="absolute right-2 top-2 hidden h-7 w-7 place-items-center rounded-full text-ink-3 hover:bg-bg-2 hover:text-ink group-hover:grid"
      >
        ×
      </button>
    </motion.div>
  );
}

function FlagTag({ flag }: { flag: NonNullable<Flag> }) {
  return (
    <span className={clsx("shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold", flag.tone === "warn" ? "bg-amber/20 text-warn" : "bg-bg-2 text-ink-3")}>{flag.text}</span>
  );
}
