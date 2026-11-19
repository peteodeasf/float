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

## Version 2 — Dr. Walker's Session 2 and 3 notes (Peter, 2026-11-19)

Peter sent three documents: *Structure and pacing of consultation*, *Session 2: Pace and Scope*, and
*Session 3*. The first is the 2026-11-18 notes with the repeats removed. It drops the 60-minute
length and "monitor for several days", so monitoring is one week. Sessions 2 and 3 are new: they are
the parent and child meeting and the child's first session. Peter: these decisions are final; they
do not go to Dr. Walker.

**The guide never blocks** (Peter: "These are guides").
- A goal Float tracks ticks itself. A goal Float cannot see, the clinician ticks. This replaces the
  dashed "in conversation" goals.
- The clinician can move on to the next stage at any time. The guide also moves on by itself when
  every goal in a stage is ticked, and jumps ahead when later work shows up in the data.
- Goals left unticked in an earlier stage show under the current one as "Not done earlier".
- The clinician's ticks are saved with the patient, in the existing process checklist record
  (`consultation_checklists.checked_items`), under keys starting `guide:`. No new table and no new
  route: the checklist routes already accept any key and already check the clinician may see the
  patient. Nothing else reads every key in that record.

**What moved or was added**
- **Fear Level** is the standard word. Her notes say Distress, Worry or Fear Thermometer, SUDS and
  DT; the guide says Fear Level.
- **The nickname** is chosen by the child in the parent and child meeting. In part 2 of the parent
  meeting the goal is explaining it to the parents.
- **The parents' script** for telling their child about the first meeting goes in the guide, at the
  end of the parent meeting. Not in the parent app.
- **The child's accommodation ratings** (Child ratings, `child_rated_at`) show as a goal from the
  parent and child meeting onward until done, marked as able to wait for a later session. It does
  not hold the stage.
- **The downward arrow with the child** goes in the child's first session, before the ladder.
  The clinician ticks it: the clinician app saves every arrow as `practitioner`, whoever was in the
  room, so Float cannot tell one done with the child from one done with the parents.
- **Practice in session** is ticked by the clinician. Float does not record it, so practicing does
  not move the guide to weekly sessions; the first exposure done at home does.
- **Daily practice time** says "a short daily practice". Her notes give 15–20 and 10–15 minutes.
- **The ladder rules** from Session 3 go in the guide's text only. The guide suggests at least 3
  rungs. Ladder Validation is unchanged (it flags fewer than 2), and Float's ladder building is
  unchanged. Not added as checks, by Peter's decision: a top rung of 8 to 10, a maximum number of
  rungs, and a rung for the situation without any behavior (Float's own rungs already cover it).
- **Points** are on for every child; the therapist will be able to switch them off for a child.
  That switch is separate work (backlog). The guide does not mention it until it exists.

**Stage changes in the code**
- Weekly sessions repeat, so their structure shows as a list without ticks.
- A ladder with rungs no longer moves the guide to the child's first session; an exposure set up
  does. Rungs can be written before the child is seen.
- "Match the behaviors to each situation" counts safety, avoidance and ritual rows per situation
  (`/triggers/{id}/behaviors`), not rungs: a rung is a sub-situation or a combination.
