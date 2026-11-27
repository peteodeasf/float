# Action plans — how it is built

The design is in `action-plans-and-rewards.md` (agreed with Peter 2026-11-18, updated 2026-11-25).
This file is how the code does it. Branch `action-plans`.

## Data

Replaces today's `action_plans` table. **Destructive:** the old table and its saved plans are
dropped. Pre-launch these are test data, and the feature has been switched off since 2026-09-01.

- `action_plans` — patient, organization, clinician, `session_number`, `session_date` (the start),
  `ends_on`, `published_at` (set on save: there are no drafts).
- `action_plan_items` — every line on a plan, in order. `kind` is one of:
  - `exposure` — links a rung (`avoidance_behavior_id`). `text` is the wording on this plan, empty
    when it uses the rung's own wording. Changing it never changes the rung.
  - `tool` — links a Library page (`tool_id`), optionally one of its examples, or is written in by the
    clinician with no page (`tool_id` empty, `text` set). `text` rewords a linked line. `parent_only`
    marks a line for the parent alone; the child never sees it.
  - Every line has `done_at` / `done_by` (the tick) and `check_note` (the clinician's alone).
  - `accommodation` — links an accommodation on the parent's ladder (`accommodation_behavior_id`).
  - `parent_instruction` — typed text ("How to help"). `share_with_child` decides if the child sees it.
  - `reward` — `text` is the reward, `reward_for` is what it is given for. Ticked = given.
  - Every kind has `note`, which the family sees.
- `tools` — the platform-wide list, written by Peter in the admin app: name, description, optional
  link (for something to watch), order, active.

## Who sees what

- Clinician: every plan for their patients, drafts included.
- Parent: the latest published plan, every item. Answers "was this reward given?" on reward items.
- Child: the latest published plan, their own items (exposures, tools, rewards) and parent
  instructions marked `share_with_child`. Never accommodations, notes on parent items, or whether a
  reward was marked given.

## Clinician app

Updated 2026-11-27 (Peter). Mockup: https://claude.ai/artifact/1N6pVXRJUCJg6HZS9PKC7x.

**Where:** the Plan tab's **Action plan** sub-tab, beside Ladder and Accommodations.

**Dates.** A plan runs from its start to its end date (default a week). A new plan closes one still
running (it ends the day before). A closed plan moves to "Earlier action plans" below.

**The view** (default for the current plan) is for checking in, in session or informally:
- Every line has a tick. The clinician ticks any line; the child or parent tick tools, strategies and
  rewards in their apps. The tick shows who and when.
- An exposure is done once recorded during the plan's dates: by the child in their app, or by the
  clinician with **Record one**, which asks the child's own debrief questions. Each recording is
  listed under the line.
- **+ Note** adds a check-in note the clinician alone sees.
- A closed plan opens in the same view and can still be ticked and noted, not edited.

**The edit view** (+ New action plan, or Edit): From / to dates, then
- **{Child}'s work** — *What to work on this week*: exposures; *Tools and strategies*: picked from the
  Library (with an example where the page has them) or written in; any line can be reworded.
- **Parent work** — *What to work on this week*: accommodations marked Working on it; *Strategies for
  the parent*; *How to help*.
- **Rewards.**
- **Save** sends the whole plan and the family sees it straight away. **Cancel** drops the changes.
  A new plan starts empty: nothing carries over.
- **Confidence is per exposure.** "+ Add an exposure" lists every ladder step: *Ready* (set up, not
  done yet, confidence High) adds it; *Medium/Low confidence* → Edit, and *Not ready* → Set it up,
  both open the Set it up sheet; saving with High adds it. The server refuses a new exposure without a
  High set-up.

## Parent and child apps

- Parent home: the current plan, with Yes / No on each reward.
- Child: the Plan tab (`SHOW_ACTION_PLANS` turned back on) shows the current plan.

## Not in this build

The document version of the plan, a daily time limit, the separate reward list and points.
