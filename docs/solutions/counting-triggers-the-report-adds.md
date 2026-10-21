# Counting the triggers each monitoring prompt adds

Found while building `AI-dev/evals/runner/compare_triggers.py` (2026-10-19).

## The report's situations carry no entry numbers

The runner matches the extraction's situations to the answer key through the log entries each one
cites (`ai-test-runner-matching-and-imports.md`). The preliminary report's situations cite nothing:
its JSON is a name and a Fear Level. So the same matching has nothing to go on.

Matching names to the answer key by word overlap was ruled out for the reason it was ruled out for
behaviors (`scoring-parent-actions-and-made-up-triggers.md`): the report renames and groups on
purpose ("Incidental encounters with unfamiliar adults" for three separate logged moments).

Instead a matcher on another model (`claude-opus-5-5`) reads each list against the numbered log. For
each situation it gives the entries that describe it, and any trigger in the name no entry
describes. It runs on **both** lists, extraction included, so the two counts are made the same way.
It is not told which prompt wrote which list.

## "Added" comes in two kinds

The report rarely invents a whole situation. More often it widens a logged one: a logged birthday
party becomes "Peer social settings (birthday parties, drop-off events, playdates)". A count of
situations with no entry behind them misses that entirely. So the matcher returns the unlogged
phrases inside a name too, and they are counted separately ("added inside").

## Opus 5.5 can think before it answers

Its reply can start with a thinking block, so `message.content[0].text` fails with AttributeError.
Join the text blocks instead (as `AI-dev/evals/generator/generate.py` does). The app's own calls are
on Sonnet 4.6 and read `content[0]` directly; they are not affected today.

## A background run is stopped after 10 minutes unless told otherwise

The first full run (18 families, 3 runs, 4 calls each) was killed by the agent tool's default
background limit before it wrote its report, and everything it had spent was lost. Run long eval jobs
with an explicit long timeout. The whole run takes longer than 10 minutes.
