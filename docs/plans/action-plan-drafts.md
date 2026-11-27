# Action plan drafts

Peter, 2026-11-27: saving needs every line complete, but a clinician needs to save a plan part-way
and come back to finish it. Builds on `action-plans-build.md`, which said "there are no drafts".

## Decisions (Peter, 2026-11-27)

- A plan is a **draft** until the clinician shares it. The child and parent never see a draft.
- A draft can hold anything: no lines, blank lines, and exposures not yet set up with High
  confidence.
- **Share with family** checks the whole plan: at least one line, no blank lines, and every exposure
  set up with High confidence. The High-confidence rule is unchanged; it is checked when the family
  would first see the exposure, not when it goes on a draft.
- Saving a plan the family can already see updates their copy straight away, as today. Drafts are
  only for plans not yet shared.

## How it works

- `action_plans.published_at` (already there) is empty for a draft and set when it is shared. No
  migration.
- The plan's state is `draft` while `published_at` is empty.
- The edit view of a new plan or a draft has **Save draft** and **Save and share**. A shared plan's
  edit view has **Save**, as today.
- The draft shows above the current plan, marked Draft, with **Edit** and **Share with family**.
  It cannot be ticked or recorded against.
- In a draft, "+ Add an exposure" can add any ladder step. A line not yet set up with High confidence
  shows its level and a Set it up button, so the clinician can see what blocks sharing.
- When a running plan's start date is reached by a new plan, the running plan ends that day. For a
  draft this happens when it is shared, not when it is saved.
- The parent's and child's tick routes refuse lines on a draft.

## Clinical note

The High-confidence check moves from "when the exposure is added" to "when the plan is shared" for
drafts. The family still never sees an exposure that is not set up with High confidence. Peter
chose this; noted for Dr. Walker's review.
