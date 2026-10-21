# Testing the AI features without waiting on Dr. Walker — plan

> **Planned 2026-10-19** with Peter. For Trevor to build. Not started.
> Page version for reading: https://claude.ai/artifact/Jfz9L7UaS939Q1TqzSPFgv
>
> **Clinical gate:** the tests change nothing a child sees. A prompt change they lead to does, so
> every prompt change is a pull request Peter approves. None of this replaces Dr. Walker's sign-off
> at launch.

## Goal

Make the AI features as good as we can before Dr. Walker reviews them. Getting her time is hard.
Use the Mac mini's overnight compute: agents write test cases, other agents review the results,
and only the cases they disagree on go to a person.

## The features, and which ones this plan tests

| Feature | In this plan | How it is tested | Where the code is |
|---|---|---|---|
| Monitoring analysis | Yes | Known facts | `backend/app/api/routers/patients.py` (preliminary report), `backend/app/services/insight_service.py` |
| Parent voice notes | Yes | Known facts | `backend/app/services/monitoring_capture.py` |
| Session note drafts | **No, not yet** | — | `backend/app/services/session_recording.py` |
| Session note suggestions | **No, not yet** | — | `suggest_from_session_note` in `insight_service.py` |
| Step sentences | Yes | Reviewing agent | `backend/app/services/combination_wording.py` |
| Suggested rungs | Yes | Reviewing agent | `backend/app/services/step_suggestion_service.py` |
| Downward arrow questions | **No, left out for now** | — | `backend/app/api/routers/downward_arrows.py` |

**Session notes, not yet.** Peter, 2026-10-19: made-up session transcripts could mislead, because we
don't yet know what a typical session looks like. He will learn that with Dr. Walker first. Until then
there are no session cases.

**Downward arrow, recorded so it isn't lost:** the prompt says "You are given the situation", but
`NextProbeRequest` has no situation field, so it is never sent. Five of the nine `AI-dev/Arrow Eval`
cases that have target questions are copied into the prompt, so they no longer test anything.

## What exists today (2026-10-19)

- **Monitoring analysis.**
  - `AI-dev/Extraction Loop/float_harness/` has 18 cases with answers Dr. Walker confirmed in June. It splits them into tuning cases (odd ids) and held-out cases (even ids).
  - Its last run (`runs/20260915_163743/holdout_report.json`) scored 0.80 on behavior types for the 9 held-out cases. Its own bar is 0.90.
  - `backend/evals/preliminary_report/` has 14 report cases with draft answers and no saved scores. Since 2026-10-19 it sends the input the app sends (it runs the app's own list and report steps).
- **Suggested rungs.** About 50 cases across the `AI-dev/Ladder Eval/` rounds, mostly social anxiety. The targets are Claude drafts. There is no runner. Dr. Walker's 2026-08-29 review of 60 suggestions is in `docs/plans/ladder-generation.md`.
- **Step sentences.** `AI-dev/Combination Wording/run_check.py` builds a sheet to read. It scores nothing.
- **Voice notes, session drafts, session suggestions.** No test cases.
- **No temperature is set on any call,** so the same input can give different answers.
- **Nothing runs on a schedule,** and CI runs no evals.

## How it works

### Known facts, for the four features that pull facts out of text

Monitoring analysis and voice notes.

The generating agent first writes a made-up family as facts:
- the child's age
- the situations, with Fear Levels
- the child's behaviors, each with its type: avoidance, escape, safety or unclear
- the parent's accommodations
- whether there is a risk

Then it writes the inputs from those facts: a parent's monitoring log and voice notes. It should vary
how they are written: terse, rambling, misspelled, out of order.

The facts are the answer key. Scoring whether Float recovered them needs no clinical opinion. Most
of the compute goes here.

### Reviewing agents, for the two judgment features

Step sentences and suggested rungs have no single right answer.

- A reviewing agent is given Dr. Walker's written rules, quoted from `docs/plans/ladder-generation.md`.
- It must name the rule behind every objection. An objection with no rule is reported as its own opinion.
- It runs on a different model from the feature it reviews.
- Several reviewers each look at one thing: her rules, the child's safety (no way out, no new fear), and whether it reads right for the child's age.

**Check the reviewer against her real marks before trusting it.** Run the rung reviewer on the 60
suggestions she marked on 2026-08-29, and report how often it agrees with her, with the counts. Sixty
is a small sample. It can show the reviewer is badly off. It can't show it is right. The step-sentence
reviewer has no marks from her to check against, so its verdicts are reported as unchecked.

### Trevor runs it

Trevor is in charge. It schedules the jobs, starts each generating and reviewing agent fresh with only
its own instructions, collects the results and writes the reports. A reviewing agent never sees a
generating agent's reasoning.

Trevor also writes the prompts, so it must not be able to mark its own work:
- **The judging is not Trevor's to change.** The reviewing agents' instructions and the held-out cases live in `AI-dev/evals/judging/`. Trevor proposes adding that folder to `.github/CODEOWNERS` in a pull request of its own, for Peter to approve.
- **Held-out results come back as scores only.** Trevor tunes prompts on the working cases. It never reads the held-out cases it failed.
- **Every prompt change is a pull request Peter approves,** showing the scores before and after, with sample sizes.
- **Synthetic data and the local test database only.** Nothing from production goes into a case (see CLAUDE.md, "Agents on the Mac mini"). Each night has a spending limit, and the run stops when it is reached.

### The schedule

| When | Job |
|---|---|
| Sundays 1am | Generate new candidate families and cases into the waiting pool. They don't join the tests yet, so scores stay comparable night to night. The first 30 were written on 2026-10-19 (`AI-dev/evals/pool/`, #26), so this job adds to them. |
| Nightly 2am | Run the four features on the fixed cases, several times each. Code checks first, then reviewing agents. |
| Nightly 4am | If a prompt-change pull request is open, score it on working and held-out cases, and post the scores on the pull request. |
| Daily 6am | A short report for Peter: what got better or worse, and any new disagreements. |
| Mondays | A list of at most 10 disputed cases for Peter. Pool cases he accepts join the fixed set. |

## Rules that keep it honest

- **Never put a test case in a prompt.** It has happened three times (`docs/solutions/eval-cases-burned-by-putting-them-in-the-prompt.md`). A check in CI catches it.
- **Report every number with its sample size,** and say what the cases don't cover.
- **No new prompt rule from a handful of cases.** A pattern the reviewers find becomes a question for Peter, not a rule (CLAUDE.md, "Do not draw rules from small samples").
- **American spelling** in everything generated for a child or parent to read.

## Work items, in order

**Fix first**
1. **Show the risk flag.** The extraction prompt can return `review_flag`. `rebuild_from_monitoring` never reads it and the route doesn't return it, so it reaches no clinician. Save it and show it. This touches what a clinician sees, so ask Peter how it should look first. The prompt's rule for raising it has not been checked by a clinician, so don't rely on the flag until Dr. Walker has said what counts as a risk sign (item 13).

**Shared machinery**

2. **One test runner** in `AI-dev/evals/`, built on `float_harness`.
   - It imports the app's real prompts and calls. Copies of prompts went stale before: the old 0.926 score came from a copy.
   - It runs each case N times, with code checks first and reviewing agents second.
   - It writes a scored report with sample sizes and a stability figure.
   - It uses one case format for every feature.
3. **Keep the judging away from Trevor.**
   - Create `AI-dev/evals/judging/` for the reviewer instructions and held-out cases. Done 2026-10-19.
   - Open a separate pull request adding it to `CODEOWNERS`. Done 2026-10-19 (#29).
   - Report held-out results as scores only. Done 2026-10-19: `judging/run_held_out.py` prints totals, check counts and stability, with no case text, model answers or case ids.
4. **A CI check that no test case is in a prompt.** It needs no API key.
5. **The overnight schedule** above, with a nightly spending limit and the morning report.
   - Local test database only.
   - Use the stability figures to propose temperature settings, as a pull request.
   - Built 2026-10-20: `AI-dev/evals/nightly.sh` (the work is in `nightly.py`). Not yet in the crontab: the lines are at the top of `nightly.sh`, for Peter to add. "Fixed cases" means the working half of the families committed to the pool, because no family has been accepted into a fixed set yet. A family the Sunday job writes is not committed, so it stays out of the nightly runs. A prompt-change pull request is one that changes the prompt or model of a feature the runner tests. It is merged into main locally and scored with main's cases and scoring code. The Monday list is not built (item 13).

**Known facts**

6. **The family generator.** The first pool was written by hand-run agents on 2026-10-19. The format is in `AI-dev/evals/pool/README.md`, and `validate.py` checks it. Turn what made those 30 into the Sunday job, and add what they don't cover. US families only: Float is US-only (Peter, 2026-10-19). No session transcripts (see above).
   - Facts first, then the inputs.
   - Kinds of anxiety: social, separation, health, specific fears, school refusal.
   - Ages 8–17, which is Float's age range, and many ways of writing.
7. **Monitoring analysis at scale.**
   - Score situations found, behavior types, parent actions mistaken for child behaviors and invented triggers.
   - **Do not score the risk flag.** Peter, 2026-10-19: what counts as a risk sign is a clinical question, and made-up data shouldn't settle it. Every family's risk label is marked `confirmed: false`. Score it only once Dr. Walker has answered (item 13).
   - Settle the conflict between the two prompts. The report prompt allows triggers the parent never logged (`patients.py`, "you may add them"); extraction forbids it. Bring the result to Peter.

     **Measured 2026-10-19** (`AI-dev/evals/runner/compare_triggers.py`). 18 working pool families, 3 runs each, so 54 runs. A matcher on a different model (Opus 5.5) read each list against the log. It was not told which prompt wrote which list.

     | | Extraction | Report |
     |---|---|---|
     | Situations listed | 314 | 196 |
     | Whole situations no log entry describes | 0 | 0 |
     | Unlogged triggers added inside a logged situation | 3 | 55 |
     | Runs with any addition | 2 of 54 | 31 of 54 |
     | Families with an addition in any run | 1 of 18 | 15 of 18 |

     - Neither prompt made up a whole situation. The report adds by widening a logged one: "Peer social settings (birthday party, likely also playdates, school group activities)" when only a birthday party was logged. It often says "by extension".
     - The report's additions change from run to run. All 3 runs added the same number on only 5 of 18 families. Extraction: 17 of 18.
     - I checked 3 of the 58 flags against the log, and all 3 were right. The rest were not checked, and nor were the situations the matcher left unflagged.
     - The extraction's 3 were all one family. Its name said "home alone" when the girl was home with her brother.
     - Not covered: OCD, families outside the US, any patient analyzed a second time. No clinician has checked the answer keys. The extraction list is what the ladder builder offers; only the report's situation names were read.

     **Decided, Peter, 2026-10-20: logged triggers only.** "The goal is to identify trigger situations from the monitoring." The report prompt now says to name only triggers the parent logged, and not to widen a situation's name with unlogged examples. Same test, after the change: additions inside a logged situation went from 55 to 3 over 54 runs, and from 15 of 18 families to 2 (18 working families, 3 runs each, $3.67). Whole situations no entry describes: 0 before and after. Small, made-up sample; the matcher is a model and no person has checked its reading. **For Dr. Walker:** confirm the preliminary report should list only what the parent logged, with no clinician-style "likely also" triggers.
   - Fix `backend/evals/preliminary_report` to send the input the app sends. Done 2026-10-19.
8. **Voice notes.**
   - Score how notes are split into observations, and whether the words are kept. Done 2026-10-19: `run.py --feature voice_notes`. First run, 32 notes from the 18 working families, 3 runs each: right number of observations in 84 of 94 readable runs, the parent's Fear Level saved in 38 of 46, no Fear Level saved that the parent did not say. The questions it raised for Peter are in the pull request.
   - Fix `_said` in `monitoring_capture.py`. It counts any number in the text as a Fear Level, so "at 8pm" passes. Done 2026-10-19: `_said_as_rating` only takes a number said as a rating ("about a seven", "6 out of 10"), waiting on Peter's review.
   - Why a Fear Level the parent said is missed. Done 2026-10-21, waiting on Peter's review: of 48 runs where one was said, 10 missed it. The app dropped it in 6 ("like" or "about" after the number; now allowed), the AI left it out in 3 (all one note giving a range), and the reply could not be read in 1 (quote marks). After the fix: 44 of 48 saved, still 0 not said. `docs/solutions/fear-level-said-but-not-saved.md`.
   - A Fear Level said as a range saves the higher number (Peter, 2026-10-21). Done 2026-10-21, waiting on Peter's review: one line in the voice note prompt, and `_said_as_rating` now also reads "between 4 and 6" and "a 6-7". On the one working note with a range, the higher number was saved in 3 of 3 runs (before: a Fear Level in 1 of 6). The answer key still gives the lower number, so the report counts those 3 as "not said"; in the backlog. `docs/solutions/fear-level-range-saves-the-higher-number.md`.
9. **Session drafts and session suggestions: wait.** No session cases until Peter has learned from
   Dr. Walker what a typical session looks like. Known gap, for when they start: the whole transcript
   goes in one call with a 3000-token answer limit, so long sessions are the first thing to test.

**Reviewing agents**

10. **Build the rung and step-sentence reviewers,** and measure the rung reviewer against Dr. Walker's 60 marks.
    - Built 2026-10-20: `AI-dev/evals/judging/reviewers.py` and `reviewers/`, one reviewer per concern (her rules, the child's safety, reads right for the age). An objection with no rule of that reviewer's is counted as opinion, in code.
    - Measuring against her marks is waiting on Peter: the marks are only in the production database. `judging/check_rung_reviewer.py --marks` takes them as a file, and the judging README has the export query.
11. **Suggested rungs.**
    - Enforce the 2–5 count, the length limit and removing duplicates in code.
    - Make the prompt, `AI-dev/Ladder Eval/checks.py` and `ladder-generation.md` agree on one set of numbers.
    - Compare suggestions with and without a feared outcome. Peter dropped that requirement on 2026-10-16 to test exactly this.
    - Done 2026-10-20, waiting on Peter's review: `within_limits` in `step_suggestion_service.py` enforces two to five and no idea twice; `checks.py` imports the numbers; `run.py --feature rungs` runs each situation with and without its feared outcome. First run, 94 cases from 18 working families, 3 runs each, $1.01: given the feared outcome the model wrote 399 suggestions over 105 runs, told it was not known 299 over the same 105. The twelve-word limit dropped 167 of 909 suggestions and left nothing to show in 36 of 282 runs. At fourteen words that would be 4 runs. Peter, 2026-10-20: no length limit for now, so nothing is dropped for length. Quality is not scored until the reviewers exist.
    - Add anxiety types beyond social anxiety.
12. **Step sentences.**
    - Build the 30-pair set from `ladder-combinations.md`, across kinds of anxiety.
    - Test its open question: say what the child does, or what they stop doing.
    - Done 2026-10-20: `run.py --feature step_sentences`. 30 pairs from 17 working families, five per kind of anxiety, picked by a rule in code (`step_sentence_set.json`). Each pair runs with the app's prompt ("app") and with its example line changed to ask what the child does ("does"). Then the three step-sentence reviewers, whose verdicts are **unchecked** by any clinician. First run, 3 runs each, 180 sentences, $1.96:

      | | app | does |
      |---|---|---|
      | Runs | 90 | 90 |
      | Names what the child stops ("without", "don't"...) | 86 | 12 |
      | Over fifteen words | 21 | 16 |
      | Adds a word not in the situation or behavior | 26 | 70 |
      | All three reviewers say show | 79 | 76 |
      | A reviewer found a broken rule | 8 (all reading level) | 10 (no way out, keeps part of the safety behavior) |
      | Reviewer answer unreadable | 3 | 4 |

      - Read by hand: the 30 "does" sentences from the first run only. Most added words are verbs that turn a stop into an action ("keep your questions to yourself"). A few add details: a seat, a kind of food, a time. Some soften the step into a smaller dose of the safety behavior ("call out only once", "stand next to dad"). The reviewers' objections in "does" are those.
      - Not decided. A question for Peter, not a prompt rule. Small sample, made-up pairs, unchecked reviewers.

**People**

13. **A weekly list for Peter,** and for Dr. Walker when possible.
    - The disputed cases, at most 10, through the existing review-link tool (`AI-dev/scripts/seed_review_round.py`).
    - Put "what counts as a risk sign that a clinician should see now" first. The risk flag is not tested until she answers.
    - Then her three open extraction questions: how broad "safety" is, whether several reassurance actions are one behavior or several, and whether dread is avoidance. They are in `AI-dev/Extraction Loop/Bridget-Extraction-Review.docx`.
    - A Fear Level a parent gives as a range ("a seven or eight") is saved as the higher number (Peter, 2026-10-21), the way Analyze with AI takes the highest Fear Level per situation. Confirm, or say what it should be.
    - **Session analysis output** (built 2026-10-21). "Analyze session with AI" adds what an approved session note says to the case summary: new situations, parental responses, safety behaviors, comments on existing items, and other notes (`SESSION_SUMMARY_SYSTEM_PROMPT` in `backend/app/services/session_analysis_service.py`). No test cases cover it: no made-up sessions until the session approach is learned from her. Ask whether what it adds, and what it flags as possibly wrong, is what a clinician would add.
