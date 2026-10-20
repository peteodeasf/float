# Scoring parent actions and made-up triggers in monitoring analysis

Found while adding these two scores to `AI-dev/evals/runner/monitoring_analysis.py` (2026-10-19).

## A parent action has no link to the answer key, so it is spotted by wording

Situations are matched to the answer key by log entry (see
`ai-test-runner-matching-and-imports.md`). Behaviors have no such link: the model gives no id for
which fact behavior or accommodation it meant. Matching the model's behavior text to the answer
key's texts by word overlap looked tempting, but a child's avoidance and the parent's accommodation
in the same situation share most of their words ("Stays home" and "Mom lets him stay home").

So `is_parent_action` reads only the start of the description: an adult as the subject ("Mom walks
him in"), or something an adult allowed with the adult left out ("Allowed to stay home").

**Only the start.** A first version also matched "was let" or "are allowed" anywhere in the
sentence. On the pool's own child behaviors it flagged "Left the party after the dog was let out"
and "Asks whether dogs are allowed at the park". Anchoring at the start fixed both.

**How it was checked.** On the texts Dr. Walker confirmed in June
(`AI-dev/Extraction Loop/float_harness/tests/fixtures.json`) it marks 0 of 42 behaviors and 34 of 34
accommodations. On the pool's facts, 0 of 185 and 123 of 123. Those texts were written by people
and generating agents, not by the extractor, so this says little about the model's own wording.
What it misses on purpose: a parent's action worded as the child's ("Stays home").

## A made-up trigger and a split trigger look the same by entry

Every pool log entry has a `situation_ref`, and none is empty. So a made-up trigger cannot point at
an entry "about nothing". It either cites no entry (counted as unlinked) or cites an entry that
already backs a real situation (counted as split). A real trigger cut in two looks exactly like the
second case. Telling them apart would need the text. The runner counts both as "triggers not in the
answer key" and says so in the report, rather than pretend to separate them.

## Stability for each score, not just the whole answer

The runner's stability figure says whether runs gave the same whole answer. The item asked for each
score's stability. The report now shows each score for run 1, run 2 and run 3 separately (every
case's first run added up, and so on), and how many cases gave a different count between runs.
