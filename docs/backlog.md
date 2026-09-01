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

# Clinician

From Peter's review of the clinician portal, 2026-08-30. Sizes are his read plus what the code
says; the ones marked "needs design" are not ready for an agent until he has drawn them.

| Item | Today | Size |
|---|---|---|
| **Granting and revoking a clinician's access — no UI** | Endpoints exist and are tested; no screen. Full entry below. | M |
| **The patient list: phases, closing a patient, a filter** | **BUILT 2026-08-31** — [`patient-list-phases.md`](plans/patient-list-phases.md). The progress column is stuck for every patient: step 3 needs a downward arrow marked as facilitated by a *parent*, and nothing in the app ever creates one, so it can never complete. Replaced by a phase — New, Monitoring, Assessment, Planning, In treatment, Closed — each derived from one observable fact rather than a chain of flags. Plus closing a patient while keeping all their data, and a filter by phase. Two questions for Peter in the plan: whether a closed patient can be reopened, and what closing does to the child's and parent's apps. | M |
| **Clinician settings — v1, not touched** | Nav item exists and is disabled: `PractitionerNav.tsx:25`, tooltip "Coming soon". No page, no route. Nothing decided about what belongs in it. | M |
| **Reports — v1, not touched** | Same: `PractitionerNav.tsx:24`, disabled, "Coming soon". Per-patient reports exist (`MonitoringReportPage`); this is the global one. | M |
| **Session notes — needs review and design** | Built and working inside `PatientPage` (`getSessionNotes` and friends, line 939). Peter wants to look at it properly before deciding what changes. | M |
| **Action plans — needs review and design** | Same shape: working, lives in `PatientPage` (line 941), rich-text editor, free-text next-appointment field. Needs his review first. | M |
| **Remove the Patient Downward Arrows section from the Plan tab** | **DONE 2026-08-30.** Removed; the checklist step now opens the arrow mode. Took 238 lines out of PatientPage. | S |
| **Close / relapse-prevention tab** | Tab exists, body is the literal string "Placeholder". | M |
| **Scheduling / appointments** | Free-text next-appointment field only. No calendar or booking. | L |
| **Clinician education modules** | Content is real; progress is `localStorage` only, so it is lost on another device. Some in-checklist links say "coming soon". Video is a separate item. | M |
| **"Run AI review" has never done anything** | `run_ladder_review` reads `ladder_rungs`, which has zero rows in production. Decide what it should read now rungs are behaviour rows. | M |
| **"Plan an experiment" missing from the flat ladder** | Exists only in the situations view (`BehaviorPanel`), so an ungrouped rung cannot be reached. See [`flat-ladder-grouped-situations.md`](plans/flat-ladder-grouped-situations.md). | S |
| **Session mode cannot add a version-of-this-situation rung** | It only asks "what do you do so it feels safer?". Phase 3 of the flat-ladder plan. | M |
| **Treatment plan — exposure ladder and parent accommodations** | In progress. See [`ladder-generation.md`](plans/ladder-generation.md) and [`flat-ladder-grouped-situations.md`](plans/flat-ladder-grouped-situations.md). | L |

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

Ten screens, about 3,800 lines. A child can sign in, see their ladder, set up an experiment, do it,
record what happened, see progress, and message their clinician. The July reorg shipped most of it.

**Finishing the child's app depends on the clinician ladder work** (Peter, 2026-08-31). The shape
of what the child sees follows from what the clinician builds, so the ladder work lands first.

| Item | Today | Size |
|---|---|---|
| **The child's ladder does not match the clinician's** | **The missing steps are FIXED 2026-08-31** — steps with no situation now reach the child, in a group called "Other steps". What remains is the shape: ** `GET /patient/ladder` (`backend/app/api/routers/patients.py:1227`) returns situations with steps nested under each, and finds those steps by `trigger_situation_id`. The flat ladder lets a clinician create a step with **no situation** — those steps are invisible to the child. The clinician adds a rung, sees it on their ladder, and the child never gets it. **Confirmed in production, 2026-08-31: one such step exists** — *"view 3 of diana's posts on my own"* — a real exposure step the child cannot see. Beyond the defect, the two views have diverged in shape: the clinician's ladder is flat with situations as grouping, the child's is still situations-first. Peter, 2026-08-31: the clinician's ladder setup must be mirrored in the child's app. That is the remaining work, and it waits on the clinician ladder changes. | M |
| **Video content and tips** | Covered by the education items — Peter, 2026-08-31: this applies to the clinician and parent apps too, not just the child's. | M |
| **Reminders** | The app records when a child plans to do something and never tells them. No scheduler exists anywhere in Float, which also blocks the parent reminders. Twilio and A2P 10DLC registration is the long part. Tabled 2026-07-28. | L |
| **A debug print in the child's ladder endpoint** | `print(f"DEBUG ladder: plan_id=...")` at `patients.py:1256`, running in production on every load. | S |
| **"Hi Patient" personalisation edge** | Falls back to the literal word. | S |
| **Milestone rewards** | Not built. Needs a defined set of milestones. | M |

Waiting on Dr. Walker, from the July reorg: how "do it now" works on a future scheduled slot, word
buttons instead of faces, equal-weight answers on "did it happen", and the too-hard path.

# Parent

**Corrected 2026-08-31.** The note that said the parent MVP was unmerged with a migration never run
was **stale, and wrong**. `parent-experience` is fully merged into main — its tip is an ancestor —
and the work is live.

## What is already built

Five screens under `/parent/*`, routed and behind a token check
(`apps/web/src/main.tsx:129-137`), about 970 lines:
`ParentLoginPage`, `ParentSetPasswordPage`, `ParentResetPasswordPage`, `ParentHomePage`,
`ParentMessagesPage`.

Ten endpoints: `/parent/accommodations`, `/parent/moments` (read and write),
`/parent/child/experiments/upcoming`, `/parent/situations/{id}/tips`, `/parent/messages` (read,
write, mark read), and the clinician side of the chat at `/patients/{id}/parent-messages`.

`ParentHomePage` is not a placeholder. It loads the child's accommodations, picks out the weekly
focus one, shows parent-audience tips for that situation, and logs whether the parent held it.

So from Peter's July plan, these are done: the accommodation list, log-a-moment, tips, and
parent↔clinician chat.

## What is missing

| Item | Today | Size |
|---|---|---|
| **Two-parent accounts** | Not built. Peter's July plan marked this blocking, and several items below assume it. First question is whether a case supports two parent accounts at all today — it may be a schema change rather than a feature. | L |
| **Parent accommodation experiments** | Not built. commit → before → after → too_hard, the same lifecycle the child's experiments have. | L |
| **Weekly consistency check-in — it is a GATE, not a report** | Not built. Once a week the parent answers one question about their focus accommodation: **held every time / mostly / caved**. Deliberately not per-instance logging — recording every moment is more than most parents sustain. Re-read of the book, 2026-08-31: step 4 moves to the next accommodation once the parent and child are comfortable without the first, so this answer is **what decides whether they advance**, not a status update. Lapses surface to the clinician. | M |
| **Parent exposure reminders** | Not built, and blocked: needs a scheduler, which does not exist. Fires on the scheduled date and on the child's commit, telling the parent what to do and what not to do. | L |
| **Child rates parent accommodations** | Not built, and it is what the plan's ORDER depends on — today the clinician guesses it. Now part of the accommodation conversation below rather than a feature on its own. | M |
| **Progress and charts** | Not built. | M |
| **Navigation between parent screens** | Home and messages exist with nothing tying them together. | S |
| **The accommodation conversation** | **The big one.** A guided tool in the parent app that finds the accommodations with the parent, then rates them with the child — and the ratings order the plan. One switch, parents only or parents and child; the clinician being in the room does not change the flow. Planned in [`accommodation-conversation.md`](plans/accommodation-conversation.md). | L |
| **An accommodation needs a state the clinician can see and change** | Not built. `status` on `AccommodationBehavior` is set to "active" when it is created and then never read or written again. Three states: **not started, started, stopped.** Shown to the clinician on the parent plan panel, and theirs to change. **The app does not detect drift and should not try.** When the weekly focus moves on, nothing asks the parent about the old accommodation again — the clinician finds out it has come back by asking in session, and moves it back to the focus. The book is why the state matters: *"Make sure you do not go back... you will set the stage for relapse."* | M |

## The question the weekly check-in raises, and it is not a build detail

`ParentHomePage` already logs moments one at a time — held yes/no against the focus accommodation.
So either:

- **Both stay.** Logging a moment is in-the-moment support for the parent; the weekly check-in is
  the summary a clinician reads.
- **Or the weekly one replaces it,** because per-instance logging is the part parents will not keep
  up.

Worth putting to Dr. Walker with the parent app open, rather than deciding it in a backlog entry.

# Admin

| Item | Today | Size |
|---|---|---|
| **Patient management** | List and delete only; no edit or detail. | M |
| **Waitlist** | Read-only; no approve, convert or export. | M |
| **Data / exports** | Not started. Overlaps the HIPAA patient-rights work. | M |
| **Feature flags / config** | Not started, and now has a first real use: Float admin deciding which settings each clinic may change — the consultation checklist and the sign-out timer. Needs a screen listing clinics and what each is allowed to control. `organizations.settings` is the column, and nothing reads it today. See [`clinician-settings.md`](plans/clinician-settings.md). | M |

---

## Clinician notifications

**Raised 2026-09-01.** Planned in [`clinician-notifications.md`](plans/clinician-notifications.md). `L`

**Today Float tells a clinician nothing.** All five emails go to patients, parents or new
clinicians. The patient list already works out three reasons a patient needs attention and hides
them in a tooltip on a dot.

Three channels — in the portal, email, SMS — and the portal one is first because it needs no
delivery mechanism and is what a clinician sees daily. The settings screen comes last: toggles that
control nothing are worse than no page.

---

# Backend and infrastructure

## No scheduler exists

**Priority: blocks three separate features.** `L`

**Today:** reminders and missed-experiment detection fire only from a manual admin POST. Teen
reminders, parent exposure reminders and the arrow harvest all want one.

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

- **~~`vitest` + component tests~~ — DONE 2026-08-31.** 17 tests, under a second to run, wired into
  `/verify` and CI. The first two files cover the patient list. What is still true: they know what
  the text says, not whether a column is cut off or a control is somewhere nobody will find. Looking
  at the screen is still a separate job.
- **Old entry, for context:** `M` **The frontend had zero tests.** Every backend defect this
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

## No way to read a review's results

**Raised 2026-08-31. Peter: querying the database is fine for now.** `S`

Each reviewer's link shows only their own marks and comments — enforced, and tested. There is no
screen showing what everyone said, so reading Dr. Walker's answers means opening the tunnel and
querying `review_marks`, `review_additions` and `review_comments` by hand.

Fine for one round. Worth an hour when there is a second, since the same tool is meant to carry the
extraction and arrow reviews too: one page, every suggestion, how each reviewer marked it and what
they wrote.

## Ladder generation — build it

**PAUSED 2026-08-31.** Waiting on seed data from Dr. Walker; she judged our case set a bad place to start and is writing her own. Nothing to do until it arrives.

`L`. Planned in [`ladder-generation.md`](plans/ladder-generation.md); decisions settled 2026-08-28.
61 real situations are pulled as candidate cases and six mechanical checks are written.

**Waiting on:** Dr. Walker's review (link live at `/review/<token>`), then the scorer, then the
feature. The scorer is not optional here — narrowing a situation *means* adding specifics, so there
is no word-level safety check the way there was for the arrow.

---

# Education content

## Video content — production

**Owner: not engineering.** Raised 2026-08-30. Outside this workstream.

Recorded here so the app-side item below has something to point at, and so it is visible that the
app work is blocked on content existing rather than on code.

There is already one place in the product that assumes video exists and has none: the consultation
checklist item `patient_worry_hill_video` — *"Teach the Worry Hill — watch video together"* — in
`backend/app/data/default_checklist.py:31` and `apps/web/src/lib/checklists.ts:29`. It carries a 🎬
icon and a "Worry Hill video" label pointing at nothing.

## Put video into each app — clinician, child and parent

**Priority: after there is content to put in.** Raised 2026-08-30. Peter, 2026-08-31: all three
apps, not just the child's. `L`

**Today:** there is no video anywhere. Every piece of education in the product is text.

Three places already exist and would each take video differently:

| Where | What it is today |
|---|---|
| **Clinician education modules** | `apps/web/src/data/education.ts`, rendered by `EducationIndexPage` / `EducationModulePage`. Text modules; progress is `localStorage` only, so it is lost on another device. |
| **Just-in-time tips for the teen** | `JitTip` in `backend/app/models/jit_content.py` — a title and a body, matched to a situation by tags. Shown on the exposure screen. Admin has full CRUD. |
| **Consultation checklist** | Items can carry a link with an icon and label. `patient_worry_hill_video` already does, and points nowhere. |

**What changes:** each of those needs somewhere to put a video, and the three are not the same
problem. A tip shown to a child in the moment before an exposure is not a five-minute module a
clinician watches once.

**Questions that shape it, and they are Peter's:**

- **Where do the files live?** There is no file storage of any kind in Float today — no uploads, no
  bucket. Either that gets built, or video is hosted elsewhere and embedded.
- **Does a child watch video in the moment, or only outside an exposure?** A tip is read in seconds
  while anxious. That may be exactly the wrong moment for a video, or exactly the right one — a
  clinical question worth asking Dr. Walker rather than assuming.
- **Does watching get recorded?** "Did they watch it" is a different feature from "here is a
  video", and it is the one that needs a database change.

**Worth knowing:** if video is hosted by a third party and a child's viewing is identifiable, that
vendor is handling patient data and needs an agreement like everyone else. See the BAA item. A
plain embedded player on a public video is not that; a per-child playlist is.

---

# Testing

## V1 testing of the parent app and the child's app

**Blocked, deliberately. Do not start.** Raised 2026-08-31. `L`

A full test pass on either app is not worth doing until they are feature complete. Both have
missing features and dependencies on work still in flight, so testing now would find gaps we
already know about and would have to be redone.

**What has to land first:**

- **The child's app** waits on the clinician ladder work — the shape of what a child sees follows
  from what the clinician builds. Its ladder also does not match the clinician's today, and drops
  steps that have no situation.
- **The parent app** is missing two-parent accounts, the accommodation experiments, the weekly
  check-in, reminders, progress, and navigation between its two screens. The accommodation
  conversation is planned and unbuilt.
- **Reminders in both** wait on a scheduler, which does not exist anywhere in Float.

**When it does happen** it is a real test pass, not a look around: every screen, on a phone, with a
real plan behind it, by someone who did not build it.

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
- **Two-parent accounts** — Peter's own note says several parent items assume it.

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
