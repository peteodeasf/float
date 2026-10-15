# Building the ladder from combinations and sub-situations — plan

> **Planned 2026-10-15** from Peter's clinical review with Dr. Walker. Not started.
> Changes parts of [`exposure-ladder-sub-situations.md`](exposure-ladder-sub-situations.md) (2026-09-01).
>
> **Clinical gate:** this changes what counts as a rung, where the downward arrow sits, and the
> order of the ladder. That is clinical logic. Pre-launch it is Peter's call, made here with
> Dr. Walker's input. The open questions below go in the Dr. Walker review queue.

## Goal

Build the ladder the way Dr. Walker runs the interview. There are seven steps:

1. **List situations.** Float suggests them from the monitoring log and session recordings. The
   therapist may have added some already.
2. **Rate each situation.** Float pre-fills a Fear Level from monitoring and sessions. Float
   suggests starting with the situation that has the lowest Fear Level.
3. **List the avoidance and safety behaviours** for a situation. Float suggests them from the log
   and recordings. Any the therapist already confirmed are listed.
4. **Rate each combination.** A combination means being in the situation without one behaviour.
   Float shows it as a sentence, and the therapist enters the child's score.
5. **Downward arrow, for each combination.** Start with the safety behaviours, lowest score first.
   It is fine not to do them all in one session.
6. **Add sub-situations.** These are easier versions of a combination, where one is needed. Float
   suggests them.
7. **The ladder.** Every combination and every sub-situation is a rung, sorted by score, lowest at
   the bottom.

**Worked example**

- Situation: *Participating in class verbally*
- Avoidance: *doesn't participate in class verbally*
- Safety behaviours: *sits at the back to avoid getting called on*; *pretends to be busy*;
  *parent asks the teacher not to call on them*
- Combination (rung): *Participating in class verbally, without sitting at the back*, rated **5**
- Sub-situation (rung): *Participating in class verbally, sitting in the middle row*, rated **4**

## What changes from today

| | Today | After |
|---|---|---|
| What a rung is | A smaller version of the situation, and nothing else | A combination, or a sub-situation of one |
| Safety behaviours | A list on the situation. Never a rung | Each one makes a combination, which is a rung |
| Downward arrow | One per situation | One per combination |
| Sub-situations | Belong to a situation | Belong to a combination (see open question 3) |
| Suggested sub-situations | Come from the situation's feared outcome | Come from the combination's feared outcome |
| Ladder order | Lowest at the top | Lowest at the bottom |

The one-screen editor stays. Peter rejected step-per-screen versions twice (2026-09-01 and
2026-09-05). The seven steps are the order things appear on that screen, not seven screens.

## Stopping and coming back

Everything is saved as soon as it is entered, which is true today. There is no wizard and no saved
"step 4 of 7" position. Where you are is worked out from what is already there.

So each situation row says what is left on it. For example: *"2 behaviours not scored · 1 downward
arrow to do"*. A situation with nothing left says nothing.

"That's the plan for now" is closing the editor. Coming back opens the same screen with everything
where it was. You can add a situation, a behaviour, a sub-situation or an arrow at any point, in any
order. Float suggests an order and never enforces it.

## The screen

It is one list with three levels, each opened under the one above:

```
Participating in class verbally                       Fear Level [6]   1 arrow to do
  Behaviours
    Avoidance   Doesn't participate verbally
    Safety      Sits at the back to avoid getting called on
                ↳ "Participate in class without sitting at the back"   [5]   ↓ Arrow ✓
                    Sub-situations
                    • Participate in class sitting in the middle row     [4]
                    + Add an easier version    ✨ Suggest easier versions
    Safety      Pretends to be busy
                ↳ "Participate in class without pretending to be busy" [ ]   ↓ Arrow
    + Add a behaviour     Suggested: "Asks to go to the bathroom" (from the log)
```

- **Situations** are listed lowest Fear Level first. The first one without a ladder is marked
  *"Start here"*. That is step 2's suggestion.
- **Behaviours** are tagged Avoidance or Safety. Suggestions from the log show as chips, which you
  tap to accept. Nothing is added until the therapist taps it.
- **Combinations** appear as soon as a behaviour is added, with a drafted sentence and an empty
  score. The therapist can edit the sentence.
- **↓ Arrow** opens the existing arrow screen for that combination. *"Do this one next"* marks the
  next arrow to do: safety behaviours first, lowest score first. This is advice, not a lock.
- **Sub-situations** sit under a combination. *Suggest easier versions* uses that combination's
  feared outcome, as it does today for situations.
- The **ladder** (the Plan tab) shows every rung, lowest at the bottom.

## Wording a combination

The situation and the behaviour are both free text from different people, so sticking them
together reads badly. For example: *"Participating in class verbally — without sits at the back to
avoid getting called on."*

**Approach:** when a combination is created, Float drafts one sentence with the AI and shows it as
the starting wording. The therapist edits it if needed, and the edited sentence is what is saved
and what the child sees. If the AI call fails, Float falls back to *"<situation> — without:
<behaviour>"* so the therapist always has something to edit.

Starting point for the draft. These are a guess, to be tested, not rules:
- Keep it short. One clause if possible.
- Keep the child's own words where possible.
- Never add anything that wasn't in the situation or the behaviour. No new details, places or
  people. This one is firm, because the child reads the sentence.
- To be tested: say what the child does rather than what they stop. For example, *"Sit in your
  usual seat and answer a question"* instead of *"without sitting at the back"*. This comes from one
  example and may read worse for other behaviours.

**Checking the wording:** there is no set of situation and behaviour pairs to test on yet.
`AI-dev/Ladder Eval` holds steps, not pairs. So the first job is to build a set of about 30 pairs
across several kinds of anxiety, from Dr. Walker's cases and the local demo data. It must not come
from production. Peter or Dr. Walker reads the drafts. The pairs stay out of the prompt itself (see
[`eval-cases-burned-by-putting-them-in-the-prompt.md`](../solutions/eval-cases-burned-by-putting-them-in-the-prompt.md)).

This sends a child's situation and behaviour text to Anthropic, the same as the extraction and arrow
prompts do today. It adds nothing new to the open data agreement item on the backlog.

## Data

Rungs stay rows in `avoidance_behaviors`. Experiments, the recommended rung and the child's app are
all keyed on that table, so keeping rungs there means none of those have to move.

| Change | How |
|---|---|
| New rung type `combination` | Added to the canonical set in `backend/app/core/behavior_types.py` and to `LADDER_TYPES`, alongside `scenario` |
| A combination knows which behaviour it is about | New nullable column `avoidance_behaviors.without_behavior_id`, pointing at the safety or avoidance row. One combination per behaviour |
| A sub-situation knows its combination | Uses the existing `parent_behavior_id` column. No new column |
| The arrow sits on a rung | New nullable column `downward_arrows.rung_id`, pointing at the combination. One per rung per person who led it, like the current situation rule |

The migration only adds things. It drops nothing and is not destructive. It goes on top of
`f1a2c3d4e5b6`, or whatever is head when the work starts.

**Existing test data:** existing situation arrows stay readable but the editor stops creating them.
Existing sub-situations that hang off a situation, not a combination, are shown in a group called
*"Not linked to a behaviour"* under their situation. Nothing is converted or deleted.

## The child's app

- `GET /patient/ladder` returns combinations as well as sub-situations in its flat `rungs` list.
  It already sorts by score and labels each rung with its situation.
- The child sees the rung's sentence. That is the edited wording, so it reads naturally.
- Experiments, the recommended rung and the on/off switch are unchanged.
- **Order:** see open question 4.

## Order of work

Each step is its own PR and each can ship on its own.

1. **Combinations exist.** The migration, the new type, and creating a combination with a drafted
   sentence when a behaviour is added. The child's ladder includes them. Backend tests for the type,
   the sentence fallback, and the child's ladder.
2. **Behaviours and combinations in the editor.** Steps 3 and 4 on the one-screen editor. Accepting
   a behaviour suggested from the log works. It is refused today
   (`backend/app/api/routers/insights.py:200`). Add the "what's left" line on each situation.
3. **The arrow on a combination.** `rung_id` on arrows, the arrow screen opened from a combination,
   and the "Do this one next" marker.
4. **Sub-situations under a combination.** Adding and suggesting them, and the suggestions read that
   combination's feared outcome.
5. **The ladder lowest at the bottom.** On the Plan tab, and in the child's app if question 4 says
   so.
6. **Suggestions from session recordings.** Today recordings only write a session note
   (`backend/app/services/session_recording.py`). This makes them suggest situations, behaviours and
   Fear Levels too. It is the biggest unknown, so it goes last and gets its own plan.

The wording check (above) runs before step 1 ships.

## Risks and non-negotiables touched

- **Clinical logic.** This changes what counts as a rung, where the arrow sits, and the ladder
  order. Peter decides. The open questions go to the Dr. Walker queue.
- **Who can see what.** The child's ladder endpoint changes what it returns. The child already sees
  rungs. The question is whether the new sentence could show them something they shouldn't see,
  such as a parent's wording of a safety behaviour like *"parent asks the teacher not to call on
  them"*. Run `/security-review` on step 1.
- **Screens.** Steps 2 to 5 change clinician screens and, at step 5, a child screen. Screenshots go
  in each PR, and Peter approves.
- **No web tests cover the editor, the ladder or the arrow screen today.** Step 2 adds them.

## Open questions for Peter

1. **Is an avoidance behaviour a combination?** In the example, *"doesn't participate"* without the
   avoidance is just *"participate"*, which is the situation itself. Proposed: an avoidance does
   not make its own rung. The situation at its own Fear Level is the top rung for that situation.
2. **Does a sub-situation get its own downward arrow,** or only combinations? Proposed: only
   combinations.
3. **Can a sub-situation belong to the situation directly,** not to a combination? Dr. Walker's
   separation-anxiety rungs (*"be in a different room for 30 seconds"*) are versions of the
   situation, not of a behaviour. Proposed: yes, both are allowed.
4. **Lowest at the bottom in the child's app too?** It was decided as lowest at the top on
   2026-09-01. Proposed: the same in both apps, lowest at the bottom, because it is a ladder.
5. **What does the child see when the sentence came from a parent's words?** For example *"parent
   asks the teacher not to call on them"*. Proposed: the therapist sees the wording before it is
   saved, and that is enough.

## How to tell it worked

- Building the class-participation example above on one screen gives three combinations, one
  sub-situation and a ladder of four rungs with the lowest at the bottom.
- A therapist closes the editor after one situation, comes back a week later, and can see what is
  left without remembering.
- Every combination sentence in the wording check reads like something a therapist would say.
- The child sees the same rungs, in the same order, as the therapist.
