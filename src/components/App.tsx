"use client";

import { clsx } from "clsx";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { useEffect, useState } from "react";
import { useApp, type View } from "@/lib/store";
import Board from "./Board";
import Discover from "./Discover";
import Home from "./Home";
import JobDrawer from "./JobDrawer";
import Settings from "./Settings";
import Setup from "./Setup";
import { spring } from "./ui";

export default function App() {
  const [ready, setReady] = useState(false);
  const view = useApp((s) => s.view);
  const theme = useApp((s) => s.theme);

  useEffect(() => {
    // wait for persisted state before first paint of app views (avoids flashing onboarding)
    const done = () => setReady(true);
    if (useApp.persist.hasHydrated()) done();
    return useApp.persist.onFinishHydration(done);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [view]);

  return (
    <MotionConfig reducedMotion="user">
      <Nav />
      <main className="min-h-[calc(100vh-72px)]">
        {ready && (
          <AnimatePresence mode="wait">
            <motion.div key={view} initial={{ opacity: 0, y: 14, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -10, filter: "blur(4px)" }} transition={{ duration: 0.22 }}>
              {view === "home" && <Home />}
              {view === "setup" && <Setup />}
              {view === "discover" && <Discover />}
              {view === "board" && <Board />}
              {view === "settings" && <Settings />}
            </motion.div>
          </AnimatePresence>
        )}
      </main>
      <JobDrawer />
    </MotionConfig>
  );
}

function Nav() {
  const view = useApp((s) => s.view);
  const onboarded = useApp((s) => s.onboarded);
  const status = useApp((s) => s.status);
  const set = useApp((s) => s.set);
  const saved = Object.values(status).filter((s) => s !== "skipped").length;
  const tabs: { id: View; label: string; badge?: number }[] = onboarded
    ? [
        { id: "discover", label: "Discover" },
        { id: "board", label: "Board", badge: saved },
        { id: "settings", label: "Settings" },
      ]
    : [];

  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center gap-3 px-4 sm:px-6">
        <button onClick={() => set({ view: "home" })} className="group flex items-center gap-2.5" aria-label="Applywise home">
          <Logo />
          <span className="hidden font-display text-xl font-extrabold tracking-tight sm:inline">applywise</span>
        </button>
        <nav className="ml-auto flex min-w-0 items-center gap-0.5 sm:ml-8 sm:mr-auto sm:gap-1">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => set({ view: t.id })} className={clsx("relative rounded-full px-3 py-2 text-sm font-semibold transition-colors sm:px-4", view === t.id ? "text-bg" : "text-ink-2 hover:text-ink")}>
              {view === t.id && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-full bg-ink" transition={spring} />}
              <span className="relative flex items-center gap-1.5">
                {t.label}
                <AnimatePresence>
                  {!!t.badge && (
                    <motion.span key={t.badge} initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ type: "spring", stiffness: 600, damping: 15 }} className="grid h-5 min-w-5 place-items-center rounded-full bg-lime px-1 text-[11px] font-bold text-[#17151f]">
                      {t.badge}
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
            </button>
          ))}
        </nav>
        <ThemeToggle />
      </div>
    </header>
  );
}

function Logo() {
  return (
    <motion.svg viewBox="0 0 32 32" className="h-9 w-9" whileHover={{ rotate: -12, scale: 1.1 }} whileTap={{ scale: 0.85, rotate: 20 }} transition={{ type: "spring", stiffness: 400, damping: 12 }}>
      <rect x="2" y="2" width="28" height="28" rx="9" fill="var(--brand)" />
      <motion.path d="M9 17.5l4.5 4.5L23 11" fill="none" stroke="var(--lime)" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.7, delay: 0.2 }} />
    </motion.svg>
  );
}

function ThemeToggle() {
  const theme = useApp((s) => s.theme);
  const set = useApp((s) => s.set);
  const dark = theme === "dark";
  return (
    <motion.button whileTap={{ scale: 0.85 }} onClick={() => set({ theme: dark ? "light" : "dark" })} aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} className="grid h-10 w-10 place-items-center overflow-hidden rounded-full border border-line bg-card">
      <AnimatePresence mode="wait" initial={false}>
        <motion.svg key={theme} viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" initial={{ y: 20, rotate: -90, opacity: 0 }} animate={{ y: 0, rotate: 0, opacity: 1 }} exit={{ y: -20, rotate: 90, opacity: 0 }} transition={spring}>
          {dark ? <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /> : <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>}
        </motion.svg>
      </AnimatePresence>
    </motion.button>
  );
}
