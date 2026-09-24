export interface Funnel {
  total: number;
  title: number;
  location: number;
  age: number;
  experience: number;
  overYears?: { company: string; title: string; years: number }[];
}

/** One short line on why company boards added nothing, e.g. "the 4 fresh matches need 5+ years (your limit is 4)". */
export function explainFunnel(f: Funnel, ctx: { maxYears?: number; maxAgeDays?: number } = {}) {
  const lead = "No company-board jobs match your filters";
  if (f.total === 0) return `${lead}.`;
  if (f.title === 0) return `${lead} — every one contains an excluded title word. Remove some in Settings → Search.`;
  if (f.location === 0) return `${lead} — none in your locations. Add cities or work modes in Settings → Search.`;
  if (f.age === 0) return `${lead} — none posted${ctx.maxAgeDays ? ` in the last ${ctx.maxAgeDays} days` : " recently"}. Widen “Posted within” in Settings → Search.`;
  if (f.experience === 0) {
    const need = f.overYears?.length ? Math.min(...f.overYears.map((j) => j.years)) : undefined;
    return `${lead} — the ${f.age} fresh one${f.age === 1 ? "" : "s"} need${f.age === 1 ? "s" : ""} ${need ? `${need}+` : "more"} years${ctx.maxYears ? ` (your limit is ${ctx.maxYears})` : ""}. Raise it in Settings → Search to see them.`;
  }
  return `${lead}.`;
}
