# Finding test cases copied into prompts: how long a match has to be

**2026-10-19.** Building `AI-dev/evals/check_no_cases_in_prompts.py`, the CI check that no test case
is in an AI prompt.

## Problem

The check cuts the prompts and the cases into words and looks for a run of N words in a row that
both share. The plan expected it to find only the five downward arrow cases already known to be in
the arrow prompt. No value of N does that.

What each length found, on the 179 cases and the prompts as they were that day:

| N | Cases matched, besides the five | What the extra matches were |
|---|---|---|
| 5 | 42 | mostly ordinary phrases: "what will happen if you", "for the rest of the" |
| 6 | 20 | still the arrow template: "what will happen if you feel" |
| 7 | 15 | real copies (below), plus "refuses to get out of the car" |
| 8 | 1 | extraction case 4 only, and the arrow case `draft-08` is no longer found |

So 7 is the only length that finds all five known cases without the template matching by chance.
But at 7 it also finds copies nobody had listed:

- **Extraction case 4 is quoted in the extraction prompt.** The prompt's example of `unclear` is
  "he was quiet and slow this morning, hard to tell what was going on." That is the case's note.
  Case 4 is a held-out case, so the held-out score has been partly a copied example since the
  prompt was promoted on 2026-06-30 (commit `f8e8f41`).
- **Extraction case 1's answer is the extraction prompt's safety example**: "wears headphones so
  nobody talks to her". Three Ladder Eval files carry the same rung, from the same situation.
- **"refuses to get out of the car"**, the prompt's avoidance example, is word for word in extraction
  case 15's note, and in extraction case 5's answer, `disagreements.json` case-15, three Ladder Eval files and the pool
  family `fam-specific-03`. This one may be an ordinary phrase rather than a copy. The check cannot
  tell which.
- **Two real arrow chains** (`AI-dev/Arrow Eval/cases.json` 3 and 4) supply the arrow prompt's
  example of a dangling question: "if THEY don't want to hang out with you".
- **The pool family `fam-edge-03`** quotes the extraction prompt's definition of avoidance in its
  label notes. Here the case copied the prompt, not the other way round.

## Fix

The check stays at 7 words and reports all of them. It does not decide which are acceptable.
Only the five arrow cases the plan named are allowed through (`ALLOWED` in the script). The
others are a question for Peter, raised in the PR: mark those cases as spent, or reword the
prompt examples so they come from no case.

## How to avoid it next time

- **Before trusting an allowed list, run the check with an empty one.** The plan's list of five came
  from the arrow work. Nobody had looked at the extraction prompt the same way.
- **A copy check finds copies, not paraphrases.** The Kemp case went into the preliminary report
  prompt reworded, and short copies (under 7 words) in the rung prompt get through. Those are in
  `docs/backlog.md`. Writing a rule into a prompt, not a case, is still the only real protection.
- **The direction of a match is not known.** A case that quotes the prompt's definition looks the
  same as a prompt that quotes a case. Read each match before acting on it.
