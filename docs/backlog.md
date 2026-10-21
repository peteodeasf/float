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

# Ready for agents

The agent loop on the Mac mini (`scripts/agent-loop.sh`, `docs/plans/agent-loop.md`) takes items
from this list only, top first. Peter moves items here when they are written to the standard above
and need no clinical decision. The agent removes an item in the PR that builds it.

### AI quality testing — moved here by Peter, 2026-10-19

All from `docs/plans/ai-quality-testing.md`. Read the whole plan before any of these, especially
"Rules that keep it honest". For every item:

- **Made-up data and the local databases only.** Cases come from `AI-dev/evals/pool/`. Nothing from
  production, ever.
- **API key.** AI calls use `ANTHROPIC_API_KEY` from the environment. If it is missing, do not look
  for one: open the PR as a draft saying the key was missing, and stop.
- **Spending.** Keep each session's AI calls under **$10**. The runner must stop when its limit is
  reached, and the PR says what was spent.
- **Never put a test case, or text copied from one, in a prompt.**
- **Report every number with its sample size**, and say what the cases don't cover. A pattern
  becomes a question for Peter in the PR, never a new prompt rule.
- **Depends on.** If an item depends on another that is not on main yet, skip it and take the next
  one. Never build on an unmerged branch.

Not in this list, on purpose: showing the risk flag (Peter, 2026-10-19: not tonight), scoring the
risk flag, session drafts and suggestions, downward arrow questions, and the weekly list for Peter.

The first group was finished 2026-10-20 (the last was the 30-pair step-sentence set).

### Acting on the first night's AI test results — moved here by Peter, 2026-10-21

From the first nightly report, `~/eval-reports/2026-10-21.md` on the mini (18 working families, 3
runs each). The same rules as the group above apply: made-up data only, under $10 a session, never
a test case in a prompt, every number with its sample size. Both items change what the app sends to
the AI, so **request Peter's review and do not merge.** The 4am nightly job also scores any open
pull request that changes a tested prompt or model.

Monitoring analysis at temperature 0 was built 2026-10-21. The voice notes item below is not built yet.

### Testing the teen's side without the teen app — moved here by Peter, 2026-10-21

The teen data testing page was built 2026-10-21.

#### Rename the clinician's "Exposures" tab to "Progress" `S`
- **Today:** the patient page's tab is called Exposures
  (`apps/web/src/pages/practitioner/PatientPage.tsx`, `ExposuresTab.tsx`). Peter, 2026-10-21: call it
  Progress. A separate, unlinked page also uses that name (`/patients/:id/progress`,
  `ProgressPage.tsx`).
- **What changes:** the tab's label, and any text that names it, say "Progress". Keep the URL value
  working for old links. Say in the PR whether the unlinked progress page should go, but do not
  remove it here.
- **How to tell it worked:** the tab reads Progress, old `?tab=experiments` links still open it.
  Screenshot.
- **Gate:** screen change: Peter approves. **Depends on:** nothing.

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
| **Anthropic** | The extraction, downward-arrow and combination-wording prompts send a child's clinical text to the API |
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
| **Granting and revoking a clinician's access** | **BUILT 2026-09-01** — a panel on the patient page, and the patient now has an owner. See [`clinician-patient-access-grants.md`](plans/clinician-patient-access-grants.md). | M |
| **The patient list: phases, closing a patient, a filter** | **BUILT 2026-08-31**, [`patient-list-phases.md`](plans/patient-list-phases.md); the family's side finished 2026-09-01, [`all-done-for-now.md`](plans/all-done-for-now.md). The progress column is stuck for every patient: step 3 needs a downward arrow marked as facilitated by a *parent*, and nothing in the app ever creates one, so it can never complete. Replaced by a phase — New, Monitoring, Assessment, Planning, In treatment, Closed — each derived from one observable fact rather than a chain of flags. Plus closing a patient while keeping all their data, and a filter by phase. Both questions answered: a closed patient can be reopened, and closing switches off the child's and parent's apps. | M |
| **Clinician settings — "Your account" built** | **2026-09-01.** The page exists and the nav item is live: name, credentials, phone, and changing your own password. See [`clinician-settings.md`](plans/clinician-settings.md). Still to come, in order: the Float admin capability switches, the clinic's consultation checklist, the sign-out timer. | M |
| **Reports — dropped** | Peter, 2026-09-01: pilot data comes straight out of the database, and clinicians get charts on the patient's Experiments tab instead. The nav item is gone. | — |
| **Session notes — needs review and design** | **BUILT 2026-09-01.** Peter's review: the pre-session brief is gone, a note can record the parent and the child together, and the two filters are labelled Who and Tag so they no longer read as one list of choices. | M |
| **Action plans — hidden 2026-09-01, open question** | Full entry below. | M |
| **Remove the Patient Downward Arrows section from the Plan tab** | **DONE 2026-08-30.** Removed; the checklist step now opens the arrow mode. Took 238 lines out of PatientPage. | S |
| **Close / relapse-prevention tab** | Tab exists, body is the literal string "Placeholder". | M |
| **Scheduling / appointments** | Free-text next-appointment field only. No calendar or booking. | L |
| **Clinician education modules** | Content is real; progress is `localStorage` only, so it is lost on another device. Some in-checklist links say "coming soon". Video is a separate item. | M |
| **"Run AI review" has never done anything** | `run_ladder_review` reads `ladder_rungs`, which has zero rows in production. Decide what it should read now rungs are behaviour rows. | M |
| **"Plan an experiment" missing from the flat ladder** | Exists only in the situations view (`BehaviorPanel`), so an ungrouped rung cannot be reached. See [`flat-ladder-grouped-situations.md`](plans/flat-ladder-grouped-situations.md). | S |
| **Session mode cannot add a version-of-this-situation rung** | It only asks "what do you do so it feels safer?". Phase 3 of the flat-ladder plan. | M |
| **The exposure ladder is a list of sub-situations** | **Planned 2026-09-01, not started** — [`exposure-ladder-sub-situations.md`](plans/exposure-ladder-sub-situations.md). A rung stops being a safety behaviour the child gives up and becomes a smaller version of the situation with its own fear rating. Safety behaviours attach to the situation instead. The conversation becomes the Plan tab's primary view; the current builder stays one switch away. Changes the child's exposure setup too, and simplifies it. | L |
| **Building the ladder from combinations and sub-situations** | **Planned 2026-10-15**, [`ladder-combinations.md`](plans/ladder-combinations.md). Replaces part of the line above: a rung can again come from a safety behaviour, as the situation without it. Step 1 (combinations exist, backend) built 2026-10-15; the wording check waits on someone with an Anthropic key. Steps 2 to 5 to come. | L |
| **The local demo data has a downward arrow the app cannot read** | Noticed 2026-10-15. `backend/seed_local.py` writes the cafeteria situation's arrow steps as `{question, answer}`, but the app reads `{question, response}`. Opening that patient's ladder editor on a local machine gives a server error for that one arrow. Local demo data only; nothing in production. | S |
| **The two-parent test fails at random** | Noticed 2026-10-15, failed once in CI on the ladder PR. `GET /patients/{id}/parents` sorts by `created_at`, which is the database's `now()`. Inside one transaction `now()` is the same for every row, so two parents invited in one test tie and come back in either order. `tests/test_two_parents.py::test_a_child_can_have_two_parents_and_the_clinician_sees_both`. Real invites are separate requests, so production order is fine. Sorting by a second column, such as the link id, after `created_at` would not fix it either; it needs a real tie-breaker or the test to not depend on order. | S |
| **`parent_behavior_id` on a new step is not checked** | **FIXED 2026-10-15** in step 4 of [`ladder-combinations.md`](plans/ladder-combinations.md): the parent must be a combination on the same situation. | S |
| **Rung wording goes into the shared behaviour library** | Noticed 2026-10-15, not fixed. `create_behavior` copies every new row's name into `behavior_library`, which is shared across practices and is meant to hold generic names only. A sub-situation is often a child's own words, such as *"view 3 of diana's posts on my own"*. So one practice's patient wording can be offered to another practice. Combinations are already kept out. | S |
| **Monitoring by more than one person** | Not built. From Dr. Walker's consultation guidance (Peter, 2026-09-15): both parents should monitor for the week, and sometimes a teacher or caregiver. Today a patient can have only one open monitoring form, sent to one address (`send_monitoring_form` in `monitoring.py` refuses a second). Related to two-parent accounts under Parent. | M |
| **Treatment plan — exposure ladder and parent accommodations** | In progress. See [`ladder-generation.md`](plans/ladder-generation.md) and [`flat-ladder-grouped-situations.md`](plans/flat-ladder-grouped-situations.md). | L |

## Action plans — hidden, and the question is whether they are worth having

**Raised by Peter 2026-09-01.** `M`

**Today:** action plans are built and work. A clinician writes a session summary in a rich-text
editor, gives it a date and a nickname, and publishes it to the child's app. The endpoints, the
editor and the child's side all still function.

**They are now hidden.** One switch does it — `SHOW_ACTION_PLANS` in
`apps/web/src/lib/featureFlags.ts` — read by both the clinician's Sessions tab and the child's tab
bar, so turning them back on is a one-word change. Nothing was deleted.

Peter's reason: he wants to see how the rest of the app flows before deciding whether an action
plan adds anything on top of the treatment plan, the exposure ladder and the child's own app. It is
a question about the product, not a defect.

**What has to happen:** answer that question. If yes, flip the flag back and design what an action
plan is for. If no, take the code out properly — the model, the endpoints, the editor and the
child's app reading published plans.

**The child's Plan tab is hidden too** (Peter, 2026-09-01). That tab was action plans and nothing
else, so with no clinician able to write one it would have sat there permanently empty, telling the
child their clinician will publish one after each session.

**Worth knowing while it is hidden:** any action plan already published still exists, and a
clinician can no longer edit or unpublish it from the portal. The child cannot reach it either, so
nothing is visible that should not be.

---

## Granting and revoking a patient's clinicians

**BUILT 2026-09-01.** Raised 2026-08-28. `M`

A "Clinician access" panel on the patient page: who can open this patient, add, remove, and hand
the patient to another clinician. `GET /practitioners` was added to feed it — the list of
colleagues did not exist, so nothing could supply an id to grant to.

The patient now has an owner, which is the clinician who added them. Only the owner or an admin at
the clinic can change who has access, and the owner's own access cannot be removed by anyone —
hand the patient over first. Peter's decision, 2026-09-01. Rules and the reasoning are in
[`clinician-patient-access-grants.md`](plans/clinician-patient-access-grants.md).

**Still open:** the access log (`GET /patients/{patient_id}/access-log`, who actually opened this
record) has no screen either. It is what answers a patient asking for a list of everyone who saw
their file.

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
| **The anxiety nickname in the child's and parent's apps** | **Needs a plan** (Peter, 2026-09-15). A nickname can be saved on the treatment plan, but neither app uses it; it only appears as clinician checklist items. Dr. Walker's consultation guidance: the child greets it ("Hi Worry Bug"), and the parent asks "Is Worry Bug here?" and then "What's your Distress Thermometer?", both with acceptance. She also mentions games and rewards for using it. | M |

## A teen cannot start an exposure on a rung with no situation `S`

**Found 2026-10-21**, building the teen data testing page.

- **Today.** `POST /patient/behaviors/{behavior_id}/experiments`
  (`patient_create_behavior_experiment` in `backend/app/api/routers/patients.py`) finds the
  child's plan through the step's situation. A step with no situation gets 404 "Situation not
  found". The ladder sends these steps to the child (as "Other steps"), so the child can see a
  rung and not start it. `GET /patient/behaviors/{id}` already falls back to the step's own
  `treatment_plan_id`; this route does not.
- **What changes.** Find the plan through `behavior.treatment_plan_id` first, then the situation,
  the same way `get_behavior_detail` does.
- **How to tell it worked.** A test: a child starts an exposure on their own situation-less rung
  (201), and still cannot on another child's (404).
- **Gate.** `/security-review` — it changes how the route decides the step is the child's.

## The Progress tab puts a too-hard exposure on the day it was scheduled `S`

**Found 2026-10-21.** The Progress tab places a too-hard exposure on `completed_date`, falling
back to `scheduled_date` (`ExposuresTab.tsx`, `dayFor`). Too hard sets `too_hard_at` and never
`completed_date`, so it always shows on the day it was scheduled, not the day the teen said it was
too hard. Usually the same day; not always. **What changes:** read `too_hard_at` for too-hard rows,
which means sending it in `GET /patients/{id}/experiments`. **Gate:** none.

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

**Added 2026-09-10: a Progress tab.** Once the clinician switches it on (Parent access panel, after
asking the child), the parent sees the child's ladder, what's planned and what's done. Never the
child's own words or their ratings of each exposure. Off for every child to start with, and the old
"this week" list on the parent home now waits for the same switch. See
[`parent-sees-child-progress.md`](plans/parent-sees-child-progress.md).

## What is missing

| Item | Today | Size |
|---|---|---|
| **Two-parent accounts** | **Planned 2026-09-15, not started** — [`two-parent-accounts.md`](plans/two-parent-accounts.md). No migration needed: the link table already holds two parents. Peter's decisions: a chat thread per parent, both parents answer the weekly check-in, both get reminder emails with a switch each, and a monitoring link each with the clinician seeing who wrote what. Two to three weeks. | L |
| **Parent accommodation experiments** | Not built. commit → before → after → too_hard, the same lifecycle the child's experiments have. | L |
| **Weekly consistency check-in — it is a GATE, not a report** | **BUILT 2026-09-10** — [`weekly-checkin.md`](plans/weekly-checkin.md). Replaces logging each moment (Peter's call). Was: not built. Once a week the parent answers one question about their focus accommodation: **held every time / mostly / caved**. Deliberately not per-instance logging — recording every moment is more than most parents sustain. Re-read of the book, 2026-08-31: step 4 moves to the next accommodation once the parent and child are comfortable without the first, so this answer is **what decides whether they advance**, not a status update. Lapses surface to the clinician. | M |
| **Parent exposure reminders** | Not built, and blocked: needs a scheduler, which does not exist. Fires on the scheduled date and on the child's commit, telling the parent what to do and what not to do. | L |
| **Child rates parent accommodations** | Not built, and it is what the plan's ORDER depends on — today the clinician guesses it. Now part of the accommodation conversation below rather than a feature on its own. | M |
| **Progress and charts** | Not built. | M |
| **Rewards** | **Needs a plan** (Peter, 2026-09-15). Not built. Dr. Walker's consultation guidance: parents make a list of rewards that matter to the child, not what the parent thinks should be enough; a reward comes as soon as possible after the agreed task; point systems only for children over 10. Different from milestone rewards under Teen, which are for reaching milestones. | M |
| **Navigation between parent screens** | Home and messages exist with nothing tying them together. | S |
| **The accommodation conversation** | **The big one.** A guided tool in the parent app that finds the accommodations with the parent, then rates them with the child — and the ratings order the plan. One switch, parents only or parents and child; the clinician being in the room does not change the flow. Planned in [`accommodation-conversation.md`](plans/accommodation-conversation.md). | L |
| **An accommodation needs a state the clinician can see and change** | **BUILT 2026-09-10** — [`accommodation-states.md`](plans/accommodation-states.md). Making one the focus marks it started. Was: `status` on `AccommodationBehavior` is set to "active" when it is created and then never read or written again. Three states: **not started, started, stopped.** Shown to the clinician on the parent plan panel, and theirs to change. **The app does not detect drift and should not try.** When the weekly focus moves on, nothing asks the parent about the old accommodation again — the clinician finds out it has come back by asking in session, and moves it back to the focus. The book is why the state matters: *"Make sure you do not go back... you will set the stage for relapse."* | M |

## The question the weekly check-in raised — answered 2026-09-10: it replaces moment logging

`ParentHomePage` already logs moments one at a time — held yes/no against the focus accommodation.
So either:

- **Both stay.** Logging a moment is in-the-moment support for the parent; the weekly check-in is
  the summary a clinician reads.
- **Or the weekly one replaces it,** because per-instance logging is the part parents will not keep
  up.

Worth putting to Dr. Walker with the parent app open, rather than deciding it in a backlog entry.

## Parent-led mode when the child has no app access

**Logged 2026-09-29, not to be designed yet (Peter's call).** As the three apps sync up — therapist
portal, child app, parent app — some patients (probably under 13, or where direct app use isn't
appropriate) may not use the child app at all. When that's the case, the parent app has to carry
what the child would otherwise get: the right information, at the right time, so the parent can
guide the child through the exposures and the plan.

- **Today.** The app assumes the child has their own login and does the work in the child app; the
  parent app shows the child's work and the parent's accommodation part. There is no mode for a
  patient with no app access — turn off the child login and the exposure side has no home.
- **What changes.** A parent-led experience: when a patient has no child app, the parent app becomes
  where the exposure work is set out and supported — what to do, when, and how to run it with the
  child — not just the accommodation side. Scope and screens to be designed.
- **How to tell it worked.** A clinician can set up a patient with no child login, and the parent
  app gives the parent enough to run the child's exposures and see progress without the child ever
  logging in.
- **Gate.** `/security-review` when built — it widens what the parent app shows of the child's plan
  (role/data scoping). Clinical: this is the **under-13 = parent-only** treatment-model decision,
  which is a leaning that needs Dr. Walker's sign-off; it's in the Dr. Walker log and in
  [`mobile-app-strategy.md`](plans/mobile-app-strategy.md).
- **Size.** L — needs a `docs/plans/` plan before code.

## Parent screens that still break the screen layout rules

**Found 2026-10-15**, while fixing the parent sign-in screen. Checked at phone width (375 wide)
against "Screen layout" in `CLAUDE.md`, signed in as the demo parent. Peter to decide which to fix.

- **Today.**
  - **Set password** (`ParentSetPasswordPage.tsx`) and **reset password**
    (`ParentResetPasswordPage.tsx`): the same centred card the sign-in screen had. Spare space is
    split above and below the card, and the button sits mid-screen instead of at the bottom.
  - **Accommodations, situation step** (`ParentAccommodationsPage.tsx`): button pinned and spare
    space above it, which is right. The gap between blocks is 16px, much tighter than the 80px
    Peter chose for the teen form screens.
  - **Home** (`ParentHomePage.tsx`): gaps between the heading, the card and the link are not all
    the same. Only seen in its empty state (see the demo-data item below).
  - **Closed treatment** (`ParentClosedPage.tsx`): not seen — the demo family's treatment is open.
    The code uses four different gaps (30, 16, 12, 20px).
  - **Progress** and **Messages**: look fine, but only seen empty.
  - Outside the parent app: the child's sign-in, set-password and reset-password screens use the
    same centred card.
- **What changes.** For each screen Peter picks: one even gap, main button pinned with
  `margin-top: auto`, spare space above it. The sign-in screen's fix
  (`ParentLoginPage.tsx`) is the pattern.
- **How to tell it worked.** Before and after screenshots at phone width.
- **Gate.** None clinical. Screen files are in CODEOWNERS.

## The demo parent cannot see the child's plan or progress

**Found 2026-10-15.** `S`

- **Today.** `backend/seed_local.py` never sets `progress_shared_with_parent_at` on the demo
  child's `patient_profiles` row. So the demo parent's home says "Your clinician hasn't shared
  Sarah's plan with you yet" and Progress says the same. Screenshots of those two screens can only
  show the empty state.
- **What changes.** Have the seed switch sharing on, the way a clinician does in the Parent access
  panel (also set `progress_shared_by_practitioner_id` to the demo clinician).
- **How to tell it worked.** `tests/test_seed_local.py` checks the parent's `/parent/progress`
  returns `shared: true`; the demo parent's home shows the child's exposures.
- **Gate.** None — local demo data only. It does not change who can see what in the app.

## The demo teen has no rungs, and the demo downward arrow breaks `S`

**Found 2026-10-21**, taking screenshots for the teen data testing page.

- **Today.** `backend/seed_local.py` (content from `seed_demo.py`) gives the demo child only safety
  and avoidance behaviors. Only situation steps are rungs (`LADDER_TYPES` in
  `backend/app/core/behavior_types.py`), so the demo teen's ladder is empty in the teen app and on
  `/teen-test`. Separately, the demo downward arrow's steps are saved with an `answer` key where
  the app expects `response`, so `GET /trigger-situations/{id}/downward-arrow` returns 500 on the
  demo patient's page.
- **What changes.** Seed three or four `scenario` steps with Fear Levels, and write the arrow steps
  with `response`.
- **How to tell it worked.** `tests/test_seed_local.py`: the demo teen's `/patient/ladder` has
  rungs, and the demo arrow loads with 200.
- **Gate.** None — local demo data only.

## Parent messages: the message box cuts off its placeholder at phone width

**Found 2026-10-15.** `S`

- **Today.** In `ParentMessagesPage.tsx` the one-row text box shows "Write a message to your
  clinician…". At 375 wide it wraps onto a second line that is cut in half.
- **What changes.** Shorter placeholder, or let the box fit it. Wording is Peter's call.
- **How to tell it worked.** Screenshot at 375 wide shows the whole placeholder.
- **Gate.** None.

## The saved list's order is arbitrary among items seen equally often

**Found 2026-10-19.** `S`

- **Today.** `get_insights` in `backend/app/services/insight_service.py` sorts by how often an
  item was seen, then by `first_seen_at`. `first_seen_at` is filled by Postgres `now()`, which is
  the same for every row written in one transaction. One press of Analyze with AI writes the whole
  list in one transaction, so the second key never separates anything. Items seen equally often
  come out in whatever order Postgres returns them. That order feeds the report call's input and
  the list the clinician sees.
- **What changes.** Add a real tiebreak, for example the order the model listed them in, or the
  fear rating.
- **How to tell it worked.** A test with two situations seen once each gets the same order every
  run, whichever is inserted first.
- **Gate.** None to fix the order. If the tiebreak chosen is the fear rating, ask Peter, since it
  decides what a clinician sees first.

# Admin

| Item | Today | Size |
|---|---|---|
| **Patient management** | List and delete only; no edit or detail. | M |
| **Waitlist** | Read-only; no approve, convert or export. | M |
| **Data / exports** | Not started. Overlaps the HIPAA patient-rights work. | M |
| **Feature flags / config** | Not started, and now has a first real use: Float admin deciding which settings each clinic may change — the consultation checklist and the sign-out timer. Needs a screen listing clinics and what each is allowed to control. `organizations.settings` is the column, and nothing reads it today. See [`clinician-settings.md`](plans/clinician-settings.md). | M |

## Demo patients for the therapist pilot

**Logged 2026-10-02 (Peter), not to be built yet.** The first pilot is therapists only — no real
patients — so they explore the platform with demo data and give feedback on its value. The
therapist-facing feature set and the agreed demo-patient shape are in
[`therapist-pilot-feature-review.md`](plans/therapist-pilot-feature-review.md).

- **Today.** One monitoring-only demo patient exists ("Maya Chen"). Nothing staged for planning or
  in-treatment, and no demo parent/teen logins set up for the pilot.
- **What changes.** Build the agreed demo set so every feature on the pilot list has something to
  show: a monitoring-only patient, one in planning (situations + a downward arrow or two + a
  half-built ladder/accommodations), one in treatment (full ladder + accommodations + a run of
  completed exposures for the charts + session notes + parent chat), and optionally a closed one.
  Plus demo parent and teen logins so the therapist can see the family apps (shown as "what's there
  today" — the family apps are about to be redesigned).
- **How to tell it worked.** A pilot therapist logs into a demo account and can click through every
  feature on the review list with realistic data, and open the matching parent/teen demo logins.
- **Gate.** None clinical — demo data, no real PHI. Keep it clearly marked as test data.
- **Size.** M — scripted seed data; depends on the feature list being finalised in/out first.

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

**BUILT 2026-09-10** — [`scheduled-jobs.md`](plans/scheduled-jobs.md). A Railway service
(`floatcbt-jobs`) runs `python -m app.jobs.run` every 15 minutes: the child's exposure-day email, the
parent's Sunday check-in email, and the missed-exposure check. Email only; texts wait on A2P 10DLC
registration. The arrow harvest is not on it yet.

**Priority: blocks three separate features.** `L`

**Today:** reminders and missed-experiment detection fire only from a manual admin POST. Teen
reminders, parent exposure reminders and the arrow harvest all want one.

**What changes:** a scheduled runner. Railway cron is the obvious first answer since the service is
already there.

**How to tell it worked:** something fires on its own, and a failure is visible rather than silent.

## Session mode does not offer "ritual" as a behaviour type

**Priority: low** (Peter, 2026-09-13). Session mode derives the type from the child's words: "I do this…"
is a safety behaviour, "I avoid this altogether" is avoidance. Ritual is only settable in the hidden
Plan-tab builder. Whether session mode should offer it is a question for Dr. Walker, not on her
current list.

## Scalability upgrades

**Priority: not needed before the first launch** (Peter, 2026-09-15). Do them as real usage grows.

**Today:** one copy of the server running one process, with at most 15 database connections. Claude
write-ups and session recording uploads run in that same process. Nobody has load-tested it. A rough
guess is a few hundred people using it at the same moment. In the week to 2026-09-15 the busiest day
was about 4,800 requests, using about 6% of one processor core.

**What changes, roughly in order:**
1. **Load test** against a copy of the app, not production, to get a real number. `S`
2. **More server processes** on the one copy: a change to the start command. `S`
3. **A second server copy** on Railway. This also keeps the app up during a restart. Check first that
   nothing assumes only one copy is running. `S`–`M`
4. **Move slow work to its own worker** (Claude write-ups, Google transcription), so a burst of them
   does not slow clinicians clicking around. `M`
5. **Recording uploads go straight from the phone to Google** with a short-lived upload link, instead
   of through the server. `M`
6. **Database size and backups** checked as real data arrives. `S`

**How to tell it worked:** the load test number goes up after each step, and response times stay
where they are now at the expected number of users.

---

## Google Workspace email for floatcbt.com — DKIM not published

**Raised 2026-09-16.** `S`. No code — Google Admin console and DNS only.

Setting up Google Workspace mail on **pete@floatcbt.com**. Getting into Gmail was blocked by "you do
not have access to Gmail — enable it in your Admin Console." Cause: no Gmail licence was assigned to
the user (upgrading the plan adds licences to the pool but does not attach one). Fixed by assigning a
licence in Admin → Directory → Users → pete@floatcbt.com → Licenses.

DNS for floatcbt.com is managed at **Netlify** (nameservers are `dns*.p06.nsone.net`). Confirmed live
at Netlify's own nameserver on 2026-09-16:

- MX → `smtp.google.com` (incoming mail routes to Google)
- SPF → `v=spf1 include:_spf.google.com ~all`
- DMARC → `v=DMARC1; p=none;`

**What is left:** DKIM is not published. In Admin → Apps → Google Workspace → Gmail → Authenticate
email, generate the key and publish the TXT record it gives you at host `google._domainkey`. Peter
said he added it, but nothing resolves under `google._domainkey.floatcbt.com`, the doubled-name
version, or `default._domainkey`. Likely one of: the Netlify name field is wrong (must be exactly
`google._domainkey` — Netlify appends `.floatcbt.com`), or Netlify rejected the value because a
2048-bit key is too long (a known Netlify limit — regenerate as 1024-bit in the Admin screen and
re-add). After it saves, return to the Admin DKIM screen and click **Start authentication**.

**How to tell it worked:** `dig +short TXT google._domainkey.floatcbt.com` returns the `v=DKIM1; …`
value, and the Admin DKIM screen shows it authenticating. None of this is needed to open Gmail or
receive mail — only to keep mail Float *sends from Google* out of spam.

**Separate, worth checking before tightening DMARC:** the SPF record only authorises Google. The
Railway backend already sends waitlist email — if that goes out through Resend or another service,
that sender is not in SPF and its mail can fail authentication. Confirm the real sending path before
moving DMARC past `p=none`.

## Smaller, already agreed

- **~~`behavior_type` holds 11 distinct values across 136 rows~~ — DONE 2026-09-01.** Folded onto
  five canonical values. The nine rows that were never behaviours — monitoring observations like
  "Complained of stomach pain" — are typed `observation` and no longer appear on any ladder. See
  [`exposure-ladder-sub-situations.md`](plans/exposure-ladder-sub-situations.md).
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
- **The Mac mini has no browser for screenshots.** `S` Found 2026-10-15. **Today:** the Playwright
  tool the agents use looks for Google Chrome at `/Applications/Google Chrome.app` and it is not
  installed, and there is no Playwright browser in `~/Library/Caches/ms-playwright`. So an agent on
  the mini cannot open the web app or take the screenshots CLAUDE.md requires for a screen change.
  **What changes:** install Chrome on the mini (or run `npx playwright install chrome`), and add it
  to `docs/plans/agent-machine-setup.md`. **How to tell it worked:** an agent can open
  `http://localhost:5173/login` with the Playwright tool. **Gate:** none.
  **Update 2026-10-15 (later):** the Playwright tool opened the web app and took screenshots on the
  mini for the parent sign-in fix, so this may already be done. Check before working on it.
- **`backend/seed_demo.py` no longer runs.** `S` Found 2026-10-15. **Today:** it writes columns
  that migrations have since removed or renamed (`patient_profiles.date_of_birth`,
  `avoidance_behaviors.distress_thermometer`), and it needs a practice and clinician whose IDs exist
  only in production. `backend/seed_local.py` replaces it for local work and carries the same
  example content. **What changes:** delete `seed_demo.py`, unless Peter still wants a script that
  adds the demo family to an existing practice. **How to tell it worked:** nothing imports it.
  **Gate:** none.
- **`/verify` does not work as written on the Mac mini.** `S` Found 2026-10-19. **Today:**
  `.claude/commands/verify.md` says to start the test database with `docker compose` and run
  `./.venv/bin/python` from `backend/`. The mini has no Docker. Its test database is a local service
  on port 55432 (`docs/plans/agent-machine-setup.md`), and a worktree has no `backend/.venv`; the
  environment is `~/code/float/backend/.venv`. The tests pass once run that way. **What changes:**
  make the first step say what to do on the mini (skip Docker if port 55432 answers, use the shared
  environment). **How to tell it worked:** an agent on the mini can follow `/verify` word for word.
  **Gate:** none.
- **The AI test tools' own tests run nowhere automatically.** `S` Found 2026-10-19. **Today:** CI
  (`.github/workflows/ci.yml`) runs `pytest` in `backend/` only, and `/verify` runs `backend/tests/`.
  The tests in `AI-dev/evals/runner/tests/`, `AI-dev/evals/judging/tests/` and
  `AI-dev/evals/generator/test_generator.py` run only when someone runs them by hand. A change to
  the backend (a renamed function in `insight_service.py`, say) can break the runner, which imports
  it, with CI green. The tests use a fake AI client, so they need no API key and cost nothing.
  **What changes:** add a step to the backend CI job, and a line to `/verify`, that runs those three.
  **How to tell it worked:** breaking an import the runner uses makes CI fail. **Gate:** waits for
  Peter (it changes `.github/`).

---

# AI features

## Change the production database password — DONE 2026-09-15

**DONE 2026-09-15.** Peter changed it in the database itself and updated every Railway variable that holds it: the Postgres service's `POSTGRES_PASSWORD`, `PGPASSWORD`, `DATABASE_URL` and `DATABASE_PUBLIC_URL`, and `DATABASE_URL` and `ASYNC_DATABASE_URL` on floatcbt and floatcbt-jobs. Raised 2026-08-29, deferred the same day. `S`

Worth knowing for next time: Railway's **Redeploy** re-runs the old deployment with its old variables, so it kept failing on the old password. A new deployment (a push) is what picks up changed variables.

The password was pasted into a chat transcript on 2026-08-29, so treat it as known. It was printed into a session transcript again on 2026-09-15, when `railway connect` showed it while creating review rounds.

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

## Improving monitoring extraction

**Rewritten 2026-09-15.** The old entry ("extraction discards the clinician's corrections") described
a review screen that no longer exists. Today Analyze with AI saves the AI's list as suggestions, and
Float records whether a clinician added or dismissed each situation and accommodation suggestion.

**1. The test tool tests the app — DONE 2026-09-15.** `AI-dev/Extraction Loop/float_harness` now
uses the app's prompt, call and input, not its own copy (deleted). The 18 cases are split 9 tuning,
9 held out. First real score of the app's prompt: behavior types 0.65 on the tuning half, 0.72 held
out (the 0.926 on record came from the old copy). Recurring situations are merged before scoring,
the way the app returns them. Details in the tool's README and `runs/20260915_161200`.

What the run showed, from 18 cases:
- **One reply the app could not read** (case 8, both runs): the model wrote its reasoning before
  the JSON. In the app that was an "AI analysis failed" error. **FIXED 2026-09-15:** the app's
  reader (`parse_model_json`) now finds the answer after reasoning or inside a fenced block.
- Differences from the confirmed answers, mostly: one action split into two behaviors, `unclear`
  where the answer is `avoidance`, and `safety` where the answer is `escape`. Eighteen cases is too
  few to say which of these are patterns.

**2b. Dr. Walker's review rounds — OUT 2026-09-15.** Two rounds on the review link, built by
`float_harness/review/build_rounds.py` from made-up notes: `extraction-disagreements-1` (8 places
the AI and her June answers disagree on behavior type) and `extraction-samples-1` (16 new notes, 67
things to mark). Answers: Admin → Reviews. Next: fold her answers into the test cases, then
look at the prompt.

**2. Clinicians' choices as cases for Dr. Walker — needs a decision.** `M`
Planned with Peter 2026-09-15: a read-only query Peter runs in Railway, and a local script that
turns each patient into a case (the log, the AI's suggestions, what the clinician did) marked
"needs review". The output stays off the repository. Run it once real clinicians have used Analyze.

Found while checking, before building:
- **Behavior suggestions are never shown to clinicians.** Only situations (session mode) and
  accommodations (parent plan) can be added or dismissed. Behaviors on the ladder come from the
  session, not the suggestions. So there is no clinician choice about behavior types to learn from,
  and behavior types are what the tool scores.
- **Re-analyzing folds runs together.** Suggestions are matched by name; a new name adds a new
  suggestion, and the fear rating and behavior type are overwritten by the latest run. A case from
  a patient analyzed more than once is the combined list, not one AI answer.

**Gate:** `/security-review` on anything that reads patients' records out of production.

## Analyze with AI loses evidence when it names a situation twice `S`
- **Today:** `entry_ids_by_situation` in `backend/app/services/insight_service.py` keys its answer
  by normalised name and sets `out[key] = ids`. When the model returns two situations with the same
  name (it does: the AI test runner counts these as "split"), the second one's entries replace the
  first's. `rebuild_from_monitoring` then looks up that one list for both, so the log entries behind
  the first are never saved as its evidence. Found 2026-10-19 while building `AI-dev/evals/runner/`.
- **What changes:** add the ids to the list already there instead of replacing it.
- **How to tell it worked:** a test in `backend/tests/test_patient_insights.py` where an extraction
  names "Bedtime" twice with entries [1] and [2], and the saved situation's evidence holds both.
- **Gate:** none. **Depends on:** nothing.

## A voice note write-up with quote marks in it cannot be read `S`
- **Today:** when the parent quotes the child ("he kept calling out are you awake"), Claude
  sometimes writes the quote with plain `"` marks inside the JSON string, without escaping them.
  `parse_model_json` in `backend/app/services/insight_service.py` cannot read that reply, so
  `write_up` in `monitoring_capture.py` fails and the note is saved as the parent's words alone,
  with no observation. Found 2026-10-19 by the voice notes test run: 3 of 96 runs, on 2 of 32 notes.
  The words are kept, but the clinician gets no write-up, and a Fear Level the parent said in the
  note is lost: on 2026-10-21 this was 1 of 48 runs where a Fear Level was said before the
  "like"/"about" fix and 2 of 48 after, all on the same note (the voice notes test run, 18 working
  families, 3 runs each).
- **What changes:** one of: ask for the reply with tool use or structured output, so the JSON is
  always valid; or tell the model to use single quotes for quoted speech; or a reader that repairs
  unescaped inner quotes. The first is the sturdiest. A prompt change needs Peter's approval.
- **How to tell it worked:** a test that a reply with unescaped quotes inside a value is read (if
  the reader changes), and `app_can_read` at 0 failed runs on the voice notes test run.
- **Gate:** Peter's review if the prompt changes. **Depends on:** nothing.

## The voice notes answer key marks a range's lower number as the right Fear Level `S`
- **Today:** Peter decided on 2026-10-21 that a Fear Level said as a range ("a seven or eight")
  saves the higher number, and the voice note prompt now says so. The pool's answer keys were
  written before that, by the agents that made the families, and give the lower number
  (`fear_level_said` in `AI-dev/evals/pool/families/fam-health-05.json`, voice note 2, the only
  working note found with a range). So `run.py --feature voice_notes` counts the right answer as
  "a Fear Level saved that the parent did not say": 3 of 3 runs on that note, on 2026-10-21. The
  runner's report says so in its "don't cover" list (`AI-dev/evals/runner/voice_notes.py`). Held-out
  families in `AI-dev/evals/judging/` may have the same problem; nobody has looked.
- **What changes:** set the answer key of each range note to its higher number, in the pool and,
  with Peter's approval (`judging/` is his), in the held-out families. Then drop the range line from
  the runner's "don't cover" list. Not done in the pull request that changed the prompt, so that a
  prompt change did not also change how it is marked.
- **How to tell it worked:** a voice notes run shows 0 "Fear Levels saved that the parent did not
  say" with the range note counted as saved.
- **Gate:** Peter approves the `judging/` part. **Depends on:** the range prompt change merged.

## A drafted step sentence in quote marks keeps its closing quote `S`
- **Today:** `clean` in `backend/app/services/combination_wording.py` strips quote marks from the
  start and end of the whole reply, then keeps the first line. When the model writes the sentence in
  quotes and then a second line ("Why: ..."), the closing quote is in the middle of the reply, so it
  is not stripped and the clinician sees `Say hello on your own"`. Found 2026-10-20 while writing the
  step-sentence tests; not seen in a real run.
- **What changes:** take the first line first, then strip the quotes.
- **How to tell it worked:** a backend test that `clean('"Say hello"\nWhy: ...')` is `Say hello`.
- **Gate:** none. **Depends on:** nothing.

## A held-out test fails on main `S`
- **Today:** `AI-dev/evals/judging/tests/test_held_out.py::test_output_has_scores_and_counts_and_no_case_text`
  fails on main (seen 2026-10-19 at 85dd09b). It looks for `"Situations found: "` in the printed
  report, but the runner's report writes scores as a table (`| Situations found | ...`). The
  report changed in #36 and the judging folder came in #34 at the same time. CI does not run the
  `AI-dev/evals` tests, so nothing caught it.
- **What changes:** the test or the report. The judging folder is Peter's (CODEOWNERS), so an
  agent should not edit the test. Also worth adding the `AI-dev/evals` tests to CI.
- **How to tell it worked:** `pytest AI-dev/evals/judging/tests` passes.
- **Gate:** Peter (judging folder). **Depends on:** nothing.

## The copy check does not read the reviewers' instructions `S`
- **Today:** `AI-dev/evals/check_no_cases_in_prompts.py` treats the strings in `backend/app/` as
  prompt text. The reviewing agents' instructions are Markdown in
  `AI-dev/evals/judging/reviewers/`, so a test case pasted into them would not be caught. Dr.
  Walker's written rules quote several of the 60 rung cases, so this is an easy mistake to make
  when the instructions are next edited. Found 2026-10-20 while building the reviewers.
- **What changes:** add the reviewers' `.md` files to the prompt side of the check.
- **How to tell it worked:** a test in the check's tests that a case line pasted into a reviewer
  file fails the check, and the check passes on main.
- **Gate:** Peter (the judging folder and CI are his in CODEOWNERS). **Depends on:** nothing.

## Monitoring form: the helper text says the link is copied, but it isn't `S`
- **Today:** on the Monitoring tab, the text by "Create monitoring form" says it emails anyone with
  an email "and copies the link" (`apps/web/src/pages/practitioner/PatientPage.tsx` near line
  1248). The code deliberately does not copy it (comment near lines 707-709). Found 2026-10-21 while
  building the UI test checklist.
- **What changes:** make the text say what happens: it emails each parent who has an email, and
  each link can be copied below.
- **How to tell it worked:** the text matches what the button does. Screenshot in the PR.
- **Gate:** screen change, so Peter approves (CODEOWNERS). **Depends on:** nothing.

## Monitoring form: the "Email sent" confirmation is probably never seen `S`
- **Today:** the green "✓ Email sent to …" banner (`PatientPage.tsx` near lines 1223-1226) sits in
  the view shown before a form exists. Creating the form replaces that view, so the banner likely
  disappears at once. Found 2026-10-21 from the code; not yet seen on a screen.
- **What changes:** check it on a screen first. If it is hidden, show the confirmation in the view
  that follows.
- **How to tell it worked:** after Create monitoring form, the clinician sees who was emailed.
- **Gate:** screen change, so Peter approves. **Depends on:** nothing.

## Parent monitoring form: "Get the link sent to me again" sends nothing `S`
- **Today:** on the parent's monitoring form, the Send button only shows "Link sent! Check your
  email or messages." No request is made and nothing is sent
  (`apps/web/src/pages/monitor/MonitorLandingPage.tsx` near lines 424-431). Found 2026-10-21.
- **What changes:** either send the link again, or remove the option until it can. Peter decides
  which.
- **How to tell it worked:** the parent never sees "sent" when nothing was sent.
- **Gate:** screen change, so Peter approves. **Depends on:** nothing.

## Parent set-password allows 6 characters; everywhere else needs 8 `S`
- **Today:** `apps/web/src/pages/parent/ParentSetPasswordPage.tsx` (line 19) accepts 6 characters.
  Clinician setup, password reset and settings require 8. Found 2026-10-21. Check what the backend
  enforces before changing the screen.
- **What changes:** the same minimum everywhere, enforced by the backend as well as the screen.
- **How to tell it worked:** a test that a 7-character parent password is refused.
- **Gate:** touches sign-in, so `/security-review`. **Depends on:** nothing.

## Parent experiments: the clinician can set one up, but the parent never sees it `M`
- **Today:** the clinician sets up an experiment with the parent on the Exposures tab
  (`apps/web/src/components/practitioner/ParentExperimentSheet.tsx`). No parent screen shows or
  records it, though `apps/web/src/api/parentExperiments.ts` has the functions. Found 2026-10-21.
- **What changes:** a product decision first: should the parent see and record these in their app?
  If yes, it needs a plan.
- **How to tell it worked:** to be decided with the plan.
- **Gate:** clinical (accommodation work), so Peter decides. **Depends on:** nothing.

## The morning report's "Not tested yet" list is out of date `S`
- **Today:** `NOT_TESTED` in `AI-dev/evals/nightly.py` still says suggested rungs are not run and
  that there are no reviewing agents. Since 2026-10-20 the nightly run tests suggested rungs, and
  the reviewers exist (`AI-dev/evals/judging/reviewers.py`), though they are not part of the
  nightly run. Found 2026-10-20 in a dry run of the schedule.
- **What changes:** say what is really untested: step sentences, the reviewers in the nightly run,
  session notes, the downward arrow, and the risk flag.
- **How to tell it worked:** a dry run's "Not tested yet" section matches what the night ran.
- **Gate:** none. **Depends on:** nothing.

## Three AI calls stop the backend answering anyone else while they wait `S`
- **Today:** three routes are `async` but call Claude with the blocking client
  (`anthropic.Anthropic`, not `AsyncAnthropic`) and do not hand the call to a thread:
  `ask_claude` in `backend/app/services/step_suggestion_service.py` (suggested rungs),
  `next_probe` in `backend/app/api/routers/downward_arrows.py`, and `generate_preliminary_report`
  in `backend/app/api/routers/patients.py` (two calls in a row). While one of these waits on Claude,
  a few seconds each, the server answers no other request. With one clinician testing it is
  invisible; with a family's app polling at the same time it is a pause. Found 2026-10-20 while
  enforcing the rung limits. `insight_service.py` and `monitoring_capture.py` already do it right
  (`asyncio.to_thread`, or the async client).
- **What changes:** wrap each call in `asyncio.to_thread`, or use `AsyncAnthropic`. Keep the
  `client=` argument the AI test runner passes in working.
- **How to tell it worked:** a test that starts a slow fake suggestion call and shows another
  request answers before it finishes. The runner tests in `AI-dev/evals/runner/tests` still pass.
- **Gate:** none. **Depends on:** nothing.

## AI analysis of session notes

**Raised 2026-09-17.** `M` (plan first if it grows past a summary).

**Today:** the app can write a draft session note from a recording (the Claude write-up), and it
analyses the parent *monitoring* log ("Analyze with AI"). Nothing reads the *content* of the written
session notes. A clinician with several sessions on a patient re-reads them by hand.

**What it could do:** read a patient's session notes and surface what's useful across them — recurring
themes, what changed since the last session, open threads to follow up, a pre-session summary. Which
of these is worth building is the first question, not a given.

**Open questions (Peter's):** what output actually helps a clinician (a running summary? a pre-session
brief? follow-up flags?), and whether it writes anything back or is read-only. Note a pre-session
brief existed and was deliberately removed (see the Session notes item under Clinician) — check why
before rebuilding that shape.

**How to tell it worked:** a clinician opening a patient with several notes gets something they would
otherwise have re-read every note to get, and confirms it is right.

**Gate:** `/security-review` — it reads patient records (session notes are PHI). Clinical sign-off
(Peter's discretion pre-launch) on any clinical wording it produces. Sending note text to the model
is the same PHI-to-Anthropic path as extraction — covered by the BAA item under Compliance.

## No way to read a review's results

**BUILT 2026-09-15:** Admin → Reviews (`/admin/reviews`) shows every round, every item, each reviewer's choice, additions and comments. Raised 2026-08-31. `S`

Each reviewer's link shows only their own marks and comments — enforced, and tested. There is no
screen showing what everyone said, so reading Dr. Walker's answers means opening the tunnel and
querying `review_marks`, `review_additions` and `review_comments` by hand.

Fine for one round. Worth an hour when there is a second, since the same tool is meant to carry the
extraction and arrow reviews too: one page, every suggestion, how each reviewer marked it and what
they wrote.

## The AI test runner numbers a log out of date order differently from the app `S`
- **Today:** `prepare` in `AI-dev/evals/runner/monitoring_analysis.py` numbers the pool's log
  entries in file order. The route reads them oldest first (`order_by(MonitoringEntry.entry_date)` in
  `generate_preliminary_report`, `backend/app/api/routers/patients.py`). One pool family,
  `fam-separation-06`, has its log out of date order, so the runner sends the model a differently
  numbered log than the app would. It is held out, so the working runs so far are not affected.
  Found 2026-10-19 while building `AI-dev/evals/runner/compare_triggers.py`, which sorts first
  (`in_date_order`).
- **What changes:** sort the case's log by date in `prepare` (or in `cases._monitoring_analysis`),
  keeping each entry's `situation_ref` beside it. `compare_triggers.in_date_order` already does this.
- **How to tell it worked:** a runner test that reverses a family's log and gets the same numbered
  text and the same scores.
- **Gate:** none. **Depends on:** nothing.

## A held-out test fails on main since the runner's report became a table `S`
- **Today:** `test_output_has_scores_and_counts_and_no_case_text[fmt0]` in
  `AI-dev/evals/judging/tests/test_held_out.py` asserts `"Situations found: "` is in the printed
  report. Since #36 (`Score monitoring analysis on the pool`) `report.markdown` in
  `AI-dev/evals/runner/report.py` prints the scores as a table (`| Situations found | ... |`), so the
  test fails on main (checked at `85dd09b`, 2026-10-19). The judging folder is Peter's (CODEOWNERS).
- **What changes:** Peter decides whether the test should look for the table row instead. Agents do
  not edit `AI-dev/evals/judging/`.
- **How to tell it worked:** `pytest AI-dev/evals/judging/tests` passes on main.
- **Gate:** Peter (CODEOWNERS). **Depends on:** nothing.

## The preliminary report writes British spellings `S`
- **Today:** on the 2026-10-19 trigger run (`AI-dev/evals/runner/compare_triggers.py`, 54 runs) the
  report's situation names included "shopping centres", "public transport" and "travelling". The
  report is shown to clinicians. `PRELIMINARY_REPORT_SYSTEM_PROMPT` in
  `backend/app/api/routers/patients.py` says nothing about spelling. Float is US-only and uses
  American spelling. How often it happens was not counted.
- **What changes:** count it on the pool first (the runner's `outputs.jsonl` has the answers). If it
  is more than a stray case, add American spelling to the prompt. That is a prompt change, so Peter
  approves it.
- **How to tell it worked:** a count, before and after, of British spellings in report runs.
- **Gate:** prompt change waits for Peter. **Depends on:** nothing.

## A stopped test run keeps no report and no record of what it spent `S`
- **Today:** `AI-dev/evals/runner/run.py` writes `report.md`, `report.json` and `outputs.jsonl` only
  after the last case. If the process is killed part-way, nothing is written, so the runs are lost
  and nobody can tell what they cost. On 2026-10-21 four runs (monitoring analysis and suggested
  rungs) were stopped by a 10-minute time limit on the agent's background commands, after spending
  an unknown amount up to their caps ($7.20 in total). The rest of that session had to plan its
  spending from the caps, not from what was actually spent.
- **What changes:** have the runner write what it spent, and the runs done so far, as it goes (for
  example, one line to `outputs.jsonl` and an updated `spent_usd` after each case), or catch the
  stop signal and write the report before exiting.
- **How to tell it worked:** a runner test that stops a run part-way and finds the cases done so
  far, and the amount spent, on disk.
- **Gate:** none. **Depends on:** nothing.

## Short case phrases in the rung prompt that the copy check cannot see

Found 2026-10-19 while building the check that no test case is in a prompt
(`AI-dev/evals/check_no_cases_in_prompts.py`). `S`

- **Today:** the check needs 7 words in a row to match. Two examples in the suggested-rungs prompt
  (`SYSTEM_PROMPT` in `backend/app/services/step_suggestion_service.py`, rule 2) are shorter copies
  of rung cases. "Play the first ten minutes" is a target in `AI-dev/Ladder Eval/` case
  `sit-82f50a2f`. "Stay until bedtime then get picked up" is close to a target in case
  `sit-b2a0b25a` ("Stay at the group sleepover until bedtime, then get picked up"). The check also
  cannot see the Kemp case in the preliminary report prompt, because it was reworded on the way in
  (`backend/evals/preliminary_report/cases/kemp.json` already says it is not a real test).
- **What changes:** nothing in the prompt without Peter. Decide whether those two rung cases still
  count as tests. If not, mark them as spent in their case files. If so, reword the prompt examples
  so they come from no case (a prompt change, so Peter approves it).
- **How to tell it worked:** the two cases are either marked spent, or share no phrase with the
  prompt.
- **Gate:** the prompt change waits for Peter. **Depends on:** nothing.

## Ladder generation — build it

**PAUSED 2026-08-31.** Waiting on seed data from Dr. Walker; she judged our case set a bad place to start and is writing her own. Nothing to do until it arrives.

`L`. Planned in [`ladder-generation.md`](plans/ladder-generation.md); decisions settled 2026-08-28.
61 real situations are pulled as candidate cases and six mechanical checks are written.

**Waiting on:** Dr. Walker's review (link live at `/review/<token>`), then the scorer, then the
feature. The scorer is not optional here — narrowing a situation *means* adding specifics, so there
is no word-level safety check the way there was for the arrow.

---

# Education content

## The content plan — every item

From the one-page content plan (Peter, 2026-09-15):
https://claude.ai/artifact/FYw2twvuhxY3qQ2fJthTM5. Writing the content is not engineering work; each
item also needs a place in the app, noted where it is known. "From Dr. Walker's guidance" lists
topics her consultation guidance (2026-09-15) says the item should cover.

| Item | For | Status | Notes |
|---|---|---|---|
| **Key concept videos** | Child and parent | In production. First sample made. | Working list of topics (Peter, 2026-09-15): Distress Thermometer; Worry Hill; The Candy Jar; Nickname the Fear; Rewards; The Exposure Ladder; How Exposures Work; Doing Exposures; The Parent Role &amp; Accommodations. Getting them into the apps is the video item below. |
| **Clinical reference** | Clinician | Drafted. 8 modules, design done, clinical review next. | From Dr. Walker's guidance, not yet covered: scripts for what CBT is and how and why exposures work; pacing the consultation; the structure of a weekly session; working in session (reviewing the session 1 video, a cheat sheet, notes). Progress saved on one device only: see Clinician education modules under Clinician. |
| **Tips for the clinician** | Clinician | Not written. Places for them exist. | At the step where needed: the consultation checklist, building the ladder and the parent plan, running a session. |
| **Tips for the child** | Child | Not written (Peter, 2026-09-16). | The way to deliver them is built — just-in-time tips on the exposure screen, admin can add them — and what is in there now is sample text. |
| **Tips for the parent** | Parent | Not written (Peter, 2026-09-16). | The way to deliver them is built; what is in there now is sample text. From Dr. Walker's guidance, topics to cover: using the nickname and the Distress Thermometer at home; parental accommodation; rewards. |
| **Parent guides** | Parent | Not started. | Longer written education, with examples. Before each consultation meeting, and in the parent's app during treatment. From Dr. Walker's guidance: what to expect before the consultation and how to prepare; obvious and less obvious signs of anxiety; the downward arrow; exposures in words (consultation part 2); parental accommodation; what ongoing treatment looks like; rewards. No place in the app yet, and the parent has no app during the monitoring week. |
| **Session materials and handouts** | Clinician, with the family | Not started. | Visuals to show in session (the Worry Hill, the Fear Level scale, a ladder) and handouts to take home. From Dr. Walker's guidance: monitoring instructions for parents (why both parents, for a week). |
| **Getting started** | Child and parent | Not started. | The first time they open their app: what Float is, what they will do, who sees what. |
| **Privacy and consent, in plain language** | Child and parent | Not started. | Before anything is recorded or shared: what is recorded, what the clinician and parent can see, what stays private. |
| **If things get worse** | Child and parent | Not started. | Always easy to find: when to contact the clinician, where to go in a crisis. |
| **Encouragement, reminders and notifications** | Child and parent | Partly written. Reminder emails exist. | Celebrating progress, and reminders by email or in the app. |

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

## Next after the ladder build — a child's login opens the clinician app

**Reported by Peter, 2026-09-10:** *"i saw that i can log into the clinical portal with a teen login."*
He asked for it to be done at the end of the ladder build. Same day: *"check parents cannot log into
clinician portal also."* So both — a child's and a parent's account.

A child's account should never get into the clinician app. That is a role boundary, so it gets a
security review (non-negotiable #2). To check: whether the clinician sign-in refuses a patient
account, whether the clinician app's pages check the role, and — most important — whether any
clinician endpoint returns data to a patient's token.

**Done 2026-09-10.** The server already refused a child's and a parent's login on every clinician
route; now a test proves it for their own family's ids (`backend/tests/test_role_boundary.py`). The
clinician app now checks the account before signing in, and signs out a saved session that is not a
clinician's. Security review: no high or medium findings once the saved-token bug it found was
fixed. See [`own-family-role-crossing.md`](solutions/own-family-role-crossing.md).

## Two older gaps the 2026-09-10 security review noticed (not caused by that change)

- `POST /rungs/{rung_id}/experiments` and `POST /patient/rungs/{rung_id}/experiments` create an
  exposure from an old-style ladder rung without checking the rung belongs to the child. The
  exposure is still saved under the child's own id, so nothing of another child's is read or
  changed — but it can point at another child's rung.
- The child routes in `experiments.py` use their own copy of `get_patient_context`, which skips the
  check that stops a child whose treatment has been closed from making changes.
- Noticed by the 2026-09-11 review of what needs attention: when a clinician creates an exposure
  (`experiments.py`, the two create routes around lines 106 and 152), its step is checked against
  the clinic but not against the patient. The clinician's screens now show that step's name, so an
  exposure pointed at another patient's step would show that name. Using it needs the other step's
  id, which cannot be guessed. Tighten the check to the patient.
