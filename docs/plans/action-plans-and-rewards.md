# Action plans and rewards — design plan

> **Drafted 2026-11-18** from Dr. Walker's answers, which Peter passed on the same day. Her text
> arrived with some tracked changes mixed in. Where the intended version was clear it is used below;
> where it was not, it is listed under **Questions** rather than guessed. Nothing here is built yet.
> This is clinical design: it goes to Peter, and the open points to Dr. Walker.

## What Dr. Walker said

### Action plans (for the child)

- After each session, the family has a short list of things to practice before the next one.
- About 10 minutes before the end of each session, the clinician and the youth decide together what
  will be practiced. That includes whether to keep practicing an item from the last plan.
- Items can be **for the child** (specific exposures, coping tools, strategies) or **for the parent**
  (for example, stop checking homework, or how to respond to crying).
- An item that is already on the exposure ladder, or is an accommodation the parent is working on,
  **links to it** rather than being entered twice.
- **Anything new is practiced in session with the clinician first**, before the youth is asked to do
  it on their own as part of the plan.
- **Before committing to the plan, the youth's confidence is checked: low, medium or high.** If it is
  not high, the clinician and youth adjust the plan until it is.
- The plan should take **no more than 10 to 15 minutes a day**.
- The plan shows in **both the child's app and the parent's app**.

### The parent's part

- The clinician meets the parents **without the child** to identify specific accommodations and the
  kinds of situations they happen in.
- The clinician assesses **how comfortable the parent is giving up each accommodation**. Parents are
  often anxious about stopping reassurance and the like. If a parent is not comfortable, the clinician
  explores the parent's concerns. **There is no point involving the child until the parent is willing
  to change.**
- The clinician and parents build the plan together, from what they believe the child and parent can
  tolerate, **just like an exposure ladder**.
- **Before a change is put into practice, the clinician checks with the child** how much distress they
  predict they will feel when the parent changes.

### Rewards

- At the start of treatment, the parent and child make a list of rewards. **The child can suggest;
  the parent decides.**
- Rewards must be what the child is willing to work for, not what the parent thinks is appropriate,
  and consistent with the family's values.
- **Ages 8 to 10:** a physical reward, given straight away. **Preteens and teens:** points toward a
  bigger reward can be planned, depending on maturity, but immediate rewards are still the most
  effective.
- The list is kept in the **parent's app**. The parent app records **when a reward is given and for
  what task**.

## What Float has today

- **Action plans exist but are switched off** (`SHOW_ACTION_PLANS` in
  `apps/web/src/lib/featureFlags.ts`, since 2026-09-01). Today's version is a free-text summary with a
  date and nickname, published to the child's app, plus loose lists (`exposures`,
  `behaviors_to_resist`, `parent_instructions`, `coping_tools`, `cognitive_strategies`) in
  `backend/app/models/action_plan.py`. Items are text; nothing links to a rung or an accommodation;
  there is no confidence check and no time limit.
- **Accommodations already work like a ladder** (`docs/plans/parent-accommodations-like-the-ladder.md`):
  ordered by the child's distress, with the child's own rating (`distress_min/max`, `child_rated_at`),
  the parent's estimate beside it, and where the parent has got to (not started, working on it,
  stopped). **Missing:** the parent's comfort with giving each one up, and the rule that the child is
  not involved until the parent is willing.
- **Experiments** (a child's exposure) already store a `confidence_level`.
- **Rewards:** nothing built. The backlog has a "Rewards — needs a plan" item; this replaces it.

## Proposed design

### Action plans

**One action plan per session**, made in the last part of the session, in session mode.

- **Items**, each one of:
  - *a rung on the ladder* (a link; the child's app opens that rung's exposure),
  - *an accommodation the parent is working on* (a link; the parent's app shows it),
  - *a tool or strategy* (short text, for the child or the parent),
  - *an instruction for the parent* (short text, such as how to respond to crying).
- **Carry over:** starting a new plan shows the last plan's items, each with *keep practicing* or
  *done*. Kept items carry over as links, not copies.
- **Practiced in session first:** a new item (not on the last plan) asks *"Practiced in session
  today?"*. Float does not let a new exposure go on the plan without it. *(Question 2: is that a hard
  stop, or a reminder?)*
- **Time:** each item has an estimate in minutes per day; the plan shows the total and warns above 15.
- **Confidence:** the last step is the youth's confidence, low, medium or high. Not high: Float goes
  back to the items to adjust. The plan is saved only at high. *(Question 1: who enters it.)*
- **Where it shows:** the child's app shows the child's items; the parent's app shows the parent's
  items and, read-only, the child's. *(Question 3.)*
- **Replaces today's action plans.** Pre-launch, today's free-text plans and lists are test data;
  moving to items can drop them. That will be said plainly in the PR when it happens.

### The parent's part (on the accommodation ladder that exists)

- **Comfort:** each accommodation gets the parent's comfort with giving it up. *(Question 4: what
  scale.)* Recorded in the parent meeting, which happens without the child.
- **Willing first:** an accommodation the parent is not yet comfortable giving up shows as *needs
  discussion* and **cannot be put on an action plan** or shown to the child. The clinician records
  the concerns explored, as a short note.
- **The child's prediction:** before an accommodation goes on an action plan, Float asks for the
  child's predicted distress, which the ladder already stores (`distress_min/max`, `child_rated_at`).
  If there is none, adding it asks for it.

### Rewards

- **The list:** in the parent's app. The child can suggest a reward (from the child's app, or with
  the parent); the parent approves or declines each. Only approved rewards are on the list.
- **Kind, by age:** *immediate* (given straight away) for every age; *points toward a bigger reward*
  offered only for preteens and teens. *(Question 5: at what age, or at the clinician's choice.)*
- **Giving one:** the parent records it: which reward, when, and for what (a link to the exposure or
  action plan item, or short text).
- **Points:** for a points reward, each task earns points the parent sets; the child sees progress
  toward it.
- **The clinician:** *(Question 6.)*

## Questions for Dr. Walker (and Peter)

1. **Confidence: who enters it?** One version of the text says the child rates their confidence;
   the other says the clinician assesses it. In session mode, does the child tap low / medium / high,
   or does the clinician record it?
2. **Practiced in session first:** should Float refuse to put a new exposure on the plan unless it
   was practiced in session today, or just remind the clinician?
3. **The parent's app:** should the parent see the child's items, or only their own? Does the child
   see the parent's items?
4. **The parent's comfort:** what scale? Low / medium / high like confidence, or 0 to 10?
5. **Points:** from what age, or does the clinician switch points on for a child they judge mature
   enough? Her guidance of 2026-09-15 (in `docs/backlog.md`) said "point systems only for children
   over 10"; the new answer says "preteens and teens, depending on maturity". Over 10 as the default,
   with the clinician able to change it?
6. **Rewards in the clinician app:** one version keeps the list in the clinician app, the other in
   the parent's app. Should the clinician see the list and what was given, read-only?
7. **Time:** is the 10 to 15 minutes a day for the child's items only, or child and parent together?

## Order to build, once the questions are answered

1. Action plan items, carry-over and links, in session mode (clinician side), replacing today's plans.
2. The confidence step and the time total.
3. The child's app and the parent's app showing the plan; switch `SHOW_ACTION_PLANS` back on.
4. Parent comfort and "willing first" on the accommodation ladder.
5. Rewards: the list and approvals, then giving and points.

Each step is a clinical change and waits for Peter's review. Session prep (item 4 of
`ai-foundation-and-features.md`) can later draft the carry-over from the last plan.

## Dr. Walker review queue

- All seven questions above.
- The "willing first" rule as built (step 4) before it reaches families.
