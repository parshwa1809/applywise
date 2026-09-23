"use client";

import { clsx } from "clsx";
import { AnimatePresence, motion, useMotionValue, useSpring, useVelocity, useTransform } from "motion/react";
import { useRef, useState } from "react";
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

export default function Board() {
  const jobs = useApp((s) => s.jobs);
  const status = useApp((s) => s.status);
  const setStatus = useApp((s) => s.setStatus);
  const set = useApp((s) => s.set);
  const [hover, setHover] = useState<Stage | null>(null);
  const colRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const byStage = (st: Stage) =>
    Object.entries(status)
      .filter(([id, s]) => s === st && jobs[id])
      .map(([id]) => jobs[id]);

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

  const total = COLUMNS.reduce((n, c) => n + byStage(c.id).length, 0);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-24 pt-6 sm:px-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-bold sm:text-5xl">Board</h1>
          <p className="mt-1 text-ink-2">Drag cards between columns. Moving to Applied earns confetti.</p>
        </div>
      </div>

      {total === 0 ? (
        <div className="mt-10 grid place-items-center rounded-[28px] border-2 border-dashed border-line p-12 text-center">
          <div className="font-display text-2xl font-bold">Nothing saved yet</div>
          <p className="mt-2 text-ink-2">Swipe right on roles in Discover and they&apos;ll land here.</p>
          <div className="mt-5">
            <Button onClick={() => set({ view: "discover" })}>Go to Discover</Button>
          </div>
        </div>
      ) : (
        <div className="no-scrollbar mt-8 flex snap-x gap-4 overflow-x-auto pb-4 lg:grid lg:grid-cols-4 lg:overflow-visible">
          {COLUMNS.map((c) => {
            const list = byStage(c.id);
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
                <div className="flex items-center justify-between px-2 pb-3 pt-1">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.accent }} />
                    <span className="font-display text-lg font-bold">{c.title}</span>
                    <motion.span key={list.length} initial={{ scale: 1.6 }} animate={{ scale: 1 }} transition={spring} className="rounded-full bg-card px-2 text-xs font-bold text-ink-2">
                      {list.length}
                    </motion.span>
                  </div>
                  <span className="text-xs text-ink-3">{c.hint}</span>
                </div>
                <motion.div layout className="flex flex-col gap-2.5">
                  <AnimatePresence mode="popLayout">
                    {list.map((job) => (
                      <DragCard
                        key={job.id}
                        job={job}
                        onHover={(x, y) => setHover(columnAt(x, y))}
                        onDrop={(x, y) => {
                          setHover(null);
                          const to = columnAt(x, y);
                          if (to) move(job, to, { x, y });
                        }}
                        onOpen={() => set({ openJob: job.id, drawerTab: useApp.getState().tailor[job.id] ? "tailor" : "job" })}
                        onArchive={() => setStatus(job.id, "skipped")}
                      />
                    ))}
                  </AnimatePresence>
                </motion.div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DragCard({ job, onHover, onDrop, onOpen, onArchive }: { job: Job; onHover: (x: number, y: number) => void; onDrop: (x: number, y: number) => void; onOpen: () => void; onArchive: () => void }) {
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
      className="group relative cursor-grab touch-none rounded-2xl border border-line bg-card p-3.5 shadow-soft active:cursor-grabbing"
    >
      <div className="flex items-start gap-3">
        <CompanyAvatar name={job.company} size={36} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-ink-2">{job.company}</div>
          <div className="line-clamp-2 font-semibold leading-snug">{job.title}</div>
          <div className="mt-1.5 flex items-center gap-2 text-xs text-ink-3">
            <span className={clsx("font-bold", job.match >= 70 ? "text-good" : job.match >= 45 ? "text-warn" : "text-coral")}>{job.match}% match</span>
            <span>·</span>
            <span>{timeAgo(job.postedAt)}</span>
          </div>
        </div>
      </div>
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onArchive();
        }}
        aria-label="Archive"
        className="absolute right-2 top-2 hidden h-7 w-7 place-items-center rounded-full text-ink-3 hover:bg-bg-2 hover:text-ink group-hover:grid"
      >
        ×
      </button>
    </motion.div>
  );
}
