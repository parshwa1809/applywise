"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { AiSection, LookSection, ResumeSection, RolesSection, WhereSection } from "./Sections";
import { Button, Segmented } from "./ui";

type Tab = "search" | "companies" | "resume" | "data";

export default function Settings() {
  const [tab, setTab] = useState<Tab>(() => useApp.getState().settingsTab);
  // a deep link (e.g. "Add JSearch / Apify") only applies once
  useEffect(() => {
    useApp.setState({ settingsTab: "search" });
  }, []);
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-6">
      <h1 className="font-display text-4xl font-bold sm:text-5xl">Settings</h1>
      <p className="mt-1 text-ink-2">Changes apply on your next scan.</p>
      <div className="no-scrollbar mt-6 overflow-x-auto">
        <Segmented<Tab>
          id="settings"
          value={tab}
          onChange={setTab}
          options={[
            { value: "search", label: "Search" },
            { value: "companies", label: "Sources" },
            { value: "resume", label: "Resume & AI" },
            { value: "data", label: "Data" },
          ]}
        />
      </div>
      <motion.div key={tab} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 300, damping: 28 }} className="mt-8">
        {tab === "search" && (
          <div className="space-y-12">
            <RolesSection />
            <WhereSection />
          </div>
        )}
        {tab === "companies" && <LookSection />}
        {tab === "resume" && (
          <div className="space-y-12">
            <ResumeSection />
            <AiSection />
          </div>
        )}
        {tab === "data" && <DataSection />}
      </motion.div>
    </div>
  );
}

function DataSection() {
  const resetAll = useApp((s) => s.resetAll);
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const exportData = () => {
    const { ai, sources, ...rest } = useApp.getState();
    // never put keys in a backup file
    const data = JSON.parse(JSON.stringify({ ...rest, ai: { ...ai, keys: { gemini: "", openai: "", anthropic: "" } }, sources: { ...sources, jsearch: { ...sources.jsearch, apiKey: "" }, apify: { ...sources.apify, token: "" } } }));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    a.download = `applywise-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };
  const importData = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      const keep = ["name", "resume", "filters", "industries", "selected", "custom", "jobs", "status", "tailor", "notes", "lastScan", "onboarded"];
      const patch = Object.fromEntries(Object.entries(data).filter(([k]) => keep.includes(k)));
      useApp.setState(patch);
      setMsg("Backup restored.");
    } catch {
      setMsg("That file doesn't look like an Applywise backup.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-line bg-card p-5">
        <div className="font-display text-lg font-bold">Your data stays with you</div>
        <p className="mt-1 text-sm text-ink-2">Everything — resume, saved jobs, tailored versions, API keys — lives in this browser&apos;s storage. Keys are sent only with the request that uses them and are never saved on a server. Backups leave keys out.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button variant="soft" onClick={exportData}>
          ↓ Export backup
        </Button>
        <label className="inline-flex h-11 cursor-pointer items-center rounded-full border border-line bg-card px-5 text-[15px] font-semibold hover:bg-bg-2">
          ↑ Import backup
          <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])} />
        </label>
      </div>
      {msg && <div className="text-sm text-ink-2">{msg}</div>}
      <div className="rounded-3xl border border-bad/30 p-5">
        <div className="font-semibold text-bad">Reset everything</div>
        <p className="mt-1 text-sm text-ink-2">Clears your resume, filters, saved jobs and key from this browser.</p>
        <div className="mt-3">
          {confirm ? (
            <div className="flex gap-2">
              <Button variant="ink" className="!bg-bad !text-white" onClick={() => resetAll()}>
                Yes, erase it all
              </Button>
              <Button variant="ghost" onClick={() => setConfirm(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button variant="soft" onClick={() => setConfirm(true)}>
              Reset…
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
