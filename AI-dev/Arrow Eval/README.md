# Downward arrow — probe evaluation

Does the AI write a good next question? The question a child actually reads, in
`POST /downward-arrows/next-probe`.

## Running it

```bash
export ANTHROPIC_API_KEY=...     # lives in Railway, not in backend/.env
python "AI-dev/Arrow Eval/run_eval.py"
```

It **imports the shipped prompt** from `app.api.routers.downward_arrows` rather than keeping a
copy. The extraction harness in the next folder over made that mistake: scoring its own copy of a
prompt tells you nothing about what children are being asked.

## The cases

Five, all from one real chain (Baseball practice, 2026-08-24). Peter reviewed all 18 chains that
existed in production and kept only these; the rest were produced by an older client-side template
that pasted the child's sentence into `What will happen if... <verbatim>?`, or by the meaning-chain
wording the prompt used before 2026-08-24. Neither is a question we would want reproduced.

**This set is small and narrow.** One child, one clinician, one session. It can catch a prompt that
regresses into obvious bad behaviour — echoing verbatim, drifting off what the child said, asking
what something means about them. It **cannot** tell you the prompt generalises. Widening it needs
either more real sessions or cases written by a clinician.

## What is checked

`checks.py`, no model and no judgement:

| Check | Catches |
|---|---|
| `is_a_question` | a statement instead of a question |
| `is_one_question` | two questions at once |
| `is_short` | a paragraph read at a child |
| `no_meaning_probe` | "what would that mean about you?" — the wrong technique for this chain |
| `uses_their_words` | a question that drifted off what the child just said |
| `not_a_verbatim_echo` | the child's sentence pasted in rather than restated |

The last two together are what "restating" means, and each catches one way it fails: all-new words
means the question left the child's fear behind, a straight copy means nothing was understood.

The checks are unit-tested in `backend/tests/test_arrow_probe_checks.py` — in CI, no key needed —
against a real good example and the three failure modes above. If the checks are wrong the
evaluation is worthless, so they are tested even though the evaluation itself is not.

## What is NOT checked

Whether the question followed the **right** thread. Two questions can both be well-formed and only
one of them chase the actual fear. That needs a scorer with a rubric, and the rubric is a clinical
judgement — Dr. Walker's, not ours.
