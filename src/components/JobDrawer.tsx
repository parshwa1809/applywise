"use client";

import { clsx } from "clsx";
import { AnimatePresence, motion, useDragControls, type DragControls } from "motion/react";
import { useEffect, useState } from "react";
import { useApp, type Stage } from "@/lib/store";
import type { Job, TailorResult } from "@/lib/types";
import { confetti } from "./Confetti";
import { GhostMeter, CompanyAvatar } from "./JobCard";
import { Button, MatchRing, Pill, Segmented, spring } from "./ui";

export default function JobDrawer() {
  const openJob = useApp((s) => s.openJob);
  const job = useApp((s) => (s.openJob ? s.jobs[s.openJob] : undefined));
  const set = useApp((s) => s.set);
  const close = () => set({ openJob: null });
  const controls = useDragControls();

  useEffect(() => {
    if (!openJob) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && set({ openJob: null });
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [openJob, set]);

  return (
    <AnimatePresence>
      {job && (
        <>
          <motion.div key="scrim" className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} />
          <motion.aside
            key="drawer"
            data-drawer-open
            role="dialog"
            aria-label={`${job.title} at ${job.company}`}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col bg-bg shadow-lift sm:rounded-l-[32px]"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
            drag="x"
            dragListener={false}
            dragControls={controls}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0, right: 0.6 }}
            onDragEnd={(_, i) => (i.offset.x > 140 || i.velocity.x > 800) && close()}
          >
            <DrawerBody job={job} onClose={close} controls={controls} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function DrawerBody({ job, onClose, controls }: { job: Job; onClose: () => void; controls: DragControls }) {
  const status = useApp((s) => s.status[job.id]);
  const setStatus = useApp((s) => s.setStatus);
  const result = useApp((s) => s.tailor[job.id]);
  const [tab, setTab] = useState<"tailor" | "job">(() => useApp.getState().drawerTab);
  const autoTailor = !result;

  return (
    <>
      <div className="flex cursor-grab touch-none items-start gap-4 border-b border-line p-6 active:cursor-grabbing" onPointerDown={(e) => controls.start(e)}>
        <CompanyAvatar name={job.company} size={52} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-ink-2">{job.company}</div>
          <h2 className="font-display text-2xl font-bold leading-tight">{job.title}</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            <Pill>{job.location}</Pill>
            {job.salary && <Pill tone="good">{job.salary}</Pill>}
            <GhostMeter ghost={job.ghost} />
          </div>
        </div>
        <MatchRing value={job.match} />
        <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full hover:bg-bg-2">
          <svg viewBox="0 0 20 20" className="h-5 w-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        </button>
      </div>

      <div className="flex items-center justify-between gap-3 px-6 pt-4">
        <Segmented
          id="drawer-tab"
          value={tab}
          onChange={setTab}
          options={[
            { value: "tailor", label: "✦ Tailored resume" },
            { value: "job", label: "Job details" },
          ]}
        />
        <StageSelect value={status && status !== "skipped" ? status : null} onChange={(s, at) => {
          setStatus(job.id, s);
          if (s === "applied" || s === "interview") confetti(at);
        }} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.18 }}>
            {tab === "job" ? <JobDetails job={job} onTailor={() => setTab("tailor")} /> : <TailorView job={job} auto={autoTailor} />}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-3 border-t border-line p-4">
        <Button
          variant="ink"
          className="flex-1"
          onClick={() => {
            window.open(job.url, "_blank", "noopener,noreferrer");
          }}
        >
          Open posting ↗
        </Button>
        <Button
          variant="lime"
          className="flex-1"
          onClick={() => {
            setStatus(job.id, "applied");
            confetti();
          }}
        >
          I applied ✓
        </Button>
      </div>
    </>
  );
}

function StageSelect({ value, onChange }: { value: Stage | null; onChange: (s: Stage, at: { x: number; y: number }) => void }) {
  const stages: Stage[] = ["saved", "tailored", "applied", "interview"];
  return (
    <div className="flex gap-1 rounded-full bg-bg-2 p-1">
      {stages.map((s) => (
        <button
          key={s}
          onClick={(e) => onChange(s, { x: e.clientX, y: e.clientY })}
          className={clsx("relative rounded-full px-2.5 py-1 text-xs font-semibold capitalize", value === s ? "text-bg" : "text-ink-2 hover:text-ink")}
        >
          {value === s && <motion.span layoutId="stage-pill" className="absolute inset-0 -z-0 rounded-full bg-ink" transition={spring} />}
          <span className="relative">{s}</span>
        </button>
      ))}
    </div>
  );
}

function JobDetails({ job, onTailor }: { job: Job; onTailor: () => void }) {
  return (
    <div>
      {job.ghost.signals.length > 0 && (
        <div className="mb-5 rounded-2xl border border-line bg-card p-4">
          <div className="text-sm font-bold">Ghost-job signals</div>
          <ul className="mt-2 space-y-1 text-sm text-ink-2">
            {job.ghost.signals.map((s) => (
              <li key={s.label}>• {s.label}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-3">Signals, not verdicts. A listing can still be real — use them to prioritize.</p>
        </div>
      )}
      <div className="whitespace-pre-line text-[15px] leading-relaxed text-ink-2">{job.description || "No description provided by the company."}</div>
      <div className="sticky bottom-0 mt-6 bg-gradient-to-t from-bg pt-4">
        <Button onClick={onTailor} className="w-full">
          ✦ Tailor my resume for this role
        </Button>
      </div>
    </div>
  );
}

function TailorView({ job, auto }: { job: Job; auto: boolean }) {
  const result = useApp((s) => s.tailor[job.id]);
  const resume = useApp((s) => s.resume);
  const ai = useApp((s) => s.ai);
  const setTailor = useApp((s) => s.setTailor);
  const setStatus = useApp((s) => s.setStatus);
  const set = useApp((s) => s.set);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tailor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job, resume, provider: ai.apiKey ? ai.provider : undefined, apiKey: ai.apiKey || undefined, model: ai.model || undefined }),
      });
      const data = (await res.json()) as TailorResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      if (data.error) setError(`AI request failed (${data.error}). Showing offline ranking instead.`);
      setTailor(job.id, data);
      const st = useApp.getState().status[job.id];
      if (!st || st === "saved" || st === "skipped") setStatus(job.id, "tailored");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!auto || !resume.trim()) return;
    const t = setTimeout(run, 0); // deferred so StrictMode's double-mount only fires once
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 1400);
    } catch {
      /* clipboard blocked */
    }
  };

  if (!resume.trim())
    return (
      <div className="rounded-3xl border-2 border-dashed border-line p-8 text-center">
        <div className="font-display text-xl font-bold">Add your resume first</div>
        <p className="mt-2 text-ink-2">Paste it once in Settings and every role gets a tailored version.</p>
        <div className="mt-4">
          <Button onClick={() => set({ view: "settings", openJob: null })}>Open Settings</Button>
        </div>
      </div>
    );

  if (loading) return <TailorSkeleton ai={!!ai.apiKey} />;

  if (!result)
    return (
      <div className="text-center">
        {error && <div className="mb-4 rounded-2xl bg-bad/10 p-3 text-sm text-bad">{error}</div>}
        <Button onClick={run} size="lg">
          ✦ Tailor my resume
        </Button>
      </div>
    );

  const markdown = toMarkdown(job, result);
  return (
    <div className="space-y-5">
      {error && <div className="rounded-2xl bg-warn/10 p-3 text-sm text-warn">{error}</div>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Pill tone={result.mode === "ai" ? "brand" : "neutral"}>{result.mode === "ai" ? "✦ AI-tailored · facts checked" : "Offline ranking · add an AI key for rewrites"}</Pill>
        <div className="flex gap-2">
          <Button size="sm" variant="soft" onClick={() => setShowOriginal((v) => !v)}>
            {showOriginal ? "Show tailored" : "Compare original"}
          </Button>
          <Button size="sm" variant="soft" onClick={run}>
            ↻ Redo
          </Button>
        </div>
      </div>

      <section className="rounded-3xl border border-line bg-card p-5">
        <div className="text-xs font-bold uppercase tracking-wider text-ink-3">Headline</div>
        <div className="mt-1 font-display text-xl font-bold">{result.headline}</div>
        {result.summary && <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{result.summary}</p>}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-bold uppercase tracking-wider text-ink-3">Bullets, ranked for this role</div>
          <button onClick={() => copy("bullets", result.bullets.map((b) => `• ${b.tailored}`).join("\n"))} className="text-xs font-semibold text-brand">
            {copied === "bullets" ? "Copied ✓" : "Copy all"}
          </button>
        </div>
        <motion.ul className="space-y-2" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.06 } } }}>
          {result.bullets.map((b, i) => (
            <motion.li
              key={i}
              variants={{ hidden: { opacity: 0, x: 24 }, show: { opacity: 1, x: 0 } }}
              transition={spring}
              className={clsx("rounded-2xl border bg-card p-4", b.flagged ? "border-warn" : "border-line")}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.p key={showOriginal ? "o" : "t"} initial={{ opacity: 0, rotateX: -60 }} animate={{ opacity: 1, rotateX: 0 }} exit={{ opacity: 0, rotateX: 60 }} transition={{ duration: 0.22 }} className={clsx("text-[15px] leading-relaxed", showOriginal && "text-ink-3")}>
                  {showOriginal ? b.original : b.tailored}
                </motion.p>
              </AnimatePresence>
              {b.keywords.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {b.keywords.map((k) => (
                    <span key={k} className="rounded-md bg-brand-soft px-1.5 py-0.5 text-[11px] font-semibold text-brand">
                      {k}
                    </span>
                  ))}
                </div>
              )}
              {b.flagged && <div className="mt-2 text-xs font-semibold text-warn">⚠ {b.flagged}</div>}
            </motion.li>
          ))}
        </motion.ul>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <section className="rounded-3xl bg-good/10 p-4">
          <div className="text-xs font-bold uppercase tracking-wider text-good">Lead with</div>
          <div className="mt-2 flex flex-wrap gap-1">{result.highlightSkills.map((s) => <Pill key={s} tone="good">{s}</Pill>)}</div>
        </section>
        <section className="rounded-3xl bg-coral/10 p-4">
          <div className="text-xs font-bold uppercase tracking-wider text-coral">Gaps (don&apos;t fake these)</div>
          <div className="mt-2 flex flex-wrap gap-1">{result.missingKeywords.map((s) => <Pill key={s} tone="bad">{s}</Pill>)}</div>
        </section>
      </div>

      {result.coverNote && (
        <section className="rounded-3xl border border-line bg-card p-5">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold uppercase tracking-wider text-ink-3">Note to the hiring manager</div>
            <button onClick={() => copy("note", result.coverNote)} className="text-xs font-semibold text-brand">
              {copied === "note" ? "Copied ✓" : "Copy"}
            </button>
          </div>
          <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-ink-2">{result.coverNote}</p>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="soft" size="sm" onClick={() => download(`${slug(job.company)}-${slug(job.title)}.md`, markdown)}>
          ↓ Download .md
        </Button>
        <Button variant="soft" size="sm" onClick={() => copy("md", markdown)}>
          {copied === "md" ? "Copied ✓" : "Copy as Markdown"}
        </Button>
        <Button variant="soft" size="sm" onClick={() => window.print()}>
          Print / Save PDF
        </Button>
      </div>

      <div id="print-area" className="hidden print:block">
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>{result.headline}</h1>
        <p>{result.summary}</p>
        <ul>{result.bullets.map((b, i) => <li key={i}>{b.tailored}</li>)}</ul>
      </div>
    </div>
  );
}

function TailorSkeleton({ ai }: { ai: boolean }) {
  const steps = ai ? ["Reading the job", "Matching your evidence", "Rewriting bullets", "Fact-checking numbers"] : ["Reading the job", "Ranking your bullets"];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => Math.min(steps.length - 1, x + 1)), 1400);
    return () => clearInterval(t);
  }, [steps.length]);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <motion.div className="h-8 w-8 rounded-xl bg-brand" animate={{ rotate: [0, 90, 180, 270, 360], borderRadius: ["30%", "50%", "30%", "50%", "30%"] }} transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut" }} />
        <AnimatePresence mode="wait">
          <motion.span key={i} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -10, opacity: 0 }} className="font-semibold">
            {steps[i]}…
          </motion.span>
        </AnimatePresence>
      </div>
      {[0, 1, 2, 3].map((k) => (
        <motion.div key={k} className="h-16 rounded-2xl bg-bg-2" animate={{ opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1.4, delay: k * 0.15 }} />
      ))}
    </div>
  );
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

function download(name: string, text: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function toMarkdown(job: Job, r: TailorResult) {
  return `# ${r.headline}

_Tailored for ${job.title} at ${job.company} — ${job.url}_

## Summary
${r.summary}

## Experience highlights
${r.bullets.map((b) => `- ${b.tailored}`).join("\n")}

## Skills to lead with
${r.highlightSkills.join(" · ")}
${r.coverNote ? `\n## Note to the hiring manager\n${r.coverNote}\n` : ""}`;
}
