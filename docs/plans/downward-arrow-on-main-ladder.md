# The Downward Arrow button moves to the main ladder

Peter, 2026-11-02: "I want to move the downward arrow in the clinician portal from the edit ladder to
the main ladder view. Change the DA button to 'Downward Arrow'. Place it inline to the left of the
fear level."

## What changes

- Each rung row on the main ladder (`patient/FlatLadder.tsx`) gets a "Downward Arrow" button, just
  left of the Fear Level box. It looks like "Set it up". Once the arrow has a feared outcome it reads
  "Downward Arrow ✓" (same rule as the old "✓ DA": `arrowDoneOn` in `ladderEditor.ts`).
- It opens the same arrow page: `/patients/:id/arrow?situation=<situation>&rung=<rung>`.
- The DA link comes out of the ladder editor (`SessionPage.tsx`), with the props and the arrow read
  that only it used.
- Coming back from the arrow for a rung goes to the main ladder (`?tab=plan`), not the editor.

## Which rungs get the button

The same rungs the editor showed DA on: a combination rung (a situation without one safety behavior)
that belongs to a situation. The backend only opens an arrow on a combination
(`_combination_on` in `avoidance_behaviors.py` returns 400 otherwise), and the URL needs the
situation. Other rungs get an empty space the same width, so the Fear Level boxes stay in a column.

## Done-ness

One call for the whole patient (`listPatientDownwardArrows`, key `['patient-arrows', patientId]`),
which already includes rung arrows. The arrow page already invalidates that key when it saves a
feared outcome (`ChainPhase.save`).

## Coming back

Every way into the arrow page now starts outside the editor, so all its exits go to
`/patients/:id?tab=plan`, which opens on the Ladder sub-tab. The editor-return URL
(`edit=1&situation=`) is no longer used by the arrow page; full screen still uses it.
