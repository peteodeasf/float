# Therapist feedback pilot — plan

**Planned 2026-11-17** with Peter. Decisions taken the same day. **Status:** plan, not started.
Builds on [`therapist-pilot-feature-review.md`](therapist-pilot-feature-review.md) (the feature
list and the agreed demo patients, 2026-10-02) and the backlog item "Demo patients for the
therapist pilot."

## Goal

Find out from 5–6 therapists what they think of the clinician app as it is today, and what is
missing before it would be worth using with their own patients.

It has two parts:

1. **Demo.** Peter shows the clinician app to each therapist, one at a time, using demo patients.
2. **Hands-on trial.** Some or all of the same therapists get their own login and try the same
   features themselves, on their own copy of the demo patients.

No real patients take part. Nothing in the pilot is used for treatment. Only the clinician app is
shown. The teen app and the parent app are not demoed and not given out.

Serves "the basic clinician platform" in `STRATEGY.md`.

## What we want to learn

Three questions, asked about each feature:

1. **Is it useful?** Would they use it with a real family?
2. **Is it right?** Does it match how they actually work: monitoring, the downward arrow, the
   exposure ladder, working with parents?
3. **What is missing?** What would stop them using Float, or what would they need first?

Plus one overall question: would they use Float with their patients, and what would it take?

## Scope

**In:**

- Demo patients that show every clinician feature in a realistic state.
- One login per therapist, each in its own practice, each with its own copy of the demo patients.
- A demo script for Peter, a short guide and task list for the trial, and the feedback questions.

**Out:**

- Real patients, or any real patient information.
- The teen app and the parent app.
- A closed patient (not a priority for this phase, Peter 2026-11-17).
- New features. The pilot tests what is built. Gaps go on the backlog.

**Nothing in the clinician app is hidden** (Peter, 2026-11-17). Features that are not finished
stay visible: AI session analysis, reminders, parent experiments, action plans. The trial guide
lists them in one line, so a therapist who clicks one knows it is unfinished, not broken.

## Part 1 — the demo

- **One therapist at a time.** About 30 minutes: 15 showing, 15 feedback.
- **Account:** a practice of Peter's own, "Float Demo," with the demo patients in it.
- **What to show in 15 minutes.** One family's journey, a few minutes on each:
  1. Patient list: the stages and the suggested next step for each patient.
  2. Monitoring: what the parent reported, and the suggestions drawn from it.
  3. The downward arrow on one situation.
  4. The plan: situations with fear ratings, the exposure ladder, the accommodation ladder.
  5. Progress: the child's exposures, predicted and actual fear, the streak.
  6. Working with the parent: accommodation states, weekly check-ins, chat.

  Session mode, Education and Tools are left for the trial.
- **Feedback, 15 minutes:** the three questions, then "would you use it, and what would it take?"
  Then ask whether they want the hands-on trial.
- **Notes:** record with their permission, or a second person takes notes. Written up the same day.

## Part 2 — the hands-on trial

- **Who:** those from the demo who want to take part.
- **Time asked of them:** about two hours at most, at their own pace.
- **When it ends:** when they have given their feedback. Their login is then switched off.
- **What they get:**
  - A login to their own practice with the same demo patients they saw.
  - A one-page guide: how to sign in, who the demo patients are, the task list, which features
    are unfinished, and a reminder not to enter anything about a real patient.
- **Task list,** so everyone tries the same things:
  1. Open the patient in monitoring. Read the report and add two suggestions to the plan.
  2. Do a downward arrow on a situation.
  3. Finish the half-built plan. Add a rung and rate it. Set an accommodation's state.
  4. Open the patient in treatment. Read their Progress and weekly check-ins. Send the parent a
     message.
  5. Try session mode and write a session note.
  6. Add a new, made-up patient and go as far as you like.
  7. Read one Education module.
- **Feedback:** a short call or a written form at the end, their choice. Same questions as the
  demo, per feature.

## The demo patients

Three patients (the closed one is out). Names and stories made up for the pilot.

1. **Monitoring only.** A week of parent monitoring, including a voice note, with suggestions
   drawn from it. Nothing on the plan yet.
2. **In planning.** Situations with fear ratings, one or two downward arrows done, the exposure
   ladder and accommodation ladder half built.
3. **In treatment.** A full plan. About four weeks of exposures, a mix of done, too hard and
   missed, so Progress has something to show. Session notes. Accommodations in different
   states. Weekly check-ins from the parent. A chat with messages from the parent and the teen.

**Everything the family would have done is made up in the data.** The teen and parent apps are
not used, so the exposures, check-ins and messages they would have sent are written straight into
the demo data. A therapist sees a full clinician app without anyone using the family apps.

**Believable.** Dr. Walker reads the three cases before the first demo (agreed, Peter
2026-11-17). This is a check that they look real, not a clinical sign-off.

**Different kinds of anxiety** across the three (for example social anxiety, separation anxiety,
a specific fear), so therapists see the app is not built for one kind only.

**Dates stay current.** Dates are counted back from the day the patients are added, so the
in-treatment patient's exposures end "yesterday." See `docs/solutions/teen-data-testing-dates.md`.

## Building it

1. **Fix the demo data bug that shows in the clinician app.** From the backlog: the demo downward
   arrow shows an error, and the demo child has no rungs on the ladder. (The other demo item, the
   parent not seeing progress, only shows in the parent app and can wait.)
2. **Write the three demo patients.** Extend the local demo data (`backend/seed_local.py`,
   content from `backend/seed_demo.py`). Check on the local database, with screenshots.
3. **An "Add demo patients" button in the admin app.** Today the demo scripts refuse to run
   against anything but a local database. That guard stays. The button adds a fresh copy of the
   three patients to a practice, on the server, so nobody points a script at production.
   - It only works on practices marked as demo practices.
   - The demo teen and parent get records but no usable login. Any address on them is one we own,
     so no email reaches a stranger.
   - A "Reset demo patients" button puts a therapist's copy back to the start.
   - **Gate:** `/security-review`. It adds patients to a practice.
4. **Set up each therapist.** In the admin app: create their practice, marked as a demo practice;
   add them as its clinician and send the setup link; click "Add demo patients." One practice
   each, because a practice admin sees every patient in the practice.
5. **The pilot agreement.** Demo practices see this at first sign-in in place of the terms of use
   and the BAA. Draft below.
6. **Check it end to end.** Set up one therapist practice in production, exactly as a therapist
   gets it, and do the whole task list.

## Pilot agreement — draft

Peter, 2026-11-17: yes in principle, wording to be decided. A suggestion, in plain words. Worth a
lawyer's read before it goes out.

> **Before you start**
>
> Thank you for helping us test Float.
>
> - This account holds made-up patients only. It is for trying Float, not for treating anyone.
> - Please do not enter anything about a real person: no real names, dates of birth or case
>   details. If you add a patient, make one up.
> - Float is not finished. Some features are incomplete, and things may change while you use it.
> - Please keep what you see to yourself, and do not share screenshots outside the pilot.
> - We will use your feedback to improve Float. We will not name you anywhere without asking.
> - We will switch this account off when the pilot ends, and delete the made-up data in it.
>
> ☐ I agree

Open: whether to keep the line about not sharing what they see.

## Collecting feedback

- Notes per therapist, per feature, from the demo and from the trial.
- **What they did in the app.** The access log already records who opened which patient record, so
  it shows which patients each therapist opened. Nothing more is tracked for now.
- **Write it up** in `docs/testing/therapist-pilot-feedback.md`: one section per therapist, then a
  table of features by therapist.

**How to read it.** Five or six therapists is a small group. Write down what each one said and how
many said it ("4 of 6 asked for X"). Do not turn one or two comments into a rule. Gaps go on the
backlog with who raised them. A request is not a decision until Peter makes it. A comment that
would change clinical logic goes to Dr. Walker.

## Risks and non-negotiables

- **A therapist types in a real patient.** The app does not stop it. Covered by the pilot
  agreement, the guide, and a reminder at the demo. If it happens, delete that record and tell
  Peter.
- **Who can see what (non-negotiable #2).** Each therapist sees only their own practice. The new
  button needs `/security-review`.
- **The app changes during the trial.** A merge to main goes live straight away. Avoid large
  changes to the clinician app while therapists are using it, and never merge on a demo morning.
- **AI costs.** Monitoring suggestions and the downward arrow call the AI. Small for six
  therapists, but check the bill after the first week.
- **Signed-out timer.** The clinician app signs out after 60 minutes idle (raised from 15 for
  testing). Fine for the pilot. Goes back to 15 before real patients.
- **Clinical logic (non-negotiable #1).** Nothing here changes it.

## Still open

1. The pilot agreement wording (draft above).
2. A date for the first demo.

## Order of work

1. Fix the demo arrow and rungs.
2. Write the three demo patients, check locally, with screenshots.
3. Dr. Walker reads the cases.
4. "Add demo patients" button and the demo practice mark. `/security-review`.
5. The pilot agreement for demo practices.
6. Set up "Float Demo" in production and check it end to end.
7. Demo script, trial guide, feedback questions.
8. Demos, then trial logins, then the write-up.
