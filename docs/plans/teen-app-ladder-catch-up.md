# Teen app: catch up with the ladder changes

**Status:** built 2026-09-10.

Most of the ladder change reached the child's app on 2026-09-03: one flat ladder, easiest first;
the step the clinician recommends is marked; the whole ladder turns on and off together; a
clinician-planned exposure shows up on the child's home; "without X" is gone. See
`exposure-ladder-sub-situations.md`.

What follows is what is still on the old model, found by reading every child screen on 2026-09-10.

## 1. Bug: the child can't open an exposure on a new situation

The exposure screen checks the old per-situation on/off flag and sends the child back to the home
if it is off (`TeenExposurePage.tsx:51`). That flag stopped being used on 2026-09-01 — the ladder
switch replaced it — and new situations are created with it off
(`trigger_situation_service.py:60`). Nothing in the ladder editor turns it on.

So a child who taps a scheduled exposure on any situation made in the new ladder editor lands back
on the home screen.

**Fix:** check the ladder switch instead. `/patient/behaviors/{id}` returns whether the ladder is
on; the exposure screen sends the child home only when it is off.

## 2. The step is the headline, the situation is the small label

Under the new model the thing the child does is the step — "Walk to my classroom by myself". The
situation is context. Seven places still show the situation as the big title with the step
underneath it:

- home: the "coming up" card, and the scheduled list
- setup screen: the top, and "The plan" card at the end
- exposure screen: the countdown state, and the "you're in it" state
- record screen: the top

**Fix:** step as the headline, situation above it in the small label style. The home's ladder list
and "Set up an experiment" card already do it this way, so they are the pattern to copy.

## 3. Two child screens break if a situation has two downward-arrow rows

`/patient/ladder` and `/patient/behaviors/{id}` both ask for exactly one arrow per situation and
fail if there are two. The first is the child's home. Same fault fixed for the suggestions on
2026-09-05.

**Fix:** take the most recently updated arrow.

## 4. A step with no situation fails on three screens

`/patient/behaviors/{id}` finds the patient through the step's situation, so a step with no
situation returns "not found". The setup, exposure and record screens all read it. New ones can't
be made now that "+ Add rung" is hidden, but older ones may exist.

**Fix:** check the step belongs to this patient through its own plan link, falling back to its
situation for older rows — the same check the clinician side already uses
(`avoidance_behavior_service.py`). This changes who the endpoint lets see a step, so it gets a
security review.

## Not changing

- **The progress screen** keeps counting every exposure the child has done, including ones on
  old-model steps. That is their real history. Counting only new-model steps would hide work they
  finished.
- **"Steps"** stays the child's word. "Sub-situation" is clinician vocabulary.

## Decided: the child sees the feared outcome once the arrow is done

Peter, 2026-09-10: *"if it has been done (tDA) should be shown."*

The setup screen used to show the clinician's feared outcome only if they pressed save on the last
screen of the downward arrow. Walking the chain and leaving recorded it without that, so the child
saw nothing. Now the child sees it whenever one is recorded — the same rule the suggestions use
since 2026-09-05. Logged in the Dr. Walker review queue, because it is text a child reads.

Applies to `/patient/ladder` and `/patient/behaviors/{id}`.

## What was done — 2026-09-10

All four items above.

**Added during the security review.** The review found one thing. The new code took the most recent
downward arrow on a situation whoever ran it, so a situation holding an arrow run with the parent
could show the child the parent's answer. A second check scored it below the bar: the old code did
not check who ran the arrow either, only old test data could trigger it, and no current screen makes
a parent arrow on a situation. It is fixed anyway, because the parent's answer is not something the
child said.

Two more changes of the same kind, both cutting down what the child's app receives:

- The parent's monitoring observations ("Complained of stomach pain") are no longer in the child's
  ladder data. They were sent before, just not drawn on screen.
- Hidden placeholder situations are no longer sent to the child's app.

**Checked:**

- 11 new backend tests, and the full backend suite including the route sweep.
- Each access rule was broken on purpose to confirm its test then fails.
- Frontend typecheck, tests and build.

**Not checked:** the changed screens were not opened in a browser, because that needs a child's
login. Screens to look at: the home ("Next experiment" and the schedule), setting up an exposure,
the exposure screen before and during, and "How it went".

`/simplify` and `/code-review` were not run.
