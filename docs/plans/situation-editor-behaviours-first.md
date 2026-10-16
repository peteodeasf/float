# Situation editor: behaviours first, one thing at a time — plan

> **Planned 2026-10-16** with Peter, from a clickable mockup he reviewed in five rounds.
> Changes the screen in [`ladder-combinations.md`](ladder-combinations.md). The data does not change.
>
> **Clinical gate:** this is mostly layout. One point touches clinical logic: a behaviour typed in by
> hand, or taken from the log without a type, is now a safety behaviour (see below). Peter decided
> it. It goes in the Dr. Walker review queue, with the avoidance question for Bridget.

## The problem

Opening a situation showed everything at once: a Safety/Avoidance switch, the behaviours, the
step for each one, the log suggestions, a downward arrow status line, and the easier versions of
the situation. Peter, 2026-10-16: *"It's so confusing."* There was no clear first thing to do.

**The rule:** hide things until the clinician has to decide on them. Open them one at a time,
in the order of the interview.

## The screen, in order

Opening a situation shows one question: *What does the child do to avoid it or feel safer?*

1. **The list.** Everything added so far, at the top. Lowest Fear Level first. Rows without a score
   come next, and the avoidance row comes last.
2. **The add box.** A text box with **Add behaviour** beside it. There is no Safety/Avoidance
   switch. A typed behaviour is a safety behaviour.
3. **Suggested behaviours.** These come from the log and from sessions, plus one avoidance
   behaviour, *"Avoids <the situation>"*. They are not labelled by where they came from. They can
   be shown or hidden. Tapping one adds it to the list.
4. **Save behaviours.**

Each row in the list is simple:

- **A safety behaviour** shows the step sentence (the situation without that behaviour), drafted
  by Float, with its Fear Level box. The sentence can be edited. Nothing else is on the row. The
  behaviour's own words, the source, and "check it" notes are gone.
- **The avoidance behaviour** shows its words only. No Fear Level, no downward arrow. It is not a
  rung. Peter, 2026-10-16: *"We allow them to select that they do avoid the situation, but then we
  don't include it as a rung on the ladder."* He is taking how to include it to Bridget.
- **An added rung** (see below) shows its sentence and Fear Level.

After **Save behaviours**:

- The add box and the suggestions close.
- Each safety behaviour's row gets a small **DA** link, before the ×. It reads **✓ DA** once that
  downward arrow is done. It opens the arrow for that step, as today.
- There are two choices: **Edit behaviours**, which opens the add box again, and **+ Add rung**.
- **+ Add rung** opens a text box and a **Suggestions** link. Suggestions shows a list of easier
  versions to pick from. Picking one adds it to the list. **Close** folds it back up.

## What Peter decided, 2026-10-16

1. A behaviour typed in by hand is a safety behaviour. (Before this, there was a switch.)
2. The list is lowest Fear Level at the top, as on the ladder.
3. An added rung belongs to the whole situation, not to one behaviour. It is another row in the
   same list, not nested under a behaviour.
4. The "1 safety behaviour has no step yet" status line under the situation name goes.
5. The avoidance behaviour has no Fear Level and no downward arrow, and makes no rung, for now.
   Bridget to advise.
6. The downward arrow link says "DA", is small, and only appears once the behaviours are saved.

## How it maps onto the data

No migration. No backend change.

- A safety behaviour's step is still a `combination` row with `without_behavior_id`. The step
  sentence is drafted by the existing `combination-draft` call as soon as the behaviour is added.
- **Nothing is written to the ladder until Save behaviours.** Until then the sentence and score
  are held on the screen. Save writes one combination per safety behaviour that has none. This keeps
  Peter's 2026-10-15 answer that *the therapist reading the sentence before it is saved is the
  check* on what the child reads. The behaviour itself is saved straight away, as today.
- "Saved" is worked out from the rows, not stored: the behaviours are saved when every safety
  behaviour has its step. Coming back to a situation in that state opens the saved view.
- An added rung is a `scenario` row with no `parent_behavior_id`. Easier versions nested under a
  step by the step 4 change are still shown, as rows in the same flat list.
- A log suggestion with no type is added as a safety behaviour. Before, the clinician chose.

## Not in this change

- The downward arrow on the situation itself ("Or do one on the situation itself") goes from this
  screen. Every situation with a safety behaviour has a step to do it on. A situation with only an
  avoidance behaviour has no step, and so no arrow, until Bridget advises.
- The "do this next" marker on the arrow goes. Peter asked for the link to be small and quiet.
- The situation suggestions panel (+ Add situation) is unchanged.

## Checking it

- Screenshots of each stage: opened, behaviours added, saved, adding a rung.
- `/verify`, then `/code-review`.
