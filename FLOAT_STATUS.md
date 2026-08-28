# Float — Build Status Reference

_As of 2026-07-29. Legend: ✅ Complete · 🟡 Partial (works, has gaps) · 🧱 Scaffold/stub · ⬜ Not started_

## Clinician / Practitioner web
| Feature | Status | Notes |
|---|---|---|
| Auth (login / forgot / reset) | ✅ | |
| Patient roster + add patient | ✅ | Needs-attention badges, progress derivation |
| Patient detail hub (`PatientPage`) | ✅ | ~4,200-line workspace; setup steps + treatment tabs |
| Assessment (monitoring send, formulation, downward-arrow, checklists, session notes) | ✅ | Fed by AI extraction + preliminary report |
| Plan builder — situations / avoidance behaviors / exposure ladder | ✅ | Full CRUD, ladder review flags |
| Parent accommodation plan (clinician side) | ✅ | CRUD + reorder + reseed-by-distress |
| Teen access / invite | ✅ | Invite / resend / change email |
| Experiments review | ✅ | Overdue detection, BIP/DT trends |
| Weekly session (brief / prep / notes) | ✅ | |
| Action plans (TipTap editor) | ✅ | Free-text next-appointment field |
| Messaging (clinician ↔ teen) | ✅ | 5s polling, no realtime |
| Monitoring report + progress charts (per patient) | ✅ | recharts |
| JIT tip tagging per situation | ✅ | Drives teen-side tips |
| Clinician education modules | 🟡 | Content real; progress is localStorage-only; some in-checklist links say "coming soon" |
| Close / relapse-prevention tab | 🧱 | Tab exists, body is literal "Placeholder" |
| Scheduling / appointments | 🟡 | Only free-text field; no calendar/booking |
| Global Reports page | ⬜ | Nav item disabled; per-patient reports exist |
| Settings / profile | ⬜ | Nav item disabled; no page |

## Teen web _(design refresh shipped 2026-07-29)_
| Feature | Status | Notes |
|---|---|---|
| Auth (login / set / reset password) | ✅ | |
| Home dashboard | ✅ | Scheduled + coming-up + set-up cards |
| Ladder / situations | ✅ | |
| Experiment setup → commit | ✅ | Schedules day + time bucket |
| Exposure (overview + guided moment) | ✅ | |
| Reporting (outcome / capture / scoreboard / too-hard) | ✅ | Disconfirmation-aware |
| Progress + charts | ✅ | |
| Chat with clinician | ✅ | 5s polling |
| Plans | ✅ | |
| JIT tips | ✅ | Tag-matched |
| Tab-bar nav | ✅ | |
| Reminders / notifications | 🧱 | Schedule data written; no delivery (no scheduler) |

## Parent web
| Feature | Status | Notes |
|---|---|---|
| Auth (login / set / reset) | ✅ | Full invite → login loop testable |
| Home landing | 🧱 | Placeholder ("ladder will appear here soon") |
| Accommodation ladder / tracking | ⬜ | Not started (backend + clinician side ready to hang it on) |
| Progress / charts | ⬜ | |
| Chat / messaging | ⬜ | |
| Multi-screen nav | ⬜ | Single route only |

> Parent product is **greenfield on the frontend** — the data model and clinician-side accommodation plan already exist.

## Admin web
| Feature | Status | Notes |
|---|---|---|
| Auth (role-checked) | ✅ | |
| JIT tips + tags CRUD (content) | ✅ | |
| User management | ✅ | List / reset-pw / delete |
| Clinician creation + org/practice mgmt | ✅ | Emailed invites |
| Dashboard stats | ✅ | |
| Patient management | 🟡 | List + delete only; no edit/detail |
| Waitlist | 🟡 | Read-only; no approve/convert/export |
| Data / exports | ⬜ | |
| Feature flags / config | ⬜ | |

## Backend / API (FastAPI, ~20 routers)
| Group | Status | Notes |
|---|---|---|
| Auth/JWT · patients · plans · situations · behaviors · ladders · experiments · accommodations · situation-tags · messages · monitoring · progress · downward-arrows · session-notes · action-plans · formulation · checklist · admin · waitlist | ✅ | All wired to real DB |
| Reminders (SMS / experiment) | 🧱 | Logic exists; fired only by a **manual** admin POST — no scheduler |

> `patients.py` is a 1,615-line monolith (patient CRUD **+** all AI endpoints) — refactor candidate.

## Data model
- ✅ Fully built + migrated — 35 Alembic migrations, **auto-migrate on deploy**.
- ✅ Parent/accommodation tables **now built out** (earlier "dead tables" note is stale).
- ⚠️ `fear_rating` is **not** a DB column — exists only in the AI-extraction JSON shape.
- ⚠️ Local `.env` points at **PROD** Postgres.

## AI / extraction
| Piece | Status | Notes |
|---|---|---|
| Monitoring → structured extraction (endpoint) | 🟡 | Live/in-tuning; Sonnet 4.6; debug prints left in |
| Preliminary clinical report (endpoint) | ✅ | Live; Sonnet 4.6 |
| Extraction tuning harness (`AI-dev/Extraction Loop/`) | 🧱 | Extractor seam stubbed (echoes expected); baseline mode; prompt gated on Dr. Walker sign-off + held-out validation |

## Integrations & infra
| Piece | Status | Notes |
|---|---|---|
| JWT auth | ✅ | Ensure prod `SECRET_KEY` is set (defaults to "change-me") |
| Email (Resend) | ✅ | 5 templates; no-ops if key unset |
| SMS (Twilio) | 🧱 | Monitoring-form SMS wired; reminder SMS needs a scheduler |
| Scheduler / cron | ⬜ | **None** — reminders + missed-experiment detection are manual POSTs |
| Storage / file uploads | ⬜ | None |
| Hosting | ✅ | Railway (API, auto-migrate) + Netlify (web, no tsc gate on build) |
| Automated tests | ⬜ | None anywhere in the web app or backend |

## Architecture (cross-cutting)
- ✅ Single Vite SPA hosting **5 surfaces** (practitioner / teen / parent / admin / public monitoring form) in one route tree.
- ✅ 4 separate auth contexts + 4 axios clients (per-surface tokens).
- ✅ Two design-token systems: `--teen-*` (teen) and `--float-*` (practitioner/admin/parent).
- 🟡 Thin shared component library; heavy inline styles; mixed Tailwind + inline.
- 🟡 Route guards inconsistent (teen/parent inline vs practitioner/admin as components).
- ⚠️ All 4 auth providers wrap the entire app (every surface mounts all contexts).

## Biggest gaps to plan around
1. **No scheduler** — blocks teen SMS reminders + automated missed-experiment detection. (A2P 10DLC is the long pole for SMS.)
2. **Parent experience** — frontend greenfield (backend ready).
3. **Extraction prompt** — not signed off (Dr. Walker) / tuning harness stubbed.
4. **No automated tests** anywhere.
5. **Clinician** — close/relapse tab, real scheduling, global reports, settings all unbuilt.
6. **Tech debt** — `patients.py` monolith; provider nesting; debug prints in AI endpoint.

## Open decisions (pending Dr. Walker input)
_Shipped as-is; flagged for clinical review, not blocking._
- **"Do it now" on a future scheduled slot** — currently *fulfills that slot early*: reporting completes that experiment and removes it from the schedule (each scheduled day is its own experiment, so other days remain). Alternative: spawn a **new** "now" experiment and keep the scheduled one pending (more repeated exposure). Owner comfortable with current behavior for now.
- **Setup readiness: emoji faces → word chips** ("Not really / Kind of / Ready") — shipped; confirm wording/framing.
- **"Did it happen?" equal-weight answers** — shipped (no visual thumb on the scale); confirm.
- **Bail flow** — removed "I couldn't do it this time" from the outcome screen; the in-moment "It felt like too much" now routes to the *optional* "what made it too big?" reflection. Confirm framing.
- **Extraction prompt** — tuned prompt still gated on Dr. Walker sign-off + held-out validation.
