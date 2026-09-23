# Applywise

**Apply to real jobs. Skip the ghosts.**

![Applywise demo](docs/applywise-demo.gif)

Applywise is a free, open-source job-search app. It pulls roles from companies' own job boards, JSearch and Apify (not LinkedIn reposts), flags listings that look like ghost jobs, scores every role against your resume, and tailors your resume for the roles you pick, without inventing facts.

- **Three sources, merged.**
  - **Company boards** (free, no key): live postings from Greenhouse, Lever and Ashby. 632 companies are built in, and you can add any company by pasting its careers link.
  - **JSearch** (your RapidAPI key): Google for Jobs results from Indeed, ZipRecruiter, Dice, company sites and more, searched by role × location. The app shows how many requests each scan uses (the free plan allows 200 a month).
  - **Apify** (your Apify token): runs the Fantastic.jobs *Career Site Job Listing Feed* actor (or any compatible actor) across 175k+ career sites, pre-filtered by role and experience level.
  - The same role found through two sources is merged, and the company-board copy wins.
- **Upload your resume** as a PDF, Word (.docx), .txt or .md file, or paste it in.
- **Swipe with signal.** Each role is a card you can drag or fling: right to save, left to skip, up to tailor. The card shows your match score, the skills you have vs. the skills they want, and ghost-job signals (age, thin description, talent-pool wording, no pay range, duplicate postings).
- **Tailor honestly.** Rewrites your bullets in the job's language with your own AI key (Gemini, OpenAI or Claude). Every number in the output is checked against your original resume, and anything new gets flagged. With no key, you get a deterministic ranking of your best bullets plus keyword gaps.
- **One-page PDF, built the job-tailor way.** A port of job-tailor's `html.ts` and `pdf.ts`: headless Chromium renders a US Letter page (Times New Roman 10pt, 0.35in/0.45in margins, ruled uppercase headings, company/title left and dates/location right) and walks the same ladder (roomy → balanced → compact → tight → top bullets → shortened, then capped spacing expansion) until the page is one page, at least 94% full, with at most 0.7in blank at the bottom. **Download tailored resume (PDF)** saves `First_Last.pdf`, with no browser header or footer.
- **Track it.** A drag-and-drop board (Saved → Tailored → Applied → Interview). Moving a card to Applied sets off confetti.
- **Private by default.** No accounts and no database. Your resume, filters, saved jobs and API key live in your browser's storage. You can export and import backups.

## Quick start

```bash
git clone <your-repo-url> applywise
cd applywise
npm install
npm run dev          # http://localhost:3000
```

To try it with realistic fake postings (offline, or for recording a demo):

```bash
npm run dev:demo
```

Requires Node 20.9+. The resume PDF uses Playwright's Chromium. If you've never installed it on this machine, run `npm run setup:pdf` once. Without it, Applywise falls back to the browser's print dialog. On Vercel it uses `@sparticuz/chromium` automatically.

## How it works

```
Browser (all state in localStorage)
  └─ POST /api/jobs     → public ATS feeds (Greenhouse/Lever/Ashby) in batches → filter → score → ghost signals
  └─ POST /api/sources  → JSearch or Apify with your key (used for that request only) → same pipeline
  └─ POST /api/resume   → PDF / .docx → plain text (nothing stored)
  └─ POST /api/tailor   → your AI key, used for one request only → JSON → fact-check guardrail
```

| Piece | File |
|---|---|
| ATS collectors (Greenhouse, Lever, Ashby) | `src/lib/engine/collect.ts` |
| JSearch + Apify collectors | `src/lib/engine/aggregators.ts` |
| Resume PDF / Word parsing | `src/lib/engine/resume.ts` |
| Filters, match score, ghost signals | `src/lib/engine/analyze.ts` |
| Skills vocabulary | `src/lib/engine/skills.ts` |
| Tailoring + "no invented numbers" guardrail | `src/lib/engine/tailor.ts` |
| Resume parser, one-page layout + fit ladder | `src/lib/resume/` |
| Company directory | `src/data/companies.json` |
| Physics hero (custom 2D engine) | `src/components/PhysicsField.tsx` |
| Swipe deck | `src/components/Discover.tsx` |

**Match score:** `25 × title fit + 75 × skill coverage`. Coverage is shrunk toward a 35% prior, so a posting that names only one skill can't show a 100% match.

**Ghost signals** are weighted hints, not verdicts: evergreen or talent-pool wording (+45), open more than 60 days (+35) or more than 30 days (+18), very thin description (+25), same title posted 5+ times (+15), no posting date (+10), no pay range (+8). A total under 25 is *Looks real*, under 50 is *Some signals*, and anything higher is *Likely ghost*.

## Adding companies

In the app, go to **Settings → Companies → Add any company** and paste a link such as `jobs.lever.co/acme`, `jobs.ashbyhq.com/acme` or `job-boards.greenhouse.io/acme`.

To add a company to the built-in directory for everyone, add an entry to `src/data/companies.json`:

```json
{ "name": "Acme", "industry": "saas", "ats": "greenhouse", "slug": "acme" }
```

## Development

```bash
npm run smoke     # live end-to-end test against a running server with real keys (see scripts/smoke-test.ts)
npm test          # engine unit tests (vitest)
npm run typecheck
npm run lint
npm run build
```

Built with Next.js, React 19, Tailwind CSS 4, Motion, and Zustand.

## Responsible use

The API routes are rate-limited per visitor (set `RATE_LIMIT=off` to disable). Applywise reads **public** job-board APIs (each board is fetched at most once every 10 minutes), calls JSearch and Apify only with keys you provide (their usage counts against your plans), and never auto-applies. Please respect each site's terms of use. Always review tailored output before you send it.

## License

MIT
