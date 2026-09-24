"use client";

import { clsx } from "clsx";
import { motion, useMotionValue, useSpring, AnimatePresence } from "motion/react";
import { useEffect, useRef, useState, type ReactNode, type KeyboardEvent } from "react";

export const spring = { type: "spring", stiffness: 420, damping: 32, mass: 0.8 } as const;
export const softSpring = { type: "spring", stiffness: 200, damping: 24 } as const;

/** Pulls its child toward the cursor with a spring, then snaps back. */
export function Magnetic({ children, strength = 0.35, className }: { children: ReactNode; strength?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useSpring(0, { stiffness: 260, damping: 18, mass: 0.6 });
  const y = useSpring(0, { stiffness: 260, damping: 18, mass: 0.6 });
  return (
    <motion.div
      ref={ref}
      className={clsx("inline-block", className)}
      style={{ x, y }}
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse") return;
        const r = ref.current!.getBoundingClientRect();
        x.set((e.clientX - (r.left + r.width / 2)) * strength);
        y.set((e.clientY - (r.top + r.height / 2)) * strength);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}

type BtnProps = {
  children: ReactNode;
  onClick?: () => void;
  variant?: "brand" | "ghost" | "ink" | "lime" | "soft";
  size?: "sm" | "md" | "lg";
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
  title?: string;
};

export function Button({ children, onClick, variant = "brand", size = "md", className, disabled, type = "button", title }: BtnProps) {
  return (
    <motion.button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      whileHover={disabled ? undefined : { y: -2, scale: 1.02 }}
      whileTap={disabled ? undefined : { scale: 0.94, y: 1 }}
      transition={spring}
      className={clsx(
        "relative inline-flex select-none items-center justify-center gap-2 rounded-full font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        size === "sm" && "h-9 px-4 text-sm",
        size === "md" && "h-11 px-5 text-[15px]",
        size === "lg" && "h-14 px-7 text-base",
        variant === "brand" && "bg-brand text-brand-ink shadow-soft hover:brightness-110",
        variant === "ink" && "bg-ink text-bg shadow-soft",
        variant === "lime" && "bg-lime text-[#17151f] shadow-soft",
        variant === "ghost" && "bg-transparent text-ink hover:bg-bg-2",
        variant === "soft" && "border border-line bg-card text-ink hover:bg-bg-2",
        className,
      )}
    >
      {children}
    </motion.button>
  );
}

/** Segmented control with a spring-animated pill that slides between options. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  id,
  className,
}: {
  options: { value: T; label: ReactNode; hint?: string }[];
  value: T;
  onChange: (v: T) => void;
  id: string;
  className?: string;
}) {
  const [hover, setHover] = useState<T | null>(null);
  return (
    <div className={clsx("relative inline-flex rounded-full border border-line bg-card p-1", className)} role="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <div key={o.value} className="relative" onPointerEnter={() => o.hint && setHover(o.value)} onPointerLeave={() => setHover(null)}>
            <button
              role="tab"
              aria-selected={active}
              aria-describedby={o.hint ? `${id}-${o.value}-hint` : undefined}
              onClick={() => onChange(o.value)}
              onFocus={() => o.hint && setHover(o.value)}
              onBlur={() => setHover(null)}
              className={clsx("relative z-10 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors", active ? "text-brand-ink" : "text-ink-2 hover:text-ink")}
            >
              {active && <motion.span layoutId={`seg-${id}`} className="absolute inset-0 -z-10 rounded-full bg-brand" transition={spring} />}
              {o.label}
            </button>
            <AnimatePresence>
              {o.hint && hover === o.value && (
                <motion.div
                  id={`${id}-${o.value}-hint`}
                  role="tooltip"
                  initial={{ opacity: 0, y: -6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.96 }}
                  transition={{ type: "spring", stiffness: 500, damping: 32 }}
                  className="pointer-events-none absolute left-1/2 top-full z-50 mt-2.5 w-60 -translate-x-1/2 rounded-xl bg-ink px-3 py-2 text-left text-xs font-medium leading-relaxed text-bg shadow-lift"
                >
                  <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-ink" />
                  {o.hint}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

/** Multi-select toggle chips. */
export function ToggleChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <motion.button
      layout
      onClick={onClick}
      whileTap={{ scale: 0.9 }}
      transition={spring}
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
        on ? "border-transparent bg-ink text-bg" : "border-line bg-card text-ink-2 hover:border-ink-3 hover:text-ink",
      )}
    >
      <AnimatePresence initial={false}>
        {on && (
          <motion.svg initial={{ width: 0, opacity: 0 }} animate={{ width: 14, opacity: 1 }} exit={{ width: 0, opacity: 0 }} viewBox="0 0 16 16" className="h-3.5">
            <path d="M3 8.5l3.2 3L13 4.5" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </motion.svg>
        )}
      </AnimatePresence>
      {children}
    </motion.button>
  );
}

/** Type-and-enter tag input with springy chips. */
export function TagInput({
  values,
  onChange,
  placeholder,
  suggestions = [],
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  suggestions?: string[];
}) {
  const [draft, setDraft] = useState("");
  const add = (v: string) => {
    // stray punctuation ("manager,") would silently change what a tag matches
    const t = v.replace(/^[\s,;.|/]+|[\s,;.|/]+$/g, "").trim();
    if (t && !values.some((x) => x.toLowerCase() === t.toLowerCase())) onChange([...values, t]);
    setDraft("");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && !draft && values.length) onChange(values.slice(0, -1));
  };
  const rest = suggestions.filter((s) => !values.some((v) => v.toLowerCase() === s.toLowerCase()));
  return (
    <div>
      <div className="flex min-h-14 flex-wrap items-center gap-2 rounded-2xl border border-line bg-card p-2.5 focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15">
        <AnimatePresence initial={false}>
          {values.map((v) => (
            <motion.span
              key={v}
              layout
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={spring}
              className="inline-flex items-center gap-1 rounded-full bg-brand-soft py-1 pl-3 pr-1.5 text-sm font-semibold text-brand"
            >
              {v}
              <button aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))} className="grid h-5 w-5 place-items-center rounded-full hover:bg-brand/15">
                ×
              </button>
            </motion.span>
          ))}
        </AnimatePresence>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={() => draft && add(draft)}
          placeholder={values.length ? "Add another…" : placeholder}
          className="min-w-[10rem] flex-1 bg-transparent px-2 py-1 text-[15px] outline-none placeholder:text-ink-3"
        />
      </div>
      {rest.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {rest.slice(0, 10).map((s) => (
            <motion.button
              key={s}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => add(s)}
              className="rounded-full border border-dashed border-line px-3 py-1 text-xs font-medium text-ink-2 hover:border-brand hover:text-brand"
            >
              + {s}
            </motion.button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={clsx("relative h-7 w-12 rounded-full transition-colors", on ? "bg-brand" : "bg-line")}>
      <motion.span
        className="absolute top-1 h-5 w-5 rounded-full bg-white shadow"
        animate={{ left: on ? 24 : 4 }}
        whileTap={{ width: 26 }}
        transition={{ type: "spring", stiffness: 700, damping: 30 }}
      />
    </button>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" | "brand" }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        tone === "neutral" && "bg-bg-2 text-ink-2",
        tone === "good" && "bg-good/15 text-good",
        tone === "warn" && "bg-warn/15 text-warn",
        tone === "bad" && "bg-bad/15 text-bad",
        tone === "brand" && "bg-brand-soft text-brand",
      )}
    >
      {children}
    </span>
  );
}

/** Animated count-up number. */
export function Ticker({ value, className }: { value: number; className?: string }) {
  const mv = useMotionValue(0);
  const sp = useSpring(mv, { stiffness: 90, damping: 20 });
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    mv.set(value);
  }, [mv, value]);
  useEffect(
    () =>
      sp.on("change", (v) => {
        if (ref.current) ref.current.textContent = Math.round(v).toLocaleString();
      }),
    [sp],
  );
  return (
    <span ref={ref} className={clsx("tabular-nums", className)}>
      0
    </span>
  );
}

export function MatchRing({ value, size = 56 }: { value: number; size?: number }) {
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const color = value >= 70 ? "var(--good)" : value >= 45 ? "var(--amber)" : "var(--coral)";
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--line)" strokeWidth="5" fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth="5"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - value / 100) }}
          transition={{ type: "spring", stiffness: 60, damping: 16, delay: 0.15 }}
        />
      </svg>
      <span className="absolute font-display text-sm font-bold">{value}</span>
    </div>
  );
}
