# Behavior suggestions: name the behavior, not the story

> Peter, 2026-11-19. Was the backlog item "Behavior suggestions are worded as the parent's story,
> not as a behavior". Built in the same PR as this plan.

## The problem

The monitoring extractor (`EXTRACTION_SYSTEM_PROMPT` in `backend/app/api/routers/patients.py`)
was told to write behaviors "in the family's own plain language", and its examples were past-tense
accounts. Its behavior descriptions become the behavior suggestions in the ladder editor. Two
examples Peter flagged:

- "Was really reluctant to leave and kept dragging his heels until they ran out of time"
  (2026-11-18).
- "Seemed only half there; parent couldn't get a read on what was going on with him; didn't have
  breakfast and wasn't ready by school time" (2026-11-19). Peter: "We need to identify what the
  actual safety behavior is here. In this case, he's skipping breakfast and delaying getting ready
  for school."

## Decided (Peter, 2026-11-19)

A behavior suggestion:
1. **Names only what the child does.** Not how the child seemed, not what the parent noticed or
   felt, not the story around it.
2. **Is one behavior.** An entry with two things the child did gives two suggestions.
3. **Is short and present tense, with no name or pronoun at the start:** "Skips breakfast", not
   "Skipping breakfast" (it reads after "without:" on a rung).
4. An entry that only describes a mood gives no behavior.

**Old suggestions:** suggestions are matched on their exact wording, so old ones would stay beside
new ones. Pre-launch, the untouched old ones are cleared (migration `c3a7e9d2b4f1`): from
monitoring only, not on the plan, not removed, not edited. They return in the new wording the next
time the monitoring analysis runs: a new monitoring entry, or AI Refresh on the Case Summary tab.

## Not changed

Situation and accommodation wording. The four behavior types and the rules for choosing between
them. Session-note suggestions (same prompt, so new ones follow the new wording; old ones are kept).

## How it was checked

The AI test runner, old prompt against new, on the working half of the made-up pool. Numbers in
the PR, each with its sample size. Peter reads a batch of suggestions after it is live.
