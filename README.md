# Applywise

**Apply to real jobs. Skip the ghosts.**

Applywise is a free, open-source job-search app. It reads companies' own job boards directly (not LinkedIn reposts), flags listings that look like ghost jobs, scores every role against your resume, and tailors your resume for the roles you pick, without inventing facts.

- **Scan the source.** Pulls live postings from Greenhouse, Lever and Ashby job boards. It ships with 632 companies, and you can add any company by pasting its careers link.
- **Swipe with signal.** Each role is a card you can drag or fling: right to save, left to skip, up to tailor. The card shows your match score, the skills you have vs. the skills they want, and ghost-job signals (age, thin description, talent-pool wording, no pay range, duplicate postings).
- **Tailor honestly.** Rewrites your bullets in the job's language with your own AI key (Gemini, OpenAI or Claude). Every number in the output is checked against your original resume, and anything new gets flagged. With no key, you get a deterministic ranking of your best bullets plus keyword gaps.
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

Requires Node 20.9+.

## How it works

```
Browser (all state in localStorage)
  └─ POST /api/jobs    → fetches public ATS feeds in batches → filter → score → ghost signals
  └─ POST /api/tailor  → your AI key, used for one request only → JSON → fact-check guardrail
```

| Piece | File |
|---|---|
| ATS collectors (Greenhouse, Lever, Ashby) | `src/lib/engine/collect.ts` |
| Filters, match score, ghost signals | `src/lib/engine/analyze.ts` |
| Skills vocabulary | `src/lib/engine/skills.ts` |
| Tailoring + "no invented numbers" guardrail | `src/lib/engine/tailor.ts` |
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
npm test          # engine unit tests (vitest)
npm run typecheck
npm run lint
npm run build
```

Built with Next.js, React 19, Tailwind CSS 4, Motion, and Zustand.

## Responsible use

Applywise only reads **public** job-board APIs, fetches each board at most once every 10 minutes (cached), and never auto-applies. Please respect each site's terms of use. Always review tailored output before you send it.

## License

MIT
