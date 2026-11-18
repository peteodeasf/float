# Avoidance is dealt with like a safety behavior — plan

> **Decided 2026-11-18 (Peter).** Changes [`situation-editor-behaviours-first.md`](situation-editor-behaviours-first.md)
> and [`ladder-combinations.md`](ladder-combinations.md). Clinical: logged for Dr. Walker below.

## Why

On Monty Full's "Getting ready for school", a behavior from the log ("Was really reluctant to leave
and kept dragging his heels until they ran out of time") showed with no Fear Level. The AI had
marked it avoidance. Tapping a suggestion kept the AI's label, and an avoidance row was words only,
never a rung. Nothing on the row said why.

Peter: "Everything gets added as a safety behavior. Even behaviors that are technically avoidance
behaviors, they're dealt with the same as a safety behavior."

## What changes

- **A tapped suggestion is always added as a safety behavior,** whatever the AI called it
  (avoidance, escape, unclear). `add_to_plan` in `backend/app/api/routers/insights.py`. A clinician
  who explicitly picks a type still gets it.
- **An avoidance behavior makes a rung,** the same as a safety one: the situation without it, drafted
  by Float, with its own Fear Level. `COMBINATION_OF` in `backend/app/core/behavior_types.py` is now
  safety or avoidance. Avoidance rows already saved get their step drafted when the situation is
  opened, so nothing in the database is changed.
- **The situation editor** lists avoidance rows with the safety ones. The words-only row at the
  bottom is gone. `SessionPage.tsx`.

## Not changed

- The AI still labels behaviors avoidance, safety, escape or unclear in the suggestion list. The
  label just no longer decides anything on the plan.
- How the AI words a behavior. It keeps the family's own words, on purpose. See the backlog.
- An observation (a symptom or a thought) still makes no rung.

## Dr. Walker review queue

- **An avoidance behavior now makes a rung.** "The situation without dragging his heels" is a step
  with its own Fear Level, like "the situation without sitting at the back". Until now an avoidance
  was recorded but never put on the ladder (Peter, 2026-10-16: "We allow them to select that they do
  avoid the situation, but then we don't include it as a rung on the ladder"; he was taking how to
  include it to Bridget). Peter decided 2026-11-18 that they are dealt with the same.
- **The AI's avoidance / safety / escape label no longer decides what goes on the plan.** Everything
  added from a suggestion is a safety behavior.
