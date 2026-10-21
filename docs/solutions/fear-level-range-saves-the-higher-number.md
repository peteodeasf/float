# A Fear Level given as a range saves the higher number

Built 2026-10-21, from Peter's decision that day: when a parent says a range in a voice note ("a
seven or eight"), save the higher number, and keep the range in the words.

## What changed

- One line in the voice note prompt (`_prompt` in `backend/app/services/monitoring_capture.py`):
  for a range, `fear` is the higher number, and both numbers stay in the write-up.
- `_said_as_rating` already let the second number of "a six or seven" through. It now also reads
  "a 6-7", "a six or a seven", and "between 4 and 6" (with or without "a"). The same list of what
  may follow a rating still applies, so "between 4 and 6pm", "a 6-7 year old" and "a 3-4 minute
  walk" are still turned away.

## Things that were not obvious

**The answer key disagrees with the rule.** The pool's answer keys were written by the agents that
made the families, before Peter decided, and they give the lower number. So after the change the
voice notes report shows "Fear Levels saved that the parent did not say: 3". All 3 are the one
working note with a range, saving its higher number, which is now the right answer. Read that line
with this in mind until the keys are changed (in the backlog). The key was left alone in the same
pull request on purpose: a prompt change should not also change how it is marked.

**The lower number still gets through the app's check.** "a six or seven" is also "a six" followed
by "or", which is an allowed word after a rating. So if the AI gives the lower number, the app keeps
it. Turning it away was considered and not done: in a note with two moments ("school was a six or
seven, bedtime a six") the 6 for bedtime is real. The prompt is what asks for the higher number;
the app's check only stops numbers that are not ratings at all.

**Ranges look like times.** "between 4 and 6 she cried" could be a time. It passes, because the AI
has to offer that number as a Fear Level first and the prompt says to only when the parent gave one.
A time with "pm", "o'clock", or a noun after it ("hours") does not pass.

## The measurement

`run.py --feature voice_notes`, 18 working families, 32 notes, 3 runs each, $0.24. The one working
note with a range saved its higher number in 3 of 3 runs. Before the change (#46), it saved a Fear
Level in 1 of 6. One note is far too small to say how the prompt does on ranges in general; the pool
needs more range notes.
