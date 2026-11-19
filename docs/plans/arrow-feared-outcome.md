# Downward arrow: the feared outcome from the whole arrow

> Peter, 2026-11-19. Built in the same PR.

## Before

Each step of the arrow asks the AI for the next question, which restates only the child's last
answer (`NEXT_PROBE_SYSTEM_PROMPT`). When the clinician pressed **That's the bottom**, the feared
outcome box was filled with the child's last answer, with filler words trimmed
(`cleanFearedOutcome` in `ArrowPage.tsx`). No AI. A vague last answer ("I dunno, it would be bad")
or one that only makes sense after an earlier one went in as it was.

## Now

**That's the bottom** sends the whole arrow to the AI (`POST /downward-arrows/feared-outcome`,
`FEARED_OUTCOME_SYSTEM_PROMPT`), which drafts one feared outcome. The clinician edits and confirms
it, as before. If the AI fails, the box falls back to the trimmed last answer.

## Decided (Peter, 2026-11-19)

- **Combine the arrow:** one outcome that joins the key steps, from what goes wrong to the worst
  thing predicted. Not just the deepest answer, and not the last concrete one.
- **The child's words, first person** ("I'll…", "my…"), filled in only where a phrase would not
  make sense alone.
- **No note** saying which answers it came from.
- Unchanged: a feared outcome is something that would happen, which an exposure can test, not what
  it would say about the child (2026-08-24, `session-situation-screen-focus.md`).

## Checked

`AI-dev/Arrow Eval/feared_outcome_check.py`: 8 made-up arrows, one per rule, 1 run each, about
$0.02. All 8 read as the child's fear with nothing invented. Eight cases show it does not obviously
break; they cannot say how often it is right. Two things for Peter, not turned into rules:
"something bad happened, like a car crash" became "will get into a car crash" (a possibility made
certain), and the longest chain gave 27 words.
