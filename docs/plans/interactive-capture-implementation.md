# Interactive capture (session mode) — implementation plan

> **STATUS: plan grounded + foundation built on branch `session-mode` 2026-08-19.** Implementation
> plan for the session-mode capture flow designed in
> [`interactive-capture-session-mode.md`](interactive-capture-session-mode.md) (read that first — it
> holds the design + all five decision rounds). Grounded in the current codebase (refs below).
> **Nothing pushed or deployed; no migration run against prod.**
>
> **Built so far (branch `session-mode`, tsc + vite green):**
> - Route `/patients/:patientId/session` + "▸ Start session" button in the Plan-tab builder header.
> - `apps/web/src/pages/practitioner/SessionPage.tsx` — full-screen shell + `Phase` machine, with
>   **intro**, **hub** (situations set, add-your-own), and **situation** (tap-1–10 fear + behaviors
>   with clinician type tag) wired to the **existing** `api/treatment.ts` CRUD. Deterministic, no AI.
>   The "core worry" chip reads the arrow's `feared_outcome`.
> - **Backend probe endpoint:** `POST /downward-arrows/next-probe` (`downward_arrows.py`) — additive,
>   practitioner-guarded, mirrors the extraction call pattern, **no migration**. FE:
>   `getNextProbe(...)` + `createPatientDownwardArrow(...)` in `api/treatment.ts`.
> - **arrow** + **review** phases are still intentional stubs.
>
> **Not built yet (next up):** the interactive **downward-arrow phase** (fresh start thought → probe
> loop via the endpoint, confirm-first → confirmed `feared_outcome` anchor). ⚠️ Its persistence must
> match the **existing** `PatientDownwardArrows` editor + `downward_arrow_service` `arrow_steps` shape
> — study that (and test against a **non-prod** DB) before wiring, to avoid corrupting live arrows.
> Then the **ladder-review** handoff reusing the builder view.
>
> ⚠️ **Do not run this route against the local dev server** — the local `.env` points at **prod**, and
> the situation/behavior writes are real. Verified by compile (tsc/vite) only, not a live click-through.

## Headline: most of this already exists
Grounding the code changed the size of the job substantially. Session mode is largely a **new
front-end surface over data models and endpoints that already exist** — not a new subsystem.

- **Ladder data (situations, behaviors incl. sub-behaviors, DT scores, library reuse):** fully built.
  Reuse as-is. `backend/app/models/treatment.py`; CRUD routers `trigger_situations.py`,
  `avoidance_behaviors.py`; FE calls in `apps/web/src/api/treatment.ts`.
- **Downward arrow: already built end-to-end.** Model `DownwardArrow` / table `downward_arrows`
  (`backend/app/models/downward_arrow.py`) with `arrow_steps` JSONB (`{question, response}`),
  `feared_outcome` (+approval flag), `bip_derived`, `facilitated_by` ("practitioner"/"parent"),
  unique on `(trigger_situation_id, facilitated_by)`. Schema/service/router all present. FE:
  `PatientDownwardArrows` steps-editor (`PatientPage.tsx:934-1173`) + `api/treatment.ts`
  (`getSituationDownwardArrow`, `createSituationDownwardArrow`, `updateDownwardArrow`, …).
- **Seeding:** `POST /patients/{id}/monitoring/extract` (`patients.py:769-860`) runs Anthropic
  `claude-sonnet-4-6` on the patient's `MonitoringEntry` rows and returns an **editable draft** to the
  FE; the clinician applies it via the per-row situation/behavior CRUD. Nothing is written to the
  ladder tables server-side except `treatment_plans.last_extracted_at`. So the plan's live
  situations/behaviors **are** the seeds by the time a session runs.
- **Child design system reusable in the clinician app:** `--teen-*` tokens
  (`apps/web/src/styles/teen-tokens.css`), the `TeenScreen` shell
  (`apps/web/src/components/teen/TeenScreen.tsx`), and `Thermometer.tsx` / `BeliefSlider.tsx` /
  `Chip.tsx` are globally imported (`index.css`) and **not route-scoped**; the teen teal
  (`--teen-teal`) equals clinician `--float-primary` (`#135450`). A clinician-app surface can use them.

### What genuinely does NOT exist (the only net-new backend)
1. **AI probe phrasing** for the downward arrow (the one live-AI piece we opted into) — an additive
   route, no schema change.

**Resolved (2026-08-19): no `core_belief` column needed.** Verified against
`backend/app/models/downward_arrow.py` + `schemas/downward_arrow.py`: the arrow already stores its
terminal statement in **`feared_outcome`** (Text) with a **`feared_outcome_approved`** confirm flag
(+ `bip_derived` belief strength). That is functionally the "core belief / bottom" my design captures.
The ladder anchor = the **patient-level arrow's `feared_outcome`** (the model supports a patient-
agnostic arrow: `trigger_situation_id` nullable, `patient_id` set). **No migration.**

## Architecture decisions
1. **Session mode is its own full-screen route:** `/patients/:patientId/session`, added under
   `<ProtectedRoute>` in `apps/web/src/main.tsx` (flat-route convention; note the app uses
   `/patients/...`, not `/practitioner/...`). Full-screen (no `PractitionerNav`) for the co-located
   experience. Launched from a **"Start session"** button in the `treatmentPlanBuilder` card header
   (`PatientPage.tsx:2500-2527`, which has empty right-side space).
2. **Practitioner-authed, one shared screen.** Uses the practitioner `apiClient` and existing auth.
   The child interacts but the session runs in the clinician's authenticated context — no teen/parent
   auth involved. (Matches "clinician always present.")
3. **Reuse the child design system** (`TeenScreen`, `--teen-*`, `Thermometer`, `BeliefSlider`,
   `Chip`) for warmth; drive the flow with a top-level `Phase` state machine like
   `TeenRecordPage.tsx` (`'outcome'|'toohard'|'capture'|'score'`). No new wizard/modal framework
   (none exists; don't add one).
4. **Persist through existing `api/treatment.ts` functions** with the practitioner client; after
   writes, invalidate the builder's query keys (`['triggers', planId]`, `['behaviors', triggerId]`,
   `['patient-das', patientId]`) so the Plan tab reflects session output live. **No new ladder
   endpoints.**
5. **Ladder capture: deterministic, no live AI** (decision round 5). **Downward arrow: one live-AI
   call** for next-probe phrasing, confirm-first.

## Backend changes (small, additive — no migration)
1. **The ladder anchor reuses `downward_arrows.feared_outcome`** — no new column, no migration
   (resolved 2026-08-19; see above). The pre-ladder **patient-level** arrow (created fresh in-session,
   `trigger_situation_id` null, `patient_id` set) holds the anchor string in `feared_outcome`, with
   `feared_outcome_approved` as the confirm flag. Ladder capture reads it via
   `listPatientDownwardArrows(patientId)` (`api/treatment.ts`) and shows it as the "core worry" chip.
2. **`POST` next-probe endpoint (the only new AI call).** Given the running chain, return the next
   probe string. Mirror the extraction pipeline exactly (there is **no** shared LLM helper — calls are
   inline in routers).
   - **Route:** add `POST /downward-arrows/next-probe` in
     `backend/app/api/routers/downward_arrows.py`, guarded by `context: tuple =
     Depends(get_practitioner_context)` like every route in that file. Body `{ starting_thought: str,
     steps: [{question, response}] }` → returns `{ probe: str }`.
   - **Call mechanics (copy from `patients.py:814-840`):** `import anthropic`; `client =
     anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)` (`settings` from `app.core.config`);
     module-level `NEXT_PROBE_SYSTEM_PROMPT` constant; build a plain-text user message joining the
     `question/response` pairs; `client.messages.create(model="claude-sonnet-4-6", max_tokens=256,
     system=NEXT_PROBE_SYSTEM_PROMPT, messages=[{"role":"user","content": chain_text}])`; return
     `message.content[0].text.strip()` (no JSON parsing — plain string). SDK `anthropic==0.69.0`,
     sync client inside `async def` (matches existing convention; a `timeout=` on `create()` is an
     optional low-risk add). Wrap in `try/except Exception → print(traceback.format_exc()) +
     HTTPException(500, detail=f"...: {type(e).__name__}: {str(e)}")` per `patients.py:834-840`.
   - **Confirm-first:** FE shows the probe; clinician edits before asking aloud. Model id matches the
     platform default (`claude-sonnet-4-6`); revisit if we standardize a model constant later.

## Frontend build (the bulk) — `apps/web/src/pages/practitioner/SessionPage.tsx` (new)
Top-level `Phase = 'intro' | 'arrow' | 'hub' | 'situation' | 'review' | 'done'`. Loads plan +
patient + `getTriggers(planId)` + behaviors + existing downward arrow on entry.

- **Phase `arrow` (runs first):** descending-chain UI over `arrow_steps`. Start thought seeded from a
  monitoring entry or typed. Probe loop → call next-probe (AI) → show editable probe → capture
  response → append step (`updateDownwardArrow`). "This is the bottom" → capture **core belief** →
  save to `plan.core_belief` (+ persist arrow). Reuse `BeliefSlider` for the bip if kept.
- **Phase `hub`:** the situations set from `getTriggers` (already-seeded), progress, "add your own"
  (routes into the same situation screen). Core-belief chip shown at top.
- **Phase `situation` (one screen):** fear meter (`Thermometer`/slider) → `updateTrigger` DT; behaviors
  as seeded chips from existing behaviors + add (`createBehavior`/`updateBehavior`), clinician sets
  `behavior_type` quietly. "Add your own situation" creates via `createTrigger` then lands here.
- **Phase `review`:** assembled ladder ordered by DT (reuse the shipped ladder aesthetic; likely a
  read-styled view), set focus/start rung, "Open full builder" → back to Plan tab.
- **Clinician driver layer:** thin, persistent controls — reword / skip / back / up-a-step / tag type
  — visible on the shared screen but visually secondary (design them explicitly; they were sketched
  thin in the mocks).

## Build order (shippable increments; each verified locally before any deploy)
1. **Backend:** `core_belief` migration + schema wiring; next-probe AI endpoint. *(Additive migration
   → prod auto-migrates on deploy; **review before deploy**.)*
2. **FE scaffolding:** route + `SessionPage` shell (`TeenScreen`) + "Start session" entry button +
   `Phase` machine skeleton (no logic). Verifiable immediately.
3. **FE downward-arrow phase** (with AI probe, confirm-first) → writes core belief.
4. **FE hub + situation-detail phase** (fear + behaviors; add-your-own).
5. **FE ladder-review phase** + handoff to builder.
6. Polish: age register, empty/edge states. Dictation/live-structuring deferred (round 5).

## Gates
- **Additive prod migration** (`core_belief`) — review before deploy; Railway auto-migrates.
- **`/security-review`** — new route + new AI endpoint touch the data-access surface. Confirm:
  `ProtectedRoute` + practitioner org-scoping hold on the route; the next-probe endpoint is
  practitioner-authed and org-scoped; no child/parent data crosses boundaries. (Non-negotiable #2.)
- **Clinical sign-off:** owner waived Dr. Walker gating for this design (round 5).

## Open questions — RESOLVED (2026-08-19)
1. **Anchor storage:** ~~new `core_belief` column~~ → **reuse `downward_arrows.feared_outcome`**; no
   migration (verified against the model).
2. **Downward-arrow starting thought:** **typed fresh in-session** for now (not seeded from monitoring).
3. **Prereq situations:** **session mode assumes situations are already seeded** — we always seed some
   before a session (normal extract-apply flow); session mode does not run extraction itself in v1.
4. **Ladder review:** **reuse the shipped builder view** (read-styled) — confirmed.
