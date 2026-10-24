# The ladder editor holds its order while you edit

**2026-10-24.** Peter: "In the edit ladder mode, I want to stop re-ordering with fear level
immediately. It's confusing for users. The situation list can be re-ordered when saving." And:
"similar with adding behaviors and rungs, we should re-order when user hits Done." And: "remove the
\"start here\" text from the situation list item".

## What changes

- **Situations.** Sorted by Fear Level (lowest first, unscored last) when the editor opens and when
  Save ladder is pressed. In between, a situation keeps its place when its Fear Level changes, and
  a new one goes at the end.
- **Inside a situation.** Behaviors and rungs are sorted when the clinician opens the situation, on
  the Done that saves the behaviors (after their steps have been read back, so each lands by its
  own score), and on the Done that closes Add rung. In between they hold their places.
- **Inline and full screen** are two screens (`PatientPage` and `/patients/:id/session`). Both held
  orders — the situations, and the steps of each situation — are kept outside React, by plan
  (`heldOrders` in `ladderEditor.ts`), so going between them, or to the downward arrow and back,
  does not re-sort. They are forgotten when Edit ladder opens the editor afresh.
- **"Start here"** badge and the code that picked it are gone.

Display only. `display_order` in the database is not touched.

## How it is built

One hook, `useHeldOrder` in `SessionPage.tsx`: sorts once, keeps that order in the plan's store,
appends new items, drops removed ones, and `resort()` sorts again. Pure helpers (`byFearLevel`,
`inHeldOrder`, `heldOrders`) live in `ladderEditor.ts`, because `SessionPage.tsx` only exports
components.

Full screen being a separate page is why the order lives outside React. Making full screen an
overlay on the Plan tab would remove that need for inline and full screen, but not for the downward
arrow, which is its own page too. Not done here.

## Checks

Tests in `SessionPage.test.tsx`; screenshots at desktop width against `float_dev`.
