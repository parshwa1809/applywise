"use client";

import { clsx } from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { APIFY_MIN, clampApify } from "@/lib/engine/aggregators";
import { companyKey, useApp } from "@/lib/store";
import { DEFAULT_MODELS } from "@/lib/engine/tailor";
import type { AiProvider, Ats, Company, SourceSettings, WorkMode } from "@/lib/types";
import { jsearchQueries } from "@/lib/engine/aggregators";
import { DIRECTORY, INDUSTRIES } from "@/lib/useScan";
import { Button, Segmented, Switch, TagInput, ToggleChip, spring } from "./ui";

const ROLE_SUGGESTIONS = ["Product Manager", "Associate Product Manager", "Technical Product Manager", "Product Analyst", "Product Owner", "Software Engineer", "Frontend Engineer", "Data Analyst", "Data Scientist", "UX Designer", "Product Designer", "Product Marketing Manager", "Program Manager"];
const CITY_SUGGESTIONS = ["New York", "San Francisco", "Seattle", "Austin", "Dallas", "Chicago", "Boston", "Los Angeles", "Denver", "Atlanta", "Washington"];

export function Label({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3">
      <div className="font-display text-lg font-bold">{title}</div>
      {hint && <div className="text-sm text-ink-2">{hint}</div>}
    </div>
  );
}

export function RolesSection() {
  const f = useApp((s) => s.filters);
  const setFilters = useApp((s) => s.setFilters);
  return (
    <div className="space-y-8">
      <div>
        <Label title="Which roles?" hint="Titles are matched word-by-word, so “product manager” also catches “Senior Product Manager, Growth”." />
        <TagInput values={f.roles} onChange={(roles) => setFilters({ roles })} placeholder="Type a role and press Enter" suggestions={ROLE_SUGGESTIONS} />
      </div>
      <div>
        <Label title="Skip titles containing" hint="Seniority or roles you don't want." />
        <TagInput values={f.excludeTitle} onChange={(excludeTitle) => setFilters({ excludeTitle })} placeholder="e.g. senior, director" suggestions={["senior", "staff", "principal", "lead", "director", "vp", "intern", "manager, "]} />
      </div>
      <div>
        <Label title="Experience ceiling" hint="Hide roles asking for more years than this." />
        <Slider value={f.maxYears} min={0} max={15} onChange={(maxYears) => setFilters({ maxYears })} format={(v) => (v === 0 ? "No limit" : `≤ ${v} years`)} />
      </div>
    </div>
  );
}

export function WhereSection() {
  const f = useApp((s) => s.filters);
  const setFilters = useApp((s) => s.setFilters);
  const toggle = (m: WorkMode) => setFilters({ workModes: f.workModes.includes(m) ? f.workModes.filter((x) => x !== m) : [...f.workModes, m] });
  return (
    <div className="space-y-8">
      <div>
        <Label title="How do you want to work?" />
        <div className="grid grid-cols-3 gap-3">
          {(
            [
              ["remote", "Remote", "M3 11l9-7 9 7M5 10v10h14V10"],
              ["hybrid", "Hybrid", "M4 20V8l8-4 8 4v12M9 20v-6h6v6"],
              ["onsite", "On-site", "M3 21h18M6 21V7h12v14M9 11h2M13 11h2M9 15h2M13 15h2"],
            ] as const
          ).map(([m, label, d]) => {
            const on = f.workModes.includes(m);
            return (
              <motion.button
                key={m}
                onClick={() => toggle(m)}
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.94 }}
                transition={spring}
                className={clsx("flex flex-col items-center gap-2 rounded-3xl border-2 p-5 font-semibold transition-colors", on ? "border-brand bg-brand-soft text-brand" : "border-line bg-card text-ink-2")}
              >
                <motion.svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" animate={{ rotate: on ? [0, -10, 10, 0] : 0 }}>
                  <path d={d} />
                </motion.svg>
                {label}
              </motion.button>
            );
          })}
        </div>
      </div>
      <div>
        <Label title="Where?" hint="Cities or regions for hybrid / on-site roles. Leave empty for anywhere. Remote roles always pass." />
        <TagInput values={f.locations} onChange={(locations) => setFilters({ locations })} placeholder="e.g. Dallas, New York" suggestions={CITY_SUGGESTIONS} />
      </div>
      <div className="flex items-center justify-between rounded-2xl border border-line bg-card p-4">
        <div>
          <div className="font-semibold">US roles only</div>
          <div className="text-sm text-ink-2">Drops postings located outside the US.</div>
        </div>
        <Switch on={f.usOnly} onChange={(usOnly) => setFilters({ usOnly })} label="US roles only" />
      </div>
      <div>
        <Label title="Freshness" hint="Older postings are more likely to be ghosts." />
        <Slider value={f.maxAgeDays} min={0} max={90} step={5} onChange={(maxAgeDays) => setFilters({ maxAgeDays })} format={(v) => (v === 0 ? "Any age" : `Posted in the last ${v} days`)} />
      </div>
    </div>
  );
}

export function SourcesSection() {
  const sources = useApp((s) => s.sources);
  const f = useApp((s) => s.filters);
  const set = useApp((s) => s.set);
  const upd = (p: Partial<SourceSettings>) => set({ sources: { ...sources, ...p } });
  const js = sources.jsearch;
  const ap = sources.apify;
  const queries = jsearchQueries(f, js.maxQueries);
  return (
    <div className="space-y-4">
      <Label title="Where should we look?" hint="Mix and match. Company boards are free; JSearch and Apify search far wider with your own key." />

      <SourceCard
        on={sources.boards}
        onToggle={(boards) => upd({ boards })}
        title="Company job boards"
        badge="Free · no key"
        color="var(--sky)"
        blurb="Reads Greenhouse, Lever and Ashby boards directly for the companies you pick below. Every listing is live at the source."
      />

      <SourceCard
        on={js.enabled}
        onToggle={(enabled) => upd({ jsearch: { ...js, enabled } })}
        title="JSearch"
        badge="RapidAPI key"
        color="var(--amber)"
        blurb="Searches Google for Jobs — Indeed, ZipRecruiter, Dice, company sites and more — by role and location."
      >
        <KeyField value={js.apiKey} onChange={(apiKey) => upd({ jsearch: { ...js, apiKey } })} placeholder="RapidAPI key (X-RapidAPI-Key)" href="https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch" linkLabel="Get a free key ↗" />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-ink-2">
            Posted within
            <select value={js.datePosted} onChange={(e) => upd({ jsearch: { ...js, datePosted: e.target.value as SourceSettings["jsearch"]["datePosted"] } })} className="mt-1 block h-10 w-full rounded-xl border border-line bg-card px-3 text-sm text-ink outline-none focus:border-brand">
              <option value="today">Today</option>
              <option value="3days">3 days</option>
              <option value="week">A week</option>
              <option value="month">A month</option>
            </select>
          </label>
          <label className="text-sm text-ink-2">
            Searches per scan
            <input type="number" min={1} max={20} value={js.maxQueries} onChange={(e) => upd({ jsearch: { ...js, maxQueries: Math.max(1, Math.min(20, Number(e.target.value) || 1)) } })} className="mt-1 block h-10 w-full rounded-xl border border-line bg-card px-3 text-sm text-ink outline-none focus:border-brand" />
          </label>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-ink-3">
          Each scan uses <b className="text-ink-2">{queries.length}</b> request{queries.length === 1 ? "" : "s"} of your quota (the free plan allows 200 a month):{" "}
          {queries.map((q) => `“${q}”`).join(", ")}
        </p>
      </SourceCard>

      <SourceCard
        on={ap.enabled}
        onToggle={(enabled) => upd({ apify: { ...ap, enabled } })}
        title="Apify"
        badge="Apify token"
        color="var(--coral)"
        blurb="Runs a job-feed actor across 175k+ company career sites (Workday, iCIMS, Greenhouse, Lever…) filtered by your roles and experience."
      >
        <KeyField value={ap.token} onChange={(token) => upd({ apify: { ...ap, token } })} placeholder="Apify API token" href="https://console.apify.com/settings/integrations" linkLabel="Get your token ↗" />
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_140px]">
          <label className="text-sm text-ink-2">
            Actor
            <input value={ap.actorId} onChange={(e) => upd({ apify: { ...ap, actorId: e.target.value.trim() } })} className="mt-1 block h-10 w-full rounded-xl border border-line bg-card px-3 font-mono text-xs text-ink outline-none focus:border-brand" />
          </label>
          <label className="text-sm text-ink-2">
            Max jobs
            <input type="number" min={APIFY_MIN} max={1000} step={50} value={ap.limit} onChange={(e) => upd({ apify: { ...ap, limit: Number(e.target.value) || APIFY_MIN } })} onBlur={() => upd({ apify: { ...ap, limit: clampApify(ap.limit) } })} className="mt-1 block h-10 w-full rounded-xl border border-line bg-card px-3 text-sm text-ink outline-none focus:border-brand" />
          </label>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-ink-3">The Fantastic.jobs actor needs at least 200 jobs per run. Apify bills per result on your account, and a run can take 1–3 minutes. Cards start dropping in from the other sources meanwhile.</p>
      </SourceCard>
    </div>
  );
}

function SourceCard({ on, onToggle, title, badge, blurb, color, children }: { on: boolean; onToggle: (v: boolean) => void; title: string; badge: string; blurb: string; color: string; children?: React.ReactNode }) {
  return (
    <motion.div layout transition={spring} className={clsx("rounded-3xl border-2 bg-card p-5 transition-colors", on ? "border-brand" : "border-line")}>
      <div className="flex items-start gap-4">
        <motion.div animate={{ rotate: on ? 0 : -8, scale: on ? 1 : 0.9 }} transition={spring} className="mt-0.5 h-10 w-10 shrink-0 rounded-2xl" style={{ background: color, opacity: on ? 1 : 0.45 }} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-lg font-bold">{title}</span>
            <span className="rounded-full bg-bg-2 px-2 py-0.5 text-[11px] font-semibold text-ink-2">{badge}</span>
          </div>
          <p className="mt-1 text-sm text-ink-2">{blurb}</p>
        </div>
        <Switch on={on} onChange={onToggle} label={`Use ${title}`} />
      </div>
      <AnimatePresence initial={false}>
        {on && children && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring} className="overflow-hidden">
            <div className="pt-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function KeyField({ value, onChange, placeholder, href, linkLabel }: { value: string; onChange: (v: string) => void; placeholder: string; href: string; linkLabel: string }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <div className="flex gap-2">
        <input type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value.trim())} placeholder={placeholder} autoComplete="off" className="h-11 min-w-0 flex-1 rounded-2xl border border-line bg-bg px-4 font-mono text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15" />
        <Button variant="soft" size="md" onClick={() => setShow((v) => !v)}>
          {show ? "Hide" : "Show"}
        </Button>
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-xs">
        <a href={href} target="_blank" rel="noreferrer" className="font-semibold text-brand hover:underline">
          {linkLabel}
        </a>
        <span className="text-ink-3">· stored only in this browser</span>
      </div>
    </div>
  );
}

/** Sources + (when company boards are on) the company picker. */
export function LookSection() {
  const boards = useApp((s) => s.sources.boards);
  return (
    <div className="space-y-10">
      <SourcesSection />
      <AnimatePresence initial={false}>
        {boards && (
          <motion.div key="companies" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} transition={spring}>
            <CompaniesSection />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function CompaniesSection() {
  const industries = useApp((s) => s.industries);
  const selected = useApp((s) => s.selected);
  const custom = useApp((s) => s.custom);
  const set = useApp((s) => s.set);
  const [q, setQ] = useState("");
  const sel = useMemo(() => new Set(selected), [selected]);

  const toggleIndustry = (id: string) => {
    const on = industries.includes(id);
    const keys = DIRECTORY.filter((c) => c.industry === id).map(companyKey);
    set({
      industries: on ? industries.filter((x) => x !== id) : [...industries, id],
      selected: on ? selected.filter((k) => !keys.includes(k)) : [...new Set([...selected, ...keys])],
    });
  };
  const toggleCompany = (c: Company) => {
    const k = companyKey(c);
    set({ selected: sel.has(k) ? selected.filter((x) => x !== k) : [...selected, k] });
  };
  const results = q.trim().length > 1 ? [...custom, ...DIRECTORY].filter((c) => c.name.toLowerCase().includes(q.toLowerCase())).slice(0, 24) : [];

  return (
    <div className="space-y-8">
      <div>
        <Label title="Pick companies by industry" hint={`${DIRECTORY.length} companies with public job boards are built in. Tap an industry to add all of them.`} />
        <div className="flex flex-wrap gap-2">
          {INDUSTRIES.map((i) => (
            <ToggleChip key={i.id} on={industries.includes(i.id)} onClick={() => toggleIndustry(i.id)}>
              {i.label} <span className="opacity-50">{i.count}</span>
            </ToggleChip>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3 text-sm">
          <motion.span key={selected.length} initial={{ scale: 1.3, color: "var(--brand)" }} animate={{ scale: 1, color: "var(--ink)" }} className="font-display text-2xl font-bold">
            {selected.length}
          </motion.span>
          <span className="text-ink-2">companies selected</span>
          {selected.length > 0 && (
            <button onClick={() => set({ selected: [], industries: [] })} className="ml-auto text-sm font-semibold text-ink-3 hover:text-bad">
              Clear
            </button>
          )}
        </div>
      </div>

      <div>
        <Label title="Or search for specific companies" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search companies…" className="h-12 w-full rounded-2xl border border-line bg-card px-4 outline-none focus:border-brand focus:ring-4 focus:ring-brand/15" />
        <motion.div layout className="mt-3 flex flex-wrap gap-2">
          <AnimatePresence>
            {results.map((c) => (
              <motion.div key={companyKey(c)} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}>
                <ToggleChip on={sel.has(companyKey(c))} onClick={() => toggleCompany(c)}>
                  {c.name}
                </ToggleChip>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      </div>

      <AddCustom />
    </div>
  );
}

function AddCustom() {
  const custom = useApp((s) => s.custom);
  const selected = useApp((s) => s.selected);
  const set = useApp((s) => s.set);
  const [url, setUrl] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const add = () => {
    const parsed = parseBoardUrl(url);
    if (!parsed) {
      setErr("Paste a Greenhouse, Lever or Ashby job-board link, e.g. jobs.lever.co/acme");
      return;
    }
    const c: Company = { name: parsed.slug.replace(/[-_]/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()), industry: "custom", ...parsed };
    const k = companyKey(c);
    set({ custom: custom.some((x) => companyKey(x) === k) ? custom : [...custom, c], selected: selected.includes(k) ? selected : [...selected, k] });
    setUrl("");
    setErr(null);
  };

  return (
    <div className="rounded-3xl border border-dashed border-line p-5">
      <Label title="Add any company" hint="Paste its careers link if it uses Greenhouse, Lever or Ashby." />
      <div className="flex gap-2">
        <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="https://jobs.ashbyhq.com/yourcompany" className="h-11 min-w-0 flex-1 rounded-full border border-line bg-card px-4 text-sm outline-none focus:border-brand" />
        <Button onClick={add} size="md">
          Add
        </Button>
      </div>
      {err && <div className="mt-2 text-sm text-bad">{err}</div>}
      {custom.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {custom.map((c) => (
            <span key={companyKey(c)} className="inline-flex items-center gap-1 rounded-full bg-bg-2 py-1 pl-3 pr-1 text-sm">
              {c.name} <span className="text-xs text-ink-3">{c.ats}</span>
              <button className="grid h-6 w-6 place-items-center rounded-full hover:bg-card" aria-label={`Remove ${c.name}`} onClick={() => set({ custom: custom.filter((x) => x !== c), selected: selected.filter((k) => k !== companyKey(c)) })}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function parseBoardUrl(input: string): { ats: Ats; slug: string } | null {
  const s = input.trim();
  const m =
    s.match(/(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/(?:embed\/job_board\?for=)?([a-z0-9._-]+)/i) ??
    s.match(/boards-api\.greenhouse\.io\/v1\/boards\/([a-z0-9._-]+)/i);
  if (m) return { ats: "greenhouse", slug: m[1] };
  const l = s.match(/jobs\.(?:eu\.)?lever\.co\/([a-z0-9._-]+)/i);
  if (l) return { ats: "lever", slug: l[1] };
  const a = s.match(/jobs\.ashbyhq\.com\/([a-z0-9._%-]+)/i);
  if (a) return { ats: "ashby", slug: decodeURIComponent(a[1]) };
  return null;
}

export function ResumeSection() {
  const resume = useApp((s) => s.resume);
  const name = useApp((s) => s.name);
  const set = useApp((s) => s.set);
  const [drag, setDrag] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const readFile = async (file: File) => {
    setMsg(null);
    if (/\.(txt|md|markdown)$/i.test(file.name)) {
      set({ resume: await file.text() });
      setMsg(`Loaded ${file.name}`);
      return;
    }
    if (!/\.(pdf|docx)$/i.test(file.name)) {
      setMsg(/\.doc$/i.test(file.name) ? "Old .doc files aren't supported — save it as .docx or PDF." : "Upload a PDF, Word (.docx), .txt or .md file.");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/resume", { method: "POST", body: fd });
      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok || !data.text) throw new Error(data.error ?? "Couldn't read that file.");
      set({ resume: data.text });
      setMsg(`Loaded ${file.name} — check the text below and fix anything that came through oddly.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't read that file.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Label title="Your first name" hint="Used to personalize the app. Optional." />
        <input value={name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Alex" className="h-12 w-full max-w-sm rounded-2xl border border-line bg-card px-4 outline-none focus:border-brand focus:ring-4 focus:ring-brand/15" />
      </div>
      <div>
        <Label title="Your resume" hint="Upload a PDF or Word file, or paste the text. Each achievement should be on its own line starting with • or -. Your resume is only sent to the server to read the file or tailor it — never stored." />
        <motion.div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files[0];
            if (f) readFile(f);
          }}
          animate={{ scale: drag ? 1.02 : 1 }}
          transition={spring}
          className={clsx("relative rounded-3xl border-2 transition-colors", drag ? "border-brand bg-brand-soft" : "border-line bg-card")}
        >
          <textarea
            value={resume}
            onChange={(e) => set({ resume: e.target.value })}
            rows={12}
            placeholder={"Jane Doe — Product Manager\n\n• Led personalization roadmap for a 200K MAU app, lifting retention 23%\n• Ran 6 A/B tests on onboarding…"}
            className="block w-full resize-y rounded-3xl bg-transparent p-5 pb-16 font-mono text-sm leading-relaxed outline-none placeholder:text-ink-3"
          />
          <label className="absolute bottom-3 right-3 inline-flex cursor-pointer items-center gap-2 rounded-full bg-brand px-4 py-2 text-xs font-semibold text-brand-ink shadow-soft hover:brightness-110">
            {busy ? (
              <motion.span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }} />
            ) : (
              <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13V3M6 7l4-4 4 4M4 13v3h12v-3" /></svg>
            )}
            {busy ? "Reading…" : "Upload PDF / Word"}
            <input type="file" accept=".pdf,.docx,.txt,.md,.markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" className="hidden" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) readFile(f); }} />
          </label>
        </motion.div>
        <div className="mt-2 flex items-center justify-between text-xs text-ink-3">
          <span>{msg}</span>
          <span>{resume.trim() ? `${resume.trim().split(/\s+/).length} words` : ""}</span>
        </div>
      </div>
    </div>
  );
}

export function AiSection() {
  const ai = useApp((s) => s.ai);
  const set = useApp((s) => s.set);
  const [show, setShow] = useState(false);
  const upd = (p: Partial<typeof ai>) => set({ ai: { ...ai, ...p } });
  const key = ai.keys[ai.provider];
  const model = ai.models[ai.provider];
  const setKey = (v: string) => upd({ keys: { ...ai.keys, [ai.provider]: v } });
  const setModel = (v: string) => upd({ models: { ...ai.models, [ai.provider]: v } });
  const names: Record<AiProvider, string> = { gemini: "Gemini", openai: "OpenAI", anthropic: "Claude" };
  const links: Record<AiProvider, string> = {
    gemini: "https://aistudio.google.com/apikey",
    openai: "https://platform.openai.com/api-keys",
    anthropic: "https://console.anthropic.com/settings/keys",
  };
  return (
    <div className="space-y-5">
      <Label title="AI rewriting (optional)" hint="Bring your own key. Without one, Applywise still ranks your bullets and shows keyword gaps. Keys are stored only in this browser." />
      <Segmented<AiProvider>
        id="provider"
        value={ai.provider}
        onChange={(provider) => upd({ provider })}
        options={(["gemini", "openai", "anthropic"] as AiProvider[]).map((p) => ({
          value: p,
          label: (
            <span className="inline-flex items-center gap-1.5">
              {names[p]}
              {ai.keys[p] && <span className="h-1.5 w-1.5 rounded-full bg-good" aria-label="key saved" />}
            </span>
          ),
          hint: ai.keys[p] ? `${names[p]} key saved${p === ai.provider ? " — used for tailoring" : ""}` : `No ${names[p]} key yet`,
        }))}
      />
      <p className="text-xs text-ink-3">
        Each provider keeps its own key. Tailoring uses the selected one: <b className="text-ink-2">{names[ai.provider]}</b>
        {key ? "." : " — paste its key below."}
      </p>
      <div className="flex gap-2">
        <input
          type={show ? "text" : "password"}
          value={key}
          onChange={(e) => setKey(e.target.value.trim())}
          placeholder={`Paste your ${names[ai.provider]} API key`}
          autoComplete="off"
          className="h-12 min-w-0 flex-1 rounded-2xl border border-line bg-card px-4 font-mono text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
        />
        <Button variant="soft" onClick={() => setShow((v) => !v)}>
          {show ? "Hide" : "Show"}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <a href={links[ai.provider]} target="_blank" rel="noreferrer" className="font-semibold text-brand hover:underline">
          Get a key ↗
        </a>
        <span className="text-ink-3">·</span>
        <label className="flex items-center gap-2 text-ink-2">
          Model
          <input value={model} onChange={(e) => setModel(e.target.value)} placeholder={DEFAULT_MODELS[ai.provider]} className="h-9 w-52 rounded-xl border border-line bg-card px-3 font-mono text-xs outline-none focus:border-brand" />
        </label>
      </div>
    </div>
  );
}

function Slider({ value, min, max, step = 1, onChange, format }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format: (v: number) => string }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="relative h-10">
        <div className="absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2 rounded-full bg-bg-2" />
        <motion.div className="absolute left-0 top-1/2 h-2.5 -translate-y-1/2 rounded-full bg-brand" animate={{ width: `${pct}%` }} transition={spring} />
        <motion.div className="pointer-events-none absolute top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-brand bg-card shadow-soft" animate={{ left: `${pct}%` }} transition={{ type: "spring", stiffness: 500, damping: 28 }} />
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="absolute inset-0 w-full cursor-pointer opacity-0" aria-valuetext={format(value)} />
      </div>
      <motion.div key={value} initial={{ y: -4, opacity: 0.5 }} animate={{ y: 0, opacity: 1 }} className="mt-1 text-sm font-semibold text-ink-2">
        {format(value)}
      </motion.div>
    </div>
  );
}
