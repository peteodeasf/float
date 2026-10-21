# A Fear Level the parent said in a voice note, but not saved

Found 2026-10-21, from the first nightly AI test report (voice notes: 38 of 46 said Fear Levels
saved).

## There are three places it is lost, not two

The backlog item named two: the AI leaves it out, or the app drops it afterwards (`_said_as_rating`
in `backend/app/services/monitoring_capture.py`). There is a third. When the AI's reply cannot be
read, `write_up` fails, the note is saved as the parent's words alone, and any Fear Level in it is
lost with the write-up.

The runner's scores do not show the third. A run whose reply cannot be read has no score, so it is
missing from "Fear Level said and saved" altogether, rather than counted as a miss. That is why the
nightly report said 46 runs with a Fear Level said, when 16 notes × 3 runs is 48.

## How to split the misses

For each run of a note whose answer key has `fear_level_said`, in this order:

1. Could `voice_notes.read` read the reply? If not: **unreadable**.
2. Is the said number on a saved observation (`voice_notes.saved`)? Then it was saved.
3. Is it in the model's raw `fear` values (`voice_notes._model_fears`)? Then **the app dropped it**.
4. Otherwise **the AI left it out** (or gave a different number).

It is a 30-line script over `outputs.jsonl`, and it was not committed: the counts go in the PR, and
reading which note failed means reading pool text, which must not go anywhere else.

## What it found (18 working families, 3 runs each, 48 runs with a Fear Level said)

| Cause | Before | After the fix |
|---|---|---|
| Saved | 38 | 44 |
| The app dropped it | 6 (2 notes, every run) | 0 |
| The AI left it out | 3 (1 note, a range) | 2 (the same note) |
| Reply could not be read | 1 (1 note) | 2 (the same note) |
| Fear Levels saved that were not said | 0 | 0 |

The AI cause and the unreadable cause each come from a single note. Neither count says anything
general about how often it happens.

## The fix, and what it costs

"like" and "about" are now allowed straight after a rating ("an eight like he was shaking", "a six
about the math test"). Checked on all 32 working notes, every number 1 to 10: the said rating is now
readable on 16 of 16 notes that have one (was 14), and no other number is taken except the second
number of a range, which was already allowed.

The cost: a count written as "a 3 like ..." would now pass. No pool note says that, and in speech a
count is almost always followed by its noun. If one turns up, it is a made-up rating, which is the
worse mistake (`a-number-in-a-voice-note-is-not-a-fear-level.md`), so add a test and tighten.

## What was not changed, and why

- **The range.** The only note the AI missed gives a range ("a six or seven" style). What to save
  for a range is a Fear Level rule, so it is Peter's decision, not a prompt line. In the backlog.
- **The unreadable reply.** Quote marks inside the JSON. Already in the backlog; the fix touches
  the shared reader or the way the reply is asked for, which is its own piece of work.
