import { describe, expect, it } from "vitest";
import { cardFlag, closedPostings, sortColumn, tidy, weeklySummary } from "../src/lib/board";
import type { Job } from "../src/lib/types";

const DAY = 86_400_000;
const NOW = Date.parse("2026-09-25T12:00:00Z");
const ago = (d: number) => new Date(NOW - d * DAY).toISOString();

const job = (id: string, over: Partial<Job> = {}): Job => ({
  id,
  company: "Acme",
  industry: "Tech",
  ats: id.split(":")[0] as Job["ats"],
  title: `Product Manager ${id}`,
  location: "Remote",
  workMode: "remote",
  postedAt: ago(3),
  url: "https://example.com",
  description: "",
  salary: null,
  minYears: null,
  match: 80,
  matched: [],
  missing: [],
  ghost: { score: 0, level: "low", signals: [] },
  ...over,
});

describe("closedPostings", () => {
  it("flags only jobs missing from a board that answered", () => {
    const tracked = ["greenhouse:acme:1", "greenhouse:acme:2", "lever:beta:9", "jsearch:x:1"];
    const r = closedPostings(tracked, [{ key: "greenhouse:acme", ids: ["greenhouse:acme:1"] }]);
    expect(r.closed).toEqual(["greenhouse:acme:2"]);
    expect(r.open).toEqual(["greenhouse:acme:1"]);
  });
});

describe("tidy", () => {
  it("archives stale saved, no-reply applied, and closed saved/tailored — never interviews", () => {
    const jobs = Object.fromEntries(["greenhouse:a:1", "greenhouse:a:2", "greenhouse:a:3", "greenhouse:a:4", "greenhouse:a:5", "greenhouse:a:6"].map((id) => [id, job(id)]));
    const out = tidy(
      {
        jobs,
        status: { "greenhouse:a:1": "saved", "greenhouse:a:2": "saved", "greenhouse:a:3": "applied", "greenhouse:a:4": "applied", "greenhouse:a:5": "tailored", "greenhouse:a:6": "interview" },
        statusAt: { "greenhouse:a:1": ago(15), "greenhouse:a:2": ago(5), "greenhouse:a:3": ago(31), "greenhouse:a:4": ago(10), "greenhouse:a:5": ago(1), "greenhouse:a:6": ago(90) },
        closed: { "greenhouse:a:5": ago(0), "greenhouse:a:6": ago(0) },
      },
      NOW,
    );
    expect(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.reason]))).toEqual({
      "greenhouse:a:1": "stale",
      "greenhouse:a:3": "noreply",
      "greenhouse:a:5": "closed",
    });
    expect(out["greenhouse:a:3"].from).toBe("applied");
  });

  it("merges the same role from two sources, keeping the furthest-along card", () => {
    const board = job("greenhouse:acme:1", { title: "Senior Product Manager" });
    const agg = job("jsearch:x:abc", { title: "Senior Product Manager", location: "United States" });
    const out = tidy({ jobs: { [board.id]: board, [agg.id]: agg }, status: { [board.id]: "saved", [agg.id]: "applied" }, statusAt: {}, closed: {} }, NOW);
    expect(Object.keys(out)).toEqual([board.id]);
    expect(out[board.id].reason).toBe("duplicate");
  });

  it("keeps two openings on the same board (different cities)", () => {
    const a = job("greenhouse:acme:1", { title: "Product Manager", location: "NYC" });
    const b = job("greenhouse:acme:2", { title: "Product Manager", location: "SF" });
    expect(tidy({ jobs: { [a.id]: a, [b.id]: b }, status: { [a.id]: "saved", [b.id]: "saved" }, statusAt: {}, closed: {} }, NOW)).toEqual({});
  });
});

describe("board display", () => {
  it("sorts saved by match and applied by longest wait", () => {
    const a = job("greenhouse:a:1", { match: 60 });
    const b = job("greenhouse:a:2", { match: 90 });
    expect(sortColumn("saved", [a, b], {}).map((j) => j.id)).toEqual([b.id, a.id]);
    expect(sortColumn("applied", [a, b], { [a.id]: ago(2), [b.id]: ago(20) }).map((j) => j.id)).toEqual([b.id, a.id]);
  });

  it("warns before archiving", () => {
    expect(cardFlag("saved", "x", { statusAt: { x: ago(12) }, closed: {} }, NOW)?.text).toBe("Archives in 2d");
    expect(cardFlag("saved", "x", { statusAt: { x: ago(3) }, closed: {} }, NOW)).toBeNull();
    expect(cardFlag("applied", "x", { statusAt: { x: ago(22) }, closed: {} }, NOW)?.text).toBe("No reply · 22d");
    expect(cardFlag("applied", "x", { statusAt: { x: ago(2) }, closed: { x: ago(0) } }, NOW)?.text).toBe("Posting closed");
  });

  it("summarises the week, ignoring manual removals", () => {
    const s = weeklySummary(
      {
        a: { from: "saved", reason: "closed", at: ago(1) },
        b: { from: "saved", reason: "closed", at: ago(2) },
        c: { from: "saved", reason: "stale", at: ago(3) },
        d: { from: "saved", reason: "manual", at: ago(1) },
        e: { from: "applied", reason: "noreply", at: ago(9) },
      },
      NOW,
    );
    expect(s).toBe("Auto-tidied this week: 2 postings closed, 1 saved job went stale");
  });
});
