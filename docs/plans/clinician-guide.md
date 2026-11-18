# Clinician guide — design plan

> **Started 2026-11-18 with Peter.** Mockup: https://claude.ai/artifact/FysikJcYYUjpHA6mxNk7c2
> (private to Peter). Content is Dr. Walker's; nothing below is clinical content yet, only how the
> guide works. Video psychoeducation is a separate project.

## What it is

A step-by-step guide for the clinician, built into the clinician app. Different from the
Education section, which stays as a library to look things up in. The guide tells the clinician
what to do next and what to know, for this patient, at this point in treatment.

## Its order

Dr. Walker's sequence of treatment, not today's process checklist (Peter: the checklist "doesn't
pass muster"). Once the guide is in place, the checklist is rebuilt to match it.

1. Before the first meeting
2. Parent meeting (two parts)
3. Parent and child meeting
4. Child's first session
5. Weekly sessions
6. Ending treatment

## How it looks and works (agreed)

- **It never pushes the page around.** The guide comes in as a panel from the side, over the page,
  and goes back out the same way. The sliding in and out is smooth and soft, and it closes with ×,
  a click outside, or Esc.
- **The top bar holds one small "Guide" button**, nothing more.
- **The panel is about this patient, now**, in three parts:
  - *Where you are:* the stages above, with this patient's position and progress through the stage.
  - *What to do next:* this patient's next step, and why it is next.
  - *What to know:* the guidance for this stage. General points stay general, but each is
    illustrated with an example from this patient's own data where there is one ("For Sam: …").
    Not a generic help file.
- **Goals tick themselves** from the data (for example, a trigger list with Fear Levels), so the
  clinician sees what is left without ticking anything.
- **The ⓘ dots are separate from the panel.** A small, gently pulsing dot beside a term opens a short
  pop-up next to it: two or three lines, with an example from the patient where it helps.
- **Quieter over time.** A clinician can fold away guidance for a stage they know well; a new
  clinician sees more. (Principle agreed; not yet in the mockup.)

## Also liked, not yet placed

- **A prep card before each session:** what is ready, what this session is for, one thing worth
  asking about. Shown on the clinician's home page or in a reminder. Ties to session prep in
  `ai-foundation-and-features.md`.
- **Cue cards in session mode:** the "what to say now" part, collapsible, hidden when the screen is
  turned to the child.
- Open: whether these are the same side panel in different moments, or separate pieces.

## Not now

- **Time cues** in sessions: no (Peter).
- **A second screen** (the clinician's phone as the cue card while the tablet faces the child): kept
  for later, as part of how Float helps run sessions, not part of the guide.

## Content still to come (from Dr. Walker's notes, sorted 2026-11-18)

The notes cover before the first meeting, both parts of the parent meeting, the weekly session
structure, the action plan, rewards and clinician habits. Still missing: the parent and child
meeting, the child's first session, building the ladder and the downward arrow with the child, the
scripts she marked as still to write (what CBT is; what exposures are, how and why they work), the
separate parent meeting on accommodations, ending treatment, and what to do if something worrying
comes up. Conflicts to settle with her: daily practice time (15–20 or 10–15 minutes), points (over
10 only, or every child as Peter decided), monitoring length (several days or a week), the name of
the rating (Float uses Fear Level), and the order of the last minutes of a session (action plan,
parent joins).

**Must include** (Peter, 2026-11-18): anything new is practiced in session before it goes on the
action plan. Float does not check this.
