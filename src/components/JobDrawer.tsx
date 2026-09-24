"use client";

import { clsx } from "clsx";
import { AnimatePresence, motion, useDragControls, type DragControls } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp, type Stage } from "@/lib/store";
import type { Job, TailorResult } from "@/lib/types";
import { confetti } from "./Confetti";
import { GhostMeter, CompanyAvatar } from "./JobCard";
import { Button, MatchRing, Pill, Segmented, spring } from "./ui";
import { parseResume } from "@/lib/resume/doc";
import { applyTailoring } from "@/lib/resume/apply";
import { fitOnePage, printResume, type FitResult } from "@/lib/resume/fit";
import { tailorOffline } from "@/lib/engine/tailor";

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

      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-4">
        <Segmented
          id="drawer-tab"
          value={tab}
          onChange={setTab}
          options={[
            { value: "job", label: "Job details" },
            { value: "tailor", label: "✦ Tailored resume" },
          ]}
        />
        <StageSelect value={status && status !== "skipped" ? status : null} onChange={(s, at) => {
          setStatus(job.id, s);
          if (s === "applied" || s === "interview") confetti(at);
        }} />
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={tab} className="flex min-h-0 flex-1 flex-col" initial={{ opacity: 0, x: tab === "tailor" ? 24 : -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: tab === "tailor" ? -24 : 24 }} transition={{ type: "spring", stiffness: 380, damping: 34 }}>
          {tab === "job" ? <JobDetails job={job} onTailor={() => setTab("tailor")} /> : <TailorView job={job} auto={autoTailor} />}
        </motion.div>
      </AnimatePresence>
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
  const hasResult = useApp((s) => !!s.tailor[job.id]);
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
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
      </div>
      <div className="flex items-center gap-3 border-t border-line p-4">
        <Button className="flex-1" onClick={onTailor}>
          ✦ {hasResult ? "View tailored resume" : "Tailored resume"}
        </Button>
        <Button variant="ink" className="flex-1" onClick={() => window.open(job.url, "_blank", "noopener,noreferrer")}>
          Open posting ↗
        </Button>
      </div>
    </>
  );
}

function TailorView({ job, auto }: { job: Job; auto: boolean }) {
  const stored = useApp((s) => s.tailor[job.id]);
  const resumeText = useApp((s) => s.resume);
  // offline results are cheap and deterministic — recompute so older saved results pick up fixes
  const result = useMemo(() => (stored?.mode === "offline" && resumeText.trim() ? { ...tailorOffline(job, resumeText), createdAt: stored.createdAt } : stored), [stored, job, resumeText]);
  const resume = useApp((s) => s.resume);
  const ai = useApp((s) => s.ai);
  const setTailor = useApp((s) => s.setTailor);
  const setStatus = useApp((s) => s.setStatus);
  const set = useApp((s) => s.set);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const fitted = useFittedResume(job, result, resume);
  const status = useApp((s) => s.status[job.id]);

  // a job with a finished tailored resume belongs in the Tailored column (unless it's further along)
  useEffect(() => {
    if (result && (!status || status === "saved" || status === "skipped")) setStatus(job.id, "tailored");
  }, [result, status, job.id, setStatus]);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tailor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job, resume, provider: ai.keys[ai.provider] ? ai.provider : undefined, apiKey: ai.keys[ai.provider] || undefined, model: ai.models[ai.provider] || undefined }),
      });
      const data = (await res.json()) as TailorResult & { error?: string; errorStatus?: number; errorModel?: string };
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      if (data.error) setError(explainAiError(data.error, data.errorStatus, data.errorModel));
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
      <Pane>
      <div className="rounded-3xl border-2 border-dashed border-line p-8 text-center">
        <div className="font-display text-xl font-bold">Add your resume first</div>
        <p className="mt-2 text-ink-2">Paste it once in Settings and every role gets a tailored version.</p>
        <div className="mt-4">
          <Button onClick={() => set({ view: "settings", openJob: null })}>Open Settings</Button>
        </div>
      </div>
      </Pane>
    );

  if (loading)
    return (
      <Pane>
        <TailorSkeleton ai={!!ai.keys[ai.provider]} />
      </Pane>
    );

  if (!result)
    return (
      <Pane>
      <div className="text-center">
        {error && <div className="mb-4 rounded-2xl bg-bad/10 p-3 text-sm text-bad">{error}</div>}
        <Button onClick={run} size="lg">
          ✦ Tailor my resume
        </Button>
      </div>
      </Pane>
    );

  const markdown = toMarkdown(job, result);
  const footer = (
    <div className="flex items-center gap-3 border-t border-line p-4">
      <Button className="flex-[2]" size="lg" disabled={!fitted.pdfUrl && !fitted.fallback} onClick={() => savePdf(fitted)} title={fitted.pdfUrl ? `Downloads ${fitted.fileName}.pdf` : "Opens the print dialog — choose “Save as PDF”"}>
        <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M10 3v10M6 9l4 4 4-4M4 16h12" />
        </svg>
        {fitted.pdfUrl ? "Download tailored resume (PDF)" : fitted.fallback ? "Print / Save tailored resume as PDF" : "Building tailored resume…"}
      </Button>
      <Button
        variant="lime"
        size="lg"
        className="flex-1"
        onClick={() => {
          setStatus(job.id, "applied");
          confetti();
        }}
      >
        I applied ✓
      </Button>
    </div>
  );
  return (
    <Pane footer={footer}>
    <div className="space-y-5">
      {error && <div className="rounded-2xl bg-warn/10 p-3 text-sm text-warn">{error}</div>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Pill tone={result.mode === "ai" ? "brand" : "neutral"}>{result.mode === "ai" ? "✦ AI-tailored · facts checked" : error ? "Offline ranking · AI unavailable" : "Offline ranking · add an AI key for rewrites"}</Pill>
        <div className="flex gap-2">
          {result.mode === "ai" && <Button size="sm" variant="soft" onClick={() => setShowOriginal((v) => !v)}>
            {showOriginal ? "Show tailored" : "Compare original"}
          </Button>}
          <Button size="sm" variant="soft" onClick={run}>
            ↻ Redo
          </Button>
        </div>
      </div>

      <ResumePreview job={job} fitted={fitted} mode={result.mode} />

      {result.mode === "ai" ? (
        <section className="rounded-3xl border border-line bg-card p-5">
          <div className="text-xs font-bold uppercase tracking-wider text-ink-3">{result.summaryFlagged ? "AI summary — rejected" : "Summary used on the resume"}</div>
          <p className={clsx("mt-2 text-[15px] leading-relaxed", result.summaryFlagged ? "text-ink-3 line-through" : "text-ink-2")}>{result.summary}</p>
          {result.summaryFlagged && <div className="mt-2 text-xs font-semibold text-warn">⚠ It {result.summaryFlagged}. Your original summary is kept on the resume.</div>}
        </section>
      ) : (
        <section className="rounded-3xl border border-dashed border-line p-5 text-sm leading-relaxed text-ink-2">
          <div className="font-display text-base font-bold text-ink">How this was tailored without AI</div>
          Your own bullets weren&apos;t reworded. Inside each role they&apos;re reordered so the ones matching this job&apos;s keywords come first, and skills are reordered the same way. If the page runs long, the least relevant bullets are dropped first. Add an AI key in Settings → Resume &amp; AI to have bullets rewritten in the job&apos;s language, with every number checked against your original.
        </section>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-bold uppercase tracking-wider text-ink-3">{result.mode === "ai" ? "What changed, bullet by bullet" : "Your most relevant bullets"}</div>
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
          {result.coverFlagged && <div className="mt-2 text-xs font-semibold text-ink-3">ⓘ The AI&apos;s note was replaced with this fact-only version because it {result.coverFlagged}. Hit Redo for a new AI note.</div>}
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="soft" size="sm" onClick={() => download(`${slug(job.company)}-${slug(job.title)}.md`, markdown)}>
          ↓ Download .md
        </Button>
        <Button variant="soft" size="sm" onClick={() => copy("md", markdown)}>
          {copied === "md" ? "Copied ✓" : "Copy as Markdown"}
        </Button>
      </div>
    </div>
    </Pane>
  );
}

function Pane({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">{children}</div>
      {footer}
    </>
  );
}

interface Fitted {
  /** blob: URL of the server-built PDF (job-tailor pipeline) */
  pdfUrl: string | null;
  /** exact HTML of that PDF, for the on-screen preview */
  html: string | null;
  fileName: string;
  layout: string;
  fill: number;
  underfilled: boolean;
  /** in-browser fallback when the PDF engine isn't available */
  fallback: FitResult | null;
  error: string | null;
  rewritten: number;
  kept: number;
  busy: boolean;
}

const toFileBase = (name: string) =>
  (name || "Resume")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "") || "Resume";

/** Parse the resume, apply this job's tailoring, and build the one-page PDF the job-tailor way. */
function useFittedResume(job: Job, result: TailorResult | undefined, resume: string): Fitted {
  const name = useApp((s) => s.name);
  const [state, setState] = useState<Fitted>({ pdfUrl: null, html: null, fileName: "Resume", layout: "", fill: 0, underfilled: false, fallback: null, error: null, rewritten: 0, kept: 0, busy: false });
  useEffect(() => {
    if (!result || !resume.trim()) return;
    let alive = true;
    let url: string | null = null;
    const doc = parseResume(resume);
    const applied = applyTailoring(doc, job, result, resume);
    // same file name job-tailor uses: just the candidate's name (e.g. Parshwa_Shah.pdf)
    const fileName = toFileBase(doc.name || name);
    setState((s) => ({ ...s, busy: true, error: null, fileName, rewritten: applied.rewritten, kept: applied.kept }));
    (async () => {
      try {
        const res = await fetch("/api/pdf", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ doc: applied.doc, fileName }) });
        const data = (await res.json().catch(() => ({}))) as { pdf?: string; html?: string; layout?: string; fill?: number; underfilled?: boolean; error?: string };
        if (!res.ok || !data.pdf) throw new Error(data.error ?? "Couldn't build the PDF");
        const bytes = Uint8Array.from(atob(data.pdf), (c) => c.charCodeAt(0));
        url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
        if (!alive) return URL.revokeObjectURL(url);
        setState((s) => ({ ...s, busy: false, pdfUrl: url, html: data.html ?? null, layout: data.layout ?? "", fill: data.fill ?? 0, underfilled: !!data.underfilled, fallback: null }));
      } catch (e) {
        // no PDF engine (or it failed): lay the page out in the browser and print that instead
        const fit = await fitOnePage(applied.doc, fileName).catch(() => null);
        if (alive) setState((s) => ({ ...s, busy: false, pdfUrl: null, fallback: fit, layout: fit?.label ?? "", fill: fit?.fill ?? 0, error: e instanceof Error ? e.message : String(e) }));
      }
    })();
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [job, result, resume, name]);
  return state;
}

function savePdf(f: Fitted) {
  if (f.pdfUrl) {
    const a = document.createElement("a");
    a.href = f.pdfUrl;
    a.download = `${f.fileName}.pdf`;
    a.click();
  } else if (f.fallback) printResume(f.fallback.html);
}

function ResumePreview({ job, fitted, mode }: { job: Job; fitted: Fitted; mode: TailorResult["mode"] }) {
  const [open, setOpen] = useState(false);
  const [scale, setScale] = useState(0.72);
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setScale(Math.min(0.72, (e.contentRect.width - 32) / 816)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const ready = !!(fitted.pdfUrl || fitted.fallback);
  // preview the exact HTML of the PDF, with screen-only page margins so it looks like the sheet
  const fallbackPreview = (fitted.html ?? fitted.fallback?.html)?.replace("</head>", "<style>@media screen{html{background:#fff}body{padding:0.35in 0.45in}}</style></head>");
  return (
    <section className="overflow-hidden rounded-3xl border-2 border-brand bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 p-4">
        <div>
          <div className="font-display text-lg font-bold">Tailored resume for {job.company}</div>
          <div className="text-xs text-ink-2">
            {fitted.busy || !ready ? (
              "Building your one-page PDF…"
            ) : (
              <>
                {fitted.pdfUrl ? "One page" : fitted.fallback?.fitsOnePage ? "One page (browser layout)" : "Runs past one page"} · {fitted.layout} · {Math.round(fitted.fill * 100)}% filled
                {mode === "ai" && ` · ${fitted.rewritten} bullet${fitted.rewritten === 1 ? "" : "s"} rewritten`}
                {fitted.kept > 0 && ` · ${fitted.kept} rewrite${fitted.kept === 1 ? "" : "s"} rejected by the fact check`}
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {fitted.pdfUrl && (
            <a href={fitted.pdfUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-ink-2 hover:text-ink">
              Open ↗
            </a>
          )}
          <button onClick={() => setOpen((v) => !v)} className="text-sm font-semibold text-brand">
            {open ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>
      {fitted.error && !fitted.pdfUrl && <div className="mx-4 mb-3 rounded-xl bg-warn/10 px-3 py-2 text-xs text-warn">PDF engine unavailable ({fitted.error}). Using the browser layout — in the print dialog choose “Save as PDF”.</div>}
      <motion.div ref={boxRef} animate={{ height: open ? 1056 * scale + 32 : 360 }} transition={{ type: "spring", stiffness: 200, damping: 28 }} className="relative overflow-hidden border-t border-line bg-bg-2">
        {ready ? (
          <div className="absolute inset-x-0 top-4 flex justify-center">
            <div className="overflow-hidden rounded-sm bg-white shadow-lift" style={{ width: 816 * scale, height: 1056 * scale }}>
              <iframe title="Tailored resume preview" srcDoc={fallbackPreview} className="origin-top-left bg-white" style={{ width: 816, height: 1056, transform: `scale(${scale})` }} sandbox="allow-same-origin" />
            </div>
          </div>
        ) : (
          <motion.div className="absolute inset-6 rounded-xl bg-card" animate={{ opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1.2 }} />
        )}
        {!open && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-bg-2 to-transparent" />}
      </motion.div>
    </section>
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

/** Says what actually went wrong, keeping the provider's own words so nothing is hidden. */
function explainAiError(raw: string, status?: number, model?: string) {
  const said = ` (provider said: "${raw.slice(0, 220)}")`
  const m = model ? ` ${model}` : "";
  if (/per ?day|daily|quota|exceeded|billing|RESOURCE_EXHAUSTED/i.test(raw) || status === 429)
    return `Your key has hit a rate limit or quota for${m || " this model"}${said}. Free-tier daily quotas reset at midnight Pacific time. Try again later, switch model or provider in Settings → Resume & AI, or add a key with more quota. Showing offline ranking for now.`;
  if (/high demand|overloaded|unavailable|try again later/i.test(raw) || status === 503 || status === 529)
    return `The model${m} is overloaded on the provider's side right now, which isn't caused by how often you tailor${said}. We retried for about a minute. Hit Redo in a few minutes, or pick another model in Settings → Resume & AI. Showing offline ranking for now.`;
  return `AI request failed${status ? ` (HTTP ${status})` : ""}${m ? ` on${m}` : ""}${said}. Showing offline ranking instead.`;
}
