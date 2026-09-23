"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useApp } from "@/lib/store";
import { AiSection, LookSection, ResumeSection, RolesSection, WhereSection } from "./Sections";
import { Button, Magnetic } from "./ui";

const STEPS = [
  { title: "What are you looking for?", sub: "Roles and seniority", body: <RolesSection /> },
  { title: "Where and how?", sub: "Location, remote, freshness", body: <WhereSection /> },
  { title: "Where should we look?", sub: "Company boards, JSearch, Apify", body: <LookSection /> },
  {
    title: "Your resume",
    sub: "So we can score and tailor",
    body: (
      <div className="space-y-10">
        <ResumeSection />
        <AiSection />
      </div>
    ),
  },
];

export default function Setup() {
  const [[step, dir], setStep] = useState<[number, number]>([0, 1]);
  const f = useApp((s) => s.filters);
  const selected = useApp((s) => s.selected);
  const sources = useApp((s) => s.sources);
  const hasSource = (sources.boards && selected.length > 0) || (sources.jsearch.enabled && !!sources.jsearch.apiKey) || (sources.apify.enabled && !!sources.apify.token);
  const set = useApp((s) => s.set);

  const canNext = step === 0 ? f.roles.length > 0 : step === 2 ? hasSource : true;
  const go = (d: number) => setStep(([s]) => [Math.max(0, Math.min(STEPS.length - 1, s + d)), d]);
  const finish = () => set({ onboarded: true, view: "discover", lastScan: null });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-32 pt-8 sm:px-6">
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <button key={s.title} onClick={() => i < step && setStep([i, -1])} className="group flex-1 text-left" aria-label={`Step ${i + 1}: ${s.sub}`}>
            <div className="h-2 overflow-hidden rounded-full bg-bg-2">
              <motion.div className="h-full rounded-full bg-brand" initial={false} animate={{ width: i < step ? "100%" : i === step ? "50%" : "0%" }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
            </div>
            <div className={`mt-2 hidden text-xs font-semibold sm:block ${i <= step ? "text-ink" : "text-ink-3"}`}>{s.sub}</div>
          </button>
        ))}
      </div>

      <div className="relative mt-10">
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div
            key={step}
            custom={dir}
            variants={{
              enter: (d: number) => ({ x: d * 80, opacity: 0, rotate: d * 1.5 }),
              center: { x: 0, opacity: 1, rotate: 0 },
              exit: (d: number) => ({ x: d * -80, opacity: 0, rotate: d * -1.5 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            <div className="mb-8">
              <div className="text-sm font-bold text-brand">
                Step {step + 1} of {STEPS.length}
              </div>
              <h1 className="font-display text-4xl font-bold sm:text-5xl">{STEPS[step].title}</h1>
            </div>
            {STEPS[step].body}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Button variant="ghost" onClick={() => (step === 0 ? set({ view: "home" }) : go(-1))}>
            ← Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Magnetic>
              <Button onClick={() => go(1)} disabled={!canNext}>
                {canNext ? "Continue →" : step === 0 ? "Add a role to continue" : "Pick companies or add a key to continue"}
              </Button>
            </Magnetic>
          ) : (
            <Magnetic>
              <Button variant="lime" size="lg" onClick={finish}>
                Find my jobs ✦
              </Button>
            </Magnetic>
          )}
        </div>
      </div>
    </div>
  );
}
