# Float — project instructions

Float is a CBT app for anxiety treatment (exposure + accommodation reduction) with three
distinct experiences: **parent**, **child**, and **clinician**. Backend is FastAPI +
Postgres (`backend/`); frontend is React + Vite (`apps/web/`), deployed on Netlify;
Railway hosts the backend and auto-migrates on deploy.

## Development process — required

Follow the standard compound-engineering loop (**Ground → Plan → Review → Compound**)
defined in the global process. Grounded in this repo's artifacts:

- **Ground:** read `STRATEGY.md`, and any relevant `docs/plans/` and `docs/solutions/`,
  before planning non-trivial work.
- **Plan:** save feature/refactor plans to `docs/plans/<slug>.md` before building.
- **Review:** `/simplify` → `/code-review` after implementing; `/security-review` on any
  change to auth, data access, or role scoping (see non-negotiables).
- **Compound:** capture non-obvious learnings in `docs/solutions/<slug>.md`; keep
  project vocabulary current in `CONCEPTS.md`.

## Current stage: pre-launch

> **There are no real users yet.** Everything in the production database is test data — no real
> clinicians, patients, or parents. This is a *temporary* stage, and the two relaxations below
> revert when the first real user onboards (date TBD). Non-negotiable #2 is **not** relaxed.

- **Migrations don't need to preserve data.** Verify a migration is *valid* — renders offline,
  correct `down_revision`, app boots after — and **say plainly when one is destructive and what it
  drops**. Then proceed. No key-preservation proofs, no backfill-fidelity analysis, no treating
  existing rows as precious. Flag, don't assume.
- **Clinical sign-off is at Peter's discretion** (see #1).

## Non-negotiables — these gate shipping

1. **Clinical sign-off.** Changes to clinical logic — what counts as
   avoidance/safety/escape, accommodation and fear-rating rules, or plan-commit behavior —
   are clinical decisions, not wording tweaks. **While pre-launch this gate is at Peter's
   discretion:** raise the clinical question with him, take his direction, and note it in the
   Dr. Walker review queue — do not treat it as blocking a ship. It becomes a hard gate again at
   launch, and it never becomes "ship on a training metric alone."
2. **PHI & role boundaries.** Separation between parent, child, and clinician data is a
   hard boundary, and data handling must meet **HIPAA** requirements. Run
   `/security-review` on any change that touches authentication, data access, or role
   scoping — a child seeing clinician data (or a parent seeing a child's private log) is a
   serious defect, not a bug. **Not relaxed pre-launch** — the boundaries are structural, and
   retrofitting them after real data arrives is how they get missed.
3. **Production is close to your keyboard.** The local `.env` points at **production**
   Postgres, and Railway **auto-migrates on deploy**. There is little buffer between "push" and
   "live" — so a broken deploy is immediately visible, and correctness still has to be verified
   before pushing. What this does *not* currently mean is data preciousness: see
   "Current stage" above.

## Where things live

- `backend/` — FastAPI app (`backend/app/api/routers/`, models, services, `migrations/`).
- `apps/web/` — React + Vite frontend (`src/`), the three experiences.
- `packages/` — shared code.
- `AI-dev/` — internal tooling and experiments (not shipped app code).
