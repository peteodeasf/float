# "How this works" walkthroughs — plan

> **Agreed with Peter 2026-11-23.** Mockup: https://claude.ai/artifact/SaC1xjUw5paQzqJ52wtWho.
> Text: `docs/clinician-walkthroughs.md` (draft, Peter edits later). Built with the draft text,
> marked "Draft content - to be reviewed", as the guide is.

## What it is

A short walkthrough for each screen of the clinician app's patient page: what it's for, before you
start, steps, what the family sees, things to know. The guide (`docs/plans/clinician-guide.md`)
says what to do in treatment. These say how to do it in Float.

## How it works

- **The link.** A small grey "How this works" link at the right end of the patient page's tab bar.
  It opens the walkthrough for the tab you are on. On the Plan tab it follows the Ladder /
  Accommodations choice. Peter agreed the right end of the Ladder / Accommodations row; the other
  tabs have no such row, so the tab bar is the one place that works for every tab.
- **Access.** The Teen, Parent and Clinician panels in the patient header get the same link, for
  the Access walkthrough.
- **The panel.** The guide's side panel, not a second one. It shows either the guide or a
  walkthrough, never both. The walkthrough's footer has "Open the guide"; the guide is unchanged.
  Opening either from its own button shows that one.
- **Show me.** Each step can name a control. "Show me" scrolls it into view and makes it pulse
  twice. Controls are found by a `data-walkthrough="<id>"` attribute added to them. A step whose
  control is not on the screen (for example, a button that only shows in the builder) has no Show
  me button. With reduced motion, the control gets an outline instead of a pulse.
- **Nothing is saved.** No backend, no data access, no new routes.

## Files

- `apps/web/src/lib/walkthroughs.ts` — the text, one entry per screen, from
  `docs/clinician-walkthroughs.md`.
- `apps/web/src/components/practitioner/GuidePanel.tsx` — the panel takes either the guide or a
  walkthrough. The shell (slide, close, Esc, backdrop) stays as it is.
- `apps/web/src/components/practitioner/Walkthrough.tsx` — the walkthrough body and Show me.
- `apps/web/src/pages/practitioner/PatientPage.tsx` — the link, which walkthrough, and the
  `data-walkthrough` attributes on the controls the steps point at (also in `FlatLadder.tsx`,
  `ParentPlanPanel.tsx`, `ProgressTab.tsx`, `TeenAccessPanel.tsx` as needed).

## How to tell it worked

- Tests: the link opens the walkthrough for the current tab and Plan sub-tab; "Open the guide"
  switches the panel; Show me adds the pulse to the right control; a step with no control on screen
  has no Show me.
- Screenshots of the panel on the Plan tab and one other tab, against local demo data.

## Not in this version

- Editing the text in the app. It lives in code, like the guide.
- Links from the guide's steps to the walkthroughs (the first option discussed; Peter chose the
  screen's own link).
- A walkthrough for session mode. It has no way in of its own (backlog).
