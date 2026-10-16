# Suggestions from sessions — plan

> **Planned 2026-10-15.** Step 5 of [`ladder-combinations.md`](ladder-combinations.md). Built the
> same day as a first version; the choices below are open for Peter to change.

## Goal

Steps 1 and 3 of the ladder interview say Float suggests situations and behaviours "from the
monitoring log and session recordings". Today only the monitoring log feeds the suggestion list.
A recorded session produces a draft note and nothing else.

## What it does

When the clinician **approves** a session note, Float reads the note and adds what it finds to the
patient's suggestion list: situations (with a Fear Level only when a number was said), behaviours
tagged avoidance, safety, escape or unclear, and accommodations. They appear in the ladder editor
beside the monitoring ones, marked as coming from a session. Nothing goes on the plan until the
clinician taps it, the same as the monitoring suggestions.

## Choices, and why

1. **The approved note, not the raw transcript.** The note has been read and approved by the
   clinician. The transcript has speakers that software guessed and everything anyone said,
   including things the clinician would not want treated as fact. The note's own instructions
   already say "a Fear Level only when a number was said in the session".
2. **The same extractor as the monitoring log, unchanged.** It has its own test set and has been
   tuned (`AI-dev/Extraction Loop`). Writing a second one for sessions would be new prompt rules
   with nothing to test them against. The message to it says the text is a clinician's session note
   rather than a parent's monitoring note. That framing line is the only new wording.
3. **On approval, after the response.** Approving does not wait for the model, and if the model
   fails the approval still stands. Approving the same note twice does nothing the second time.
4. **Evidence is the note.** Each suggestion records the session note it came from
   (`session_note_ids`, a column that already existed for this), and carries the source
   `session_note`, so the editor can say "from a session".
5. **Only notes that were drafts.** A note typed by the clinician is never a draft, so it is not
   read. Recorded sessions are what step 5 is about. Reading typed notes too is one line to change.

## Not known

- How well the extractor does on session notes. It has only been measured on monitoring notes. The
  first few real sessions should be read against what it suggests before trusting it.
- **For Peter:** a session's Fear Level only fills a gap. If the monitoring log already gave the
  situation a number, the session's does not replace it. Otherwise the two would overwrite each
  other each time either was read. Is that the right way round?
- **No retry yet.** The note is read once, when it is approved. If the model fails at that moment,
  that session's suggestions are lost. A retry needs somewhere to record "read", which is a new
  column; not done in this first version.
- An editor already open when the note is approved does not refresh its suggestions by itself.

## Checks

- Approving a recorded session's note adds its situations and behaviours to the list, marked as
  from a session, with the note as evidence.
- A second approval, or approving a note that was never a draft, reads nothing.
- A model failure leaves the note approved and the list unchanged.
- Nothing is put on the plan by this.
