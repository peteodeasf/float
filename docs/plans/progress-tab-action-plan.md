# Progress tab around the action plan

Step 3 of `action-plan-centred-treatment.md`. Mockup agreed with Peter 2026-11-28:
https://claude.ai/artifact/3bRyryh7o8z9KDdaQ7TmqY#artboard-Progress and `#artboard-ProgressAll`.

## What the therapist wants to see (Peter, 2026-11-28)

- Did the child do each exposure, how often, on which days.
- Fear Level and Belief in Prediction, before and after, for each time.
- When not done: whether they tried and found it too hard (different from not doing it; "exposures
  attempted is a good metric"), and why.
- Whether the feared outcome happened, each time.
- The child's to-dos, the parent's accommodations and to-dos, and whether rewards were given.
- Readable quickly: marks and numbers, not sentences.

## Layout

A switch: **This plan / All plans**.

- **This plan.** The current shared plan (else the latest). One grid per exposure on it: a column
  per day it was scheduled or done in the plan's dates; rows Did it (✓ done, ◐ tried, too hard, ✗
  not done, ○ coming up), Fear Level, Belief, Feared outcome. Header: tried, done, too hard, not
  done. Then three boxes: the child's to-dos, parent (accommodations with the weekly check-in answer;
  how-to-help lines), rewards (given or not). Then the existing graph, then earlier plans, each of
  which opens in this view.
- **All plans.** The same grids across every shared plan, a plan label and divider over each plan's
  columns. Then one table of the other items with a column per plan.

The summary numbers band and the week strip go. The parent progress section below stays.

## Data

- "Not done": a scheduled day has passed and nothing was recorded. "Too hard": the child reported
  it (`status = too_hard`), which saves the time and now also the reason.
- New column `experiments.too_hard_reason` (additive migration). Until now the reason only went to
  the clinician as a chat message. Older "too hard" rows have no reason.
- The clinician's exposure list returned the latest 50; raised to 1000 so All plans is complete.
- A day belongs to the plan whose dates contain it; on the day one plan ends and the next starts, the
  newer plan.

## Not in this build

- Parents ticking how-to-help lines (parent app change; Peter prefers to discuss, a weekly
  "every time / mostly / not really" was suggested).
- Linking a reward to what earns it (needs definition).
- Clinician reminders (after this is reviewed).
