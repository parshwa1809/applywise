"use client";

import { AnimatePresence, motion, useMotionTemplate, useMotionValue, useSpring } from "motion/react";
import { useState, type ReactNode } from "react";
import { useApp } from "@/lib/store";
import { DIRECTORY } from "@/lib/useScan";
import PhysicsField from "./PhysicsField";
import { Button, Magnetic } from "./ui";

const WORDS = ["real", "fresh", "live", "right"];

export default function Home() {
  const onboarded = useApp((s) => s.onboarded);
  const set = useApp((s) => s.set);
  const [popped, setPopped] = useState(0);
  const [w, setW] = useState(0);

  return (
    <div className="relative">
      <section className="relative mx-auto max-w-7xl px-4 pt-10 sm:px-6 sm:pt-16">
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 120, damping: 20 }} className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1 text-sm font-semibold text-ink-2">
            <span className="h-2 w-2 rounded-full bg-good" /> Free & open source · {DIRECTORY.length} companies built in
          </div>
          <h1 className="mt-5 font-display text-5xl font-extrabold leading-[0.95] sm:text-7xl">
            Apply to{" "}
            <span className="relative inline-block" onMouseEnter={() => setW((x) => (x + 1) % WORDS.length)}>
              <AnimatePresence mode="popLayout">
                <motion.span key={w} initial={{ y: "60%", opacity: 0, rotate: -6 }} animate={{ y: 0, opacity: 1, rotate: 0 }} exit={{ y: "-60%", opacity: 0, rotate: 6 }} transition={{ type: "spring", stiffness: 300, damping: 20 }} className="inline-block text-brand">
                  {WORDS[w]}
                </motion.span>
              </AnimatePresence>
              <motion.svg viewBox="0 0 200 20" className="absolute -bottom-2 left-0 w-full" preserveAspectRatio="none">
                <motion.path d="M2 14 Q 50 2 100 12 T 198 8" fill="none" stroke="var(--lime)" strokeWidth="6" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.5, duration: 0.8 }} />
              </motion.svg>
            </span>{" "}
            jobs.
            <br />
            Skip the ghosts.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-ink-2">
            Applywise scans company job boards, JSearch and Apify, flags stale and evergreen listings, scores every role against your resume, and tailors it — without ever inventing a fact.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Magnetic strength={0.4}>
              <Button size="lg" onClick={() => set({ view: onboarded ? "discover" : "setup" })}>
                {onboarded ? "Open my deck →" : "Set up in 2 minutes →"}
              </Button>
            </Magnetic>
            <Magnetic>
              <Button size="lg" variant="soft" onClick={() => document.getElementById("how")?.scrollIntoView({ behavior: "smooth" })}>
                How it works
              </Button>
            </Magnetic>
          </div>
        </motion.div>

        <div className="relative mt-10 h-[440px] overflow-hidden rounded-[36px] border border-line bg-bg-2 grain sm:h-[520px]">
          <PhysicsField className="absolute inset-0 h-full w-full" onPop={setPopped} />
          <div className="pointer-events-none absolute left-5 top-5 rounded-2xl bg-card/90 px-4 py-3 shadow-soft backdrop-blur">
            <div className="text-xs font-bold uppercase tracking-wider text-ink-3">Ghost jobs popped</div>
            <motion.div key={popped} initial={{ scale: 1.5, color: "var(--coral)" }} animate={{ scale: 1, color: "var(--ink)" }} transition={{ type: "spring", stiffness: 400, damping: 15 }} className="font-display text-3xl font-extrabold">
              {popped}
            </motion.div>
          </div>
          <div className="pointer-events-none absolute bottom-5 right-5 hidden rounded-full bg-ink px-4 py-2 text-sm font-semibold text-bg sm:block">Drag, fling, and pop the dashed ghosts</div>
        </div>
      </section>

      <section id="how" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-24 sm:px-6">
        <h2 className="font-display text-4xl font-bold sm:text-5xl">How it works</h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          <TiltCard n="01" title="Scan the source" color="var(--sky)">
            Reads Greenhouse, Lever and Ashby boards directly, and plugs into JSearch (Indeed, ZipRecruiter, Dice…) and Apify career-site feeds with your own key.
          </TiltCard>
          <TiltCard n="02" title="Swipe with signal" color="var(--lime)">
            Each card shows your match score, the skills you have vs. they want, and ghost-job signals like age, thin descriptions or talent-pool wording.
          </TiltCard>
          <TiltCard n="03" title="Tailor honestly" color="var(--coral)">
            Flick a card up and your resume is rewritten in the job&apos;s language. Any number not in your original gets flagged, so nothing made-up slips through.
          </TiltCard>
        </div>
        <div className="mt-16 rounded-[36px] bg-ink p-8 text-bg sm:p-12">
          <div className="grid gap-8 md:grid-cols-3">
            <Stat k="3" v="sources — company boards, JSearch, Apify" />
            <Stat k="100%" v="of your data stays in your browser" />
            <Stat k="BYO" v="AI key — Gemini, OpenAI or Claude, optional" />
          </div>
        </div>
      </section>
    </div>
  );
}

function TiltCard({ n, title, color, children }: { n: string; title: string; color: string; children: ReactNode }) {
  const rx = useSpring(useMotionValue(0), { stiffness: 200, damping: 18 });
  const ry = useSpring(useMotionValue(0), { stiffness: 200, damping: 18 });
  const gx = useMotionValue(50);
  const gy = useMotionValue(50);
  const glare = useMotionTemplate`radial-gradient(circle at ${gx}% ${gy}%, rgba(255,255,255,0.16), transparent 55%)`;
  return (
    <motion.div
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 900 }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        ry.set((px - 0.5) * 16);
        rx.set(-(py - 0.5) * 16);
        gx.set(px * 100);
        gy.set(py * 100);
      }}
      onPointerLeave={() => {
        rx.set(0);
        ry.set(0);
      }}
      whileHover={{ y: -6 }}
      className="relative overflow-hidden rounded-[30px] border border-line bg-card p-7 shadow-soft"
    >
      <motion.div className="pointer-events-none absolute inset-0" style={{ background: glare }} />
      <div className="grid h-12 w-12 place-items-center rounded-2xl font-display text-lg font-extrabold text-[#17151f]" style={{ background: color }}>
        {n}
      </div>
      <h3 className="mt-5 font-display text-2xl font-bold">{title}</h3>
      <p className="mt-2 text-ink-2">{children}</p>
    </motion.div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ type: "spring", stiffness: 120, damping: 18 }}>
      <div className="font-display text-5xl font-extrabold text-lime">{k}</div>
      <div className="mt-1 opacity-80">{v}</div>
    </motion.div>
  );
}
