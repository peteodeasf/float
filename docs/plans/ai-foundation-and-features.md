# AI that prepares, clinicians who decide — plan

> **Agreed 2026-11-18 (Peter):** "I actually want to do all of this. Create the foundation first,
> and then go straight to building the features that come after." Built as a series of PRs, in the
> order below. Each PR updates this file with what was built.

## The aim

As AI gets more capable, it does more of the preparation in Float. The clinician still makes every
clinical decision, and nothing reaches the child or parent without the clinician's plan behind it.
This already holds today: every AI output is a draft or a suggestion the clinician accepts, edits
or ignores. The work below makes that rule something the code enforces and records, and then
builds more preparation on top of it.

## What the AI does today (2026-11-18)

Eight places draft something with Claude. All of them are drafts or suggestions:

| Where | What it drafts | Where the clinician decides |
|---|---|---|
| `insight_service.request_extraction` | Situations, behaviors and accommodations from the monitoring log, and from session notes | Taps a suggestion to add it, or removes it |
| `insight_service.request_report` | The monitoring part of the Case Summary | Reads it; nothing goes on the plan from it |
| `session_analysis_service` | What an approved session note adds to the Case Summary | Reads it |
| `session_recording` | A session note from a recorded session | Approves the draft, editing it or not |
| `step_suggestion_service` | Smaller versions of a situation | Picks some, or none |
| `combination_wording` | The rung sentence ("the situation without X") | Edits it before saving |
| `monitoring_capture` | A parent's spoken or typed note, written up as observations | Reads them beside the parent's words |
| `downward_arrows.py` | Wording help in the downward arrow | Accepts or changes it |

What is missing: **no record of what the AI proposed and what the clinician did with it**, no rule
in the code about what an AI may do, and no way for an AI assistant to act for a clinician through
the same permission checks a person goes through.

## Part 1 — the foundation

### 1. A record of every AI suggestion and the clinician's decision

A new table, `ai_suggestions`: one row each time the AI drafts something for a patient.

- **What it holds:** the patient and practice, which of the eight jobs it was, the model, a short
  fingerprint of the instructions the model was given (so a change to a prompt shows up), what the AI
  returned, who started it (a clinician, or "automatic" for the background updates), and when.
- **The decision:** pending, accepted as it was, accepted after editing, rejected, or replaced by a
  newer draft. Who decided and when, and the final version when it was edited.
- **Who can see it:** clinicians with access to the patient, through the same check as every other
  clinician route. Never the parent or the child.
- **It is patient data.** It holds what the AI wrote about the patient, so it is treated like the
  rest of the record: same database, same access rules, nothing copied out of it into the repo.

**Why:** it shows the clinician approved every decision; it gives Dr. Walker real cases to review;
and before switching to a newer AI model, the new one can be checked against what clinicians
actually accepted.

**First PR (built 2026-11-18):** the table (`app/models/ai_suggestion.py`), the helper every call
site uses (`app/services/ai_record.py`), a clinician-only route to read it
(`GET /patients/{id}/ai-suggestions`), and the record written for the monitoring extraction, the
Case Summary and the session analysis. These are recorded with no decision for now: the clinician
decides item by item in the suggestion list, and wiring those item decisions in is the next PR,
along with the other five jobs.

### 2. Rules for what an AI may do, enforced in the code

Every route on the server declares what an AI acting for someone may do there:

- **read** — an AI may read what the person it acts for may read;
- **draft** — an AI may create a draft or suggestion that a clinician then accepts;
- **never** — people only. Messaging a child or parent, changing the ladder, approving a note,
  deciding what kind of behavior something is, anything to do with accounts or access.

A route with no declaration counts as **never**. A test walks every route, the same way the route
sweep does today, and fails if one is missing its declaration, so a route added later cannot be
forgotten.

### 3. An AI acts as the person, through the same checks

A clinician can give an AI assistant access to act for them: Float's own assistant, or one they bring,
such as Claude connected to Float.

- It gets a token of its own: tied to that clinician, marked as an AI, limited in time, and revocable.
- Every existing permission check applies unchanged, so it can never see more than the clinician can.
- Rule 2 then narrows what it may do.
- Each thing it reads is recorded in the patient access log, marked as an AI acting for that clinician.
- Only clinicians can create one, at first.

This touches sign-in and access, so it gets a security review and waits for Peter's approval.

**Second PR (built 2026-11-18):** four more jobs recorded.
- *Step sentence:* waits for a decision. Saving the rung marks it accepted (wording unchanged) or
  edited (with the final wording). A second draft for the same behavior replaces the first. Float's
  own fallback wording, used when the AI is unavailable, is not recorded: it is not the AI's.
- *Session note from a recording:* waits for a decision. Approving marks it accepted or edited;
  deleting the draft marks it rejected.
- *Smaller-step suggestions* and *voice note write-ups:* recorded with no decision. A picked
  suggestion becomes a rung; a write-up is read beside the parent's words.
- *The suggestion list:* each item's decision (added to the plan, removed, or reworded) is already
  stored on the item itself, in `patient_insights` (`added_at`, `removed_at`, `is_edited`). It is not
  copied. It does not yet store who decided.
- *Not recorded yet:* the downward arrow's question wording. Its request does not say which patient
  it is for (`POST /downward-arrows/next-probe` takes only the chain), so it cannot be filed under a
  patient without changing that request.

## Part 2 — the features

Each one is built on the foundation: its output is recorded (1), it can only draft (2), and it only
sees what the clinician can see (3).

### 4. Session prep

Before a session, Float drafts a plan for it from what happened since the last one: new monitoring
entries, exposures done and skipped, Fear Levels, messages, the last session's note. The clinician
edits it. It is never shown to the family.

**Questions for Peter before building:** what the draft should contain and in what order; whether it
appears on its own or on the Sessions tab; how far back it looks when there is no earlier session.

### 5. Alerts between sessions

Float tells the clinician when something needs attention between sessions. The checks are plain
rules on the data, not AI, so they can be tested and trusted. AI only writes the one-line summary.

**Clinical questions, for Peter and Dr. Walker, before building:** which situations count. The
examples so far are only illustrations: no exposure for some number of days; Fear Levels not dropping
over some number of exposures; a parent accommodating again. Each needs its number set by a
clinician, not by us. Also: how the clinician is told (in the app, by email), and how often.

### 6. Coaching for the child during an exposure

By chat or voice, during an exposure. It works only from the clinician's plan for that rung, and
hands anything worrying to the clinician.

**This is the highest-risk item and is built last.** A child aged 8 to 17 reads every word.
Before building: Dr. Walker's script or rules for what the coach says; what counts as "worrying" and
what happens then (today the extraction prompt raises a `review_flag` for risk); and how it is kept
from becoming self-guided therapy, which the strategy rules out.

## Order

1. Suggestion record: table, helper, first two jobs. *(this PR)*
2. Suggestion record: the other six jobs, and the clinician's decisions wired in.
3. AI rules on every route, with the sweep test.
4. AI access for a clinician's assistant. Security review; Peter approves.
5. Session prep, once Peter answers its questions.
6. Alerts, once the clinical questions are answered.
7. Coaching, once Dr. Walker's rules are in.

## Dr. Walker review queue

- The record in item 1 is built partly so she can review what the AI proposed and what clinicians
  kept. Worth showing her once there are a few weeks of it.
- Alerts (5) and coaching (6) need her rules before they are built.
