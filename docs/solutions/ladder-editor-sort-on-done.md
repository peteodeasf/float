# Sorting the ladder editor's lists on Done, not as you type

**2026-10-24.** Worked out while making the ladder editor keep its order while editing
(docs/plans/ladder-editor-stable-order.md). Three things that were not obvious.

## The order has to live outside the component

The inline editor (Plan tab) and full screen (`/patients/:id/session`) are different routes, and so
is the downward arrow. Each move unmounts the editor. Order kept in React state or a ref is lost and
the list re-sorts. So the shown order is a module-level map in `ladderEditor.ts`, one entry per
list, cleared on purpose: all of it on Save ladder and Edit ladder, one situation's steps when it
is opened and on Done.

## Done must wait for the saved scores

The Fear Level box saves on every keystroke, and each save is followed by a re-read of the
behaviors. If Done sorts straight away, it can sort by the old score: the save or the re-read is
still on its way. The step then lands in the wrong place and, since the order is now kept, stays
there. `sortWhenSettled` in `SituationBody` waits for the latest save, then the latest re-read,
and loops until neither changes, then sorts.

## The avoidance row has to be pinned last again

New rows go at the end of the kept order. The avoidance row ("Avoids the cafeteria") is always last
because it is not a rung, so a safety behavior added mid-edit would land below it. The rows are
split after ordering so avoidance stays last.

## Testing it

`SessionPageOrder.test.tsx` mocks the treatment API with a small in-memory store, so a Fear Level
change goes through the same save-then-re-read as the real screen. Testing with `setQueryData` alone
would skip the timing that the second point is about.
