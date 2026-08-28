# Putting a case in the prompt destroys it as a test

**2026-08-28.** Downward-arrow probe, `AI-dev/Arrow Eval/`.

## Problem

Peter wrote nine target questions against the evaluation cases. Three of them broke the
`What will happen if...` template. To teach the model those moves, the three were written into the
shipped prompt as worked examples. The eval was then run, and all three came back word-for-word
identical to his targets.

That looked like the prompt change had worked. It hadn't shown anything. The model was reciting
examples it had just been handed.

## Root cause

Cases were serving two jobs at once — teaching the model and measuring it. Once a case is in the
prompt, a match on it is guaranteed and carries no information. Three of fifteen synthetic cases
went from evidence to decoration in one edit, and the loss was silent: the run still printed "ok".

## Fix

When a new rule is needed, write it **as a rule, not as the case**, and re-run. If the model gets
the case right from the rule alone, the case survives as a test and the rule has been shown to
generalise. Only fall back to pasting the example in when the rule genuinely cannot be stated — and
then say out loud that the case is spent.

This worked twice in the same session. "The question has to stand on its own; watch for parts that
dangle" fixed draft-05 without draft-05 appearing anywhere in the prompt — and the same rule was
visibly wrong on two *other* cases (it dragged referents into draft-13 and swapped a noun for a bare
pronoun in a real case), which pasting the answer in would have hidden.

## How to avoid it next time

- Cases in `cases.json` / `cases_draft.json` and examples in the prompt are two different sets. If a
  case's text appears in `NEXT_PROBE_SYSTEM_PROMPT`, it is no longer measuring anything.
- Prefer a stated rule over a pasted example, always. A rule can be wrong in a visible way; a pasted
  example can only be right.
- A rule that changes no output is not neutral — it is untested text. Say so rather than keeping it
  because it reads well. (One added here did exactly that and had to be replaced.)
