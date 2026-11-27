# Exposure setup and debrief: match Dr. Walker's worksheet

Status: agreed with Peter 2026-11-24. Built 2026-11-24 on branch `exposure-worksheet`. Clinical change: goes in the Dr. Walker review queue.

## Why

Dr. Walker reviewed the app against her standard exposure worksheet. The child app's setup and
debrief questions had drifted from it: two setup questions and one debrief question were missing,
the confidence question asked something different, and the debrief offered ready-made answers.

Her worksheet:

**What I plan to do**
- What am I most worried will happen?
- How will I know if this happens?
- How strongly do I believe my prediction is correct (0-100%)?
- What will my Fear Thermometer/SUDS be?
- Which safety/avoidance behaviors or rituals might I want to do?
- How confident do I feel that I can do the exposure without doing avoidance/safety behaviors or
  rituals? High? Medium? Low?

**After Exposure Debrief**
- Did what I was most worried about occur?
- What did happen? Was I surprised?
- What was my Fear Thermometer/SUDS?
- What did I learn?

## Decisions (Peter, 2026-11-24)

- Use her wording word for word where it suits a child. Where it does not, discuss before changing.
  Her questions are in the first person ("I"); the app asks in the second person ("you").
- Keep "Fear Level" as the name. Do not say "Fear Thermometer" or "SUDS".
- "rituals" is shown to every child for now (Peter, 2026-11-24). There is no OCD flag, and
  adding one to hide the word is not worth it yet.
- The confidence question replaces "How ready do you feel?", with High / Medium / Low.
- Safety behaviors: the child picks from the ones already in their plan and can type others.
- Debrief: no ready-made answer chips. Free text, with a hint in the box that suggests no answer.
  Chips may come back later once there is a better way to write them.
- Keep "When will you do it?" (not on the worksheet; needed for scheduling).
- Keep "How strong is your belief now?" after the exposure (not on the worksheet; the clinician's
  progress page uses the before/after drop).
- Parent experiments are a different model and are not part of this change.

## The questions after the change

Setup, in order (child app one screen at a time; clinician session sheet all on one sheet):

| # | Question | Answer | Stored in |
|---|---|---|---|
| 1 | What are you most worried will happen? | text | `prediction` (exists) |
| 2 | How will you know if this happens? | text | `how_will_i_know` (new) |
| 3 | How strongly do you believe your prediction is correct? | 0-100% | `bip_before` (exists) |
| 4 | What will your Fear Level be? | 0-10 | `distress_thermometer_expected` (exists) |
| 5 | Which safety or avoidance behaviors or rituals might you want to do? | pick from plan + type | `tempting_behaviors` (exists, see below) |
| 6 | How confident do you feel that you can do the exposure without doing them? | High / Medium / Low | `confidence_level` (exists, labels change) |
| 7 | When will you do it? | day + time of day | `scheduled_date`, `scheduled_time_bucket` (exist) |

Question 6 is shortened from her wording ("without doing avoidance/safety behaviors or rituals")
because question 5 has just listed them (Peter, 2026-11-24).

Debrief, in order:

| # | Question | Answer | Stored in |
|---|---|---|---|
| 1 | Did what you were most worried about happen? | Yes / No | `feared_outcome_occurred` (exists) |
| 2 | What did happen? | text, hint below | `what_happened` (exists) |
| 3 | Were you surprised? | Yes / No | `was_surprised` (new) |
| 4 | What was your Fear Level? | 0-10 | `distress_thermometer_actual` (exists) |
| 5 | How strong is your belief now? | 0-100% | `bip_after` (exists) |
| 6 | What did you learn? | text, hint below | `what_learned` (exists) |

## Changes

1. **Shared wording** — `apps/web/src/lib/setupQuestions.ts`: new keys `howKnow` and `safety`,
   new wording, confidence labels High / Medium / Low, updated `whatsDone`. Both the child app
   (`TeenExperimentPage.tsx`) and the clinician sheet (`SessionSetupSheet.tsx`) read from here.
2. **Safety behaviors step** — list the child's own safety and avoidance behaviors from their plan
   for that situation as choices, plus a text box. Save to `tempting_behaviors`. That column still
   holds an old `times:N` encoding on some rows; `lib/temptingBehaviors.ts` already reads both.
   Check on build whether to store as JSON or keep its current format.
3. **Debrief** — `TeenRecordPage.tsx`: remove the `WHAT_HAPPENED` and `WHAT_LEARNED_*` chips; add
   "Were you surprised?"; reorder to the table above.
4. **Database** — migration adding `experiments.how_will_i_know` (text, nullable) and
   `experiments.was_surprised` (boolean, nullable). Not destructive. Update the experiment schemas
   and the before/after endpoints.
5. **Clinician view** — show the two new answers and the chosen safety behaviors wherever the
   clinician reads a finished exposure (`ProgressTab.tsx`, `ProgressPage.tsx`).

## Debrief hints (Peter, 2026-11-24)

Grey text inside the empty box.

- What did happen? — "What did you do? What did other people do?"
- What did you learn? — "How was it different to what you expected?"

Considered and not chosen: "Was it as bad as you predicted?" (expects "no").

## Screens (as built)

The child app asks setup on five screens: fear + how you'll know; belief + Fear Level; safety
behaviors; confidence (with the behaviors they just picked shown above it, since the question says
"them"); when. The debrief is three screens: did it happen + what did happen; surprised + Fear
Level; belief now + what did you learn. Two-to-a-screen with the safety and confidence questions
together, or with all of the first debrief questions together, pushed the button off a phone
screen. The clinician's session sheet asks everything on one page.

"How will you know" is required in the child app and optional on the clinician's sheet; the child
is asked it at home if the clinician left it empty. Picking no safety behaviors is an answer.

## Checks before calling it done

- Screenshots at phone width of every setup and debrief screen, checked against the screen-layout
  rules in `CLAUDE.md`.
- Clinician session sheet screenshot.
- Existing exposures with no answers to the new questions still open and display.
