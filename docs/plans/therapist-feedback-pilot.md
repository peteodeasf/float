# Therapist feedback pilot — plan

**Planned 2026-11-17** with Peter. **Status:** plan, not started.
Builds on [`therapist-pilot-feature-review.md`](therapist-pilot-feature-review.md) (the feature
list and the agreed demo patients, 2026-10-02) and the backlog item "Demo patients for the
therapist pilot."

## Goal

Find out from 5–6 therapists what they think of the clinician app as it is today, and what is
missing before it would be worth using with their own patients.

It has two parts:

1. **Demo.** Peter shows the clinician app to the therapists, using demo patients.
2. **Hands-on trial.** Some or all of the same therapists get their own login and try the same
   features themselves, on their own copy of the demo patients.

No real patients take part. Nothing in the pilot is used for treatment.

Serves "the basic clinician platform" in `STRATEGY.md`.

## What we want to learn

Three questions, asked about each feature shown:

1. **Is it useful?** Would they use it with a real family?
2. **Is it right?** Does it match how they actually work: monitoring, the downward arrow, the
   exposure ladder, working with parents?
3. **What is missing?** What would stop them using Float, or what would they need first?

Plus one overall question: would they use Float with their patients, and what would it take?

## Scope

**In:**

- Demo patients that show each feature in a realistic state.
- One login per therapist, each in its own practice, each with its own copy of the demo patients.
- Demo parent and teen logins for each copy, so a therapist can see what the family sees.
- A demo script for Peter and a task list for the trial.
- A way to collect and write up the feedback.

**Out:**

- Real patients, or any real patient information.
- New features. The pilot tests what is built. Gaps go on the backlog.
- Features that are not finished. See "Features to leave out" below.

## Part 1 — the demo

- **Who:** 5–6 therapists. One at a time or as a group is Peter's call. One at a time gets more
  honest answers. A group is quicker.
- **Length:** about 45–60 minutes. About 30 minutes showing, and the rest questions.
- **Account:** Peter demos from a practice of his own, "Float Demo," with the demo patients in
  it. Not his test account, which has odd test data in it.
- **Order:** follow one family through treatment, so each feature appears where it is used:
  1. Patient list. The stages, and the suggested next step for each patient.
  2. Monitoring. What the parent reported in the first week, and the suggestions drawn from it.
  3. The downward arrow, on one situation.
  4. The plan. Situations with fear ratings, the exposure ladder, the accommodation ladder.
  5. Session mode, and session notes.
  6. Progress. The child's completed exposures, predicted and actual fear, the streak.
  7. Working with the parent. Accommodation states, the weekly check-in, chat.
  8. A short look at the teen app and the parent app. Say plainly that both are being
     redesigned now and this is what is there today.
  9. Education and Tools.
- **Record it** (with their permission) or have a second person take notes. Notes are written up
  the same day.
- **At the end,** ask the questions in "Collecting feedback," then ask who wants the hands-on trial.

## Part 2 — the hands-on trial

- **Who:** those from the demo who want to take part.
- **How long:** two weeks. Long enough to come back to it a few times, and short enough that they
  remember it.
- **What they get:**
  - A login to their own practice, set up with the same demo patients they saw.
  - The teen and parent logins for their demo family.
  - A one-page guide: how to sign in, the demo families, and a short task list.
  - A short note at the top: do not type in anything about real patients.
- **Task list,** so everyone tries the same things:
  1. Open the patient in monitoring. Read the report and add two suggestions to the plan.
  2. Do a downward arrow on a situation.
  3. Finish the half-built plan. Add a rung and rate it. Set an accommodation's state.
  4. Open the patient in treatment. Read their Progress. Send the parent a message.
  5. Sign in as the teen and do one exposure. Then see it appear on the clinician side.
  6. Add a new, made-up patient and go as far as you like.
  7. Read one Education module.
- **Halfway:** one short check-in email asking if anything is stuck.
- **At the end:** a 30-minute call with each therapist, then their login is switched off.

## Features to leave out, or show as "not finished"

Peter decides each one. From the feature review and the backlog:

- **AI session analysis.** A button that does nothing yet. Hide it, or say it is coming.
- **Reminders.** Not built. Do not show them as if they work.
- **Parent experiments.** The clinician can set one up, but the parent never sees it. Leave out.
- **Action plans.** Hidden today. Leave out.
- **Two parents per child, and rewards.** Not built.
- **The teen and parent apps.** Show them, but as "today's version, being redesigned."

## The demo patients

As agreed on 2026-10-02, with names and stories made up for the pilot:

1. **Monitoring only.** A week of parent monitoring, including a voice note, with suggestions
   drawn from it. Nothing on the plan yet.
2. **In planning.** Situations with fear ratings, one or two downward arrows done, the exposure
   ladder and accommodation ladder half built.
3. **In treatment.** A full plan. About four weeks of exposures, a mix of done, too hard and
   missed, so the Progress charts and streak have something to show. Session notes. Parent chat.
   Weekly check-ins. Accommodations in different states. Teen and parent logins.
4. **Closed** (optional). A finished course of treatment, to show the whole journey.

**Make them believable.** A therapist will stop trusting the app if a case does not ring true.
Ask Dr. Walker to read the four cases before the demo. This is not a clinical sign-off. It is a
check that the cases look real.

**Different kinds of anxiety** across the four (for example social anxiety, separation anxiety,
a specific fear), so therapists see the app is not built for one kind only.

**Dates stay current.** The in-treatment patient's exposures must end "yesterday," not on the day
the data was written. Otherwise by the trial the charts show weeks with nothing in them. See
`docs/solutions/teen-data-testing-dates.md`.

## Building it

### 1. Fix the demo data problems already known

Two backlog items break the demo today:

- "The demo parent cannot see the child's plan or progress." Sharing is never switched on.
- "The demo teen has no rungs, and the demo downward arrow breaks." The ladder is empty and the
  arrow page shows an error.

### 2. Write the four demo patients

Extend the existing local demo data (`backend/seed_local.py`, content from `backend/seed_demo.py`)
into the four patients. Build and check them on the local database first.

### 3. A way to add the demo patients to a practice in production

Today the demo scripts refuse to run against anything but a local database. That is a guard on
purpose, and it should stay.

**Recommended:** a button in the admin app, "Add demo patients," on a practice's page. It adds a
fresh copy of the four demo patients, with their own teen and parent logins, to that practice.
It runs on the server, so nobody points a script at the production database.

- It only works on practices marked as demo practices. It cannot add made-up patients to a real
  practice.
- The teen and parent logins use addresses we own (for example
  `pilot-teen-3@floatcbt.com`), so no email reaches a stranger.
- A second button, "Reset demo patients," puts a therapist's copy back to the start if they want
  to begin again.

**Gate:** `/security-review`. It creates logins and adds patients to a practice.

### 4. Set up the therapists' logins

For each therapist:

1. Create a practice for them in the admin app, marked as a demo practice.
2. Add them as its clinician, and send them their setup link.
3. Click "Add demo patients."

**One practice each.** A practice admin sees every patient in the practice. If two therapists
shared one, each would see the other's changes. It would also confuse the feedback.

### 5. What a therapist agrees to when they first sign in

The first sign-in asks a practice to accept the terms of use and the BAA. For the pilot there are
no patients, so the BAA does not apply.

**Recommended:** for demo practices, replace both with a short pilot agreement: this is test data
only, do not enter real patient information, and what you see is not finished. Peter to confirm
the wording, ideally with the lawyer.

### 6. Check it end to end

Before the demo: set up one practice in production exactly as a therapist would get it. Sign in as
the therapist, the teen and the parent. Go through the whole task list. Fix what breaks.

## Collecting feedback

- **During the demo:** after each feature, ask the three questions (useful, right, missing). Notes
  per therapist, per feature.
- **After the trial:** the same three questions per feature, in a 30-minute call. Plus:
  - What would stop you using this with your patients?
  - What would you need first?
  - How do you work today? What do you use, and how do you keep track between sessions?
- **What they did in the app.** The access log already records who opened which patient record. It
  can show which patients each therapist opened and how often. Whether to look further than that
  is a later question.
- **Write it up** in `docs/testing/therapist-pilot-feedback.md`: one section per therapist, then a
  table of features by therapist.

**How to read it.** Five or six therapists is a small group. Write down what each one said and how
many said it ("4 of 6 asked for X"). Do not turn one or two comments into a rule. Gaps go on the
backlog as things to look at, with who raised them. A request is not a decision until Peter makes
it. A comment that changes clinical logic still goes to Dr. Walker.

## Risks and non-negotiables

- **A therapist types in a real patient.** The biggest risk, because the app does not stop it.
  Covered by the pilot agreement, the note at the top of the guide, and a reminder in the demo.
  If it happens, delete that record and tell Peter.
- **Who can see what (non-negotiable #2).** Each therapist must see only their own practice. This
  is how practices already work. The new "Add demo patients" button needs `/security-review`.
- **The app changes during the trial.** A merge to main goes live straight away. During the two
  weeks, avoid merging large changes to the clinician app, or tell the therapists when something
  changes. Do not merge on the morning of a demo.
- **AI costs.** Monitoring suggestions, the downward arrow and session features call the AI. Six
  therapists for two weeks is small, but check the bill after the first week.
- **Signed-out timer.** The clinician app signs out after 60 minutes idle (raised from 15 for
  testing). Fine for the pilot. It goes back to 15 before real patients.
- **Clinical logic (non-negotiable #1).** Nothing in this plan changes clinical logic. The demo
  cases are not clinical sign-off, but Dr. Walker reads them for realism.

## Decisions for Peter

1. Demo one therapist at a time, or as a group?
2. Two weeks for the trial: right length?
3. Which of the "leave out" features to hide, and which to show as coming.
4. Is the closed patient worth building?
5. The pilot agreement in place of the BAA and terms: agreed, and the wording.
6. Will Dr. Walker read the demo cases?
7. A date for the first demo. Building takes about a week to ten days, plus a full check.

## Order of work

1. Peter answers the decisions above.
2. Fix the two broken demo data items.
3. Write the four demo patients and check them locally, with screenshots.
4. Dr. Walker reads the cases.
5. Build "Add demo patients" and the demo practice flag. `/security-review`.
6. The pilot agreement for demo practices.
7. Set up Peter's "Float Demo" practice in production and check it end to end.
8. Write the demo script, the therapist guide and the feedback questions.
9. Run the demos. Set up trial logins for those who want one.
10. Trial calls, write-up, gaps onto the backlog.
