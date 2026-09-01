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

## How to write to Peter — and this applies to agents too

Plain English, short sentences, one idea per sentence. He is making product and clinical calls, not
reading code.

**Never invent a word for something that already has a name.** Say "the parent app" or "the parent
experience", not "the parent surface". Say "the clinician app", not "the clinician surface". If a
term is not one he already uses, it costs him a decode before he can read the sentence.

Banned in practice, because each has been flagged:
- Invented nouns and noun-pairs — "surface", "meaning-chain", "consequence-chain".
- Metaphors and figures of speech — "the long pole", "stays theatre", "load-bearing". Say the
  literal thing. He has said outright: *"CI is not a robot. explain in concrete simple terms."*
- Citing a rule instead of saying what it means. Not "§164.312(b) requires audit controls" but
  "a patient can ask for a list of everyone who saw their file".
- Stacking three clauses into one sentence, even when every word is ordinary.
- Referring to something by a label he has not seen. Backlog items have names, not codes. Saying
  "P3" or "C7" makes him ask what it means — it happened twice on 2026-08-30/31.
- Quoting `STRATEGY.md` back as a slogan. Its lines are shorthand for ideas Peter already holds;
  repeating them makes him decode a phrase instead of reading a fact. Say the concrete thing.

Domain vocabulary he already uses is fine and correct: distress thermometer, downward arrow,
exposure ladder, accommodation, safety behavior.

Answer first, detail only if asked. *"It's so slow to have to read a paragraph for a simple
question."*

## Do not draw rules from small samples

**This is a repeated failure, not an occasional one.** Peter, 2026-08-31: *"hard inferences from
small data sets is a really bad habit that YOU do all the time."*

What it looks like: nine target questions become four prompt rules. Sixteen drafted suggestions
become "suggestions get better when the situation has behaviours under it". Six situations from one
disorder become "the axis depends on the situation" — and the correction to *that* was another
confident rule from the same six.

Worth noting the shape: the second version usually sounds MORE rigorous, because it comes with a
count. It is the same mistake wearing arithmetic.

**Instead:** write down what is present in the data and what is absent. Say the sample size and
that it is partial. Say explicitly what is not known. A rule needs enough cases that it could have
been wrong and was not — and when the data is a partial file from one person about one disorder, it
could not have been.

This applies to clinical judgement most of all, where a confident-sounding rule from four examples
gets built into a prompt and then into what a child reads.

## Where things live

- `backend/` — FastAPI app (`backend/app/api/routers/`, models, services, `migrations/`).
- `apps/web/` — React + Vite frontend (`src/`), the three experiences.
- `packages/` — shared code.
- `AI-dev/` — internal tooling and experiments (not shipped app code).
