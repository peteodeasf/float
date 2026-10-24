# Ladder editor: things stay put while you edit

Peter, 2026-10-24: "In the edit ladder mode, I want to stop re-ordering with fear level immediately.
It's confusing for users. The situation list can be re-ordered when saving." And: "similar with
adding behaviors and rungs, we should re-order when user hits Done".

## Today

`SessionInterview` (`apps/web/src/pages/practitioner/SessionPage.tsx`) sorts the situations by Fear
Level on every render, and `SituationBody` sorts the steps the same way (`rows.sort`). A change of
Fear Level, or a new row, moves it at once.

## What changes

The sort itself stays as it is. What is new is the order *shown*: a list of ids. Each render keeps
the ids already shown where they were, drops any that are gone, and puts new ones at the end
(`keepOrder` in `ladderEditor.ts`).

Both lists keep their shown order in one module-level map (`inShownOrder` / `sortNextTime`), one
entry per list. It lives outside any component because the inline editor, full screen and the
downward arrow are different routes, and going between them must not re-sort.

- **Situations.** Every shown order is forgotten on Save ladder and when Edit ladder is pressed, so
  the editor opens sorted. A page reload also starts sorted. Going to full screen and back, or to
  the downward arrow and back, keeps the order: that is the same editing session.
- **Steps.** A situation's steps are forgotten (so sorted) when the clinician opens it, and on
  both Dones (the one that saves the behaviors, and Add rung's). Done first waits for any Fear Level
  still being saved and for the behaviors to be read back, so the sort uses the saved scores.
  The avoidance row stays last even when added mid-edit, as before: it is not a rung.

Nothing about saving changes. `display_order` is not written.

## Checks

Tests in `SessionPageOrder.test.tsx` for both lists; screenshots at desktop width.
