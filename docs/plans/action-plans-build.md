# Action plans — how it is built

The design is in `action-plans-and-rewards.md` (agreed with Peter 2026-11-18, updated 2026-11-25).
This file is how the code does it. Branch `action-plans`.

## Data

Replaces today's `action_plans` table. **Destructive:** the old table and its saved plans are
dropped. Pre-launch these are test data, and the feature has been switched off since 2026-09-01.

- `action_plans` — one per session: patient, organization, clinician, `session_number`,
  `session_date`, `confidence` (low, medium, high or empty), `published_at` (empty while a draft).
- `action_plan_items` — every line on a plan, in order. `kind` is one of:
  - `exposure` — links a rung (`avoidance_behavior_id`). `text` is the wording on this plan, empty
    when it uses the rung's own wording. Changing it never changes the rung.
  - `tool` — links a tool from the list (`tool_id`). No typed tools.
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

Sessions tab, Action plans section. "New action plan" opens full screen, so the child can see it:

1. **Last plan** (if there is one) — each item: keep practicing or done. Kept items are copied.
   Rewards the parent has not answered: the clinician marks given or not.
2. **For the child** — exposures picked from the ladder (reword, add a note), tools picked from the
   list (add a note).
3. **For the parent** — accommodations picked from the parent's ladder, "How to help" lines with a
   *share with child* switch.
4. **Rewards** — what it is, and what it is for. Several allowed.
5. **Confidence** — low, medium, high. Publish is only possible at high.

## Parent and child apps

- Parent home: the current plan, with Yes / No on each reward.
- Child: the Plan tab (`SHOW_ACTION_PLANS` turned back on) shows the current plan.

## Not in this build

The document version of the plan, a daily time limit, the separate reward list and points.
