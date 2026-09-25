"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { confetti } from "./Confetti";
import { CompanyAvatar } from "./JobCard";
import { Button, spring } from "./ui";

const EXPIRES_MS = 24 * 3_600_000;

/**
 * After you open a posting and come back to Applywise, one tap moves it to Applied.
 * We ask instead of moving it automatically: opening a posting doesn't always mean you applied.
 */
export default function ApplyPrompt() {
  const pending = useApp((s) => s.pendingApply);
  const job = useApp((s) => (s.pendingApply ? s.jobs[s.pendingApply.id] : undefined));
  const status = useApp((s) => (s.pendingApply ? s.status[s.pendingApply.id] : undefined));
  // shown once the user returns to this tab (or reopens the app later) for this particular click
  const [backAt, setBackAt] = useState<string | null>(() => useApp.getState().pendingApply?.at ?? null);

  useEffect(() => {
    if (!pending) return;
    const onBack = () => {
      if (document.visibilityState === "visible") setBackAt(pending.at);
    };
    window.addEventListener("focus", onBack);
    document.addEventListener("visibilitychange", onBack);
    return () => {
      window.removeEventListener("focus", onBack);
      document.removeEventListener("visibilitychange", onBack);
    };
  }, [pending]);

  useEffect(() => {
    if (!pending) return;
    const expired = Date.now() - Date.parse(pending.at) > EXPIRES_MS;
    if (expired || !job || status === "applied" || status === "interview") useApp.setState({ pendingApply: null });
  }, [pending, job, status]);

  const clear = () => useApp.setState({ pendingApply: null });
  const show = pending && backAt === pending.at && job && status !== "applied" && status !== "interview";

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          role="status"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={spring}
          className="fixed inset-x-3 bottom-4 z-50 mx-auto flex max-w-xl flex-wrap items-center gap-3 rounded-2xl border border-line bg-card p-3 shadow-lg sm:flex-nowrap"
        >
          <CompanyAvatar name={job.company} size={36} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold">Did you apply?</div>
            <div className="truncate text-sm text-ink-2">
              {job.title} at {job.company}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="lime"
              onClick={() => {
                useApp.getState().setStatus(job.id, "applied");
                clear();
                confetti(undefined, 140);
              }}
            >
              Yes, move to Applied
            </Button>
            <Button size="sm" variant="ghost" onClick={clear}>
              Not yet
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
