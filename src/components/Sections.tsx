"use client";

import { clsx } from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { companyKey, useApp } from "@/lib/store";
import { DEFAULT_MODELS } from "@/lib/engine/tailor";
import type { AiProvider, Ats, Company, WorkMode } from "@/lib/types";
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
        <Label title="Pick industries" hint={`A starter directory of ${DIRECTORY.length} companies with public job boards. Tap to add all companies in an industry.`} />
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

  const readFile = async (file: File) => {
    if (/\.(txt|md|markdown)$/i.test(file.name) || file.type.startsWith("text/")) {
      set({ resume: await file.text() });
      setMsg(`Loaded ${file.name}`);
    } else setMsg("For now, upload .txt or .md — or paste your resume text directly.");
  };

  return (
    <div className="space-y-6">
      <div>
        <Label title="Your first name" hint="Used to personalize the app. Optional." />
        <input value={name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Alex" className="h-12 w-full max-w-sm rounded-2xl border border-line bg-card px-4 outline-none focus:border-brand focus:ring-4 focus:ring-brand/15" />
      </div>
      <div>
        <Label title="Your resume" hint="Paste the text, or drop a .txt/.md file. Put each achievement on its own line starting with • or -. It never leaves your browser except when you tailor." />
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
            className="block w-full resize-y rounded-3xl bg-transparent p-5 font-mono text-sm leading-relaxed outline-none placeholder:text-ink-3"
          />
          <label className="absolute bottom-3 right-3 cursor-pointer rounded-full bg-bg-2 px-3 py-1.5 text-xs font-semibold text-ink-2 hover:bg-line">
            Upload file
            <input type="file" accept=".txt,.md,.markdown,text/plain" className="hidden" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
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
        onChange={(provider) => upd({ provider, model: "" })}
        options={[
          { value: "gemini", label: "Gemini" },
          { value: "openai", label: "OpenAI" },
          { value: "anthropic", label: "Claude" },
        ]}
      />
      <div className="flex gap-2">
        <input
          type={show ? "text" : "password"}
          value={ai.apiKey}
          onChange={(e) => upd({ apiKey: e.target.value.trim() })}
          placeholder="Paste API key"
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
          <input value={ai.model} onChange={(e) => upd({ model: e.target.value })} placeholder={DEFAULT_MODELS[ai.provider]} className="h-9 w-52 rounded-xl border border-line bg-card px-3 font-mono text-xs outline-none focus:border-brand" />
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
