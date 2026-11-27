# Action plans — how it is built

The design is in `action-plans-and-rewards.md` (agreed with Peter 2026-11-18, updated 2026-11-25).
This file is how the code does it. Branch `action-plans`.

## Data

Replaces today's `action_plans` table. **Destructive:** the old table and its saved plans are
dropped. Pre-launch these are test data, and the feature has been switched off since 2026-09-01.

- `action_plans` — one per session: patient, organization, clinician, `session_number`,
  `session_date`, `confidence` (no longer used: confidence is per exposure, below), `published_at` (empty while a draft).
- `action_plan_items` — every line on a plan, in order. `kind` is one of:
  - `exposure` — links a rung (`avoidance_behavior_id`). `text` is the wording on this plan, empty
    when it uses the rung's own wording. Changing it never changes the rung.
  - `tool` — links a Library page (`tool_id`), optionally one of its examples, or is written in by the
    clinician with no page (`tool_id` empty, `text` set). `text` rewords a linked line. `parent_only`
    marks a line for the parent alone; the child never sees it.
  - `accommodation` — links an accommodation on the parent's ladder (`accommodation_behavior_id`).
  - `parent_instruction` — typed text ("How to help"). `share_with_child` decides if the child sees it.
  - `reward` — `text` is the reward, `reward_for` is what it is given for. `reward_given` is empty,
    yes or no; `reward_given_by` says whether the parent or the clinician answered.
  - Every kind has `note`. Carry-over copies an item to the new plan and sets `outcome` on the old one
    (`keep` or `done`).
- `tools` — the platform-wide list, written by Peter in the admin app: name, description, optional
  link (for something to watch), order, active.

## Who sees what

- Clinician: every plan for their patients, drafts included.
- Parent: the latest published plan, every item. Answers "was this reward given?" on reward items.
- Child: the latest published plan, their own items (exposures, tools, rewards) and parent
  instructions marked `share_with_child`. Never accommodations, notes on parent items, or whether a
  reward was marked given.

## Clinician app

Updated 2026-11-27 (Peter): the plan is a **card on the Sessions tab**, below Session notes, in the
patient page's card style. Mockup: https://claude.ai/artifact/1N6pVXRJUCJg6HZS9PKC7x.

- The newest plan is the card you work in; earlier plans sit in a card below and open in place,
  read only. "+ New action plan" first shows last week's plan in the same card: keep practicing or
  done for each item, and given or not for each reward the parent hasn't answered.
- **{Child}'s work** — *What to work on this week*: exposures. *Tools and strategies*: picked from
  the Library (with an example where the page has them) or written in; any line can be reworded.
- **Parent work** — *What to work on this week*: accommodations marked Working on it. *Strategies for
  the parent*, *How to help*.
- **Rewards.**
- **Confidence is per exposure** (Peter, 2026-11-27). "+ Add an exposure" lists every ladder step:
  *Ready* (set up, not done yet, confidence High) adds it; *Medium/Low confidence* → Edit, and *Not
  ready* → Set it up, both open the Set it up sheet; saving with High adds it. The server refuses an
  exposure without a High set-up. The plan is shared with no confidence step of its own.

## Parent and child apps

- Parent home: the current plan, with Yes / No on each reward.
- Child: the Plan tab (`SHOW_ACTION_PLANS` turned back on) shows the current plan.

## Not in this build

The document version of the plan, a daily time limit, the separate reward list and points.
