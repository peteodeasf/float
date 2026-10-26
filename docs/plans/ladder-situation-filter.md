# Ladder: filter by situation — plan

## Goal

Peter, 2026-10-26: "On the ladder building page, we currently have all of the rungs across different
situations mixed into one. Need the ability to select one situation, or two, or all, in the tags
above at the top of the exposure ladder and have the exposure ladder filter to those selections."

## Scope

The flat ladder on the Plan tab, Ladder sub-tab (`apps/web/src/pages/practitioner/patient/FlatLadder.tsx`).

- A row of chips above the list: **All**, then one per situation that has rungs, lowest Fear Level
  first (the same order as the ladder editor, `bySituationFear` in `ladderEditor.ts`). Uses `chip()`.
  The row wraps.
- Multi-select. A situation chip toggles. All clears. Nothing selected means All is on.
- What it shows only. "Visible to patient", Build/Edit ladder and saving still see the whole ladder.
  Nothing the teen sees changes.
- Remembered per patient in localStorage (`float.ladder.situations.<patientId>`), wrapped in
  try/catch like the Hide/Show switch. A remembered situation that no longer exists is ignored when
  read, and dropped the next time the selection is written. It is not pruned on load, because the
  situations arrive after the first render and an empty list would wipe the saved selection.
- A selected situation that still exists but has no rungs left keeps its chip, so it can be
  deselected. If the selection shows no rungs, a plain line says so with a "Show all" link.
- Rungs with no situation show under All only.

Not in scope: changing the ladder editor, the teen app, or the backend.

## Risks

None of the non-negotiables: no clinical rule, no data access or role change.

## Checks

`FlatLadderFilter.test.tsx`: one chip filters; two chips; All; deselecting the last returns to All;
easiest first is kept; remembered for that patient only. Screenshots at desktop width.
