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

## Non-negotiables — these gate shipping

1. **Clinical sign-off.** Changes to clinical logic — what counts as
   avoidance/safety/escape, accommodation and fear-rating rules, or plan-commit behavior —
   are clinical decisions, not wording tweaks. They ship only with **Dr. Walker's
   approval**, never on a training metric alone.
2. **PHI & role boundaries.** Separation between parent, child, and clinician data is a
   hard boundary, and data handling must meet **HIPAA** requirements. Run
   `/security-review` on any change that touches authentication, data access, or role
   scoping — a child seeing clinician data (or a parent seeing a child's private log) is a
   serious defect, not a bug.
3. **Production is close to your keyboard.** The local `.env` points at **production**
   Postgres, and Railway **auto-migrates on deploy**. Treat migrations and pushes as
   production-affecting; there is little buffer between "push" and "live."

## Where things live

- `backend/` — FastAPI app (`backend/app/api/routers/`, models, services, `migrations/`).
- `apps/web/` — React + Vite frontend (`src/`), the three experiences.
- `packages/` — shared code.
- `AI-dev/` — internal tooling and experiments (not shipped app code).
