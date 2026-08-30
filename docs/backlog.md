# Backlog

Work that is agreed but not started.

## How to use this

**Every item must be actionable without the conversation that produced it.** File paths, what is
true today, what changes, and how to tell it worked. An item an agent cannot pick up cold is not
finished being written.

Each item carries:

- **Today** — what the code actually does now, with file paths.
- **What changes** — the work.
- **How to tell it worked** — the check, ideally a test.
- **Gate** — `/security-review` for anything touching auth, data access or role scoping;
  clinical sign-off for anything touching what counts as avoidance, safety, escape, fear ratings,
  accommodation rules or plan-commit behaviour. Pre-launch the clinical gate is Peter's discretion
  and goes in the Dr. Walker log rather than blocking.
- **Depends on** — where order matters.

**Sizing.** `S` under a day, `M` a few days, `L` more than a week or needs a plan first. `L` items
should get a `docs/plans/<slug>.md` before code.

**Status of this file.** The infrastructure and AI items below are written to that standard. The
per-surface product items are **transcribed from Peter's July plan and the build-status table** and
are not yet at that standard — they name the work, not how to do it. Peter's app review turns them
into items an agent can take. That review is the thing this file is waiting on, and it is his: a
list generated from reading the source finds disabled buttons and stub tabs, not a flow with too
many steps or a screen that confuses.

---

# Compliance

## HIPAA — what is actually missing

**Priority: highest that is not already a defect.** Raised 2026-08-29.
Non-negotiable #2, and #3 in `STRATEGY.md`. Not relaxed pre-launch.

The boundary work landed on 2026-08-28 (`patient_access_grants`), which covers one of the technical
safeguards. Most of the rest does not exist. Split below by what is code and what is paperwork,
because the paperwork is the part most likely to be forgotten and the part that blocks first real
patients hardest.

### Code — and the first one is the big gap

**1. Nobody can see who opened which patient record.** `L` — **DONE 2026-08-29.**
Every clinician read now writes a row saying who, which patient, what and when, and whether they
got in by a grant or as an institution admin. Readable by institution admins at
`GET /patients/{patient_id}/access-log`. Plan: [`patient-access-log.md`](plans/patient-access-log.md).

How it was done:

We control who is *allowed* in. We do not record who actually went in.

HIPAA requires that record. And a patient can ask for a list of everyone who saw their file. We
could not produce one.

The fix is small. Every clinician already goes through one function to open a patient —
`get_permitted_patient` in `backend/app/api/routers/patients.py`. Log it there and all 39 routes are
covered.

**How to tell it worked:** open a patient as a clinician, then find that visit in the log — who,
which patient, when. **Gate:** `/security-review`. **Plan it first.**

**2. The app logs you out after 30 minutes, whether or not you are using it.** `S` — **DONE 2026-08-29.**

Was: a login lasted 30 minutes and nothing ever called the refresh endpoint, so everyone was signed
out 30 minutes after signing in — a clinician mid-note, a teen mid-exposure. It met the requirement
by accident, in the way most likely to annoy. Only the clinician app even kept its refresh token;
the other three discarded theirs.

Now: the token is renewed silently while you work. The clinician and admin apps sign out after
**15 minutes of no activity** — no clicks, no typing, no scrolling, no requests — including when
nothing is being requested, because what is on the screen is the thing that matters. The teen and
parent apps have no idle limit: their own phone, their own data, and signing a child out in the
middle of an exposure makes them less likely to come back. Their refresh token still expires after
seven days.

Limits are in one place, `IDLE_LIMIT_MS` in `apps/web/src/api/session.ts`.

Verified in a browser against a local backend, since there are no frontend tests: logging in stores
both tokens; a tampered access token produces `POST /auth/refresh 200` and the request retries
rather than bouncing to the login screen; and sitting still with the limit temporarily set to five
seconds signs out and clears both tokens.

**3a. The database was reachable from the public internet.** — **CLOSED 2026-08-29.**
Railway keeps databases private by default; Public Access had been turned on. The TCP proxy
(`junction.proxy.rlwy.net:51458`) and the public domain (`postgres-production-d4e3.up.railway.app`)
are both removed. Verified: a connection from outside is refused, and the app still reaches the
database over `postgres.railway.internal`.

Cost: `backend/.env` and the scripts that query production (the review-round seeder, both case
harvesters) no longer work as written. They need to go through `railway connect`.

**3. Is the database encrypted at rest? Railway does not say.** `S`

Checked 2026-08-29. Railway documents encryption at rest for registry credentials and for private
networking. The volumes page says nothing. So it cannot be confirmed from outside — it is a support
question.

**This turned out to be the smaller half of a bigger problem.** See item 7 below and
[`hosting-for-real-patient-data.md`](plans/hosting-for-real-patient-data.md). On Cloud SQL,
encryption at rest is on by default and documented, so the hosting decision answers this on its
own.

**4. There are no backups at all.** `M` — **needs a Railway plan upgrade, no work to do**

Checked 2026-08-29: backups are **off**. Railway only offers them on the Pro plan, so turning them
on is a plan upgrade, not a piece of engineering.

Nothing to build. Two things to do when the plan changes: turn them on, and then actually restore
one. A backup nobody has restored is not a backup. Also decide how far back they go.

**Not needed before real patients, but before full launch.** Peter's call, 2026-08-29. Worth being
straight about the exposure in the meantime: if the volume is lost today, everything is lost. That
is fine while every patient is fake and stops being fine the day one is not.

**5. No rule for what happens to data when someone leaves.** `M`

A patient leaves. A clinician leaves. A clinic closes. What gets kept, what gets deleted, when.

An admin can already delete a patient (`DELETE /admin/patients/{patient_id}`). Check what that
actually leaves behind — nothing in this database deletes automatically, which has bitten us before
([why](solutions/delete-fails-silently-no-fk-cascade.md)).

**6. We commit patients' words into the code repository.** `S` — **DONE 2026-08-29.**
The two harvested files are gitignored and untracked, and both harvesters carry a warning saying a
decision is needed before they run against real patients. History deliberately not rewritten: what
is already committed is test data.

How it was done:

`AI-dev/Ladder Eval/cases_review.json`, `review_sheet_source.json` and the arrow case files all
contain situation text copied straight out of the database, saved into git.

Fine today, because every patient is fake. The first time a real child's words land in one of those
files, they are in the repository permanently and cannot be taken back out.

So the rule has to exist before the first real patient does, not after.

### Paperwork — blocking, and none of it is code

**7. Business Associate Agreements — and Railway wants $12,000 a year for theirs.** `L`

**Railway only signs a HIPAA BAA at their $1,000/month committed spend tier, on a one-year
commitment.** Found 2026-08-29. Without it, real patient data cannot legally live on Railway.

That is the largest single item on this list, it has a lead time, and Peter's plan opens the
patient study around December. Written up with the options, the costs, and pieces that can be done
one at a time in [`hosting-for-real-patient-data.md`](plans/hosting-for-real-patient-data.md).
Short version: Google Cloud's BAA is free and self-serve; the recommendation is Cloud Run plus
Cloud SQL; paying Railway is still a legitimate answer because it buys back simplicity.

Every vendor that touches patient data needs one, signed, before real patient data exists. From the
code, that is at least:

| Vendor | What reaches it |
|---|---|
| **Anthropic** | The extraction and downward-arrow prompts send a child's clinical text to the API |
| **Railway** | The application and the Postgres database |
| **Netlify** | The frontends |
| **Twilio** | Phone numbers and message content |
| **Resend** | Email addresses and invite content |

Anthropic offers a BAA for API use on request. **Anthropic is the one to do first** — clinical text
already flows there on every extraction and every arrow question.

**8. A written risk assessment.** HIPAA requires one. A big clinic will ask to see it anyway.

**9. What we do if data leaks.** Who gets told, in what order, within 60 days. Write it now, not on
the day.

**10. Workforce training and sanctions policy.** Small team, still required.

**11. Each screen should only get the data it needs.** Review what each one actually returns. Easier
once the access log exists, because that shows what is really being read.

**One decision of yours changes all of the above:** is Float the clinic's supplier, or does Float
hold the patient relationship itself? That decides who has to tell patients when something goes
wrong, and who owes them a copy of their record.

---

# Defects

---

# Clinician

Transcribed from the build-status table and Peter's July plan. **Needs his app review** before an
agent can take any of them.

| | Item | Today | Size |
|---|---|---|---|
| C1 | **Granting and revoking a clinician's access — no UI** | Endpoints exist and are tested; no screen. See the full entry below. | M |
| C2 | **Close / relapse-prevention tab** | Tab exists, body is the literal string "Placeholder". | M |
| C3 | **Global Reports page** | Nav item disabled. Per-patient reports exist. | M |
| C4 | **Settings / profile** | Nav item disabled, no page. | M |
| C5 | **Scheduling / appointments** | Free-text next-appointment field only. No calendar or booking. | L |
| C6 | **Clinician education modules** | Content is real; progress is `localStorage` only, so it is lost on another device. Some in-checklist links say "coming soon". | M |
| C7 | **"Run AI review" has never done anything** | `run_ladder_review` reads `ladder_rungs`, which has zero rows in production. Decide what it should read now rungs are behaviour rows. | M |
| C8 | **"Plan an experiment" missing from the flat ladder** | Exists only in the situations view (`BehaviorPanel`), so an ungrouped rung cannot be reached. See [`flat-ladder-grouped-situations.md`](plans/flat-ladder-grouped-situations.md). | S |
| C9 | **Session mode cannot add a version-of-this-situation rung** | It only asks "what do you do so it feels safer?". Phase 3 of the flat-ladder plan. | M |
| C10 | **Treatment journey restructure** | Setup / Run the plan / Close. Peter's item 22 — confirm what was built. | L |

## Granting and revoking a patient's clinicians — no UI

**Priority: high — I shipped access control that cannot be administered.** Raised 2026-08-28. `M`

**Today:** access is enforced (`patient_access_grants`, live 2026-08-28) and the three endpoints
exist and are tested — `GET/POST /patients/{patient_id}/access` and
`DELETE /patients/{patient_id}/access/{practitioner_id}`. There is no screen. Access can only be
changed through the API or the database, so nobody can hand a patient over from the app.

Note: two of the three clinicians at Test School are institution admins, who bypass grants
entirely. The boundary is only as tight as who holds admin.

**What changes:** a panel on the patient page listing who has access, with add and remove. Adding
needs a list of colleagues in the institution — **no endpoint returns that today**, so it is part of
the work.

**How to tell it worked:** grant a colleague from the UI and they can open the patient; revoke and
they cannot. Revoking the last one is refused (409, already enforced).

**Gate:** `/security-review`.

---

# Teen

| | Item | Today | Size |
|---|---|---|---|
| T1 | **Reminders / notifications** | Schedule data is written; nothing delivers it. No scheduler exists. Twilio/A2P 10DLC is the long pole. Tabled 2026-07-28. | L |
| T2 | **"Hi Patient" personalisation edge** | Falls back to the literal word. | S |
| T3 | **Teen app and the flat ladder** | Deferred: the teen app still reads situations → behaviours through the per-trigger routes. Its own redesign comes first. | L |
| T4 | **Milestone rewards** | Peter's item 21. Needs a defined milestone set. | M |

Most of the teen surface is built. The July plan's items 13–19 (approved-experiment screen,
before-state, in-the-moment, after-state, hard paths, progress, chat) all shipped in the reorg on
2026-07-28.

---

# Parent

**The least built surface, and the one the July plan leaned on most.** An MVP exists on branch
`parent-experience` — parent home, chat, tips, log-a-moment, plus the clinician focus toggle and
admin parent tips — **not merged, and its migration has never run.**

| | Item | Today | Size |
|---|---|---|---|
| P1 | **Decide the fate of `parent-experience`** | Branch exists, unmerged, migration unrun. Merge, rebuild or drop — first question, blocks the rest. | S |
| P2 | **Parent home** | Placeholder: "ladder will appear here soon". | M |
| P3 | **Accommodation ladder / tracking** | Not started. Backend and clinician side are ready to build on. | L |
| P4 | **Two-parent account model** | Peter's items 2 and 3, marked blocking. Does a case support two parent accounts today? May be a schema change, not a feature. Several parent items assume it. | L |
| P5 | **Parent accommodation experiments** | commit → before → after → too_hard, same lifecycle as the child's. Peter's item 7. | L |
| P6 | **Parent weekly consistency check-in** | Held every time / mostly / caved. Not per-instance logging. Lapses surface to the clinician. | M |
| P7 | **Parent exposure reminders** | Parent told an exposure is happening and what they should and should not do. Fires on the scheduled date and on the child's commit. Depends on a scheduler existing. | L |
| P8 | **Parent ↔ clinician chat** | Adult-to-adult, lighter safety burden than the teen channel. | M |
| P9 | **Child rates parent accommodations** | In-app, supports ranges, parent can see the ratings. **The child must be told the parent will see them** — that is a clinical and a trust decision, not a UI one. | M |
| P10 | **Progress / charts, multi-screen nav** | Not started. Single route only. | M |

---

# Admin

| | Item | Today | Size |
|---|---|---|---|
| A1 | **Patient management** | List and delete only; no edit or detail. | M |
| A2 | **Waitlist** | Read-only; no approve, convert or export. | M |
| A3 | **Data / exports** | Not started. Overlaps the HIPAA patient-rights work. | M |
| A4 | **Feature flags / config** | Not started. | M |

---

# Backend and infrastructure

## No scheduler exists

**Priority: blocks three separate features.** `L`

**Today:** reminders and missed-experiment detection fire only from a manual admin POST. Teen
reminders (T1), parent exposure reminders (P7) and the arrow harvest all want one.

**What changes:** a scheduled runner. Railway cron is the obvious first answer since the service is
already there.

**How to tell it worked:** something fires on its own, and a failure is visible rather than silent.

## Smaller, already agreed

- **`behavior_type` holds 11 distinct values across 136 rows** — `safety` / `safety_behavior` /
  `safety_seeking`, `cognitive` / `anxious_cognition`. Anything reading a child's rungs reads that
  mess, including the ladder-generation feature. `S`
- **A stale migration reference**: `2408a7d29380` names a `down_revision` no file defines. It is why
  a hand-picked revision id silently created a cycle on 2026-08-28. `S`
- **`.claude/settings.local.json` has 279 allow entries** — worth pruning to patterns. `S`

## Development setup — what is left

From [`dev-setup.md`](plans/dev-setup.md). Items 1, 3 and 4 are done (test database and 64 backend
tests; CI on push; this file).

- **`vitest` + component tests.** `M` **The frontend has zero tests.** Every backend defect this
  month was caught by a test; every frontend one was caught by `tsc -b` or by Peter looking at it.
  `apps/web/src/pages/practitioner/__SessionPreview.tsx` already seeds fixtures and renders the
  session phases — it is a component test with the assertions missing, and the phases are already
  exported for it.
- **CI does not gate deploys.** `S` It runs on push to `main`; Railway builds from the same push. CI
  tells you a build was broken, it does not stop it reaching production.
- **`PatientPage.tsx` is 3,150 lines.** `M` Down from 3,931. Matters when two agents edit it at once.

---

# AI features

## Rotate the production database password

**Raised 2026-08-29. Deferred by Peter the same day — not urgent, but do it.** `S`

The password was pasted into a chat transcript on 2026-08-29, so treat it as known.

**Why it is not urgent:** the database came off the public internet the same day. Its TCP proxy and
its public domain are both gone, so the only route in is `postgres.railway.internal`. Using the
password now means already being inside Railway's network.

**Why it still matters:** it is a credential that is written down somewhere it should not be.

**Do it in this order. The obvious order breaks the app.**

`POSTGRES_PASSWORD` is only read when the database is first created. The data volume already
exists, so changing that variable does NOT change the password inside Postgres — but `DATABASE_URL`
is built from it, so the app would immediately be using a new password against a database that
still has the old one. Nothing connects.

1. Generate the new value.
2. Change the real password first, over the private network:
   `railway connect --project 6f7aa50b-3962-4784-af1d-9419f40ccecb --environment production`
   then `ALTER USER postgres WITH PASSWORD '<the new one>';`
3. Then set `POSTGRES_PASSWORD` to that same value in Railway and let it redeploy.
4. Update `backend/.env`.

**How to tell it worked:** a login attempt against the live API returns 401, not 500. A 500 means
the app cannot reach the database.

---

## Monitoring extraction discards the clinician's corrections

**Priority: high — it is what unblocks improving extraction at all.** Raised 2026-08-28. `M`

**Today:** `POST /patients/{patient_id}/monitoring/extract`
(`backend/app/api/routers/patients.py:912`) returns a proposed list of situations, scores and
behaviours. The clinician keeps some, rewrites some, deletes what is wrong, adds what was missed,
and commits the result. `apps/web/src/api/monitoring.ts:83` says exactly this in its own comment.
The backend then stores **only `plan.last_extracted_at`**. The proposal is never saved.

So every extraction has a trained clinician marking the model's work item by item, and the product
throws it away.

**Why it matters:** improving extraction needs examples of "this input, this correct output". The
harness has **18**, because Dr. Walker reviewed a batch in June 2026 and her time is the bottleneck.
Without new cases the tuning loop in `AI-dev/Extraction Loop/float_harness` just overfits those 18.

**What changes:** persist what the model proposed alongside what was committed. The difference is
the correction.

**What it is NOT:** confirmed answers. A rewrite may be preference; a deletion may mean "not now".
These are candidates — the value is that Dr. Walker confirms a filtered pile instead of authoring
from a blank page.

**Do first, and smaller:** the harness is wired to a stub. `extractor_adapter.py:33` returns the
expected fixture as the answer, so every check passes trivially and it has **never run against the
real extractor**. It also reads its own copy of the prompt (`Float-Extractor-Prompt.md`) while the
shipped prompt is inline at `backend/app/api/routers/patients.py:751`. Point it at the shipped
prompt, as `AI-dev/Arrow Eval/run_eval.py` does. **Expect the first real score to be well below the
0.926 on record — that number came from the stub answering itself.**

Also split the cases into a tuning half and a held-out half. Whatever the loop optimises against
stops being a measurement.

**Gate:** `/security-review` — the proposal is clinical text about a child.

## Ladder generation — build it

`L`. Planned in [`ladder-generation.md`](plans/ladder-generation.md); decisions settled 2026-08-28.
61 real situations are pulled as candidate cases and six mechanical checks are written.

**Waiting on:** Dr. Walker's review (link live at `/review/<token>`), then the scorer, then the
feature. The scorer is not optional here — narrowing a situation *means* adding specifics, so there
is no word-level safety check the way there was for the arrow.

---

# Peter's — not for Claude to generate

## Product review and backlog generation

**Owner: Peter.** Raised 2026-08-27, restated 2026-08-29.

The per-surface items above are transcribed, not reviewed. Turning them into items an agent can
take needs Peter going through the clinician, teen and parent experiences.

Claude reading the source produces only the mechanical half — disabled buttons, TODOs, a table
nothing writes to. It cannot find a screen that works but confuses, a flow with too many steps, or
something missing that was expected. Those came from Peter using it ("it's a mess", "we're still
loading up the screen", "the situation is too small to read"), and nothing in the code would have
surfaced them.

## Decisions that block work below

- **Covered entity or business associate?** Shapes every HIPAA item.
- **The fate of branch `parent-experience`** (P1) — blocks the whole parent surface.
- **Two-parent account model** (P4) — Peter's own note says several parent items assume it.

---

# What changed since the July status table

Peter's build-status table is dated 2026-07-29; there have been 93 commits since. Corrections:

- **"Automated tests: Not started"** — the backend now has 64 across 8 files, including a sweep of
  every route as three wrong identities. The frontend still has none.
- **"Hosting: web build has no tsc gate"** — CI now runs `tsc -b --force` and the backend tests on
  every push. It still does not block the deploy.
- **Parent accommodation plan (clinician side)** — built, and the parent-side MVP exists unmerged on
  a branch.
- **Access control** — a clinician could open any patient in their institution. Fixed 2026-08-28;
  access is now an explicit grant.
- **Downward arrow** — was live and never measured. Now has 20 cases, six checks, and four rules in
  the shipped prompt derived from Peter's own target questions.

---

# Blocked on real usage

## Arrow evaluation — nothing triggers the harvest

**Raised 2026-08-28. Blocked on real usage, not on work.**

`AI-dev/Arrow Eval/harvest.py` turns real downward-arrow chains into evaluation cases. Nothing runs
it. There is no schedule, no hook, no trigger — someone types the command or it does not happen.

That is deliberate for now: it reads only arrows created on or after 2026-08-28, and there are none.
It will keep finding nothing until the arrow is used in a real session. Automating a collector with
nothing to collect cannot be checked.

**The trigger to watch for:** the first real session that uses the downward arrow. Run the harvest
straight afterwards, while the session is fresh enough for Peter to say what the right question
would have been. His review is the part that makes a case worth anything; the script only gathers.

**When it earns automation:** once the queue has a backlog and the manual run is being missed. The
version that works unattended is a scheduled job on Railway, which sits next to the database
already. A local scheduled job only fires when Peter's laptop is on and will skip weeks in silence.
Do not put case collection into the app's own code — it is eval plumbing on a live clinician path.

**Also unfinished on the same tooling:**
- Six synthetic cases have no target question from Peter (draft-01, 02, 03, 09, 10, 14).
- draft-08's response ("Nobody likes me") is one he flagged as an unlikely thing for a child to say;
  it needs rewriting or dropping.
- Cases are compared to targets by exact string match, so "you're stuck" vs "get stuck" counts as a
  miss. Scoring against a rubric is the fix, and the rubric needs Dr. Walker.
- draft-12, 13 and 15 appear as examples inside the shipped prompt, so their matches prove nothing.
  See [`eval-cases-burned-by-putting-them-in-the-prompt.md`](solutions/eval-cases-burned-by-putting-them-in-the-prompt.md).

---
