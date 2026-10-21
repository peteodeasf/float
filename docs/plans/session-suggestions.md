# Suggestions from sessions — plan

> **Planned 2026-10-15.** Step 5 of [`ladder-combinations.md`](ladder-combinations.md). Built the
> same day as a first version; the choices below are open for Peter to change.
>
> **Changed 2026-10-21 (Peter): nothing runs on approval any more.** "We shouldn't have both." The
> clinician presses **Analyze session with AI** on an approved note. One press adds the note's
> suggestions (as below) and updates the case summary. See "Analyze session with AI" at the end.

## Goal

Steps 1 and 3 of the ladder interview say Float suggests situations and behaviours "from the
monitoring log and session recordings". Today only the monitoring log feeds the suggestion list.
A recorded session produces a draft note and nothing else.

## What it does

When the clinician presses **Analyze session with AI** on an approved session note, Float reads the note and adds what it finds to the
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
3. **When the clinician presses the button, not on approval** (changed 2026-10-21). Approving
   reads nothing. Pressing it again on the same note adds nothing new: items fold in by wording and
   the note is recorded once as evidence. If the model fails, nothing is saved and the clinician
   sees an error and can press again.
4. **Evidence is the note.** Each suggestion records the session note it came from
   (`session_note_ids`, a column that already existed for this), and carries the source
   `session_note`, so the editor can say "from a session".
5. **Any approved note.** A typed note is never a draft, so it counts as approved and has the
   button too. A draft note from a recording does not, until it is approved.

## Not known

- How well the extractor does on session notes. It has only been measured on monitoring notes. The
  first few real sessions should be read against what it suggests before trusting it.
- **For Peter:** a session's Fear Level only fills a gap. If the monitoring log already gave the
  situation a number, the session's does not replace it. Otherwise the two would overwrite each
  other each time either was read. Is that the right way round?
- An editor already open in another tab does not refresh its suggestions by itself.

## Analyze session with AI — the case summary (2026-10-21)

The same press also updates the case summary that monitoring analysis builds
(`formulation.preliminary_report`). Code: `backend/app/services/session_analysis_service.py`,
`POST /notes/{note_id}/analyze` in `backend/app/api/routers/session_notes.py`.

- **A second model call, with its own prompt** (`SESSION_SUMMARY_SYSTEM_PROMPT`). It is given the
  current summary and the note, and asked only what the note adds: new situations (a Fear Level
  only when the note states one), parental responses, safety behaviors, comments on existing items,
  and other notes. It has no test cases: Peter, 2026-10-19, no made-up sessions until the session
  approach is learned from Dr. Walker. It is on Dr. Walker's list in `ai-quality-testing.md`.
- **Update, never overwrite.** Session additions are stored apart, under `session_additions`, one
  block per note with its session date. The monitoring sections are not touched. The Case Summary
  tab merges them for display, each session item marked "from session, Oct 15".
- **A comment, not a removal.** If the session suggests an existing item is wrong, a comment is
  shown under that item. If the item's wording has changed since, the comment shows as a note.
- **Monitoring re-analysis keeps them.** It copies `session_additions` across. It also leaves out
  suggestion-list items that only a session note gave, so they are not written into the monitoring
  sections as if the parent had logged them.
- **Same note twice adds nothing new.** Anything whose wording already appears anywhere in the
  summary is skipped.
- **Deleting a note takes its additions out of the summary**, so a note on the wrong patient does
  not leave its content behind. Its suggestions stay on the list, as before.

## Checks

`backend/tests/test_session_suggestions.py`:

- A draft note is refused. Approving a note reads nothing.
- Analyzing adds the note's situations and behaviors to the list, marked as from that note.
- Existing summary items survive; session items carry their session; a monitoring re-analysis keeps
  them; analyzing the same note twice adds nothing new.
- A model failure saves nothing.
- Nothing is put on the plan by this.
